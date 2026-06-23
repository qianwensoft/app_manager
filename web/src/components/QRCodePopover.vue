<template>
  <el-popover
    :placement="placement"
    :width="width"
    trigger="hover"
    :popper-style="{ padding: '8px' }"
  >
    <template #reference>
      <slot />
    </template>
    <div class="qr-popover-content">
      <canvas ref="canvasRef" />
      <div v-if="showText" class="qr-text">{{ text }}</div>
    </div>
  </el-popover>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  text: { type: String, required: true },
  size: { type: Number, default: 160 },
  placement: { type: String, default: 'top' },
  width: { type: Number, default: 180 },
  showText: { type: Boolean, default: true }
})

const canvasRef = ref(null)

const generateQR = async () => {
  if (!canvasRef.value || !props.text) return
  try {
    await QRCode.toCanvas(canvasRef.value, props.text, {
      width: props.size,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    })
  } catch (err) {
    console.error('QR code generation failed:', err)
  }
}

onMounted(() => generateQR())
watch(() => props.text, generateQR)
</script>

<style scoped>
.qr-popover-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.qr-text {
  font-size: 12px;
  color: #606266;
  text-align: center;
  word-break: break-all;
  max-width: 160px;
}
canvas {
  display: block;
}
</style>
