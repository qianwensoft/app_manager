<template>
  <div class="login-root">
    <!-- 左侧：产品介绍 -->
    <div class="login-left">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="磐石">
            <g fill="currentColor">
              <path d="M128 150 L210 196 L128 242 L46 196 Z" opacity="0.55"/>
              <path d="M128 100 L186 132 L128 164 L70 132 Z" opacity="0.78"/>
            </g>
            <path d="M128 46 L164 67 L128 88 L92 67 Z" fill="#3BE0C8"/>
            <line x1="128" y1="88" x2="128" y2="104" stroke="#3BE0C8" stroke-width="4" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="brand-name">磐石 <span class="brand-en">BEDROCK</span></div>
        <div class="brand-tag">企业级现场管理与数字化平台 · 可内网自托管</div>
      </div>

      <div class="feature-list">
        <div class="feature-item" v-for="f in features" :key="f.title">
          <div class="feature-icon">{{ f.icon }}</div>
          <div class="feature-text">
            <div class="feature-title">{{ f.title }}</div>
            <div class="feature-desc">{{ f.desc }}</div>
          </div>
        </div>
      </div>

      <div class="left-footer">
        © 2025 磐石 Bedrock · 企业现场数字化一体方案
      </div>
    </div>

    <!-- 右侧：登录表单 -->
    <div class="login-right">
      <div class="login-box">
        <div class="form-header">
          <h2>欢迎回来</h2>
          <p>请登录您的账号以继续</p>
        </div>

        <el-form :model="form" @submit.prevent="handleLogin" class="login-form">
          <el-form-item>
            <el-input
              v-model="form.username"
              placeholder="用户名"
              size="large"
              clearable
              @keyup.enter="handleLogin"
            >
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              size="large"
              show-password
              clearable
              @keyup.enter="handleLogin"
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
            {{ loading ? '登录中...' : '登 录' }}
          </el-button>
        </el-form>

        <!-- 注册入口：仅在允许注册时显示 -->
        <div v-if="allowRegister" class="register-link">
          还没有账号？
          <router-link to="/register">立即注册</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { getSetupStatus } from '@/api/setup'

const form = ref({ username: '', password: '' })
const loading = ref(false)
const allowRegister = ref(false)
const router = useRouter()
const auth = useAuthStore()

const features = [
  { icon: '📱', title: 'Android 设备管理', desc: 'PDA / 工业手持终端远程画面、触控、Shell、APK 分发、屏幕分享' },
  { icon: '🔗', title: 'ESB 系统集成', desc: '出站连接器、数据栈、第三方 SSO、双向对接外部 ERP / MES / 钉钉' },
  { icon: '📝', title: 'PDA 低码平台', desc: 'Form App 小屏表单设计器、扫码联动、蓝牙打印机、一键下发到设备' },
  { icon: '📋', title: '工单全生命周期', desc: '工单派发、扫码定位、设备快照、状态流转、实时看板、时间线追踪' },
  { icon: '🎛️', title: '多屏联动工作流', desc: '组态 SCADA 编辑器、DAG 工作流编排、事件引擎、实时数据可视化' },
]

onMounted(async () => {
  try {
    const res = await getSetupStatus()
    allowRegister.value = res.allow_register === true
  } catch {}
})

const handleLogin = async () => {
  if (!form.value.username || !form.value.password) return
  loading.value = true
  try {
    await auth.login(form.value.username, form.value.password)
    router.push('/')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-root {
  display: flex;
  height: 100vh;
  min-height: 600px;
  background: #f0f2f5;
}

/* ---- 左侧 ---- */
.login-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 64px;
  background: linear-gradient(135deg, #16202E 0%, #1F3147 45%, #0E9384 100%);
  color: white;
  position: relative;
  overflow: hidden;
}
.login-left::before {
  content: '';
  position: absolute;
  top: -120px; right: -120px;
  width: 400px; height: 400px;
  border-radius: 50%;
  background: rgba(255,255,255,0.06);
}
.login-left::after {
  content: '';
  position: absolute;
  bottom: -80px; left: -80px;
  width: 300px; height: 300px;
  border-radius: 50%;
  background: rgba(255,255,255,0.05);
}

.brand {
  margin-bottom: 56px;
}
.brand-icon {
  width: 64px; height: 64px;
  margin-bottom: 16px;
}
.brand-icon svg { width: 100%; height: 100%; }
.brand-name {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 2px;
}
.brand-en {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  color: #3BE0C8;
  margin-left: 6px;
  vertical-align: 4px;
}
.brand-tag {
  margin-top: 8px;
  font-size: 14px;
  opacity: 0.75;
}

.feature-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.feature-icon {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}
.feature-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.feature-desc {
  font-size: 13px;
  opacity: 0.75;
  line-height: 1.5;
}

.left-footer {
  position: absolute;
  bottom: 32px; left: 64px;
  font-size: 12px;
  opacity: 0.45;
}

/* ---- 右侧 ---- */
.login-right {
  width: 440px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0,0,0,0.06);
}
.login-box {
  width: 340px;
}
.form-header {
  margin-bottom: 36px;
}
.form-header h2 {
  font-size: 26px;
  font-weight: 700;
  color: #1a1a2e;
  margin: 0 0 8px;
}
.form-header p {
  color: #909399;
  font-size: 14px;
  margin: 0;
}
.login-form {
  :deep(.el-input__wrapper) {
    padding: 4px 12px;
  }
}
.register-link {
  margin-top: 20px;
  text-align: center;
  font-size: 14px;
  color: #909399;
}
.register-link a {
  color: #409eff;
  text-decoration: none;
  font-weight: 500;
}
.register-link a:hover {
  text-decoration: underline;
}

/* 响应式：窄屏只显示右侧 */
@media (max-width: 768px) {
  .login-left { display: none; }
  .login-right { width: 100%; box-shadow: none; }
}
</style>
