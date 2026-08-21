package com.appmanager.agent.ui

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.printer.PrinterManager
import com.appmanager.agent.printer.ProtocolBuilder
import com.google.android.material.appbar.MaterialToolbar
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread

/** 打印配置独立页：选已配对打印机、协议/传输、测试打印，并支持 App 内搜索 + 配对新设备。 */
class PrinterSettingsActivity : AppCompatActivity() {

    private lateinit var tvCurrentPrinter: TextView
    private lateinit var tvConnStatus: TextView
    private lateinit var spProtocol: Spinner
    private lateinit var spTransport: Spinner
    private lateinit var switchCpclQrWithLength: com.google.android.material.switchmaterial.SwitchMaterial
    private lateinit var btnDiscover: Button
    private lateinit var discoverProgress: ProgressBar
    private lateinit var tvDiscoverStatus: TextView
    private lateinit var containerFoundDevices: LinearLayout

    private val protocolValues = listOf("escpos", "cpcl", "tspl")
    private val transportValues = listOf("spp", "ble")
    private var selectedPrinterMac: String = ""
    private var selectedPrinterName: String = ""

    /** 扫描到的未配对设备，按 MAC 去重；值为 (device, rssi_dBm) */
    private val foundDevices = LinkedHashMap<String, Pair<BluetoothDevice, Int>>()

    /** 是否已发起过扫描权限申请（用于区分「首次申请」与「永久拒绝」） */
    private var hasRequestedScanPerm = false

    private val discoveryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device: BluetoothDevice? = getBluetoothDevice(intent)
                    if (device != null && device.bondState != BluetoothDevice.BOND_BONDED) {
                        val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                        foundDevices[device.address] = Pair(device, rssi)
                        renderFoundDevices()
                    }
                }
                android.bluetooth.BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    discoverProgress.visibility = View.GONE
                    btnDiscover.isEnabled = true
                    tvDiscoverStatus.text = getString(
                        R.string.printer_discover_done, foundDevices.size
                    )
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val state = intent.getIntExtra(
                        BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE
                    )
                    val device: BluetoothDevice? = getBluetoothDevice(intent)
                    if (state == BluetoothDevice.BOND_BONDED && device != null) {
                        // 配对成功：移出待配对列表，自动选为默认打印机
                        foundDevices.remove(device.address)
                        renderFoundDevices()
                        selectedPrinterMac = device.address
                        selectedPrinterName = safeDeviceName(device)
                        refreshPrinterLabel()
                        Toast.makeText(
                            this@PrinterSettingsActivity,
                            getString(R.string.printer_bond_success, selectedPrinterName),
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_printer_settings)

        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }

        tvCurrentPrinter = findViewById(R.id.tvCurrentPrinter)
        tvConnStatus = findViewById(R.id.tvPrinterConnStatus)
        spProtocol = findViewById(R.id.spPrinterProtocol)
        spTransport = findViewById(R.id.spPrinterTransport)
        switchCpclQrWithLength = findViewById(R.id.switchCpclQrWithLength)
        btnDiscover = findViewById(R.id.btnDiscover)
        discoverProgress = findViewById(R.id.discoverProgress)
        tvDiscoverStatus = findViewById(R.id.tvDiscoverStatus)
        containerFoundDevices = findViewById(R.id.containerFoundDevices)

        spProtocol.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item,
            listOf("ESC/POS（小票机）", "CPCL（便携/标签）", "TSPL（标签机）")
        )
        spTransport.adapter = ArrayAdapter(
            this, android.R.layout.simple_spinner_dropdown_item,
            listOf("经典蓝牙 SPP", "低功耗 BLE")
        )

        val config = AgentConfig.get(this)
        selectedPrinterMac = config.defaultPrinterMac
        selectedPrinterName = config.defaultPrinterName
        spProtocol.setSelection(protocolValues.indexOf(config.defaultPrinterProtocol).coerceAtLeast(0))
        spTransport.setSelection(transportValues.indexOf(config.defaultPrinterTransport).coerceAtLeast(0))
        switchCpclQrWithLength.isChecked = config.cpclQrWithLength
        refreshPrinterLabel()

        findViewById<Button>(R.id.btnSelectPrinter).setOnClickListener {
            if (ensureBluetoothPermission(REQ_BT_SELECT)) showPrinterPicker()
        }
        findViewById<Button>(R.id.btnTestPrint).setOnClickListener {
            if (ensureBluetoothPermission(REQ_BT_TEST)) doTestPrint()
        }
        findViewById<Button>(R.id.btnCheckConn).setOnClickListener {
            if (ensureBluetoothPermission(REQ_BT_CHECK)) doCheckConnection()
        }
        findViewById<Button>(R.id.btnSavePrinter).setOnClickListener { savePrinter() }
        btnDiscover.setOnClickListener {
            if (ensureScanPermission()) startDiscovery()
        }

        val filter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            addAction(android.bluetooth.BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        ContextCompat.registerReceiver(this, discoveryReceiver, filter, ContextCompat.RECEIVER_EXPORTED)
    }

    override fun onDestroy() {
        super.onDestroy()
        PrinterManager.cancelDiscovery(this)
        try { unregisterReceiver(discoveryReceiver) } catch (_: Exception) {}
    }

    private fun refreshPrinterLabel() {
        tvCurrentPrinter.text = if (selectedPrinterMac.isEmpty()) {
            getString(R.string.settings_printer_none)
        } else {
            val name = selectedPrinterName.ifEmpty { "打印机" }
            "$name ($selectedPrinterMac)"
        }
        refreshConnStatus()
    }

    /** 按 PrinterManager 实际连接快照刷新状态行（绿色已连 / 灰色未连）。 */
    private fun refreshConnStatus() {
        val st = PrinterManager.connectionState()
        if (st.connected && st.mac.equals(selectedPrinterMac, ignoreCase = true)) {
            val label = if (st.transport == "ble") "BLE" else "SPP"
            tvConnStatus.text = getString(R.string.printer_conn_connected, label)
            tvConnStatus.setTextColor(0xFF16A34A.toInt())
        } else {
            tvConnStatus.text = getString(R.string.printer_conn_disconnected)
            tvConnStatus.setTextColor(ContextCompat.getColor(this, R.color.agent_text_secondary))
        }
    }

    /** 主动连接所选打印机以检测可用性，不打印。 */
    private fun doCheckConnection() {
        if (selectedPrinterMac.isEmpty()) {
            Toast.makeText(this, "请先选择打印机", Toast.LENGTH_SHORT).show()
            return
        }
        val transport = transportValues[spTransport.selectedItemPosition.coerceIn(0, transportValues.size - 1)]
        val mac = selectedPrinterMac
        tvConnStatus.text = getString(R.string.printer_conn_connecting)
        tvConnStatus.setTextColor(ContextCompat.getColor(this, R.color.agent_text_secondary))
        thread(name = "conn-check") {
            val r = PrinterManager.connectOnly(this, mac, transport)
            runOnUiThread {
                when (r) {
                    is PrinterManager.PrintResult.Success -> refreshConnStatus()
                    is PrinterManager.PrintResult.Failure -> {
                        tvConnStatus.text = getString(R.string.printer_conn_failed, r.message)
                        tvConnStatus.setTextColor(0xFFDC2626.toInt())
                    }
                }
            }
        }
    }

    private fun savePrinter() {
        val cur = AgentConfig.get(this)
        AgentConfig.save(
            this,
            cur.copy(
                defaultPrinterMac = selectedPrinterMac,
                defaultPrinterName = selectedPrinterName,
                defaultPrinterProtocol = protocolValues[spProtocol.selectedItemPosition.coerceIn(0, protocolValues.size - 1)],
                defaultPrinterTransport = transportValues[spTransport.selectedItemPosition.coerceIn(0, transportValues.size - 1)],
                cpclQrWithLength = switchCpclQrWithLength.isChecked
            )
        )
        Toast.makeText(this, R.string.printer_settings_saved, Toast.LENGTH_SHORT).show()
    }

    // ── 已配对选择 / 测试打印（迁移自 SettingsActivity） ──

    private fun showPrinterPicker() {
        val printers = PrinterManager.listPairedPrinters(this)
        if (printers.isEmpty()) {
            Toast.makeText(this, "未发现已配对蓝牙设备，可在下方搜索并配对", Toast.LENGTH_LONG).show()
            return
        }
        val labels = printers.map { "${it.name}\n${it.mac}" }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_printer_select)
            .setItems(labels) { _, which ->
                selectedPrinterMac = printers[which].mac
                selectedPrinterName = printers[which].name
                refreshPrinterLabel()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun doTestPrint() {
        if (selectedPrinterMac.isEmpty()) {
            Toast.makeText(this, "请先选择打印机", Toast.LENGTH_SHORT).show()
            return
        }
        val protocol = protocolValues[spProtocol.selectedItemPosition.coerceIn(0, protocolValues.size - 1)]
        val transport = transportValues[spTransport.selectedItemPosition.coerceIn(0, transportValues.size - 1)]
        val content = JSONArray()
            .put(JSONObject().put("op", "text").put("text", "测试打印 / Test Print").put("align", "center").put("size", 2))
            .put(JSONObject().put("op", "text").put("text", "AppManager Agent").put("align", "center"))
            .put(JSONObject().put("op", "line"))
            .put(JSONObject().put("op", "qrcode").put("data", "appmanager-printer-test").put("size", 6))
            .put(JSONObject().put("op", "feed").put("lines", 3))
            .put(JSONObject().put("op", "cut"))
        val payload = JSONObject().put("protocol", protocol).put("content", content)
        val mac = selectedPrinterMac
        Toast.makeText(this, "正在打印测试页…", Toast.LENGTH_SHORT).show()
        thread(name = "test-print") {
            val bytes = ProtocolBuilder.build(payload)
            val r = PrinterManager.print(this, mac, transport, bytes)
            runOnUiThread {
                val msg = when (r) {
                    is PrinterManager.PrintResult.Success -> "测试打印已发送"
                    is PrinterManager.PrintResult.Failure -> "打印失败：${r.message}"
                }
                Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
                refreshConnStatus()
            }
        }
    }

    // ── 搜索 + 配对新设备 ──

    private fun startDiscovery() {
        if (!PrinterManager.isBluetoothReady(this)) {
            Toast.makeText(this, "请先开启蓝牙", Toast.LENGTH_SHORT).show()
            return
        }
        // Android 12 及以下（未加 neverForLocation）：经典蓝牙发现强依赖系统定位总开关
        if (!PrinterManager.isLocationServiceOn(this)) {
            AlertDialog.Builder(this)
                .setTitle(R.string.printer_discover_title)
                .setMessage(R.string.printer_scan_need_location)
                .setPositiveButton("去开启") { _, _ ->
                    try { startActivity(Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)) } catch (_: Throwable) {}
                }
                .setNegativeButton("取消", null)
                .show()
            return
        }
        foundDevices.clear()
        renderFoundDevices()
        val ok = PrinterManager.startDiscovery(this)
        if (!ok) {
            Toast.makeText(this, "启动扫描失败", Toast.LENGTH_SHORT).show()
            return
        }
        btnDiscover.isEnabled = false
        discoverProgress.visibility = View.VISIBLE
        tvDiscoverStatus.text = getString(R.string.printer_discover_scanning)
    }

    private fun renderFoundDevices() {
        containerFoundDevices.removeAllViews()
        val sorted = foundDevices.values.sortedByDescending { (_, rssi) -> rssi }
        for ((device, rssi) in sorted) {
            val name = safeDeviceName(device)
            val rssiLabel = when {
                rssi == Short.MIN_VALUE.toInt() -> ""
                rssi >= -60 -> "信号强 ($rssi dBm)"
                rssi >= -80 -> "信号中 ($rssi dBm)"
                else -> "信号弱 ($rssi dBm)"
            }
            val typeLabel = when (device.type) {
                BluetoothDevice.DEVICE_TYPE_LE -> "BLE"
                BluetoothDevice.DEVICE_TYPE_DUAL -> "经典+BLE"
                else -> "经典蓝牙"
            }
            val classLabel = btClassLabel(device)
            val lines = buildString {
                append(name)
                append("\nMAC: ${device.address}")
                append("   $typeLabel")
                if (classLabel.isNotEmpty()) append(" · $classLabel")
                if (rssiLabel.isNotEmpty()) append("\n$rssiLabel")
            }
            val tv = TextView(this).apply {
                text = lines
                textSize = 13f
                setPadding(dp(12), dp(12), dp(12), dp(12))
                setBackgroundResource(android.R.drawable.list_selector_background)
                setOnClickListener { confirmBond(device) }
            }
            containerFoundDevices.addView(tv)
        }
    }

    private fun btClassLabel(device: BluetoothDevice): String {
        return try {
            when (device.bluetoothClass?.majorDeviceClass) {
                android.bluetooth.BluetoothClass.Device.Major.IMAGING -> "打印/图像"
                android.bluetooth.BluetoothClass.Device.Major.COMPUTER -> "电脑"
                android.bluetooth.BluetoothClass.Device.Major.PHONE -> "手机"
                android.bluetooth.BluetoothClass.Device.Major.AUDIO_VIDEO -> "音频/视频"
                android.bluetooth.BluetoothClass.Device.Major.PERIPHERAL -> "外设"
                android.bluetooth.BluetoothClass.Device.Major.NETWORKING -> "网络设备"
                android.bluetooth.BluetoothClass.Device.Major.HEALTH -> "医疗"
                else -> ""
            }
        } catch (_: Throwable) { "" }
    }

    private fun confirmBond(device: BluetoothDevice) {
        val name = safeDeviceName(device)
        AlertDialog.Builder(this)
            .setTitle(R.string.printer_bond_title)
            .setMessage(getString(R.string.printer_bond_confirm, name))
            .setPositiveButton(R.string.printer_bond_action) { _, _ ->
                PrinterManager.cancelDiscovery(this)
                // 等蓝牙栈停止发现后再发起配对，避免系统配对对话框被阻断
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    if (!isFinishing && !isDestroyed) {
                        val ok = PrinterManager.bondDevice(device)
                        if (!ok) {
                            Toast.makeText(this, R.string.printer_bond_failed, Toast.LENGTH_SHORT).show()
                        } else {
                            Toast.makeText(this, R.string.printer_bond_pairing, Toast.LENGTH_SHORT).show()
                        }
                    }
                }, 300)
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun safeDeviceName(device: BluetoothDevice): String {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) {
                device.address
            } else {
                device.name ?: device.address
            }
        } catch (_: Throwable) {
            device.address
        }
    }

    // ── 权限 ──

    /** 连接/选择/测试打印所需的 BLUETOOTH_CONNECT（API 31+）。 */
    private fun ensureBluetoothPermission(reqCode: Int): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
            == PackageManager.PERMISSION_GRANTED
        ) return true
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BLUETOOTH_CONNECT), reqCode)
        return false
    }

    /** 扫描设备所需权限：31+ 需 SCAN+CONNECT；<31 需定位。 */
    private fun ensureScanPermission(): Boolean {
        val perms = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> {
                // Android 13+：BT 发现与位置彻底解耦
                arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
            }
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
                // Android 12：BLUETOOTH_SCAN 未加 neverForLocation，startDiscovery 仍需 ACCESS_FINE_LOCATION
                arrayOf(
                    Manifest.permission.BLUETOOTH_SCAN,
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.ACCESS_FINE_LOCATION
                )
            }
            else -> arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        val missing = perms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) return true
        // 已被「不再询问」永久拒绝时，requestPermissions 会静默无效，引导去系统设置
        val permanentlyDenied = missing.any { !ActivityCompat.shouldShowRequestPermissionRationale(this, it) }
        if (permanentlyDenied && hasRequestedScanPerm) {
            AlertDialog.Builder(this)
                .setTitle(R.string.printer_discover_title)
                .setMessage(R.string.printer_scan_need_permission)
                .setPositiveButton("去授权") { _, _ -> openAppSettings() }
                .setNegativeButton("取消", null)
                .show()
            return false
        }
        hasRequestedScanPerm = true
        ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_BT_SCAN)
        return false
    }

    private fun openAppSettings() {
        try {
            startActivity(Intent(
                android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package", packageName, null)
            ))
        } catch (_: Throwable) {}
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        if (!granted) {
            if (requestCode == REQ_BT_SCAN) {
                // 拒绝后给出明确指引，而非静默
                Toast.makeText(this, R.string.printer_scan_need_permission, Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(this, "需要相关权限才能继续", Toast.LENGTH_SHORT).show()
            }
            return
        }
        when (requestCode) {
            REQ_BT_SELECT -> showPrinterPicker()
            REQ_BT_TEST -> doTestPrint()
            REQ_BT_CHECK -> doCheckConnection()
            REQ_BT_SCAN -> startDiscovery()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    @Suppress("DEPRECATION")
    private fun getBluetoothDevice(intent: Intent): BluetoothDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }

    companion object {
        private const val REQ_BT_SELECT = 5201
        private const val REQ_BT_TEST = 5202
        private const val REQ_BT_SCAN = 5203
        private const val REQ_BT_CHECK = 5204
    }
}
