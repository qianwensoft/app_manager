package com.appmanager.agent.command

import android.os.Environment
import android.util.Base64
import android.util.Log
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.ws.Message
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

object FsCommandHandler {
    private const val TAG = "FsCommandHandler"

    private const val ERR_PERMISSION_DENIED = "permission_denied"
    private const val ERR_PATH_NOT_ALLOWED = "path_not_allowed"
    private const val ERR_NOT_FOUND = "not_found"
    private const val ERR_NOT_DIR = "not_dir"
    private const val ERR_TOO_LARGE = "too_large"
    private const val ERR_IO = "io_error"
    private const val ERR_INVALID_REQUEST = "invalid_request"

    private const val MAX_UPLOAD_BYTES: Long = 200L * 1024L * 1024L

    private data class UploadSession(
        val uploadId: String,
        val expectedSize: Long,
        val tmpFile: File,
        val out: FileOutputStream,
        val targetFile: File,
        var received: Long = 0L,
        var lastSeq: Long = 0L
    )

    private val uploads = ConcurrentHashMap<String, UploadSession>()

    fun list(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val rid = m?.get("request_id") as? String
        val path = (m?.get("path") as? String)?.trim()
        val includeHidden = (m?.get("include_hidden") as? Boolean) ?: false
        if (rid.isNullOrBlank() || path.isNullOrBlank()) {
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to (rid ?: ""), "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }

        val resolved = resolveDir(service, path)
        if (resolved.err != null) {
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to rid, "success" to false, "error" to resolved.err))
            return
        }
        val dir = resolved.file ?: run {
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to rid, "success" to false, "error" to ERR_NOT_FOUND))
            return
        }
        if (!dir.exists()) {
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to rid, "success" to false, "error" to ERR_NOT_FOUND))
            return
        }
        if (!dir.isDirectory) {
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to rid, "success" to false, "error" to ERR_NOT_DIR))
            return
        }
        val files = try {
            dir.listFiles()?.toList() ?: emptyList()
        } catch (e: Exception) {
            Log.w(TAG, "listFiles failed: $path", e)
            service.webSocket.send(mapOf("type" to "fs_list_result", "request_id" to rid, "success" to false, "error" to ERR_PERMISSION_DENIED))
            return
        }

        val entries = files
            .asSequence()
            .filter { includeHidden || !it.name.startsWith(".") }
            .sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
            .map {
                mapOf(
                    "name" to it.name,
                    "type" to (if (it.isDirectory) "dir" else "file"),
                    "size" to (if (it.isFile) it.length() else 0L),
                    "mtime" to it.lastModified()
                )
            }
            .toList()

        service.webSocket.send(
            mapOf(
                "type" to "fs_list_result",
                "request_id" to rid,
                "success" to true,
                "entries" to entries
            )
        )
    }

    fun uploadBegin(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val uploadId = (m?.get("upload_id") as? String)?.trim()
        val dirPath = (m?.get("path") as? String)?.trim()
        val fileName = (m?.get("file_name") as? String)?.trim()
        val size = (m?.get("size") as? Number)?.toLong() ?: -1L
        if (uploadId.isNullOrBlank() || dirPath.isNullOrBlank() || fileName.isNullOrBlank() || size <= 0) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to (uploadId ?: ""), "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        if (size > MAX_UPLOAD_BYTES) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_TOO_LARGE))
            return
        }
        // cancel previous if exists
        uploadCancelInternal(uploadId, service, notify = false)

        val dirResolved = resolveDir(service, dirPath)
        if (dirResolved.err != null) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to dirResolved.err))
            return
        }
        val dir = dirResolved.file!!
        if (!dir.exists() || !dir.isDirectory) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_NOT_DIR))
            return
        }

        val safeName = sanitizeFileName(fileName)
        if (safeName.isEmpty()) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        val target = File(dir, safeName)
        val tmp = File.createTempFile("upload_${uploadId}_", ".tmp", service.cacheDir)
        val out = try {
            FileOutputStream(tmp, false)
        } catch (e: Exception) {
            Log.w(TAG, "open tmp file failed", e)
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_IO))
            return
        }
        uploads[uploadId] = UploadSession(uploadId, size, tmp, out, target)
        service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to true, "received_bytes" to 0L))
    }

    fun uploadChunk(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val uploadId = (m?.get("upload_id") as? String)?.trim() ?: ""
        val seq = (m?.get("seq") as? Number)?.toLong() ?: -1L
        val b64 = (m?.get("data_base64") as? String) ?: ""
        val s = uploads[uploadId]
        if (uploadId.isBlank() || s == null || seq <= 0 || b64.isBlank()) {
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        if (seq != s.lastSeq + 1) {
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        val bytes = try {
            Base64.decode(b64, Base64.DEFAULT)
        } catch (e: Exception) {
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        if (s.received + bytes.size > s.expectedSize) {
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to false, "error" to ERR_TOO_LARGE))
            uploadCancelInternal(uploadId, service, notify = true)
            return
        }
        try {
            s.out.write(bytes)
            s.received += bytes.size.toLong()
            s.lastSeq = seq
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to true, "received_bytes" to s.received))
        } catch (e: Exception) {
            Log.w(TAG, "write chunk failed", e)
            service.webSocket.send(mapOf("type" to "fs_upload_progress", "upload_id" to uploadId, "success" to false, "error" to ERR_IO))
            uploadCancelInternal(uploadId, service, notify = true)
        }
    }

    fun uploadEnd(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val uploadId = (m?.get("upload_id") as? String)?.trim() ?: ""
        val s = uploads[uploadId]
        if (uploadId.isBlank() || s == null) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        try {
            s.out.flush()
            s.out.fd.sync()
        } catch (_: Exception) {
        } finally {
            try { s.out.close() } catch (_: Exception) {}
        }
        if (s.received != s.expectedSize) {
            cleanupSession(uploadId, s)
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }
        try {
            // Ensure parent exists
            s.targetFile.parentFile?.mkdirs()
            // Overwrite if exists
            if (s.targetFile.exists()) {
                s.targetFile.delete()
            }
            val ok = s.tmpFile.renameTo(s.targetFile)
            if (!ok) {
                // fallback copy+delete
                s.tmpFile.copyTo(s.targetFile, overwrite = true)
                s.tmpFile.delete()
            }
            cleanupSession(uploadId, null)
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to true))
        } catch (e: SecurityException) {
            Log.w(TAG, "move to target denied", e)
            cleanupSession(uploadId, null)
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_PERMISSION_DENIED))
        } catch (e: Exception) {
            Log.w(TAG, "move to target failed", e)
            cleanupSession(uploadId, null)
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to ERR_IO))
        }
    }

    fun uploadCancel(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val uploadId = (m?.get("upload_id") as? String)?.trim() ?: ""
        uploadCancelInternal(uploadId, service, notify = true)
    }

    private fun uploadCancelInternal(uploadId: String, service: AgentService, notify: Boolean) {
        if (uploadId.isBlank()) return
        val s = uploads.remove(uploadId) ?: return
        try { s.out.close() } catch (_: Exception) {}
        try { s.tmpFile.delete() } catch (_: Exception) {}
        if (notify) {
            service.webSocket.send(mapOf("type" to "fs_upload_done", "upload_id" to uploadId, "success" to false, "error" to "cancelled"))
        }
    }

    private fun cleanupSession(uploadId: String, session: UploadSession?) {
        if (session != null) {
            uploads.remove(uploadId)
            try { session.tmpFile.delete() } catch (_: Exception) {}
        } else {
            val s = uploads.remove(uploadId)
            if (s != null) {
                try { s.tmpFile.delete() } catch (_: Exception) {}
            }
        }
    }

    private data class ResolvedDir(val file: File?, val err: String?)

    private fun resolveDir(service: AgentService, path: String): ResolvedDir {
        val p = path.trim()
        if (p.isEmpty()) return ResolvedDir(null, ERR_INVALID_REQUEST)

        val root = when {
            p.startsWith("app://files") -> service.filesDir
            p.startsWith("app://cache") -> service.cacheDir
            p.startsWith("app://external_files") -> service.getExternalFilesDir(null)
            p.startsWith("app://external_cache") -> service.externalCacheDir
            else -> null
        }
        if (root != null) {
            val sub = p.substringAfter("://", "").substringAfter("/", "")
            val dir = if (sub.isBlank()) root else File(root, sub)
            return ResolvedDir(dir, null)
        }

        // Public storage (best-effort; on Android 10+ writing may be blocked without SAF/MANAGE_EXTERNAL_STORAGE)
        val pubRoot = try {
            Environment.getExternalStorageDirectory()
        } catch (_: Exception) {
            null
        }
        if (pubRoot != null) {
            val canonRoot = try { pubRoot.canonicalFile } catch (_: Exception) { pubRoot.absoluteFile }
            val f = File(p)
            val canon = try { f.canonicalFile } catch (_: Exception) { f.absoluteFile }
            if (!canon.path.startsWith(canonRoot.path)) {
                // Don't allow /data or other partitions by default
                return ResolvedDir(null, ERR_PATH_NOT_ALLOWED)
            }
            return ResolvedDir(canon, null)
        }
        return ResolvedDir(null, ERR_PERMISSION_DENIED)
    }

    fun download(msg: Message, service: AgentService) {
        val m = msg.data as? Map<*, *>
        val rid = m?.get("request_id") as? String
        val path = (m?.get("path") as? String)?.trim()
        if (rid.isNullOrBlank() || path.isNullOrBlank()) {
            service.webSocket.send(mapOf("type" to "fs_download_result", "request_id" to (rid ?: ""), "success" to false, "error" to ERR_INVALID_REQUEST))
            return
        }

        val file = File(path)
        if (!file.exists()) {
            service.webSocket.send(mapOf("type" to "fs_download_result", "request_id" to rid, "success" to false, "error" to ERR_NOT_FOUND))
            return
        }

        if (!file.isFile) {
            service.webSocket.send(mapOf("type" to "fs_download_result", "request_id" to rid, "success" to false, "error" to "not_file"))
            return
        }

        try {
            val data = file.readBytes()
            val encoded = Base64.encodeToString(data, Base64.NO_WRAP)
            service.webSocket.send(mapOf("type" to "fs_download_result", "request_id" to rid, "success" to true, "data_base64" to encoded))
        } catch (e: Exception) {
            Log.e(TAG, "download error", e)
            service.webSocket.send(mapOf("type" to "fs_download_result", "request_id" to rid, "success" to false, "error" to ERR_IO))
        }
    }

    private fun sanitizeFileName(name: String): String {
        val n = name.trim().replace("\\", "_").replace("/", "_")
        if (n == "." || n == "..") return ""
        return n
    }
}

