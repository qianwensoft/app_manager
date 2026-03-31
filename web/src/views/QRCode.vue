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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import QRCode from 'qrcode'

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
  serverUrl.value = `ws://${window.location.hostname}:8080`

  const config = JSON.stringify({
    serverUrl: serverUrl.value,
    deviceToken: deviceToken.value
  })

  await QRCode.toCanvas(qrCanvas.value, config, {
    width: 280,
    margin: 2
  })
}

function regenerate() {
  generateQRCode()
}

onMounted(() => {
  generateQRCode()
})
</script>
