package com.appmanager.agent.config

import android.content.Context

data class AgentConfig(
    val serverUrl: String = "",
    val deviceToken: String = "",
    val screenFps: Int = 10,
    val screenQuality: Int = 60,
    val deviceAlias: String = "",
    val groupName: String = "",
    val autoScreenCapture: Boolean = false,
    val autoAcceptScreenCapture: Boolean = false,
    /** Web 打开「屏幕查看」前须在端上勾选，否则拒绝 start_screen */
    val allowRemoteScreen: Boolean = false,
    /** 默认蓝牙打印机 MAC（空=未配置） */
    val defaultPrinterMac: String = "",
    /** 默认打印机显示名 */
    val defaultPrinterName: String = "",
    /** 默认打印协议：cpcl / escpos / tspl */
    val defaultPrinterProtocol: String = "escpos",
    /** 传输方式：spp（经典蓝牙）/ ble */
    val defaultPrinterTransport: String = "spp",
    /** CPCL 二维码是否携带字符长度前缀（MA,长度格式），默认 false（使用 MM,数据格式） */
    val cpclQrWithLength: Boolean = false,
    /**
     * 表单运行时基址覆盖（仅调试用，空=用 serverUrl）。
     * 指向开发机的 `vite preview`（如 http://192.168.1.x:4175），
     * 让真机直接加载设计器构建产物，无需 make 发布到后端。
     */
    val formAppBaseUrl: String = "",
    /**
     * 扫码方式：hardware（硬件扫码枪，监听广播）/ camera（摄像头扫码）。
     * 硬件模式下表单运行时隐藏扫码悬浮按钮，仅用扫码枪广播。
     */
    val scanMode: String = SCAN_MODE_HARDWARE,
    /** 用户登录后的 JWT token（供 form-app 运行时调用需要用户身份的接口）。 */
    val userToken: String = "",
    /** 登录用户名（用于个人中心展示登录状态，空=未登录）。 */
    val userName: String = "",
    /** 用户登录角色（admin / operator / viewer）。 */
    val userRole: String = "",
    /** 用于无感续期的 refresh token（服务端签发，30 天有效）。 */
    val refreshToken: String = "",
    /** access token 的过期 Unix 时间戳（秒）；0 = 旧版兼容（不检查）。 */
    val userTokenExpiry: Long = 0L,
    /** 后台下发的自定义扫描广播事件 JSON 数组（["action1","action2"]）。 */
    val customScanActionsJson: String = "",
) {
    companion object {
        private const val PREFS_NAME = "agent_config"

        const val SCAN_MODE_HARDWARE = "hardware"
        const val SCAN_MODE_CAMERA = "camera"

        /**
         * 默认扫码方式：常用手机品牌（无内置扫码枪的消费机）默认摄像头扫码，
         * 其余（工业 PDA / 手持终端）默认硬件扫码。用户可在设置中覆盖。
         */
        private val CONSUMER_PHONE_BRANDS = listOf(
            "xiaomi", "redmi", "huawei", "honor", "oppo", "vivo", "oneplus",
            "samsung", "meizu", "realme", "google", "motorola", "nothing", "iqoo"
        )

        fun defaultScanMode(): String {
            val brand = android.os.Build.BRAND.lowercase()
            val manufacturer = android.os.Build.MANUFACTURER.lowercase()
            val isConsumer = CONSUMER_PHONE_BRANDS.any { brand.contains(it) || manufacturer.contains(it) }
            return if (isConsumer) SCAN_MODE_CAMERA else SCAN_MODE_HARDWARE
        }

        fun get(context: Context): AgentConfig {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return AgentConfig(
                serverUrl = prefs.getString("server_url", "") ?: "",
                deviceToken = prefs.getString("device_token", "") ?: "",
                screenFps = prefs.getInt("screen_fps", 10),
                screenQuality = prefs.getInt("screen_quality", 60),
                deviceAlias = prefs.getString("device_alias", "") ?: "",
                groupName = prefs.getString("group_name", "") ?: "",
                autoScreenCapture = prefs.getBoolean("auto_screen_capture", false),
                autoAcceptScreenCapture = prefs.getBoolean("auto_accept_screen_capture", false),
                allowRemoteScreen = prefs.getBoolean("allow_remote_screen", false),
                defaultPrinterMac = prefs.getString("default_printer_mac", "") ?: "",
                defaultPrinterName = prefs.getString("default_printer_name", "") ?: "",
                defaultPrinterProtocol = prefs.getString("default_printer_protocol", "escpos") ?: "escpos",
                defaultPrinterTransport = prefs.getString("default_printer_transport", "spp") ?: "spp",
                cpclQrWithLength = prefs.getBoolean("cpcl_qr_with_length", false),
                formAppBaseUrl = prefs.getString("form_app_base_url", "") ?: "",
                // 未设置过时按品牌给默认值（消费手机→摄像头，PDA→硬件）
                scanMode = prefs.getString("scan_mode", null) ?: defaultScanMode(),
                userToken = prefs.getString("user_token", "") ?: "",
                userName = prefs.getString("user_name", "") ?: "",
                userRole = prefs.getString("user_role", "") ?: "",
                refreshToken = prefs.getString("refresh_token", "") ?: "",
                userTokenExpiry = prefs.getLong("user_token_expiry", 0L),
                customScanActionsJson = prefs.getString("custom_scan_actions_json", "") ?: "",
            )
        }

        fun save(context: Context, config: AgentConfig) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().apply {
                putString("server_url", config.serverUrl)
                putString("device_token", config.deviceToken)
                putInt("screen_fps", config.screenFps)
                putInt("screen_quality", config.screenQuality)
                putString("device_alias", config.deviceAlias)
                putString("group_name", config.groupName)
                putBoolean("auto_screen_capture", config.autoScreenCapture)
                putBoolean("auto_accept_screen_capture", config.autoAcceptScreenCapture)
                putBoolean("allow_remote_screen", config.allowRemoteScreen)
                putString("default_printer_mac", config.defaultPrinterMac)
                putString("default_printer_name", config.defaultPrinterName)
                putString("default_printer_protocol", config.defaultPrinterProtocol)
                putString("default_printer_transport", config.defaultPrinterTransport)
                putBoolean("cpcl_qr_with_length", config.cpclQrWithLength)
                putString("form_app_base_url", config.formAppBaseUrl)
                putString("scan_mode", config.scanMode)
                putString("user_token", config.userToken)
                putString("user_name", config.userName)
                putString("user_role", config.userRole)
                putString("refresh_token", config.refreshToken)
                putLong("user_token_expiry", config.userTokenExpiry)
                putString("custom_scan_actions_json", config.customScanActionsJson)
                apply()
            }
        }
    }
}
