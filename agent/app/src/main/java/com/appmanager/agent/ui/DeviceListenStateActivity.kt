package com.appmanager.agent.ui

import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.CustomEventBroadcastHelper
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * 本机自定义事件监听状态：与 Web 控制台一致可暂停（停广播 + 后台标未激活）、删除快照行。
 * 凭 X-Device-Token 调 /api/agent/custom-events/...
 */
class DeviceListenStateActivity : AppCompatActivity() {

    private lateinit var progress: ProgressBar
    private lateinit var tvStatus: TextView
    private lateinit var tvKeys: TextView
    private lateinit var tvUpdated: TextView
    private lateinit var btnPause: MaterialButton
    private lateinit var btnDelete: MaterialButton

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_listen_state)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        progress = findViewById(R.id.progress)
        tvStatus = findViewById(R.id.tvStatus)
        tvKeys = findViewById(R.id.tvKeys)
        tvUpdated = findViewById(R.id.tvUpdated)
        btnPause = findViewById(R.id.btnPause)
        btnDelete = findViewById(R.id.btnDelete)

        findViewById<MaterialButton>(R.id.btnRefresh).setOnClickListener { load() }
        btnPause.setOnClickListener { confirmPause() }
        btnDelete.setOnClickListener { confirmDelete() }

        load()
    }

    private fun cfgOrToast(): Pair<String, String>? {
        val cfg = AgentConfig.get(this)
        val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
        val token = cfg.deviceToken.trim()
        if (base.isEmpty() || token.isEmpty()) {
            Toast.makeText(this, R.string.listen_state_need_config, Toast.LENGTH_SHORT).show()
            return null
        }
        return Pair(base, token)
    }

    private fun load() {
        val pair = cfgOrToast() ?: return
        val (base, token) = pair
        progress.visibility = View.VISIBLE
        thread {
            try {
                val json = AgentCatalogApi.getJson(base, "/api/agent/custom-events/listen-state", token)
                val root = JSONObject(json)
                val data = root.opt("data")
                runOnUiThread {
                    progress.visibility = View.GONE
                    val hasData = data != null && data != JSONObject.NULL
                    val localListening = CustomEventBroadcastHelper.isListening()
                    if (!hasData) {
                        tvStatus.text = if (localListening) {
                            getString(R.string.listen_state_local_only)
                        } else {
                            getString(R.string.listen_state_none)
                        }
                        tvKeys.text = ""
                        tvUpdated.text = ""
                        btnPause.isEnabled = localListening
                        btnDelete.isEnabled = false
                        return@runOnUiThread
                    }
                    val o = data as JSONObject
                    val active = o.optBoolean("active", false)
                    tvStatus.text = getString(
                        if (active) R.string.listen_state_status_active else R.string.listen_state_status_inactive
                    )
                    val keys = o.optJSONArray("event_keys") ?: JSONArray()
                    val lines = ArrayList<String>(keys.length())
                    for (i in 0 until keys.length()) {
                        keys.optString(i).trim().takeIf { it.isNotEmpty() }?.let { lines.add(it) }
                    }
                    tvKeys.text = if (lines.isEmpty()) {
                        getString(R.string.listen_state_no_keys)
                    } else {
                        getString(R.string.listen_state_keys_label) + "\n" + lines.joinToString("\n")
                    }
                    tvUpdated.text = getString(R.string.listen_state_updated_label, o.optString("updated_at", "—"))
                    btnPause.isEnabled = true
                    btnDelete.isEnabled = true
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progress.visibility = View.GONE
                    tvStatus.text = e.message ?: getString(R.string.catalog_load_failed)
                    btnPause.isEnabled = false
                    btnDelete.isEnabled = false
                }
            }
        }
    }

    private fun confirmPause() {
        AlertDialog.Builder(this)
            .setTitle(R.string.listen_state_pause)
            .setMessage(R.string.listen_state_pause_confirm)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.listen_state_pause) { _, _ -> runPause() }
            .show()
    }

    private fun runPause() {
        val pair = cfgOrToast() ?: return
        val (base, token) = pair
        progress.visibility = View.VISIBLE
        thread {
            try {
                AgentCatalogApi.postJson(base, "/api/agent/custom-events/listen/pause", token, "{}")
                CustomEventBroadcastHelper.stop(applicationContext)
                runOnUiThread {
                    progress.visibility = View.GONE
                    Toast.makeText(this, R.string.listen_state_paused_ok, Toast.LENGTH_SHORT).show()
                    load()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progress.visibility = View.GONE
                    Toast.makeText(this, e.message ?: "", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun confirmDelete() {
        AlertDialog.Builder(this)
            .setTitle(R.string.listen_state_delete)
            .setMessage(R.string.listen_state_delete_confirm)
            .setNegativeButton(android.R.string.cancel, null)
            .setPositiveButton(R.string.listen_state_delete) { _, _ -> runDelete() }
            .show()
    }

    private fun runDelete() {
        val pair = cfgOrToast() ?: return
        val (base, token) = pair
        progress.visibility = View.VISIBLE
        thread {
            try {
                AgentCatalogApi.delete(base, "/api/agent/custom-events/listen-state", token)
                CustomEventBroadcastHelper.stop(applicationContext)
                runOnUiThread {
                    progress.visibility = View.GONE
                    Toast.makeText(this, R.string.listen_state_deleted_ok, Toast.LENGTH_SHORT).show()
                    load()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progress.visibility = View.GONE
                    Toast.makeText(this, e.message ?: "", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
