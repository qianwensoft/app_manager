package com.appmanager.agent.util

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
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

    @Throws(IOException::class)
    fun delete(httpBase: String, path: String, deviceToken: String): String {
        val base = httpBase.trim().trimEnd('/')
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
}
