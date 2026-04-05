<template>
  <div class="register-root">
    <div class="register-left">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="48" height="48" rx="12" fill="rgba(255,255,255,0.15)" />
            <path d="M14 16a2 2 0 012-2h16a2 2 0 012 2v2H14v-2z" fill="white" />
            <rect x="14" y="20" width="20" height="14" rx="1" fill="white" fill-opacity="0.9" />
            <rect x="12" y="34" width="24" height="2" rx="1" fill="white" fill-opacity="0.7" />
            <circle cx="24" cy="27" r="3" fill="#409EFF" />
          </svg>
        </div>
        <div class="brand-name">AppManager</div>
        <div class="brand-tag">Android 设备远程管理平台</div>
      </div>
      <div class="intro-text">
        <p>注册后您将获得 <strong>查看者</strong> 权限，管理员可后续为您分配更多权限。</p>
        <p>通过 AppManager，您可以在任意浏览器内实时查看设备状态、屏幕投影及应用信息。</p>
      </div>
      <div class="left-footer">
        © 2025 AppManager · 企业级 Android 设备管理解决方案
      </div>
    </div>

    <div class="register-right">
      <div class="register-box">
        <div class="form-header">
          <h2>创建账号</h2>
          <p>加入 AppManager 设备管理平台</p>
        </div>

        <el-form :model="form" :rules="rules" ref="formRef" label-position="top" @submit.prevent="handleRegister">
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              size="large"
              clearable
            >
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请设置密码（至少 6 位）"
              size="large"
              show-password
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="确认密码" prop="confirm">
            <el-input
              v-model="form.confirm"
              type="password"
              placeholder="请再次输入密码"
              size="large"
              show-password
              @keyup.enter="handleRegister"
            >
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-button
            type="primary"
            native-type="submit"
            :loading="loading"
            size="large"
            style="width: 100%; margin-top: 8px"
          >
            {{ loading ? '注册中...' : '注 册' }}
          </el-button>
        </el-form>

        <div class="login-link">
          已有账号？
          <router-link to="/login">立即登录</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const formRef = ref(null)
const loading = ref(false)
const router = useRouter()
const form = ref({ username: '', password: '', confirm: '' })

const validateConfirm = (_, value, callback) => {
  if (value !== form.value.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 32, message: '用户名长度 2-32 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ],
  confirm: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' }
  ]
}

const handleRegister = async () => {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await http.post('/auth/register', {
      username: form.value.username,
      password: form.value.password
    })
    ElMessage.success('注册成功，请登录')
    router.push('/login')
  } catch (e) {
    const msg = e?.response?.data?.error || '注册失败'
    if (msg.includes('disabled')) {
      ElMessage.error('当前系统已关闭注册功能，请联系管理员')
    } else if (msg.includes('already exists') || msg.includes('Duplicate')) {
      ElMessage.error('用户名已被占用，请换一个')
    } else {
      ElMessage.error(msg)
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-root {
  display: flex;
  height: 100vh;
  min-height: 600px;
  background: #f0f2f5;
}

/* ---- 左侧 ---- */
.register-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 64px;
  background: linear-gradient(135deg, #1a6fc4 0%, #2563eb 40%, #4f46e5 100%);
  color: white;
  position: relative;
  overflow: hidden;
}
.register-left::before {
  content: '';
  position: absolute;
  top: -120px; right: -120px;
  width: 400px; height: 400px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
}
.brand {
  margin-bottom: 48px;
}
.brand-icon { width: 64px; height: 64px; margin-bottom: 16px; }
.brand-icon svg { width: 100%; height: 100%; }
.brand-name { font-size: 32px; font-weight: 700; letter-spacing: 1px; }
.brand-tag { margin-top: 8px; font-size: 14px; opacity: 0.75; }

.intro-text p {
  font-size: 15px;
  line-height: 1.8;
  opacity: 0.85;
  margin: 0 0 16px;
}
.intro-text strong { font-weight: 600; }

.left-footer {
  position: absolute;
  bottom: 32px; left: 64px;
  font-size: 12px;
  opacity: 0.45;
}

/* ---- 右侧 ---- */
.register-right {
  width: 440px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0,0,0,0.06);
}
.register-box { width: 340px; }
.form-header { margin-bottom: 32px; }
.form-header h2 { font-size: 26px; font-weight: 700; color: #1a1a2e; margin: 0 0 8px; }
.form-header p { color: #909399; font-size: 14px; margin: 0; }
.login-link {
  margin-top: 20px;
  text-align: center;
  font-size: 14px;
  color: #909399;
}
.login-link a {
  color: #409eff;
  text-decoration: none;
  font-weight: 500;
}
.login-link a:hover { text-decoration: underline; }

@media (max-width: 768px) {
  .register-left { display: none; }
  .register-right { width: 100%; box-shadow: none; }
}
</style>
