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
          <el-button type="primary" @click="uploadDialogVisible = true">上传新版本</el-button>
        </div>
      </template>
      <el-table :data="updates" border>
        <el-table-column prop="version" label="版本" width="120" />
        <el-table-column prop="changelog" label="更新说明" />
        <el-table-column prop="upload_at" label="上传时间" width="180">
          <template #default="{ row }">{{ new Date(row.upload_at).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" @click="downloadAPK(row.id)">下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="uploadDialogVisible" title="上传 Agent APK" width="500px">
      <el-form :model="uploadForm" label-width="100px">
        <el-form-item label="版本号">
          <el-input v-model="uploadForm.version" placeholder="例如: 1.0.0" />
        </el-form-item>
        <el-form-item label="更新说明">
          <el-input v-model="uploadForm.changelog" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="APK 文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept=".apk"
            :on-change="handleFileChange"
          >
            <el-button>选择文件</el-button>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpload">上传</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getHeartbeatSettings, updateHeartbeatSettings } from '@/api/settings'
import { uploadAgentAPK, listAgentUpdates, downloadAgentAPK } from '@/api/agentUpdate'
import { getRegisterSetting, updateRegisterSetting } from '@/api/user'

const heartbeat = ref({ interval: 30, timeout: 90 })
const allowRegister = ref(false)
const updates = ref([])
const uploadDialogVisible = ref(false)
const uploadForm = ref({ version: '', changelog: '', file: null })

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
  updates.value = res.data
}

const handleFileChange = (file) => {
  uploadForm.value.file = file.raw
}

const submitUpload = async () => {
  const fd = new FormData()
  fd.append('file', uploadForm.value.file)
  fd.append('version', uploadForm.value.version)
  fd.append('changelog', uploadForm.value.changelog)
  await uploadAgentAPK(fd)
  ElMessage.success('上传成功')
  uploadDialogVisible.value = false
  uploadForm.value = { version: '', changelog: '', file: null }
  loadUpdates()
}

const downloadAPK = (id) => {
  window.open(downloadAgentAPK(id))
}
</script>

<style scoped>
.settings-page { padding: 20px; }
.mb-4 { margin-bottom: 16px; }
.ml-2 { margin-left: 8px; }
</style>
