<template>
  <div>
    <div style="margin-bottom:12px;max-width:640px">
      <el-input
        v-model="uploadDescription"
        type="textarea"
        :rows="2"
        placeholder="可选：上传说明（如版本说明、构建类型等）"
        maxlength="4000"
        show-word-limit
        style="margin-bottom:8px"
      />
      <el-upload
        :http-request="handleUploadRequest"
        accept=".apk"
        :show-file-list="false"
      >
        <el-button type="primary">上传 APK</el-button>
      </el-upload>
    </div>
    <el-table :data="apps" border>
      <el-table-column prop="name" label="文件名" min-width="140" show-overflow-tooltip />
      <el-table-column prop="package_name" label="包名" min-width="160" show-overflow-tooltip />
      <el-table-column prop="version_name" label="版本" width="120" />
      <el-table-column prop="file_size" label="大小" width="100">
        <template #default="{ row }">{{ (row.file_size / 1024 / 1024).toFixed(1) }} MB</template>
      </el-table-column>
      <el-table-column label="上传时间" width="170">
        <template #default="{ row }">{{ formatUploadTime(row) }}</template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDescEdit(row)">编辑描述</el-button>
          <el-button size="small" type="primary" @click="openInstall(row)">安装</el-button>
          <el-button size="small" type="warning" @click="openUninstall(row)">卸载</el-button>
          <el-button size="small" type="danger" @click="remove(row.id)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="descDialog" title="编辑描述" width="520px" destroy-on-close>
      <el-input
        v-model="descEditText"
        type="textarea"
        :rows="5"
        maxlength="4000"
        show-word-limit
        placeholder="APK 说明"
      />
      <template #footer>
        <el-button @click="descDialog = false">取消</el-button>
        <el-button type="primary" :loading="descSaving" @click="saveDescription">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="installDialog" :title="installAction === 'install' ? '安装到设备' : '从设备卸载'" width="500px">
      <el-checkbox-group v-model="selectedDevices">
        <el-checkbox v-for="d in devices" :key="d.id" :label="d.id">{{ d.name || d.serial }}</el-checkbox>
      </el-checkbox-group>
      <el-checkbox
        v-if="installAction === 'install'"
        v-model="installAndLaunch"
        style="margin-top:12px;display:block"
      >
        安装完成后启动应用（无 ADB 的设备经 Agent 安装后会尝试拉起主界面）
      </el-checkbox>
      <template #footer>
        <el-button @click="installDialog = false">取消</el-button>
        <el-button type="primary" @click="submitInstall">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as appApi from '@/api/app'
import * as deviceApi from '@/api/device'

const apps = ref([])
const devices = ref([])
const installDialog = ref(false)
const installAction = ref('install')
const selectedDevices = ref([])
const currentApp = ref(null)
const installAndLaunch = ref(true)
const uploadDescription = ref('')

const descDialog = ref(false)
const descEditText = ref('')
const descEditId = ref(null)
const descSaving = ref(false)

const formatUploadTime = (row) => {
  if (!row?.created_at) return '-'
  const d = new Date(row.created_at)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

const load = async () => {
  const [a, d] = await Promise.all([appApi.getApps(), deviceApi.getDevices()])
  apps.value = a.data
  devices.value = d.data
}

const handleUploadRequest = async (options) => {
  const fd = new FormData()
  fd.append('file', options.file)
  const t = uploadDescription.value.trim()
  if (t) fd.append('description', t)
  try {
    await appApi.uploadApp(fd)
    ElMessage.success('上传成功')
    uploadDescription.value = ''
    options.onSuccess?.({})
    await load()
  } catch (e) {
    options.onError?.(e)
    ElMessage.error(e.response?.data?.error || e.message || '上传失败')
  }
}

const openDescEdit = (app) => {
  descEditId.value = app.id
  descEditText.value = app.description || ''
  descDialog.value = true
}

const saveDescription = async () => {
  if (descEditId.value == null) return
  descSaving.value = true
  try {
    await appApi.updateAppMeta(descEditId.value, { description: descEditText.value })
    ElMessage.success('已保存')
    descDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || e.message || '保存失败')
  } finally {
    descSaving.value = false
  }
}

const openInstall = (app) => {
  currentApp.value = app; installAction.value = 'install'
  installAndLaunch.value = true
  selectedDevices.value = []; installDialog.value = true
}
const openUninstall = (app) => {
  currentApp.value = app; installAction.value = 'uninstall'
  selectedDevices.value = []; installDialog.value = true
}

const submitInstall = async () => {
  if (!selectedDevices.value.length) return ElMessage.warning('请选择设备')
  if (installAction.value === 'install') {
    await appApi.installApp(currentApp.value.id, selectedDevices.value, {
      start_after_install: installAndLaunch.value
    })
  } else {
    await appApi.uninstallApp(currentApp.value.id, selectedDevices.value)
  }
  installDialog.value = false
  ElMessage.success('任务已提交')
}

const remove = async (id) => {
  await ElMessageBox.confirm('确认删除？')
  await appApi.deleteApp(id)
  load()
}

onMounted(load)
</script>
