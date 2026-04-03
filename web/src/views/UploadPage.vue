<template>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fa;padding:20px">
    <div style="background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);padding:40px;width:100%;max-width:480px">
      <div v-if="loading" style="text-align:center;color:#999">加载中...</div>
      <div v-else-if="expired" style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⏰</div>
        <h3 style="color:#f56c6c">链接已过期</h3>
      </div>
      <div v-else-if="notFound" style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">🔗</div>
        <h3 style="color:#f56c6c">链接不存在</h3>
      </div>
      <template v-else>
        <h2 style="margin:0 0 8px;text-align:center">文件上传</h2>
        <p v-if="label" style="text-align:center;color:#666;margin:0 0 24px">{{ label }}</p>
        <p v-if="expiresAt" style="text-align:center;color:#999;font-size:13px;margin:-16px 0 24px">
          有效期至 {{ formatDate(expiresAt) }}
        </p>

        <div
          class="drop-zone"
          :class="{ dragging }"
          @dragover.prevent="dragging=true"
          @dragleave="dragging=false"
          @drop.prevent="onDrop"
          @click="$refs.fileInput.click()"
          style="border:2px dashed #dcdfe6;border-radius:8px;padding:40px 20px;text-align:center;cursor:pointer;transition:border-color .2s"
        >
          <div style="font-size:36px;margin-bottom:8px">📁</div>
          <p style="color:#606266;margin:0">点击或拖拽文件到此处上传</p>
          <p style="color:#c0c4cc;font-size:13px;margin:4px 0 0">支持任意文件类型</p>
          <input ref="fileInput" type="file" multiple style="display:none" @change="onFileChange" />
        </div>

        <div v-if="queue.length" style="margin-top:20px">
          <div v-for="item in queue" :key="item.id" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:4px">
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%">{{ item.name }}</span>
              <span :style="{ color: statusColor(item.status) }">{{ statusText(item.status) }}</span>
            </div>
            <div style="background:#f0f2f5;border-radius:4px;height:6px;overflow:hidden">
              <div
                :style="{ width: item.progress + '%', background: statusColor(item.status), height:'100%', transition:'width .3s' }"
              ></div>
            </div>
            <div v-if="item.error" style="color:#f56c6c;font-size:12px;margin-top:2px">{{ item.error }}</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const expired = ref(false)
const notFound = ref(false)
const label = ref('')
const expiresAt = ref(null)
const dragging = ref(false)
const queue = ref([])
let idSeq = 0

onMounted(async () => {
  try {
    const res = await fetch(`/api/upload/${token}`)
    if (res.status === 404) { notFound.value = true; return }
    if (res.status === 410) { expired.value = true; return }
    const json = await res.json()
    label.value = json.data?.label || ''
    expiresAt.value = json.data?.expires_at || null
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
})

function onDrop(e) {
  dragging.value = false
  const files = Array.from(e.dataTransfer.files)
  files.forEach(upload)
}

function onFileChange(e) {
  Array.from(e.target.files).forEach(upload)
  e.target.value = ''
}

function upload(file) {
  const item = { id: ++idSeq, name: file.name, progress: 0, status: 'uploading', error: '' }
  queue.value.push(item)

  const fd = new FormData()
  fd.append('file', file)

  const xhr = new XMLHttpRequest()
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) item.progress = Math.round(e.loaded / e.total * 100)
  }
  xhr.onload = () => {
    if (xhr.status === 200) {
      item.progress = 100
      item.status = 'done'
    } else {
      item.status = 'error'
      try { item.error = JSON.parse(xhr.responseText)?.error || '上传失败' } catch { item.error = '上传失败' }
    }
  }
  xhr.onerror = () => { item.status = 'error'; item.error = '网络错误' }
  xhr.open('POST', `/api/upload/${token}`)
  xhr.send(fd)
}

function statusText(s) {
  return { uploading: '上传中', done: '完成', error: '失败' }[s] || s
}
function statusColor(s) {
  return { uploading: '#409eff', done: '#67c23a', error: '#f56c6c' }[s] || '#909399'
}
function formatDate(d) {
  return new Date(d).toLocaleString()
}
</script>

<style scoped>
.drop-zone:hover, .drop-zone.dragging {
  border-color: #409eff !important;
  background: #f0f7ff;
}
</style>
