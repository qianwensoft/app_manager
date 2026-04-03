<template>
  <div class="setup-wrap">
    <el-card class="setup-card">
      <h2>AppManager 安装向导</h2>
      <el-steps :active="step" finish-status="success" align-center style="margin-bottom: 30px">
        <el-step title="数据库配置" />
        <el-step title="服务配置" />
        <el-step title="管理员账户" />
        <el-step title="完成" />
      </el-steps>

      <!-- Step 1: 数据库配置 -->
      <div v-if="step === 0">
        <el-form :model="form" label-width="120px">
          <el-form-item label="数据库类型">
            <el-radio-group v-model="form.db_type">
              <el-radio value="sqlite">SQLite</el-radio>
              <el-radio value="mysql">MySQL</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="数据库路径" v-if="form.db_type === 'sqlite'">
            <el-input v-model="form.db_dsn" placeholder="./data/app-manager.db" />
          </el-form-item>
          <el-form-item label="连接字符串" v-if="form.db_type === 'mysql'">
            <el-input v-model="form.db_dsn" placeholder="user:password@tcp(127.0.0.1:3306)/dbname?charset=utf8mb4&parseTime=True" />
          </el-form-item>
          <el-form-item>
            <el-button @click="testDb" :loading="testing">测试连接</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- Step 2: 服务配置 -->
      <div v-if="step === 1">
        <el-form :model="form" label-width="120px">
          <el-form-item label="监听地址">
            <el-input v-model="form.server_host" placeholder="0.0.0.0" />
          </el-form-item>
          <el-form-item label="监听端口">
            <el-input-number v-model="form.server_port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="JWT Secret">
            <el-input v-model="form.jwt_secret" placeholder="留空自动生成" />
          </el-form-item>
          <el-form-item label="Agent APK URL">
            <el-input v-model="form.agent_apk_url" placeholder="Android 客户端下载地址（可选）" />
          </el-form-item>
          <el-form-item label="注册系统服务">
            <el-switch v-model="form.register_service" />
            <span style="margin-left: 10px; color: #909399; font-size: 12px">自动注册为 systemd 服务</span>
          </el-form-item>
          <el-form-item label="服务名称" v-if="form.register_service">
            <el-input v-model="form.service_name" placeholder="app-manager" />
          </el-form-item>
        </el-form>
      </div>

      <!-- Step 3: 管理员账户 -->
      <div v-if="step === 2">
        <el-form :model="form" label-width="120px">
          <el-form-item label="用户名">
            <el-input v-model="form.admin_username" placeholder="admin" />
          </el-form-item>
          <el-form-item label="密码">
            <el-input v-model="form.admin_password" type="password" show-password />
          </el-form-item>
          <el-form-item label="确认密码">
            <el-input v-model="confirmPassword" type="password" show-password />
          </el-form-item>
        </el-form>
      </div>

      <!-- Step 4: 完成 -->
      <div v-if="step === 3" style="text-align: center; padding: 40px 0">
        <el-icon :size="60" color="#67C23A" v-if="!installing"><CircleCheck /></el-icon>
        <el-icon :size="60" v-if="installing" class="rotating"><Loading /></el-icon>
        <p style="margin-top: 20px; font-size: 16px">{{ statusText }}</p>
        <div v-if="!installing && form.register_service" style="margin-top: 20px;">
          <p>请在服务器目录运行以下命令启动服务：</p>
          <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">{{ installCommand }}</pre>
        </div>
      </div>

      <div style="margin-top: 30px; text-align: right">
        <el-button v-if="step > 0 && step < 3" @click="step--">上一步</el-button>
        <el-button v-if="step < 2" type="primary" @click="step++">下一步</el-button>
        <el-button v-if="step === 2" type="primary" @click="install" :loading="installing">完成安装</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheck, Loading } from '@element-plus/icons-vue'
import { testDbConnection, completeSetup, getSetupStatus } from '@/api/setup'

const router = useRouter()
const step = ref(0)
const testing = ref(false)
const installing = ref(false)
const confirmPassword = ref('')
const statusText = ref('正在安装...')

const form = ref({
  db_type: 'sqlite',
  db_dsn: './data/app-manager.db',
  server_host: '0.0.0.0',
  server_port: 8080,
  jwt_secret: '',
  admin_username: 'admin',
  admin_password: '',
  register_service: false,
  service_name: 'app-manager',
  agent_apk_url: ''
})

const installCommand = computed(() => {
  const platform = navigator.platform.toLowerCase()
  if (platform.includes('win')) {
    return '.\\install-service.bat'
  } else if (platform.includes('mac')) {
    return 'bash ./install-service.sh'
  } else {
    return 'sudo bash ./install-service.sh'
  }
})

const testDb = async () => {
  testing.value = true
  try {
    await testDbConnection({ type: form.value.db_type, dsn: form.value.db_dsn })
    ElMessage.success('数据库连接成功')
  } catch (err) {
    ElMessage.error('数据库连接失败: ' + (err.response?.data?.error || err.message))
  } finally {
    testing.value = false
  }
}

const install = async () => {
  if (form.value.admin_password !== confirmPassword.value) {
    ElMessage.error('两次密码输入不一致')
    return
  }
  if (!form.value.admin_password) {
    ElMessage.error('请输入管理员密码')
    return
  }

  installing.value = true
  statusText.value = '正在安装...'
  try {
    await completeSetup(form.value)
    step.value = 3

    if (!form.value.register_service) {
      statusText.value = '等待服务重启...'
      await waitForRestart()
    } else {
      installing.value = false
    }
  } catch (err) {
    ElMessage.error('安装失败: ' + (err.response?.data?.error || err.message))
    installing.value = false
  }
}

const waitForRestart = async () => {
  let attempts = 0
  const maxAttempts = 30
  const interval = setInterval(async () => {
    try {
      const res = await getSetupStatus()
      if (!res.required) {
        clearInterval(interval)
        statusText.value = '安装完成！'
        installing.value = false
        sessionStorage.removeItem('setupRequired')
        ElMessage.success('即将跳转到登录页')
        setTimeout(() => router.push('/login'), 1000)
      }
    } catch (err) {}
    if (++attempts >= maxAttempts) {
      clearInterval(interval)
      statusText.value = '重启超时，请手动重启服务'
      installing.value = false
    }
  }, 1000)
}
</script>

<style scoped>
.setup-wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f0f2f5; padding: 20px; }
.setup-card { width: 700px; }
h2 { text-align: center; margin-bottom: 30px; }
.rotating { animation: rotate 1s linear infinite; }
@keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>
