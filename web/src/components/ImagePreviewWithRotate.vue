<template>
  <el-dialog
    v-model="visible"
    :title="currentImage?.name || '图片预览'"
    width="90%"
    top="5vh"
    destroy-on-close
    @close="handleClose"
  >
    <div class="preview-container">
      <div class="toolbar">
        <el-button-group>
          <el-button @click="rotate(-90)">
            <el-icon><RefreshLeft /></el-icon>
            左转90°
          </el-button>
          <el-button @click="rotate(90)">
            <el-icon><RefreshRight /></el-icon>
            右转90°
          </el-button>
          <el-button @click="resetRotation">
            <el-icon><Refresh /></el-icon>
            重置
          </el-button>
        </el-button-group>
        <div class="spacer" />
        <el-button
          :loading="recognizing"
          @click="recognizeBarcode"
        >
          <el-icon><View /></el-icon>
          识别二维码/条形码
        </el-button>
        <el-button
          v-if="rotationAngle !== 0"
          type="primary"
          :loading="saving"
          @click="saveRotated"
        >
          <el-icon><Check /></el-icon>
          保存旋转
        </el-button>
        <el-button-group v-if="imageList.length > 1">
          <el-button :disabled="currentIndex === 0" @click="prev">
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <el-button :disabled="currentIndex === imageList.length - 1" @click="next">
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-button-group>
      </div>

      <div class="image-wrapper">
        <canvas ref="canvasRef" class="preview-canvas" />
        <div v-if="imageList.length > 1" class="image-counter">
          {{ currentIndex + 1 }} / {{ imageList.length }}
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RefreshLeft, RefreshRight, Refresh, Check, ArrowLeft, ArrowRight, View } from '@element-plus/icons-vue'
import { updateWorkOrderItem, recognizeWorkOrderItemBarcode } from '@/api/workOrder'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  imageList: { type: Array, default: () => [] }, // [{ id, url, name, workOrderId }]
  initialIndex: { type: Number, default: 0 }
})

const emit = defineEmits(['update:modelValue', 'saved', 'set-other-codes'])

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentIndex = ref(props.initialIndex)
const currentImage = computed(() => props.imageList[currentIndex.value])
const rotationAngle = ref(0)
const saving = ref(false)
const canvasRef = ref(null)
const imageCache = ref({}) // 缓存加载的图片对象

const loadImage = (url) => {
  return new Promise((resolve, reject) => {
    if (imageCache.value[url]) {
      resolve(imageCache.value[url])
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageCache.value[url] = img
      resolve(img)
    }
    img.onerror = reject
    img.src = url
  })
}

const drawImage = async () => {
  if (!currentImage.value || !canvasRef.value) return

  try {
    const img = await loadImage(currentImage.value.url)
    const canvas = canvasRef.value
    const ctx = canvas.getContext('2d')

    // 根据旋转角度调整 canvas 尺寸
    const angle = rotationAngle.value * Math.PI / 180
    const absAngle = Math.abs(rotationAngle.value) % 180

    let canvasWidth, canvasHeight
    if (absAngle === 90) {
      canvasWidth = img.height
      canvasHeight = img.width
    } else {
      canvasWidth = img.width
      canvasHeight = img.height
    }

    // 设置 canvas 尺寸
    canvas.width = canvasWidth
    canvas.height = canvasHeight

    // 清空画布
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // 保存状态
    ctx.save()

    // 移动到画布中心
    ctx.translate(canvasWidth / 2, canvasHeight / 2)

    // 旋转
    ctx.rotate(angle)

    // 绘制图片（以中心为原点）
    ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height)

    // 恢复状态
    ctx.restore()
  } catch (error) {
    console.error('Failed to load image:', error)
    ElMessage.error('图片加载失败')
  }
}

const rotate = (degrees) => {
  rotationAngle.value = (rotationAngle.value + degrees) % 360
  drawImage()
}

const resetRotation = () => {
  rotationAngle.value = 0
  drawImage()
}

const prev = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
    rotationAngle.value = 0
  }
}

const next = () => {
  if (currentIndex.value < props.imageList.length - 1) {
    currentIndex.value++
    rotationAngle.value = 0
  }
}

const saveRotated = async () => {
  if (!canvasRef.value || !currentImage.value) return

  try {
    saving.value = true

    // 将 canvas 转换为 Blob
    const blob = await new Promise((resolve, reject) => {
      canvasRef.value.toBlob((result) => {
        if (result) {
          resolve(result)
        } else {
          reject(new Error('转换图片失败'))
        }
      }, 'image/jpeg', 0.95)
    })

    if (!blob) {
      throw new Error('无法生成图片')
    }

    // 创建 File 对象
    const file = new File([blob], currentImage.value.name || 'rotated.jpg', { type: 'image/jpeg' })

    // 上传
    await updateWorkOrderItem(currentImage.value.workOrderId, currentImage.value.id, file)

    ElMessage.success('图片已保存，页面将自动刷新')
    rotationAngle.value = 0

    // 清除图片缓存
    if (imageCache.value[currentImage.value.url]) {
      delete imageCache.value[currentImage.value.url]
    }

    emit('saved', currentImage.value.id)

    // 延迟关闭对话框，让用户看到成功提示
    setTimeout(() => {
      visible.value = false
    }, 500)
  } catch (error) {
    console.error('Failed to save rotated image:', error)
    ElMessage.error('保存失败：' + (error.response?.data?.error || error.message))
  } finally {
    saving.value = false
  }
}

const recognizing = ref(false)

const recognizeBarcode = async () => {
  if (!currentImage.value) return

  try {
    recognizing.value = true
    const response = await recognizeWorkOrderItemBarcode(currentImage.value.id)

    const codes = response.data.codes || []
    const message = response.data.message || ''

    if (codes.length === 0) {
      ElMessage.warning(message || '未识别到二维码或条形码')
      return
    }

    // 展示识别结果并提供设置选项
    const codesList = codes.map((code, idx) => `${idx + 1}. ${code}`).join('\n')

    await ElMessageBox.confirm(
      `识别到 ${codes.length} 个编码：\n\n${codesList}\n\n是否设置为工单的"其他编码"？`,
      '识别结果',
      {
        confirmButtonText: '设置到其他编码',
        cancelButtonText: '取消',
        type: 'success',
        distinguishCancelAndClose: true
      }
    )

    // 用户确认后，将编码设置到工单
    emit('set-other-codes', codes.join(','))
    ElMessage.success('已设置到其他编码')

  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      console.error('识别失败:', error)
      ElMessage.error('识别失败：' + (error.response?.data?.error || error.message))
    }
  } finally {
    recognizing.value = false
  }
}

const handleClose = () => {
  rotationAngle.value = 0
  currentIndex.value = props.initialIndex
}

watch(() => props.modelValue, (val) => {
  if (val) {
    currentIndex.value = props.initialIndex
    rotationAngle.value = 0
    nextTick(() => {
      drawImage()
    })
  }
})

watch(currentIndex, () => {
  nextTick(() => {
    drawImage()
  })
})
</script>

<style scoped>
.preview-container {
  display: flex;
  flex-direction: column;
  height: 75vh;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.spacer {
  flex: 1;
}

.image-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 4px;
  position: relative;
  overflow: auto;
  padding: 20px;
}

.preview-canvas {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.image-counter {
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 14px;
}
</style>
