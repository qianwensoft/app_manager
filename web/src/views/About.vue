<template>
  <div class="about-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <el-icon :size="24"><InfoFilled /></el-icon>
          <span>关于 磐石 Bedrock</span>
        </div>
      </template>

      <div class="about-content">
        <div class="info-section">
          <div class="app-logo">
            <img src="@/assets/bedrock-icon.svg" alt="磐石" style="width:80px;height:80px;border-radius:18px;" />
          </div>
          <h2>磐石 Bedrock</h2>
          <p class="version">版本 {{ systemInfo.version || 'v1.0.0' }}</p>
          <p class="description">设备管控 · 组态可视化 · 数据连接中枢平台</p>
        </div>

        <el-divider />

        <div class="info-grid">
          <div class="info-item">
            <span class="label">系统版本</span>
            <span class="value">{{ systemInfo.version || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">构建时间</span>
            <span class="value">{{ systemInfo.buildTime || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">Go 版本</span>
            <span class="value">{{ systemInfo.goVersion || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="label">运行时间</span>
            <span class="value">{{ uptime }}</span>
          </div>
        </div>

        <el-divider />

        <div class="tech-stack">
          <h3>技术栈</h3>
          <div class="stack-grid">
            <el-tag>Go + Gin</el-tag>
            <el-tag type="success">Vue 3</el-tag>
            <el-tag type="warning">Element Plus</el-tag>
            <el-tag type="danger">WebSocket</el-tag>
            <el-tag type="info">SQLite / MySQL</el-tag>
            <el-tag>Android Kotlin</el-tag>
          </div>
        </div>

        <el-divider />

        <div class="links">
          <h3>相关链接</h3>
          <div class="link-list">
            <a href="https://github.com/your-repo" target="_blank" class="link-item">
              <el-icon><Link /></el-icon>
              <span>GitHub 仓库</span>
            </a>
            <a href="/api/docs" target="_blank" class="link-item">
              <el-icon><Document /></el-icon>
              <span>API 文档</span>
            </a>
          </div>
        </div>

        <div class="copyright">
          <p>© 2024-2026 AppManager. All rights reserved.</p>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { InfoFilled, Phone, Link, Document } from '@element-plus/icons-vue'
import axios from 'axios'

const systemInfo = ref({})
const uptime = ref('-')
let timer = null

const fetchSystemInfo = async () => {
  try {
    const { data } = await axios.get('/api/system/info')
    systemInfo.value = data
    updateUptime()
  } catch (err) {
    console.error('获取系统信息失败:', err)
  }
}

const updateUptime = () => {
  if (!systemInfo.value.startTime) return
  const start = new Date(systemInfo.value.startTime).getTime()
  const now = Date.now()
  const diff = Math.floor((now - start) / 1000)

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)

  if (days > 0) {
    uptime.value = `${days} 天 ${hours} 小时`
  } else if (hours > 0) {
    uptime.value = `${hours} 小时 ${minutes} 分钟`
  } else {
    uptime.value = `${minutes} 分钟`
  }
}

onMounted(() => {
  fetchSystemInfo()
  timer = setInterval(updateUptime, 60000) // 每分钟更新一次运行时间
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.about-page {
  max-width: 800px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
}

.about-content {
  padding: 20px 0;
}

.info-section {
  text-align: center;
  padding: 20px 0;
}

.app-logo {
  margin-bottom: 20px;
}

.info-section h2 {
  margin: 10px 0;
  font-size: 28px;
  color: #303133;
}

.version {
  color: #909399;
  font-size: 16px;
  margin: 8px 0;
}

.description {
  color: #606266;
  font-size: 14px;
  margin: 8px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  padding: 20px 0;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item .label {
  color: #909399;
  font-size: 13px;
}

.info-item .value {
  color: #303133;
  font-size: 15px;
  font-weight: 500;
}

.tech-stack h3,
.links h3 {
  font-size: 16px;
  color: #303133;
  margin-bottom: 16px;
}

.stack-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.link-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #409EFF;
  text-decoration: none;
  padding: 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.link-item:hover {
  background-color: #f5f7fa;
}

.copyright {
  text-align: center;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #EBEEF5;
  color: #909399;
  font-size: 13px;
}

@media (max-width: 768px) {
  .info-grid {
    grid-template-columns: 1fr;
  }
}
</style>
