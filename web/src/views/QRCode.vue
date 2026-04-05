<template>
  <div style="display:flex;flex-direction:column;align-items:center;padding:40px">
    <h2>扫码接入设备</h2>
    <p style="color:#666;margin-bottom:30px">使用Android Agent应用扫描二维码快速接入</p>
    <canvas ref="qrCanvas" style="padding:20px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)"></canvas>
    <div style="margin-top:20px;text-align:center;line-height:2">
      <p><strong>服务器地址：</strong>{{ serverUrl }}</p>
      <p><strong>设备Token：</strong>{{ deviceToken }}</p>
      <el-button type="primary" @click="regenerate" style="margin-top:10px">重新生成</el-button>
    </div>
    <el-divider />
    <div style="text-align:center">
      <h3>下载 Agent 应用</h3>
      <canvas ref="downloadQrCanvas" style="padding:20px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);margin-top:20px"></canvas>
      <p style="margin-top:10px;color:#666">扫码下载最新版 Agent APK</p>
      <el-button type="success" @click="downloadLatest" style="margin-top:10px">直接下载</el-button>
    </div>
    <el-divider />
    <!-- 文件上传链接 -->
    <div style="width:100%;max-width:500px">
      <h3 style="text-align:center">文件上传链接</h3>
      <p style="text-align:center;color:#666;margin-bottom:20px">生成二维码，手机扫码即可上传文件到服务器</p>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <el-input v-model="uploadLabel" placeholder="链接备注（可选）" style="flex:1" />
        <el-select v-model="uploadExpiry" style="width:130px">
          <el-option label="永不过期" :value="0" />
          <el-option label="1 小时" :value="60" />
          <el-option label="24 小时" :value="1440" />
          <el-option label="7 天" :value="10080" />
        </el-select>
        <el-button type="primary" @click="createUploadLink" :loading="creating">生成</el-button>
      </div>
      <div v-if="uploadLinks.length" style="margin-bottom:20px">
        <div
          v-for="link in uploadLinks" :key="link.id"
          style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #ebeef5;border-radius:6px;margin-bottom:8px"
        >
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:500">{{ link.label || '未命名' }}</div>
            <div style="font-size:12px;color:#999">
              {{ link.expires_at ? '有效期至 ' + formatDate(link.expires_at) : '永不过期' }}
            </div>
          </div>
          <el-button size="small" @click="showUploadQR(link)">查看二维码</el-button>
          <el-button size="small" type="danger" @click="deleteLink(link.id)">删除</el-button>
        </div>
      </div>
      <div v-else style="text-align:center;color:#c0c4cc;padding:20px">暂无上传链接</div>
    </div>

    <!-- 上传链接二维码弹窗 -->
    <el-dialog v-model="qrDialogVisible" title="文件上传二维码" width="360px" align-center>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <canvas ref="uploadQrCanvas" style="padding:16px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1)"></canvas>
        <p style="color:#666;font-size:13px;margin:0">手机扫码后可直接上传文件</p>
        <el-input :value="currentUploadUrl" readonly size="small" style="width:100%">
          <template #append>
            <el-button @click="copyUrl">复制</el-button>
          </template>
        </el-input>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import QRCode from 'qrcode'
import { ElMessage } from 'element-plus'
import http from '@/api/http'

const qrCanvas = ref(null)
const serverUrl = ref('')
const deviceToken = ref('')

function generateToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 16; i++) token += chars[Math.floor(Math.random() * chars.length)]
  return token
}

async function generateQRCode() {
  deviceToken.value = generateToken()
  serverUrl.value = `ws://${window.location.host}`
  const config = JSON.stringify({ serverUrl: serverUrl.value, deviceToken: deviceToken.value })
  await QRCode.toCanvas(qrCanvas.value, config, { width: 280, margin: 2 })
}

function regenerate() { generateQRCode() }

// 下载 Agent
const downloadQrCanvas = ref(null)
const latestApkId = ref(null)
async function renderDownloadQR() {
  try {
    const res = await http.get('/agent-updates/latest')
    const id = res.data?.id
    if (!id) return
    latestApkId.value = id
    const url = `${window.location.origin}/api/agent-updates/${id}/download`
    await QRCode.toCanvas(downloadQrCanvas.value, url, { width: 200, margin: 2 })
  } catch {
    // 未上传 APK 时不显示二维码，属正常状态
  }
}
function downloadLatest() {
  if (latestApkId.value) {
    window.open(`/api/agent-updates/${latestApkId.value}/download`)
    return
  }
  http.get('/agent-updates/latest').then(res => {
    const id = res.data?.id
    if (id) {
      latestApkId.value = id
      window.open(`/api/agent-updates/${id}/download`)
    } else {
      ElMessage.warning('暂无可下载的 Agent APK，请先上传')
    }
  }).catch(() => ElMessage.error('获取 APK 信息失败'))
}

// 上传链接
const uploadLabel = ref('')
const uploadExpiry = ref(0)
const creating = ref(false)
const uploadLinks = ref([])
const qrDialogVisible = ref(false)
const uploadQrCanvas = ref(null)
const currentUploadUrl = ref('')

async function loadLinks() {
  try {
    const res = await http.get('/upload-links')
    uploadLinks.value = res.data?.data || []
  } catch {}
}

async function createUploadLink() {
  creating.value = true
  try {
    await http.post('/upload-links', { label: uploadLabel.value, expires_in: uploadExpiry.value })
    uploadLabel.value = ''
    await loadLinks()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '创建失败')
  } finally {
    creating.value = false
  }
}

async function showUploadQR(link) {
  currentUploadUrl.value = `${window.location.origin}/upload/${link.token}`
  qrDialogVisible.value = true
  await nextTick()
  await QRCode.toCanvas(uploadQrCanvas.value, currentUploadUrl.value, { width: 240, margin: 2 })
}

async function deleteLink(id) {
  await http.delete(`/upload-links/${id}`)
  await loadLinks()
}

function copyUrl() {
  navigator.clipboard.writeText(currentUploadUrl.value)
  ElMessage.success('已复制')
}

function formatDate(d) {
  return new Date(d).toLocaleString()
}

onMounted(async () => {
  await nextTick()
  generateQRCode()
  renderDownloadQR()
  loadLinks()
})
</script>

