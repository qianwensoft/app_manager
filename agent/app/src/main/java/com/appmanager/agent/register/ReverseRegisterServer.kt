package com.appmanager.agent.register

import android.content.Context
import android.os.Build
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.DeviceMachineId
import fi.iki.elonen.NanoHTTPD
import org.json.JSONObject

/**
 * 反向注册 HTTP 服务（电视等无摄像头端）。
 *
 * 端上起此服务并在界面显示「IP + 端口 + 授权码」；管理端浏览器直连：
 *   GET  /agent/info   → 返回机器码与机型信息，供管理端展示确认
 *   POST /agent/claim  → 携带授权码 + serverUrl + token + 别名/分组，校验授权码后写入配置
 *
 * 仅校验 authCode；已配置设备也允许重新认领（覆盖原配置），便于换服务器/重新归属。
 * authCode 每次构造时随机生成，只有看着设备屏幕的人能读到，防止 LAN 上盲目认领。
 */
class ReverseRegisterServer(
    private val context: Context,
    port: Int,
    val authCode: String,
    /** claim 成功回调（主线程外），参数为保存后的配置；调用方据此启动服务并刷新 UI。 */
    private val onClaimed: (AgentConfig) -> Unit,
) : NanoHTTPD("0.0.0.0", port) {

    private fun cors(resp: Response): Response {
        resp.addHeader("Access-Control-Allow-Origin", "*")
        resp.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        resp.addHeader("Access-Control-Allow-Headers", "Content-Type")
        return resp
    }

    private fun json(status: Response.Status, obj: JSONObject): Response =
        cors(newFixedLengthResponse(status, "application/json", obj.toString()))

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""))
        }
        return when (session.uri) {
            "/agent/info" -> handleInfo()
            "/agent/claim" -> handleClaim(session)
            else -> json(Response.Status.NOT_FOUND, JSONObject().put("error", "not found"))
        }
    }

    private fun handleInfo(): Response {
        val configured = AgentConfig.get(context).serverUrl.isNotEmpty()
        val obj = JSONObject()
            .put("machineCode", DeviceMachineId.get(context))
            .put("model", Build.MODEL)
            .put("brand", Build.BRAND)
            .put("osVersion", Build.VERSION.RELEASE)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("configured", configured)
        return json(Response.Status.OK, obj)
    }

    private fun handleClaim(session: IHTTPSession): Response {
        val body = readBody(session)
        val req = try {
            JSONObject(body)
        } catch (_: Exception) {
            return json(Response.Status.BAD_REQUEST, JSONObject().put("error", "invalid json"))
        }
        if (req.optString("authCode").trim() != authCode) {
            return json(Response.Status.FORBIDDEN, JSONObject().put("error", "bad auth code"))
        }
        val serverUrl = req.optString("serverUrl").trim()
        if (serverUrl.isEmpty()) {
            return json(Response.Status.BAD_REQUEST, JSONObject().put("error", "missing serverUrl"))
        }
        val cur = AgentConfig.get(context)
        val code = DeviceMachineId.get(context)
        val token = if (code.isNotEmpty()) code else req.optString("deviceToken").trim()
        val next = cur.copy(
            serverUrl = serverUrl,
            deviceToken = token,
            deviceAlias = req.optString("name", cur.deviceAlias),
            groupName = req.optString("group", cur.groupName),
            formAppBaseUrl = req.optString("formAppBaseUrl", cur.formAppBaseUrl),
        )
        AgentConfig.save(context, next)
        onClaimed(next)
        return json(Response.Status.OK, JSONObject().put("ok", true).put("deviceToken", token))
    }

    private fun readBody(session: IHTTPSession): String {
        val files = HashMap<String, String>()
        return try {
            session.parseBody(files)
            files["postData"] ?: ""
        } catch (_: Exception) {
            ""
        }
    }
}
