package com.appmanager.agent.ui

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.appmanager.agent.R
import com.appmanager.agent.auth.AgentAuth
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 独立登录页：账号密码登录后写入 [AgentAuth] 登录态。
 * 登录成功以 RESULT_OK 结束，便于调用方（菜单点击守卫）继续打开原目标菜单。
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var etUsername: EditText
    private lateinit var etPassword: EditText
    private lateinit var btnLogin: MaterialButton
    private lateinit var tvHint: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        findViewById<MaterialToolbar>(R.id.toolbar).setNavigationOnClickListener { finish() }

        etUsername = findViewById(R.id.etUsername)
        etPassword = findViewById(R.id.etPassword)
        btnLogin = findViewById(R.id.btnLogin)
        tvHint = findViewById(R.id.tvLoginHint)

        // 菜单守卫拉起登录时提示「需要登录」
        if (intent.getBooleanExtra(EXTRA_REQUIRED_HINT, false)) {
            tvHint.text = getString(R.string.login_required_hint)
            tvHint.visibility = View.VISIBLE
        }

        btnLogin.setOnClickListener { doLogin() }
    }

    private fun doLogin() {
        val username = etUsername.text.toString().trim()
        val password = etPassword.text.toString()
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, R.string.login_empty_input, Toast.LENGTH_SHORT).show()
            return
        }
        setLoading(true)
        lifecycleScope.launch {
            val error = withContext(Dispatchers.IO) {
                AgentAuth.login(this@LoginActivity, username, password)
            }
            setLoading(false)
            if (error == null) {
                Toast.makeText(this@LoginActivity, R.string.login_success, Toast.LENGTH_SHORT).show()
                setResult(Activity.RESULT_OK)
                finish()
            } else {
                tvHint.text = error
                tvHint.visibility = View.VISIBLE
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        btnLogin.isEnabled = !loading
        btnLogin.setText(if (loading) R.string.login_in_progress else R.string.login_btn)
        etUsername.isEnabled = !loading
        etPassword.isEnabled = !loading
    }

    companion object {
        /** true 时在登录页顶部提示「该功能需要登录」。 */
        const val EXTRA_REQUIRED_HINT = "required_hint"
    }
}
