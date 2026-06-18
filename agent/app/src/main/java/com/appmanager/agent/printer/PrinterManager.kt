package com.appmanager.agent.printer

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * 蓝牙打印机连接与写入管理（单例）。
 *
 * - 经典蓝牙（SPP/RFCOMM）：BluetoothSocket，UUID 00001101-...
 * - 低功耗蓝牙（BLE）：BluetoothGatt，写特征，分包 ≤20B
 *
 * 维护"当前连接"，相同 MAC 复用；写入失败时尝试重连一次。
 * 所有蓝牙调用前检查 BLUETOOTH_CONNECT 权限（API 31+）。
 */
object PrinterManager {
    private const val TAG = "PrinterManager"
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    data class PrinterInfo(val name: String, val mac: String)

    sealed class PrintResult {
        object Success : PrintResult()
        data class Failure(val message: String) : PrintResult()
    }

    /** 当前连接状态快照，供 UI 展示。 */
    data class ConnState(val connected: Boolean, val mac: String, val transport: String)

    // ── 经典蓝牙连接状态 ──
    private var sppSocket: BluetoothSocket? = null
    private var sppOut: OutputStream? = null
    private var sppMac: String = ""

    // ── BLE 连接状态 ──
    private var gatt: BluetoothGatt? = null
    private var writeChar: BluetoothGattCharacteristic? = null
    private var bleMac: String = ""

    private fun adapter(context: Context): BluetoothAdapter? {
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        return mgr?.adapter
    }

    private fun hasConnectPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.BLUETOOTH_CONNECT
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** 列出已配对蓝牙设备。 */
    @SuppressLint("MissingPermission")
    fun listPairedPrinters(context: Context): List<PrinterInfo> {
        if (!hasConnectPermission(context)) return emptyList()
        val ad = adapter(context) ?: return emptyList()
        if (!ad.isEnabled) return emptyList()
        return try {
            ad.bondedDevices.map { PrinterInfo(it.name ?: it.address, it.address) }
        } catch (t: Throwable) {
            Log.e(TAG, "listPairedPrinters failed", t)
            emptyList()
        }
    }

    /** 蓝牙是否可用（已开启）。 */
    fun isBluetoothReady(context: Context): Boolean {
        val ad = adapter(context) ?: return false
        return ad.isEnabled
    }

    /**
     * 系统定位开关是否打开。Android <= 11（API<=30）经典蓝牙发现强依赖系统定位，
     * 即使已授予权限，定位总开关关闭时 startDiscovery 也扫描不到任何设备。
     */
    fun isLocationServiceOn(context: Context): Boolean {
        // 12+ 用 BLUETOOTH_SCAN，与定位解耦，无需检查
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return true
        return try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager
            lm?.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) == true ||
                lm?.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER) == true
        } catch (_: Throwable) {
            true // 查询失败不阻断流程
        }
    }

    /** 当前连接状态：连接对象存在且 socket 仍连接视为已连。 */
    @Synchronized
    fun connectionState(): ConnState {
        if (sppSocket?.isConnected == true && sppMac.isNotEmpty()) {
            return ConnState(true, sppMac, "spp")
        }
        if (gatt != null && writeChar != null && bleMac.isNotEmpty()) {
            return ConnState(true, bleMac, "ble")
        }
        return ConnState(false, "", "")
    }

    /** 主动建立连接（不打印），用于「检测连接」。阻塞式，调用方在 IO 线程执行。 */
    @SuppressLint("MissingPermission")
    @Synchronized
    fun connectOnly(context: Context, mac: String, transport: String): PrintResult {
        if (mac.isEmpty()) return PrintResult.Failure("未配置默认打印机")
        if (!hasConnectPermission(context)) return PrintResult.Failure("缺少蓝牙连接权限")
        val ad = adapter(context) ?: return PrintResult.Failure("设备不支持蓝牙")
        if (!ad.isEnabled) return PrintResult.Failure("蓝牙未开启")
        return try {
            if (transport.equals("ble", ignoreCase = true)) {
                ensureBleConnected(context, ad, mac)
                if (gatt != null && writeChar != null) PrintResult.Success
                else PrintResult.Failure("BLE 连接失败或未找到可写特征")
            } else {
                ensureSppConnected(ad, mac)
                if (sppOut != null) PrintResult.Success else PrintResult.Failure("打印机连接失败")
            }
        } catch (t: Throwable) {
            Log.e(TAG, "connectOnly failed", t)
            PrintResult.Failure(t.message ?: "连接失败")
        }
    }

    /** 开始扫描周边蓝牙设备。结果由调用方注册的 BroadcastReceiver(ACTION_FOUND) 接收。 */
    @SuppressLint("MissingPermission")
    fun startDiscovery(context: Context): Boolean {
        val ad = adapter(context) ?: return false
        if (!ad.isEnabled) return false
        return try {
            if (ad.isDiscovering) ad.cancelDiscovery()
            ad.startDiscovery()
        } catch (t: Throwable) {
            Log.e(TAG, "startDiscovery failed", t)
            false
        }
    }

    @SuppressLint("MissingPermission")
    fun cancelDiscovery(context: Context) {
        try {
            val ad = adapter(context) ?: return
            if (ad.isDiscovering) ad.cancelDiscovery()
        } catch (_: Throwable) {}
    }

    /** 发起配对。配对结果由调用方监听 ACTION_BOND_STATE_CHANGED 获取。 */
    @SuppressLint("MissingPermission")
    fun bondDevice(device: BluetoothDevice): Boolean {
        return try {
            if (device.bondState == BluetoothDevice.BOND_BONDED) true
            else device.createBond()
        } catch (t: Throwable) {
            Log.e(TAG, "createBond failed", t)
            false
        }
    }

    /**
     * 打印字节。transport: "spp" | "ble"。返回结果。
     * 该方法为阻塞式，调用方应在 IO 线程执行。
     */
    @SuppressLint("MissingPermission")
    @Synchronized
    fun print(context: Context, mac: String, transport: String, bytes: ByteArray): PrintResult {
        if (mac.isEmpty()) return PrintResult.Failure("未配置默认打印机")
        if (!hasConnectPermission(context)) return PrintResult.Failure("缺少蓝牙连接权限")
        val ad = adapter(context) ?: return PrintResult.Failure("设备不支持蓝牙")
        if (!ad.isEnabled) return PrintResult.Failure("蓝牙未开启")

        return try {
            if (transport.equals("ble", ignoreCase = true)) {
                printBle(context, ad, mac, bytes)
            } else {
                printSpp(ad, mac, bytes)
            }
        } catch (t: Throwable) {
            Log.e(TAG, "print failed", t)
            PrintResult.Failure(t.message ?: "打印失败")
        }
    }

    // ── 经典蓝牙 SPP ──
    @SuppressLint("MissingPermission")
    private fun printSpp(ad: BluetoothAdapter, mac: String, bytes: ByteArray): PrintResult {
        ensureSppConnected(ad, mac)
        val out = sppOut ?: return PrintResult.Failure("打印机连接失败")
        return try {
            out.write(bytes)
            out.flush()
            PrintResult.Success
        } catch (t: Throwable) {
            // 写失败，重连一次再试
            Log.w(TAG, "spp write failed, reconnect once", t)
            closeSpp()
            ensureSppConnected(ad, mac)
            val out2 = sppOut ?: return PrintResult.Failure("打印机重连失败：${t.message}")
            out2.write(bytes)
            out2.flush()
            PrintResult.Success
        }
    }

    @SuppressLint("MissingPermission")
    private fun ensureSppConnected(ad: BluetoothAdapter, mac: String) {
        if (sppMac == mac && sppSocket?.isConnected == true && sppOut != null) return
        closeSpp()
        val device: BluetoothDevice = ad.getRemoteDevice(mac)
        ad.cancelDiscovery()
        val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
        try {
            socket.connect()
        } catch (t: Throwable) {
            // 杂牌小票机 SDP 不规范时标准 connect 常失败，反射走通道 1 兜底
            Log.w(TAG, "standard rfcomm connect failed, try reflection channel 1", t)
            try { socket.close() } catch (_: Throwable) {}
            val fallback = createRfcommFallback(device)
            fallback.connect()
            sppSocket = fallback
            sppOut = fallback.outputStream
            sppMac = mac
            return
        }
        sppSocket = socket
        sppOut = socket.outputStream
        sppMac = mac
    }

    /** 反射调用隐藏 API createRfcommSocket(int) 走固定通道 1。 */
    private fun createRfcommFallback(device: BluetoothDevice): BluetoothSocket {
        val m = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
        return m.invoke(device, 1) as BluetoothSocket
    }

    private fun closeSpp() {
        try { sppOut?.close() } catch (_: Throwable) {}
        try { sppSocket?.close() } catch (_: Throwable) {}
        sppOut = null
        sppSocket = null
        sppMac = ""
    }

    // ── BLE ──
    @SuppressLint("MissingPermission")
    private fun printBle(context: Context, ad: BluetoothAdapter, mac: String, bytes: ByteArray): PrintResult {
        ensureBleConnected(context, ad, mac)
        val g = gatt ?: return PrintResult.Failure("BLE 连接失败")
        val ch = writeChar ?: return PrintResult.Failure("未找到可写特征")
        // 分包 ≤20 字节循环写
        var offset = 0
        while (offset < bytes.size) {
            val end = minOf(offset + 20, bytes.size)
            val chunk = bytes.copyOfRange(offset, end)
            @Suppress("DEPRECATION")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeCharacteristic(ch, chunk, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)
            } else {
                ch.value = chunk
                ch.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                g.writeCharacteristic(ch)
            }
            offset = end
            Thread.sleep(20) // 给 BLE 栈留出节奏
        }
        return PrintResult.Success
    }

    @SuppressLint("MissingPermission")
    private fun ensureBleConnected(context: Context, ad: BluetoothAdapter, mac: String) {
        if (bleMac == mac && gatt != null && writeChar != null) return
        closeBle()
        val device = ad.getRemoteDevice(mac)
        val latch = CountDownLatch(1)
        val cb = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothGatt.STATE_CONNECTED) {
                    g.discoverServices()
                }
            }
            @SuppressLint("MissingPermission")
            override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
                // 选第一个可写特征
                outer@ for (svc in g.services) {
                    for (c in svc.characteristics) {
                        val props = c.properties
                        if (props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0 ||
                            props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) {
                            writeChar = c
                            break@outer
                        }
                    }
                }
                latch.countDown()
            }
        }
        gatt = device.connectGatt(context, false, cb)
        bleMac = mac
        latch.await(8, TimeUnit.SECONDS)
    }

    @SuppressLint("MissingPermission")
    private fun closeBle() {
        try { gatt?.close() } catch (_: Throwable) {}
        gatt = null
        writeChar = null
        bleMac = ""
    }
}
