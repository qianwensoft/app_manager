package com.appmanager.agent.service

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.util.AppVersions
import com.appmanager.agent.util.DeviceInfoUtil
import com.appmanager.agent.util.DeviceMachineId
import com.appmanager.agent.util.DisplayUtil
import com.appmanager.agent.util.ForegroundAppDetector
import com.appmanager.agent.ws.DeviceInfoData

private data class WifiInfo(val ssid: String?, val signal: Int?, val speed: Int?)

private fun cpuUsage(): Float {
    return try {
        val reader = java.io.RandomAccessFile("/proc/stat", "r")
        val load = reader.readLine().split(" ").drop(2).map { it.toLong() }
        reader.close()
        val idle = load[3]
        val total = load.sum()
        val usage = (total - idle) * 100f / total
        usage.coerceIn(0f, 100f)
    } catch (_: Exception) {
        0f
    }
}

private fun networkType(context: Context): String {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val nc = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "None"
    return when {
        nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
        nc.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile"
        nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
        else -> "Unknown"
    }
}

private fun localIp(): String {
    return try {
        java.net.NetworkInterface.getNetworkInterfaces().toList()
            .flatMap { it.inetAddresses.toList() }
            .firstOrNull { !it.isLoopbackAddress && it is java.net.Inet4Address }
            ?.hostAddress ?: ""
    } catch (_: Exception) {
        ""
    }
}

private fun networkConnected(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val nc = cm.getNetworkCapabilities(cm.activeNetwork)
    return nc != null && nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
}

private fun wifiInfo(context: Context): WifiInfo {
    return try {
        val wm = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val info = wm.connectionInfo
        if (info.networkId == -1) {
            WifiInfo(null, null, null)
        } else {
            val ssid = info.ssid?.removeSurrounding("\"")
            val signal = WifiManager.calculateSignalLevel(info.rssi, 100)
            val speed = info.linkSpeed
            WifiInfo(ssid, signal, speed)
        }
    } catch (_: Exception) {
        WifiInfo(null, null, null)
    }
}

/** 与 [DeviceInfoCollector] 周期上报、即时推送使用同一套采集逻辑 */
fun collectDeviceInfoData(context: Context): DeviceInfoData {
    val memInfo = DeviceInfoUtil.getMemoryInfo(context)
    val storageInfo = DeviceInfoUtil.getStorageInfo()
    val battery = DeviceInfoUtil.getBatteryLevel(context)
    val w = wifiInfo(context)
    val config = AgentConfig.get(context)
    val (rw, rh) = DisplayUtil.getPhysicalDisplaySize(context)
    val resolution = "${rw}x${rh}"
    val foregroundPackage = ForegroundAppDetector.getForegroundPackageName(context)

    // 获取 X5 内核状态
    val x5Version = com.appmanager.agent.x5.X5KernelManager.getLocalVersion()
    val x5State = com.appmanager.agent.x5.X5KernelManager.getState().name

    // 获取 WebView 版本
    val webViewVersion = try {
        val pm = context.packageManager
        val webViewPackage = "com.google.android.webview"
        val chromePackage = "com.android.chrome"
        // 尝试获取 Android System WebView 版本
        try {
            pm.getPackageInfo(webViewPackage, 0).versionName ?: ""
        } catch (_: Exception) {
            // 如果没有安装，尝试获取 Chrome 版本（Android 7+ Chrome 可作为 WebView 提供者）
            try {
                pm.getPackageInfo(chromePackage, 0).versionName ?: ""
            } catch (_: Exception) {
                ""
            }
        }
    } catch (_: Exception) {
        ""
    }

    return DeviceInfoData(
        battery = battery,
        cpuUsage = cpuUsage(),
        memoryUsed = memInfo.used,
        memoryTotal = memInfo.total,
        storageUsed = storageInfo.usedMB,
        storageTotal = storageInfo.totalMB,
        networkType = networkType(context),
        ip = localIp(),
        model = android.os.Build.MODEL,
        brand = android.os.Build.BRAND,
        osVersion = android.os.Build.VERSION.RELEASE,
        sdkVersion = android.os.Build.VERSION.SDK_INT,
        wifiSsid = w.ssid,
        wifiSignal = w.signal,
        wifiSpeed = w.speed,
        networkConnected = networkConnected(context),
        agentAlias = config.deviceAlias,
        groupName = config.groupName,
        resolution = resolution,
        allowRemoteScreen = config.allowRemoteScreen,
        agentVersion = AppVersions.displayLabel(context),
        webViewVersion = webViewVersion,
        androidSerial = DeviceMachineId.get(context),
        foregroundPackage = foregroundPackage,
        x5KernelVersion = x5Version,
        x5KernelState = x5State
    )
}
