<template>
  <div class="settings-page">
    <el-card class="mb-4">
      <template #header><h3>注册设置</h3></template>
      <el-form label-width="140px" style="max-width: 500px">
        <el-form-item label="允许用户注册">
          <el-switch v-model="allowRegister" @change="saveRegisterSetting" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px">关闭后 /api/auth/register 接口返回 403</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="mb-4">
      <template #header><h3>心跳设置</h3></template>
      <el-form :model="heartbeat" label-width="120px" style="max-width: 500px">
        <el-form-item label="心跳间隔">
          <el-input-number v-model="heartbeat.interval" :min="10" :max="300" />
          <span class="ml-2">秒</span>
        </el-form-item>
        <el-form-item label="超时时间">
          <el-input-number v-model="heartbeat.timeout" :min="30" :max="600" />
          <span class="ml-2">秒</span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveHeartbeat">保存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <h3>Agent 更新管理</h3>
          <el-button type="primary" @click="openUploadDialog">上传新版本</el-button>
        </div>
      </template>
      <el-table :data="updates" border>
        <el-table-column prop="version" label="版本号" width="110" />
        <el-table-column prop="version_code" label="版本码" width="90" />
        <el-table-column prop="package_name" label="包名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="file_name" label="文件名" min-width="160" show-overflow-tooltip />
        <el-table-column prop="changelog" label="更新说明" min-width="160" show-overflow-tooltip />
        <el-table-column prop="upload_at" label="上传时间" width="170">
          <template #default="{ row }">{{ new Date(row.upload_at).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="downloadAPK(row.id)">下载</el-button>
            <el-popconfirm title="确认删除该版本？" @confirm="deleteAPK(row.id)">
              <template #reference>
                <el-button size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 上传对话框 -->
    <el-dialog v-model="uploadDialogVisible" title="上传 Agent APK" width="520px" :close-on-click-modal="false">
      <el-form :model="uploadForm" label-width="100px">
        <el-form-item label="APK 文件" required>
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept=".apk"
            :on-change="handleFileChange"
            :on-remove="handleFileRemove"
          >
            <el-button>选择 APK 文件</el-button>
          </el-upload>
          <div v-if="uploadForm.fileName" class="file-tip">
            已选择：{{ uploadForm.fileName }}
          </div>
        </el-form-item>
        <el-form-item label="版本号">
          <el-input
            v-model="uploadForm.version"
            placeholder="留空则自动从 APK 解析"
            clearable
          />
          <div class="form-tip">上传后服务器将自动解析包名与版本，版本号可不填</div>
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input v-model="uploadForm.changelog" type="textarea" :rows="3" placeholder="本次更新内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="!uploadForm.file"
          @click="submitUpload"
        >
          {{ uploading ? '上传中...' : '上传' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getHeartbeatSettings, updateHeartbeatSettings } from '@/api/settings'
import { uploadAgentAPK, listAgentUpdates, downloadAgentAPK, deleteAgentUpdate } from '@/api/agentUpdate'
import { getRegisterSetting, updateRegisterSetting } from '@/api/user'

const heartbeat = ref({ interval: 30, timeout: 90 })
const allowRegister = ref(false)
const updates = ref([])
const uploadDialogVisible = ref(false)
const uploading = ref(false)
const uploadRef = ref(null)
const uploadForm = ref({ version: '', changelog: '', file: null, fileName: '' })

onMounted(async () => {
  const [hbRes, regRes] = await Promise.all([getHeartbeatSettings(), getRegisterSetting()])
  heartbeat.value = hbRes.data
  allowRegister.value = regRes.allow_register
  loadUpdates()
})

const saveRegisterSetting = async () => {
  await updateRegisterSetting(allowRegister.value)
  ElMessage.success('保存成功')
}

const saveHeartbeat = async () => {
  await updateHeartbeatSettings(heartbeat.value)
  ElMessage.success('保存成功')
}

const loadUpdates = async () => {
  const res = await listAgentUpdates()
  updates.value = res.data || []
}

const openUploadDialog = () => {
  uploadForm.value = { version: '', changelog: '', file: null, fileName: '' }
  uploadDialogVisible.value = true
}

const handleFileChange = (file) => {
  uploadForm.value.file = file.raw
  uploadForm.value.fileName = file.name
}

const handleFileRemove = () => {
  uploadForm.value.file = null
  uploadForm.value.fileName = ''
}

const submitUpload = async () => {
  if (!uploadForm.value.file) {
    ElMessage.warning('请选择 APK 文件')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', uploadForm.value.file)
    fd.append('version', uploadForm.value.version)
    fd.append('changelog', uploadForm.value.changelog)
    await uploadAgentAPK(fd)
    ElMessage.success('上传成功，包名和版本已自动解析')
    uploadDialogVisible.value = false
    uploadForm.value = { version: '', changelog: '', file: null, fileName: '' }
    loadUpdates()
  } catch (e) {
    ElMessage.error('上传失败: ' + (e?.response?.data?.error || e.message || '未知错误'))
  } finally {
    uploading.value = false
  }
}

const downloadAPK = (id) => {
  window.open(downloadAgentAPK(id))
}

const deleteAPK = async (id) => {
  try {
    await deleteAgentUpdate(id)
    ElMessage.success('删除成功')
    loadUpdates()
  } catch {
    ElMessage.error('删除失败')
  }
}
</script>

<style scoped>
.settings-page { padding: 20px; }
.mb-4 { margin-bottom: 16px; }
.ml-2 { margin-left: 8px; }
.file-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #409eff;
}
.form-tip {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
</style>
