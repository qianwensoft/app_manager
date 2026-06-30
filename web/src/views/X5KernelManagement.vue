<template>
  <div class="x5-kernel-management">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>X5 内核管理</span>
          <el-button type="primary" @click="uploadDialogVisible = true">
            <el-icon><Upload /></el-icon>
            上传新版本
          </el-button>
        </div>
      </template>

      <!-- 版本列表 -->
      <el-table :data="versions" v-loading="loading" stripe>
        <el-table-column prop="version" label="版本号" width="150" />
        <el-table-column prop="version_code" label="版本代码" width="120" />
        <el-table-column label="文件大小" width="120">
          <template #default="{ row }">
            {{ formatFileSize(row.file_size) }}
          </template>
        </el-table-column>
        <el-table-column prop="core_type" label="内核类型" width="100" />
        <el-table-column prop="min_android" label="最低 Android" width="120">
          <template #default="{ row }">
            API {{ row.min_android }} (Android {{ androidVersionName(row.min_android) }})
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.is_active" type="success">激活</el-tag>
            <el-tag v-else type="info">未激活</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="uploaded_by_name" label="上传者" width="120" />
        <el-table-column label="上传时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.uploaded_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!row.is_active"
              type="primary"
              size="small"
              @click="activateVersion(row)"
            >
              激活
            </el-button>
            <el-button
              type="info"
              size="small"
              @click="viewDetails(row)"
            >
              详情
            </el-button>
            <el-button
              v-if="!row.is_active"
              type="danger"
              size="small"
              @click="deleteVersion(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="上传 X5 内核"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="uploadForm" :rules="uploadRules" ref="uploadFormRef" label-width="120px">
        <el-form-item label="内核文件" prop="file">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            :on-change="handleFileChange"
            :file-list="fileList"
            accept=".tbs"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              拖拽文件到此处或<em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">
                仅支持 .tbs 格式，选择后将自动识别版本信息
              </div>
            </template>
          </el-upload>
          <!-- 文件名显示 -->
          <div v-if="uploadForm.file" style="margin-top: 8px; padding: 8px; background: #f5f7fa; border-radius: 4px">
            <div style="font-size: 12px; color: #606266; word-break: break-all">
              📄 {{ uploadForm.file.name }}
            </div>
            <div style="font-size: 12px; color: #909399; margin-top: 4px">
              大小: {{ formatFileSize(uploadForm.file.size) }}
            </div>
          </div>
        </el-form-item>

        <el-form-item label="版本号" prop="version">
          <el-input
            v-model="uploadForm.version"
            placeholder="如: 4.8.445 (可自动识别)"
          >
            <template #suffix v-if="uploadForm.auto_detected">
              <el-tag size="small" type="success">已识别</el-tag>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="版本代码" prop="version_code">
          <el-input-number
            v-model="uploadForm.version_code"
            :min="1"
            :step="1"
            placeholder="如: 48445 (可自动识别)"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item label="最低 Android" prop="min_android">
          <el-select v-model="uploadForm.min_android" placeholder="请选择">
            <el-option label="Android 9 (API 28)" :value="28" />
            <el-option label="Android 10 (API 29)" :value="29" />
            <el-option label="Android 11 (API 30)" :value="30" />
            <el-option label="Android 12 (API 31)" :value="31" />
          </el-select>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="uploadForm.remark"
            type="textarea"
            :rows="3"
            placeholder="版本说明、更新内容等"
          />
        </el-form-item>

        <el-form-item v-if="uploading" label="上传进度">
          <el-progress :percentage="uploadProgress" :status="uploadProgress >= 100 ? 'success' : undefined" />
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            正在上传，请勿关闭窗口...
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="uploadDialogVisible = false" :disabled="uploading">取消</el-button>
        <el-button type="primary" @click="submitUpload" :loading="uploading">
          {{ uploading ? `上传中 ${uploadProgress}%` : '上传' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="内核版本详情"
      width="600px"
    >
      <el-descriptions v-if="currentVersion" :column="1" border>
        <el-descriptions-item label="版本号">
          {{ currentVersion.version }}
        </el-descriptions-item>
        <el-descriptions-item label="版本代码">
          {{ currentVersion.version_code }}
        </el-descriptions-item>
        <el-descriptions-item label="内核类型">
          {{ currentVersion.core_type }}
        </el-descriptions-item>
        <el-descriptions-item label="最低 Android">
          API {{ currentVersion.min_android }} (Android {{ androidVersionName(currentVersion.min_android) }})
        </el-descriptions-item>
        <el-descriptions-item label="文件大小">
          {{ formatFileSize(currentVersion.file_size) }}
        </el-descriptions-item>
        <el-descriptions-item label="文件 MD5">
          <code style="font-size: 12px">{{ currentVersion.file_md5 }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag v-if="currentVersion.is_active" type="success">激活</el-tag>
          <el-tag v-else type="info">未激活</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="上传者">
          {{ currentVersion.uploaded_by_name }}
        </el-descriptions-item>
        <el-descriptions-item label="上传时间">
          {{ formatDateTime(currentVersion.uploaded_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="下载链接">
          <el-link :href="getDownloadUrl(currentVersion)" target="_blank" type="primary">
            点击下载
          </el-link>
        </el-descriptions-item>
        <el-descriptions-item label="备注">
          {{ currentVersion.remark || '无' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Upload, UploadFilled } from '@element-plus/icons-vue'
import http from '@/api/http'

const loading = ref(false)
const versions = ref([])
const uploadDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const currentVersion = ref(null)
const fileList = ref([])
const uploadFormRef = ref(null)
const uploadRef = ref(null)

const uploadForm = ref({
  file: null,
  version: '',
  version_code: null,
  min_android: 28,
  remark: '',
  auto_detected: false
})

const uploadRules = {
  file: [{ required: true, message: '请选择内核文件', trigger: 'change' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'blur' }],
  version_code: [{ required: true, message: '请输入版本代码', trigger: 'blur' }],
  min_android: [{ required: true, message: '请选择最低 Android 版本', trigger: 'change' }]
}

// 加载版本列表
const loadVersions = async () => {
  loading.value = true
  try {
    const res = await http.get('/x5-kernel/versions')
    versions.value = res.data || res
  } catch (error) {
    ElMessage.error('加载版本列表失败: ' + (error.response?.data?.error || error.message))
  } finally {
    loading.value = false
  }
}

// 文件选择
const handleFileChange = async (file) => {
  uploadForm.value.file = file.raw
  fileList.value = [file]

  // 自动解析文件名
  if (file.name.endsWith('.tbs')) {
    try {
      const formData = new FormData()
      formData.append('filename', file.name)

      const res = await http.post('/x5-kernel/parse-filename', formData)
      const data = res.data || res

      if (data.auto_detected) {
        uploadForm.value.version = data.version
        uploadForm.value.version_code = data.version_code
        uploadForm.value.auto_detected = true

        // 自动填充备注
        if (data.architecture && data.date) {
          uploadForm.value.remark = `架构: ${data.architecture}, 日期: ${data.date}`
        }

        ElMessage.success(`已自动识别版本: ${data.version} (${data.version_code})`)
      } else {
        uploadForm.value.auto_detected = false
        ElMessage.warning('无法从文件名自动识别版本，请手动填写')
      }
    } catch (error) {
      console.error('解析文件名失败:', error)
      uploadForm.value.auto_detected = false
      ElMessage.warning('解析文件名失败，请手动填写版本信息')
    }
  }
}

// 提交上传
const submitUpload = async () => {
  if (!uploadFormRef.value) return

  await uploadFormRef.value.validate(async (valid) => {
    if (!valid) return

    if (!uploadForm.value.file) {
      ElMessage.error('请选择要上传的文件')
      return
    }

    uploading.value = true
    uploadProgress.value = 0

    const formData = new FormData()
    formData.append('file', uploadForm.value.file)
    formData.append('version', uploadForm.value.version)
    formData.append('version_code', uploadForm.value.version_code.toString())
    formData.append('min_android', uploadForm.value.min_android.toString())
    formData.append('remark', uploadForm.value.remark)

    try {
      await http.post('/x5-kernel/versions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            uploadProgress.value = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          }
        }
      })
      ElMessage.success('上传成功')
      uploadDialogVisible.value = false
      resetUploadForm()
      loadVersions()
    } catch (error) {
      ElMessage.error('上传失败: ' + (error.response?.data?.error || error.message))
    } finally {
      uploading.value = false
      uploadProgress.value = 0
    }
  })
}

// 重置上传表单
const resetUploadForm = () => {
  uploadForm.value = {
    file: null,
    version: '',
    version_code: null,
    min_android: 28,
    remark: '',
    auto_detected: false
  }
  fileList.value = []
  uploadProgress.value = 0
  if (uploadFormRef.value) {
    uploadFormRef.value.resetFields()
  }
}

// 激活版本
const activateVersion = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要激活版本 ${row.version} 吗？这将取消当前激活的版本。`,
      '确认激活',
      { type: 'warning' }
    )

    await http.put(`/x5-kernel/versions/${row.id}/activate`)
    ElMessage.success('激活成功')
    loadVersions()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('激活失败: ' + (error.response?.data?.error || error.message))
    }
  }
}

// 删除版本
const deleteVersion = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除版本 ${row.version} 吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )

    await http.delete(`/x5-kernel/versions/${row.id}`)
    ElMessage.success('删除成功')
    loadVersions()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除失败: ' + (error.response?.data?.error || error.message))
    }
  }
}

// 查看详情
const viewDetails = (row) => {
  currentVersion.value = row
  detailDialogVisible.value = true
}

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

// 格式化日期时间
const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Android 版本名称映射
const androidVersionName = (apiLevel) => {
  const map = {
    28: '9',
    29: '10',
    30: '11',
    31: '12',
    32: '12L',
    33: '13',
    34: '14'
  }
  return map[apiLevel] || apiLevel
}

// 获取下载链接
const getDownloadUrl = (version) => {
  return window.location.origin + version.download_url
}

onMounted(() => {
  loadVersions()
})
</script>

<style scoped>
.x5-kernel-management {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

:deep(.el-upload-dragger) {
  padding: 40px;
}

:deep(.el-icon--upload) {
  font-size: 48px;
  margin-bottom: 16px;
}
</style>
