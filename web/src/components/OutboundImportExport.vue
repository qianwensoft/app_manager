<!--
  外部应用导出导入组件
  功能：
  - 导出应用配置（包括连接器、Webhook、令牌等）
  - 导入应用配置
  - 验证导入数据
  - 选择性导入选项
-->
<template>
  <div class="outbound-import-export">
    <!-- 导出对话框 -->
    <el-dialog
      v-model="exportDialogVisible"
      title="导出外部应用配置"
      width="600px"
    >
      <el-form :model="exportForm" label-width="120px">
        <el-alert
          title="导出说明"
          description="导出将包含应用的所有配置，包括连接器、Webhook、扩展脚本等"
          type="info"
          :closable="false"
          style="margin-bottom: 16px"
        />

        <el-form-item label="应用">
          <el-text>{{ currentApp.name }} ({{ currentApp.app_code }})</el-text>
        </el-form-item>

        <el-form-item label="包含内容">
          <el-checkbox-group v-model="exportForm.includeItems" disabled>
            <el-checkbox label="connectors">连接器配置</el-checkbox>
            <el-checkbox label="webhooks">Webhook 配置</el-checkbox>
            <el-checkbox label="scripts">扩展脚本</el-checkbox>
            <el-checkbox label="tokens">访问令牌</el-checkbox>
          </el-checkbox-group>
          <div class="field-tip">所有配置项都会被导出</div>
        </el-form-item>

        <el-form-item label="是否包含密钥">
          <el-switch
            v-model="exportForm.includeSecrets"
            active-text="包含"
            inactive-text="不包含"
          />
          <div class="field-tip">
            包含 Webhook Secret、访问令牌等敏感信息（导出文件请妥善保管）
          </div>
        </el-form-item>

        <el-form-item label="导出格式">
          <el-radio-group v-model="exportForm.format">
            <el-radio label="json">JSON 文件</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="exportDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="exporting"
          @click="handleExport"
        >
          <el-icon><Download /></el-icon>
          导出配置
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog
      v-model="importDialogVisible"
      title="导入外部应用配置"
      width="800px"
    >
      <el-steps :active="importStep" finish-status="success" style="margin-bottom: 24px">
        <el-step title="上传文件" />
        <el-step title="验证配置" />
        <el-step title="导入选项" />
        <el-step title="确认导入" />
      </el-steps>

      <!-- 步骤1: 上传文件 -->
      <div v-if="importStep === 0">
        <el-upload
          ref="uploadRef"
          :auto-upload="false"
          :limit="1"
          accept=".json"
          :on-change="handleFileChange"
          drag
        >
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            拖拽文件到此处或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              仅支持 JSON 格式的配置文件
            </div>
          </template>
        </el-upload>

        <el-card v-if="importData" style="margin-top: 16px">
          <template #header>
            <span>文件信息</span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="文件名">
              {{ uploadedFileName }}
            </el-descriptions-item>
            <el-descriptions-item label="导出版本">
              {{ importData.export_version }}
            </el-descriptions-item>
            <el-descriptions-item label="导出时间">
              {{ formatDate(importData.export_time) }}
            </el-descriptions-item>
            <el-descriptions-item label="导出用户">
              {{ importData.export_by || '未知' }}
            </el-descriptions-item>
            <el-descriptions-item label="应用名称">
              {{ importData.app.name }}
            </el-descriptions-item>
            <el-descriptions-item label="应用编码">
              {{ importData.app.app_code }}
            </el-descriptions-item>
            <el-descriptions-item label="连接器数量">
              {{ importData.connectors?.length || 0 }} 个
            </el-descriptions-item>
            <el-descriptions-item label="Webhook 数量">
              {{ importData.webhooks?.length || 0 }} 个
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </div>

      <!-- 步骤2: 验证配置 -->
      <div v-if="importStep === 1">
        <el-result
          v-if="validationResult.valid"
          icon="success"
          title="验证通过"
          sub-title="配置文件格式正确，可以继续导入"
        >
          <template #extra>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="应用名称">
                {{ validationResult.summary?.app_name }}
              </el-descriptions-item>
              <el-descriptions-item label="连接器">
                {{ validationResult.summary?.connectors_count }} 个
              </el-descriptions-item>
              <el-descriptions-item label="Webhooks">
                {{ validationResult.summary?.webhooks_count }} 个
              </el-descriptions-item>
              <el-descriptions-item label="访问令牌">
                {{ validationResult.summary?.tokens_count }} 个
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-result>

        <el-result
          v-else
          icon="error"
          title="验证失败"
          sub-title="配置文件存在以下问题"
        >
          <template #extra>
            <el-alert
              v-for="(issue, index) in validationResult.issues"
              :key="index"
              :title="issue"
              type="error"
              :closable="false"
              style="margin-bottom: 8px"
            />
          </template>
        </el-result>
      </div>

      <!-- 步骤3: 导入选项 -->
      <div v-if="importStep === 2">
        <el-form :model="importOptions" label-width="140px">
          <el-alert
            title="导入选项"
            description="请根据实际需求配置导入选项"
            type="info"
            :closable="false"
            style="margin-bottom: 16px"
          />

          <el-form-item label="导入模式">
            <el-radio-group v-model="importOptions.mode">
              <el-radio label="new">创建新应用</el-radio>
              <el-radio label="overwrite">覆盖已存在应用</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="importOptions.mode === 'new'" label="编码前缀">
            <el-input
              v-model="importOptions.prefix"
              placeholder="例如: test_"
              style="width: 200px"
            />
            <div class="field-tip">
              为导入的应用、连接器、Webhook 等编码添加前缀，避免与现有配置冲突
            </div>
          </el-form-item>

          <el-form-item label="是否导入密钥">
            <el-switch
              v-model="importOptions.import_secrets"
              active-text="导入"
              inactive-text="跳过"
            />
            <div class="field-tip">
              是否导入 Webhook Secret、访问令牌等敏感信息
            </div>
          </el-form-item>

          <el-form-item label="生成新编码">
            <el-switch
              v-model="importOptions.generate_new_codes"
              active-text="是"
              inactive-text="否"
            />
            <div class="field-tip">
              是否为所有配置项生成新的编码（UUID）
            </div>
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤4: 确认导入 -->
      <div v-if="importStep === 3">
        <el-alert
          title="请确认以下导入信息"
          type="warning"
          :closable="false"
          style="margin-bottom: 16px"
        />

        <el-descriptions :column="1" border>
          <el-descriptions-item label="应用名称">
            {{ importData.app.name }}
          </el-descriptions-item>
          <el-descriptions-item label="应用编码">
            <el-tag>{{ finalAppCode }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="导入模式">
            <el-tag :type="importOptions.mode === 'new' ? 'success' : 'warning'">
              {{ importOptions.mode === 'new' ? '创建新应用' : '覆盖已存在应用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="连接器">
            {{ importData.connectors?.length || 0 }} 个
          </el-descriptions-item>
          <el-descriptions-item label="Webhooks">
            {{ importData.webhooks?.length || 0 }} 个
          </el-descriptions-item>
          <el-descriptions-item label="访问令牌">
            {{ importData.tokens?.length || 0 }} 个
            <span v-if="!importOptions.import_secrets" style="color: #999">
              （密钥将被跳过）
            </span>
          </el-descriptions-item>
          <el-descriptions-item label="编码前缀">
            {{ importOptions.prefix || '无' }}
          </el-descriptions-item>
        </el-descriptions>

        <el-alert
          v-if="importOptions.mode === 'overwrite'"
          title="警告：覆盖模式将删除应用的所有现有配置！"
          type="error"
          :closable="false"
          style="margin-top: 16px"
        />
      </div>

      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <el-button
            v-if="importStep > 0"
            @click="importStep--"
          >
            上一步
          </el-button>
          <div style="flex: 1"></div>
          <el-button @click="importDialogVisible = false">取消</el-button>
          <el-button
            v-if="importStep < 3"
            type="primary"
            :disabled="!canProceed"
            @click="nextStep"
          >
            下一步
          </el-button>
          <el-button
            v-else
            type="primary"
            :loading="importing"
            @click="handleImport"
          >
            <el-icon><Check /></el-icon>
            确认导入
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Download,
  UploadFilled,
  Check
} from '@element-plus/icons-vue'
import * as api from '@/api/outbound'

const props = defineProps({
  currentApp: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['import-success', 'export-success'])

// 导出相关
const exportDialogVisible = ref(false)
const exporting = ref(false)
const exportForm = ref({
  includeItems: ['connectors', 'webhooks', 'scripts', 'tokens'],
  includeSecrets: false,
  format: 'json'
})

// 导入相关
const importDialogVisible = ref(false)
const importing = ref(false)
const importStep = ref(0)
const uploadRef = ref(null)
const uploadedFileName = ref('')
const importData = ref(null)
const validationResult = ref({
  valid: false,
  issues: [],
  summary: {}
})
const importOptions = ref({
  mode: 'new',
  prefix: '',
  import_secrets: false,
  generate_new_codes: false,
  overwrite_existing: false
})

// 计算属性
const canProceed = computed(() => {
  if (importStep.value === 0) {
    return importData.value !== null
  }
  if (importStep.value === 1) {
    return validationResult.value.valid
  }
  return true
})

const finalAppCode = computed(() => {
  if (!importData.value) return ''
  const prefix = importOptions.value.prefix || ''
  return prefix + importData.value.app.app_code
})

// 方法
function showExportDialog() {
  exportDialogVisible.value = true
}

function showImportDialog() {
  importDialogVisible.value = true
  importStep.value = 0
  importData.value = null
  validationResult.value = { valid: false, issues: [], summary: {} }
}

async function handleExport() {
  try {
    exporting.value = true

    const response = await api.exportOutboundApp(
      props.currentApp.id,
      exportForm.value.includeSecrets
    )

    // 下载文件
    const blob = new Blob([JSON.stringify(response.data, null, 2)], {
      type: 'application/json'
    })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.currentApp.app_code}_export_${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)

    ElMessage.success('导出成功')
    exportDialogVisible.value = false
    emit('export-success')
  } catch (error) {
    ElMessage.error('导出失败: ' + (error.message || '未知错误'))
  } finally {
    exporting.value = false
  }
}

function handleFileChange(file) {
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const content = e.target.result
      importData.value = JSON.parse(content)
      uploadedFileName.value = file.name
      ElMessage.success('文件加载成功')
    } catch (error) {
      ElMessage.error('文件格式错误，请上传有效的 JSON 文件')
      importData.value = null
    }
  }
  reader.readAsText(file.raw)
}

async function nextStep() {
  if (importStep.value === 0) {
    // 验证导入数据
    await validateImportData()
  }
  importStep.value++
}

async function validateImportData() {
  try {
    const { data } = await api.validateImportData(importData.value)
    validationResult.value = data

    if (!data.valid) {
      ElMessage.warning('配置文件验证未通过，请查看问题列表')
    } else {
      ElMessage.success('配置文件验证通过')
    }
  } catch (error) {
    validationResult.value = {
      valid: false,
      issues: ['服务器验证失败: ' + (error.message || '未知错误')],
      summary: {}
    }
  }
}

async function handleImport() {
  if (importOptions.value.mode === 'overwrite') {
    try {
      await ElMessageBox.confirm(
        '覆盖模式将删除应用的所有现有配置，包括连接器、Webhook等。此操作不可恢复，是否继续？',
        '警告',
        {
          confirmButtonText: '确认覆盖',
          cancelButtonText: '取消',
          type: 'warning',
          confirmButtonClass: 'el-button--danger'
        }
      )
    } catch {
      return
    }
  }

  try {
    importing.value = true

    const payload = {
      ...importData.value,
      options: {
        overwrite_existing: importOptions.value.mode === 'overwrite',
        generate_new_codes: importOptions.value.generate_new_codes,
        import_secrets: importOptions.value.import_secrets,
        prefix: importOptions.value.prefix
      }
    }

    const { data } = await api.importOutboundApp(payload)

    ElMessage.success('导入成功')
    importDialogVisible.value = false
    emit('import-success', data)
  } catch (error) {
    ElMessage.error('导入失败: ' + (error.message || '未知错误'))
  } finally {
    importing.value = false
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

// 暴露方法
defineExpose({
  showExportDialog,
  showImportDialog
})
</script>

<style scoped>
.outbound-import-export {
  display: inline-block;
}

.field-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.5;
}

:deep(.el-upload-dragger) {
  padding: 40px;
}

:deep(.el-icon--upload) {
  font-size: 67px;
  color: #409eff;
  margin-bottom: 16px;
}
</style>
