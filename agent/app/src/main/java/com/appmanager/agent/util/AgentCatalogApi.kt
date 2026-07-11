package com.appmanager.agent.util

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

object AgentCatalogApi {

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    @Throws(IOException::class)
    fun getJson(httpBase: String, path: String, deviceToken: String): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", deviceToken)
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${body.take(200)}")
            }
            return body
        }
    }

    /**
     * GET 请求，优先使用 JWT token（如果提供），否则使用 device token
     * 用于支持 FormRuntimeAuthMiddleware 的接口（工单相关）
     */
    @Throws(IOException::class)
    fun getJsonWithAuth(httpBase: String, path: String, jwtToken: String, deviceToken: String): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val reqBuilder = Request.Builder().url(url)

        // 优先使用 JWT token
        if (jwtToken.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer $jwtToken")
        } else {
            reqBuilder.header("X-Device-Token", deviceToken)
        }

        client.newCall(reqBuilder.get().build()).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${body.take(200)}")
            }
            return body
        }
    }

    /**
     * GET 请求，支持 JWT Bearer token 认证
     */
    @Throws(IOException::class)
    fun getJsonWithJWT(httpBase: String, path: String, jwtToken: String): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $jwtToken")
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            val body = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${body.take(200)}")
            }
            return body
        }
    }

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    @Throws(IOException::class)
    fun postJson(httpBase: String, path: String, deviceToken: String, jsonBody: String = "{}"): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val body = jsonBody.toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", deviceToken)
            .post(body)
            .build()
        client.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    /**
     * POST 请求，优先使用 JWT token（如果提供），否则使用 device token
     * 用于支持 FormRuntimeAuthMiddleware 的接口（工单相关）
     */
    @Throws(IOException::class)
    fun postJsonWithAuth(httpBase: String, path: String, jwtToken: String, deviceToken: String, jsonBody: String = "{}"): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val body = jsonBody.toRequestBody(jsonMedia)
        val reqBuilder = Request.Builder().url(url).post(body)

        // 优先使用 JWT token
        if (jwtToken.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer $jwtToken")
        } else {
            reqBuilder.header("X-Device-Token", deviceToken)
        }

        client.newCall(reqBuilder.build()).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    @Throws(IOException::class)
    fun putJson(httpBase: String, path: String, deviceToken: String, jsonBody: String = "{}"): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val body = jsonBody.toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", deviceToken)
            .put(body)
            .build()
        client.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    @Throws(IOException::class)
    fun putJsonWithJWT(httpBase: String, path: String, jwtToken: String, jsonBody: String = "{}"): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val body = jsonBody.toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $jwtToken")
            .put(body)
            .build()
        client.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    @Throws(IOException::class)
    fun postJsonWithJWT(httpBase: String, path: String, jwtToken: String, jsonBody: String = "{}"): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val body = jsonBody.toRequestBody(jsonMedia)
        val req = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $jwtToken")
            .post(body)
            .build()
        client.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    @Throws(IOException::class)
    fun delete(httpBase: String, path: String, deviceToken: String): String {        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", deviceToken)
            .delete()
            .build()
        client.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    /** 上传单个文件到工单（multipart）。formFields 作为额外文本字段一并提交。 */
    @Throws(IOException::class)
    fun uploadFile(
        httpBase: String,
        path: String,
        deviceToken: String,
        file: File,
        contentType: String,
        formFields: Map<String, String> = emptyMap(),
    ): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        formFields.forEach { (k, v) -> builder.addFormDataPart(k, v) }
        builder.addFormDataPart("file", file.name, file.asRequestBody(contentType.toMediaType()))
        val req = Request.Builder()
            .url(url)
            .header("X-Device-Token", deviceToken)
            .post(builder.build())
            .build()
        uploadClient.newCall(req).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    /**
     * 上传文件，优先使用 JWT token（如果提供），否则使用 device token
     */
    @Throws(IOException::class)
    fun uploadFileWithAuth(
        httpBase: String,
        path: String,
        jwtToken: String,
        deviceToken: String,
        file: File,
        contentType: String,
        formFields: Map<String, String> = emptyMap(),
    ): String {
        val base = httpBase.trim().trimEnd('/')
        val p = if (path.startsWith("/")) path else "/$path"
        val url = base + p
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        formFields.forEach { (k, v) -> builder.addFormDataPart(k, v) }
        builder.addFormDataPart("file", file.name, file.asRequestBody(contentType.toMediaType()))

        val reqBuilder = Request.Builder().url(url).post(builder.build())

        // 优先使用 JWT token
        if (jwtToken.isNotBlank()) {
            reqBuilder.header("Authorization", "Bearer $jwtToken")
        } else {
            reqBuilder.header("X-Device-Token", deviceToken)
        }

        uploadClient.newCall(reqBuilder.build()).execute().use { resp ->
            val respBody = resp.body?.string() ?: ""
            if (!resp.isSuccessful) {
                throw IOException("HTTP ${resp.code}: ${respBody.take(200)}")
            }
            return respBody
        }
    }

    private val uploadClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(300, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
}
