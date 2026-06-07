package com.appmanager.agent.ui

import android.os.Build
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.util.AppVersions
import com.google.android.material.appbar.MaterialToolbar

class AboutActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_about)

        val toolbar = findViewById<MaterialToolbar>(R.id.toolbar)
        toolbar.setNavigationOnClickListener { finish() }

        // 版本信息
        findViewById<TextView>(R.id.tvAboutVersion).text =
            getString(R.string.about_version) + ": " + AppVersions.displayLabel(this)

        // 构建时间
        findViewById<TextView>(R.id.tvAboutBuildTime).text =
            getString(R.string.about_build_time) + ": " + getBuildTime()

        // 设备型号
        findViewById<TextView>(R.id.tvAboutDeviceModel).text =
            getString(R.string.about_device_model) + ": " + Build.MODEL

        // Android 版本
        findViewById<TextView>(R.id.tvAboutAndroidVersion).text =
            getString(R.string.about_android_version) + ": Android " + Build.VERSION.RELEASE
    }

    private fun getBuildTime(): String {
        return try {
            val info = packageManager.getPackageInfo(packageName, 0)
            val time = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info.lastUpdateTime
            } else {
                @Suppress("DEPRECATION")
                info.lastUpdateTime
            }
            java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date(time))
        } catch (e: Exception) {
            "未知"
        }
    }
}
