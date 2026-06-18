package com.appmanager.agent.ui

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.appmanager.agent.R
import com.appmanager.agent.auth.AgentAuth
import com.appmanager.agent.config.AgentConfig
import com.appmanager.agent.config.AgentRegistration
import com.appmanager.agent.service.AgentService
import com.appmanager.agent.util.DeviceMachineId
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton

/** 设备别名、分组等档案信息（与服务器连接类设置分离）。 */
class PersonalCenterActivity : AppCompatActivity() {

    private lateinit var etDeviceAlias: EditText
    private lateinit var etGroupName: EditText
    private lateinit var tvLoginStatus: TextView
    private lateinit var btnLoginAction: MaterialButton

    private val loginLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { refreshLoginStatus() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_personal_center)

        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }

        etDeviceAlias = findViewById(R.id.etDeviceAlias)
        etGroupName = findViewById(R.id.etGroupName)
        tvLoginStatus = findViewById(R.id.tvLoginStatus)
        btnLoginAction = findViewById(R.id.btnLoginAction)
        val tvMachineCode = findViewById<TextView>(R.id.tvMachineCode)

        val config = AgentRegistration.ensureMachineCodeConfig(this)
        val code = DeviceMachineId.get(this).ifEmpty { config.deviceToken }
        tvMachineCode.text = code.ifEmpty { getString(R.string.personal_center_no_machine_code) }
        etDeviceAlias.setText(config.deviceAlias)
        etGroupName.setText(config.groupName)

        refreshLoginStatus()

        findViewById<android.view.View>(R.id.btnSave).setOnClickListener {
            val cur = AgentConfig.get(this)
            val next = cur.copy(
                deviceAlias = etDeviceAlias.text.toString().trim(),
                groupName = etGroupName.text.toString().trim()
            )
            AgentConfig.save(this, next)
            if (cur.serverUrl.isNotBlank()) {
                startForegroundService(Intent(this, AgentService::class.java))
            }
            Toast.makeText(this, R.string.personal_center_saved, Toast.LENGTH_SHORT).show()
            setResult(Activity.RESULT_OK)
            finish()
        }
    }

    /** 刷新登录状态卡片：已登录显示用户名/角色 + 退出登录；未登录显示「去登录」。 */
    private fun refreshLoginStatus() {
        val cfg = AgentConfig.get(this)
        if (cfg.userToken.isNotBlank()) {
            val role = cfg.userRole.ifEmpty { "—" }
            tvLoginStatus.text = getString(R.string.personal_center_logged_in_as, cfg.userName, role)
            btnLoginAction.setText(R.string.personal_center_logout)
            btnLoginAction.setOnClickListener {
                AgentAuth.logout(this)
                Toast.makeText(this, R.string.personal_center_logged_out, Toast.LENGTH_SHORT).show()
                refreshLoginStatus()
            }
        } else {
            tvLoginStatus.text = getString(R.string.personal_center_not_logged_in)
            btnLoginAction.setText(R.string.personal_center_go_login)
            btnLoginAction.setOnClickListener {
                loginLauncher.launch(Intent(this, LoginActivity::class.java))
            }
        }
    }
}
