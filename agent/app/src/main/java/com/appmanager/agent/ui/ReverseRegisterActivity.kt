package com.appmanager.agent.ui

import android.content.Intent
import android.content.Context
import android.net.wifi.WifiManager
import android.os.Bundle
import android.text.format.Formatter
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.register.ReverseRegisterServer
import com.appmanager.agent.service.AgentService
import com.google.android.material.appbar.MaterialToolbar
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * 反向注册界面（电视等无摄像头端）。
 *
 * 显示「本机 IP + 端口 + 授权码」，并起 [ReverseRegisterServer] 等管理端浏览器直连认领。
 * 授权码每次进入界面随机生成；认领成功后写入配置、启动 [AgentService] 并结束本页。
 */
class ReverseRegisterActivity : AppCompatActivity() {

    private var server: ReverseRegisterServer? = null
    private lateinit var tvStatus: TextView

    companion object {
        private const val PORT = 8765
        private const val CODE_CHARS = "0123456789"
        private const val CODE_LEN = 4
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_reverse_register)
        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }

        tvStatus = findViewById(R.id.tvStatus)
        val tvIp = findViewById<TextView>(R.id.tvIp)
        val tvPort = findViewById<TextView>(R.id.tvPort)
        val tvAuthCode = findViewById<TextView>(R.id.tvAuthCode)

        val ip = localIpAddress()
        if (ip == null) {
            tvIp.text = "—"
            tvStatus.text = getString(R.string.reverse_register_no_network)
        } else {
            tvIp.text = ip
        }
        tvPort.text = PORT.toString()

        val authCode = randomCode()
        tvAuthCode.text = authCode
        startServer(authCode)
    }

    private fun startServer(authCode: String) {
        val srv = ReverseRegisterServer(applicationContext, PORT, authCode) { config ->
            onClaimed(config)
        }
        try {
            srv.start()
            server = srv
        } catch (e: Exception) {
            tvStatus.text = "端口占用或启动失败：${e.message}"
        }
    }

    private fun onClaimed(config: AgentConfig) {
        runOnUiThread {
            tvStatus.text = getString(R.string.reverse_register_success)
            if (config.serverUrl.isNotEmpty() && config.deviceToken.isNotEmpty()) {
                startForegroundService(Intent(this, AgentService::class.java))
            }
            Toast.makeText(this, R.string.reverse_register_success, Toast.LENGTH_LONG).show()
            // 给用户看清提示再退出
            tvStatus.postDelayed({ finish() }, 1500)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        server?.stop()
        server = null
    }

    private fun randomCode(): String {
        // 用机器码与时间派生，避免引入 Math.random / SecureRandom 的可预测争议；
        // 局域网一次性认领场景，6 位足够。
        val seed = (System.nanoTime() xor android.os.Build.FINGERPRINT.hashCode().toLong())
        var x = seed
        val sb = StringBuilder(CODE_LEN)
        repeat(CODE_LEN) {
            x = x * 6364136223846793005L + 1442695040888963407L
            val idx = ((x ushr 33).toInt() and 0x7fffffff) % CODE_CHARS.length
            sb.append(CODE_CHARS[idx])
        }
        return sb.toString()
    }

    /** 取本机局域网 IPv4 地址，优先 wlan。 */
    private fun localIpAddress(): String? {
        // 先试 WifiManager（Wi-Fi 直连场景）
        try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            val ipInt = wifi?.connectionInfo?.ipAddress ?: 0
            if (ipInt != 0) {
                @Suppress("DEPRECATION")
                return Formatter.formatIpAddress(ipInt)
            }
        } catch (_: Exception) {
        }
        // 回退遍历网卡（有线网/盒子）
        try {
            for (nif in NetworkInterface.getNetworkInterfaces()) {
                if (!nif.isUp || nif.isLoopback) continue
                for (addr in nif.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (_: Exception) {
        }
        return null
    }
}
