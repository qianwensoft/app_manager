<template>
  <div class="system-update-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <el-icon :size="24"><Upload /></el-icon>
          <span>系统更新</span>
        </div>
      </template>

      <div class="update-content">
        <!-- 当前版本信息 -->
        <div class="current-version">
          <h3>当前版本</h3>
          <div class="version-info">
            <el-tag size="large" type="success">{{ currentVersion }}</el-tag>
            <span class="build-time">构建时间: {{ buildTime }}</span>
          </div>
        </div>

        <el-divider />

        <!-- 检查更新 -->
        <div class="check-update">
          <el-button
            type="primary"
            :loading="checking"
            @click="checkUpdate"
            :icon="Refresh"
          >
            检查更新
          </el-button>
          <span v-if="lastCheckTime" class="last-check">
            上次检查: {{ lastCheckTime }}
          </span>
        </div>

        <!-- 更新状态 -->
        <div v-if="updateStatus" class="update-status">
          <el-alert
            :type="updateStatus.type"
            :title="updateStatus.title"
            :description="updateStatus.description"
            show-icon
            :closable="false"
          />
        </div>

        <!-- 可用更新 -->
        <div v-if="availableUpdate" class="available-update">
          <h3>发现新版本</h3>
          <div class="update-info">
            <div class="version-compare">
              <div class="version-item">
                <span class="label">当前版本</span>
                <el-tag>{{ currentVersion }}</el-tag>
              </div>
              <el-icon :size="24" color="#409EFF"><Right /></el-icon>
              <div class="version-item">
                <span class="label">最新版本</span>
                <el-tag type="success">{{ availableUpdate.version }}</el-tag>
              </div>
            </div>

            <div class="release-notes">
              <h4>更新说明</h4>
              <div class="notes-content" v-html="availableUpdate.releaseNotes || '暂无更新说明'"></div>
            </div>

            <div class="update-actions">
              <el-button
                type="primary"
                size="large"
                :loading="updating"
                @click="performUpdate"
              >
                立即更新
              </el-button>
              <el-button size="large" @click="availableUpdate = null">
                稍后提醒
              </el-button>
            </div>
          </div>
        </div>

        <el-divider />

        <!-- 手动上传更新包 -->
        <div class="manual-update">
          <h3>手动更新</h3>
          <p class="hint">如果无法自动更新，可以手动上传更新包</p>

          <el-upload
            class="upload-demo"
            drag
            :action="uploadAction"
            :headers="uploadHeaders"
            :before-upload="beforeUpload"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
            accept=".zip,.tar.gz"
            :limit="1"
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">
              拖拽文件到此处或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                仅支持 .zip 或 .tar.gz 格式的更新包，大小不超过 500MB
              </div>
            </template>
          </el-upload>
        </div>

        <el-divider />

        <!-- 更新历史 -->
        <div class="update-history">
          <h3>更新历史</h3>
          <el-timeline>
            <el-timeline-item
              v-for="item in updateHistory"
              :key="item.version"
              :timestamp="item.time"
              placement="top"
            >
              <el-card>
                <h4>版本 {{ item.version }}</h4>
                <p>{{ item.description }}</p>
              </el-card>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Upload, Refresh, Right, UploadFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const currentVersion = ref('v1.0.0')
const buildTime = ref('-')
const checking = ref(false)
const updating = ref(false)
const lastCheckTime = ref('')
const updateStatus = ref(null)
const availableUpdate = ref(null)
const updateHistory = ref([])

const uploadAction = ref('/api/system/update/upload')
const uploadHeaders = ref({
  Authorization: `Bearer ${localStorage.getItem('token')}`
})

const fetchSystemInfo = async () => {
  try {
    const { data } = await axios.get('/api/system/info')
    currentVersion.value = data.version || 'v1.0.0'
    buildTime.value = data.buildTime || '-'
  } catch (err) {
    console.error('获取系统信息失败:', err)
  }
}

const checkUpdate = async () => {
  checking.value = true
  updateStatus.value = null

  try {
    const { data } = await axios.get('/api/system/update/check')
    lastCheckTime.value = new Date().toLocaleString('zh-CN')

    if (data.hasUpdate) {
      availableUpdate.value = data.update
      updateStatus.value = {
        type: 'success',
        title: '发现新版本',
        description: `最新版本 ${data.update.version} 可供下载`
      }
    } else {
      updateStatus.value = {
        type: 'info',
        title: '已是最新版本',
        description: '当前系统已是最新版本，无需更新'
      }
    }
  } catch (err) {
    updateStatus.value = {
      type: 'error',
      title: '检查更新失败',
      description: err.response?.data?.error || '无法连接到更新服务器'
    }
  } finally {
    checking.value = false
  }
}

const performUpdate = async () => {
  try {
    await ElMessageBox.confirm(
      '更新过程中系统将会重启，请确保已保存所有数据。是否继续？',
      '确认更新',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    updating.value = true
    await axios.post('/api/system/update/apply', {
      version: availableUpdate.value.version
    })

    ElMessage.success('更新已开始，系统将在 10 秒后重启...')

    setTimeout(() => {
      window.location.href = '/login'
    }, 10000)
  } catch (err) {
    if (err !== 'cancel') {
      ElMessage.error(err.response?.data?.error || '更新失败')
    }
    updating.value = false
  }
}

const beforeUpload = (file) => {
  const isValidFormat = file.name.endsWith('.zip') || file.name.endsWith('.tar.gz')
  const isLt500M = file.size / 1024 / 1024 < 500

  if (!isValidFormat) {
    ElMessage.error('仅支持 .zip 或 .tar.gz 格式')
    return false
  }
  if (!isLt500M) {
    ElMessage.error('文件大小不能超过 500MB')
    return false
  }
  return true
}

const onUploadSuccess = () => {
  ElMessage.success('上传成功，系统将自动应用更新')
  setTimeout(() => {
    window.location.reload()
  }, 3000)
}

const onUploadError = (err) => {
  ElMessage.error('上传失败: ' + (err.message || '未知错误'))
}

const fetchUpdateHistory = async () => {
  try {
    const { data } = await axios.get('/api/system/update/history')
    updateHistory.value = data || []
  } catch (err) {
    console.error('获取更新历史失败:', err)
  }
}

onMounted(() => {
  fetchSystemInfo()
  fetchUpdateHistory()
})
</script>

<style scoped>
.system-update-page {
  max-width: 900px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: bold;
}

.update-content {
  padding: 20px 0;
}

.current-version h3,
.check-update h3,
.manual-update h3,
.update-history h3,
.available-update h3 {
  font-size: 16px;
  color: #303133;
  margin-bottom: 16px;
}

.version-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.build-time {
  color: #909399;
  font-size: 14px;
}

.check-update {
  display: flex;
  align-items: center;
  gap: 16px;
}

.last-check {
  color: #909399;
  font-size: 13px;
}

.update-status {
  margin-top: 20px;
}

.available-update {
  margin-top: 20px;
}

.update-info {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 4px;
}

.version-compare {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
  margin-bottom: 24px;
}

.version-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.version-item .label {
  color: #909399;
  font-size: 13px;
}

.release-notes {
  margin-bottom: 24px;
}

.release-notes h4 {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
}

.notes-content {
  background: white;
  padding: 16px;
  border-radius: 4px;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

.update-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.manual-update .hint {
  color: #909399;
  font-size: 13px;
  margin-bottom: 16px;
}

.upload-demo {
  margin-top: 16px;
}

.update-history {
  margin-top: 20px;
}

@media (max-width: 768px) {
  .version-compare {
    flex-direction: column;
    gap: 16px;
  }
}
</style>
