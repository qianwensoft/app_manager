package com.appmanager.agent.ui

import android.os.Bundle
import android.view.View
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AgentCatalogApi
import com.appmanager.agent.util.ServerUrlUtil
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/**
 * 出站连接器与自定义事件只读列表（GET /api/agent/...，请求头 X-Device-Token）。
 */
class CatalogListActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_MODE = "mode"
        const val MODE_OUTBOUND = "outbound"
        const val MODE_CUSTOM_EVENTS = "custom_events"
    }

    private lateinit var recycler: RecyclerView
    private lateinit var progress: ProgressBar
    private lateinit var tvEmpty: TextView
    private val adapter = CatalogListAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_agent_list)

        val mode = intent.getStringExtra(EXTRA_MODE) ?: MODE_CUSTOM_EVENTS

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }
        toolbar.title = when (mode) {
            MODE_OUTBOUND -> getString(R.string.main_tile_outbound)
            else -> getString(R.string.main_tile_custom_events)
        }
        if (mode == MODE_OUTBOUND) {
            toolbar.subtitle = getString(R.string.catalog_outbound_long_press_hint)
        }

        recycler = findViewById(R.id.recycler)
        progress = findViewById(R.id.progress)
        tvEmpty = findViewById(R.id.tvEmpty)
        recycler.layoutManager = LinearLayoutManager(this)
        recycler.adapter = adapter

        load(mode)
    }

    private fun load(mode: String) {
        progress.visibility = View.VISIBLE
        tvEmpty.visibility = View.GONE
        adapter.submit(emptyList())

        thread {
            try {
                val cfg = AgentConfig.get(this)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val token = cfg.deviceToken.trim()
                if (base.isEmpty() || token.isEmpty()) {
                    runOnUiThread {
                        progress.visibility = View.GONE
                        showEmpty(getString(R.string.catalog_need_server_token))
                    }
                    return@thread
                }

                val path = when (mode) {
                    MODE_OUTBOUND -> "/api/agent/outbound-connectors"
                    else -> "/api/agent/custom-event-definitions"
                }
                val json = AgentCatalogApi.getJson(base, path, token)
                val root = JSONObject(json)
                val arr = root.optJSONArray("data") ?: JSONArray()

                val rows = when (mode) {
                    MODE_OUTBOUND -> parseOutboundRows(arr)
                    else -> parseCustomEventRows(arr)
                }

                runOnUiThread {
                    progress.visibility = View.GONE
                    if (rows.isEmpty()) {
                        showEmpty(getString(R.string.catalog_empty))
                    } else {
                        tvEmpty.visibility = View.GONE
                        adapter.submit(rows)
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    progress.visibility = View.GONE
                    showEmpty(e.message ?: getString(R.string.catalog_load_failed))
                    Toast.makeText(this, e.message ?: "", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun showEmpty(msg: String) {
        tvEmpty.text = msg
        tvEmpty.visibility = View.VISIBLE
    }

    private fun parseOutboundRows(arr: JSONArray): List<CatalogRow> {
        val out = ArrayList<CatalogRow>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val name = o.optString("name", "—")
            val cid = o.optLong("id", 0L)
            val devicePaused = o.optBoolean("device_paused", false)
            val enabled = o.optBoolean("enabled", true)
            val code = o.optString("connector_code", "")
            val deliveryMode = o.optString("delivery_mode", "")
            val pri = o.optInt("priority", 0)
            val keys = o.optJSONArray("event_keys")?.let { a ->
                (0 until a.length()).mapNotNull { j -> a.optString(j).takeIf { it.isNotBlank() } }
            } ?: emptyList()
            val keysStr = if (keys.isEmpty()) "（未绑定事件）" else keys.joinToString(", ")
            val status = if (enabled) "启用" else "停用"
            val pauseTag = if (devicePaused) " · 本机已暂停" else ""
            val subtitle = buildString {
                append(status)
                append(pauseTag)
                append(" · ")
                append(code)
                append(" · ")
                append(deliveryMode)
                append(" · 优先级 ")
                append(pri)
                append("\n事件：")
                append(keysStr)
                val desc = o.optString("description").trim()
                if (desc.isNotEmpty()) {
                    append("\n")
                    append(desc)
                }
            }
            val detail = subtitle
            val displayTitle = if (devicePaused) "$name（本机已暂停）" else name
            val outboundMenu: (() -> Unit)? = if (cid > 0L) {
                {
                    AlertDialog.Builder(this@CatalogListActivity)
                        .setTitle(name)
                        .setItems(
                            arrayOf(
                                getString(R.string.outbound_action_pause),
                                getString(R.string.outbound_action_enable),
                                getString(R.string.outbound_action_exclude)
                            )
                        ) { _, which ->
                            when (which) {
                                0 -> runOutboundAction(cid, "pause")
                                1 -> runOutboundAction(cid, "enable")
                                2 -> {
                                    AlertDialog.Builder(this@CatalogListActivity)
                                        .setMessage(R.string.outbound_exclude_confirm)
                                        .setPositiveButton(android.R.string.ok) { _, _ ->
                                            runOutboundAction(cid, "exclude")
                                        }
                                        .setNegativeButton(android.R.string.cancel, null)
                                        .show()
                                }
                            }
                        }
                        .show()
                }
            } else {
                null
            }
            out.add(
                CatalogRow(
                    title = displayTitle,
                    subtitle = subtitle,
                    onClickDetail = {
                        AlertDialog.Builder(this@CatalogListActivity)
                            .setTitle(displayTitle)
                            .setMessage(detail)
                            .setPositiveButton(android.R.string.ok, null)
                            .show()
                    },
                    outboundMenu = outboundMenu
                )
            )
        }
        return out
    }

    private fun runOutboundAction(connectorId: Long, action: String) {
        thread {
            try {
                val cfg = AgentConfig.get(this@CatalogListActivity)
                val base = ServerUrlUtil.httpBaseFromWs(cfg.serverUrl)
                val token = cfg.deviceToken.trim()
                if (base.isEmpty() || token.isEmpty()) {
                    runOnUiThread {
                        Toast.makeText(this@CatalogListActivity, getString(R.string.catalog_need_server_token), Toast.LENGTH_SHORT).show()
                    }
                    return@thread
                }
                val path = "/api/agent/outbound-connectors/$connectorId/$action"
                AgentCatalogApi.postJson(base, path, token, "{}")
                runOnUiThread {
                    Toast.makeText(this@CatalogListActivity, getString(R.string.outbound_state_saved), Toast.LENGTH_SHORT).show()
                    load(MODE_OUTBOUND)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(
                        this@CatalogListActivity,
                        e.message ?: getString(R.string.catalog_load_failed),
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }

    private fun parseCustomEventRows(arr: JSONArray): List<CatalogRow> {
        val out = ArrayList<CatalogRow>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val name = o.optString("name", "—")
            val key = o.optString("key", "")
            val enabled = o.optBoolean("enabled", true)
            val groupName = o.optJSONObject("group")?.optString("name")?.trim().orEmpty()
            val actions = o.optJSONArray("broadcast_actions")?.let { a ->
                (0 until a.length()).mapNotNull { j -> a.optString(j).takeIf { it.isNotBlank() } }
            } ?: emptyList()
            val extraKeys = o.optJSONArray("extra_keys")?.let { a ->
                (0 until a.length()).mapNotNull { j -> a.optString(j).takeIf { it.isNotBlank() } }
            } ?: emptyList()
            val status = if (enabled) "启用" else "停用"
            val subtitle = buildString {
                append(status)
                append(" · key: ")
                append(key)
                if (groupName.isNotEmpty()) {
                    append("\n分组：")
                    append(groupName)
                }
                append("\n广播：")
                append(if (actions.isEmpty()) "—" else actions.joinToString(", "))
                append("\nExtra：")
                append(if (extraKeys.isEmpty()) "—" else extraKeys.joinToString(", "))
                val desc = o.optString("description").trim()
                if (desc.isNotEmpty()) {
                    append("\n")
                    append(desc)
                }
            }
            out.add(
                CatalogRow(
                    title = name,
                    subtitle = subtitle,
                    onClickDetail = {
                        AlertDialog.Builder(this)
                            .setTitle(name)
                            .setMessage(subtitle)
                            .setPositiveButton(android.R.string.ok, null)
                            .show()
                    }
                )
            )
        }
        return out
    }
}
