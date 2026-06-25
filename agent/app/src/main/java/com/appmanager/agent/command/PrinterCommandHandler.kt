package com.appmanager.agent.command

import android.util.Log
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.printer.PrinterManager
import com.appmanager.agent.printer.ProtocolBuilder
import com.appmanager.agent.service.AgentService
import com.google.gson.Gson
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * 蓝牙打印命令处理。
 * - PRINT：生成协议字节（或透传 raw_base64）→ PrinterManager.write → sendResult。
 * - LIST_BLUETOOTH_PRINTERS：返回已配对设备 JSON。
 * - SET_DEFAULT_PRINTER：写入 AgentConfig（服务端远程下发默认打印机）。
 *
 * 默认打印机优先级：命令显式指定的 mac/protocol/transport 优先；缺省回退到 AgentConfig。
 * 服务端 SET_DEFAULT_PRINTER 会覆盖本地配置（以最后写入为准）。
 */
object PrinterCommandHandler {
    private const val TAG = "PrinterCommandHandler"
    private val gson = Gson()

    /** 把 msg.data（Map 或 JSON 字符串）转成 JSONObject。 */
    private fun toJson(data: Any?): JSONObject {
        return when (data) {
            null -> JSONObject()
            is String -> try { JSONObject(data) } catch (_: Throwable) { JSONObject() }
            is Map<*, *> -> JSONObject(gson.toJson(data))
            else -> try { JSONObject(gson.toJson(data)) } catch (_: Throwable) { JSONObject() }
        }
    }

    fun print(data: Any?, commandId: String?, service: AgentService) {
        val payload = toJson(data)
        val ctx = service.applicationContext
        val cfg = AgentConfig.get(ctx)

        val mac = payload.optString("mac", "").ifEmpty { cfg.defaultPrinterMac }
        val transport = payload.optString("transport", "").ifEmpty { cfg.defaultPrinterTransport }
        // protocol 用于生成字节：payload 未给则用默认
        if (!payload.has("protocol") || payload.optString("protocol").isEmpty()) {
            payload.put("protocol", cfg.defaultPrinterProtocol)
        }

        if (mac.isEmpty()) {
            CommandDispatcher.sendResult(service, commandId, false, "未配置默认打印机")
            return
        }

        thread(name = "bt-print") {
            try {
                val bytes = ProtocolBuilder.build(payload)
                when (val r = PrinterManager.print(ctx, mac, transport, bytes)) {
                    is PrinterManager.PrintResult.Success ->
                        CommandDispatcher.sendResult(service, commandId, true, "printed ${bytes.size} bytes")
                    is PrinterManager.PrintResult.Failure ->
                        CommandDispatcher.sendResult(service, commandId, false, r.message)
                }
            } catch (t: Throwable) {
                Log.e(TAG, "print failed", t)
                CommandDispatcher.sendResult(service, commandId, false, t.message ?: "打印失败")
            }
        }
    }

    fun listPrinters(commandId: String?, service: AgentService) {
        thread(name = "bt-list") {
            try {
                val list = PrinterManager.listPairedPrinters(service.applicationContext)
                val arr = JSONArray()
                list.forEach {
                    arr.put(JSONObject().put("name", it.name).put("mac", it.mac))
                }
                CommandDispatcher.sendResult(service, commandId, true, arr.toString())
            } catch (t: Throwable) {
                CommandDispatcher.sendResult(service, commandId, false, t.message ?: "列举失败")
            }
        }
    }

    fun setDefaultPrinter(data: Any?, commandId: String?, service: AgentService) {
        val payload = toJson(data)
        val mac = payload.optString("mac", "")
        if (mac.isEmpty()) {
            CommandDispatcher.sendResult(service, commandId, false, "缺少 mac")
            return
        }
        val ctx = service.applicationContext
        val cur = AgentConfig.get(ctx)
        AgentConfig.save(ctx, cur.copy(
            defaultPrinterMac = mac,
            defaultPrinterName = payload.optString("name", cur.defaultPrinterName),
            defaultPrinterProtocol = payload.optString("protocol", cur.defaultPrinterProtocol).ifEmpty { cur.defaultPrinterProtocol },
            defaultPrinterTransport = payload.optString("transport", cur.defaultPrinterTransport).ifEmpty { cur.defaultPrinterTransport }
        ))
        CommandDispatcher.sendResult(service, commandId, true, "默认打印机已更新")
    }
}
