<template>
  <div>
    <div class="toolbar">
      <el-page-header v-if="!embedded" content="工单外发配置" @back="$router.push('/work-orders')" />
      <div class="spacer" />
      <el-button type="primary" @click="openCreate">新增 Webhook</el-button>
    </div>

    <el-alert
      type="info" :closable="false" style="margin-bottom:12px"
      title="工单创建/状态变更/关闭时，按下列配置外发同步。目标可选「第三方接口」或「连接器接口」；类型留空表示对所有工单生效；可配置多个。"
    />

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">{{ row.type_code || '全部' }}</template>
      </el-table-column>
      <el-table-column label="目标" width="220">
        <template #default="{ row }">
          <el-tag size="small">{{ row.target === 'connector' ? '连接器' : '第三方接口' }}</el-tag>
          <span style="margin-left:6px">{{ targetLabel(row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="监听事件">
        <template #default="{ row }">{{ eventsLabel(row.events) }}</template>
      </el-table-column>
      <el-table-column prop="enabled" label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing.id ? '编辑 Webhook' : '新增 Webhook'" width="640px">
      <el-form :model="editing" label-width="120px">
        <el-form-item label="名称" required><el-input v-model="editing.name" /></el-form-item>
        <el-form-item label="适用类型">
          <el-select v-model="editing.type_code" clearable placeholder="全部类型" style="width:100%">
            <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听事件">
          <el-select v-model="selectedEvents" multiple clearable placeholder="全部事件" style="width:100%">
            <el-option v-for="e in workOrderEvents" :key="e.value" :label="e.label" :value="e.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标类型">
          <el-radio-group v-model="editing.target">
            <el-radio-button label="endpoint">第三方接口</el-radio-button>
            <el-radio-button label="connector">连接器接口</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="editing.target === 'endpoint'" label="第三方接口">
          <el-select v-model="editing.endpoint_id" filterable placeholder="选择 outbound endpoint" style="width:100%">
            <el-option v-for="ep in endpoints" :key="ep.id" :label="`${ep.app_name || ''} / ${ep.name}`" :value="ep.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else label="连接器接口">
          <el-select v-model="editing.connector_code" filterable placeholder="选择连接器 interface_code" style="width:100%">
            <el-option v-for="cn in connectorInterfaces" :key="cn.id" :label="`${cn.name} (${cn.interface_code})`" :value="cn.interface_code" />
          </el-select>
        </el-form-item>
        <el-form-item label="入参映射">
          <div style="width:100%">
            <div class="map-head">
              <span class="hint">
                键=目标接口参数，值=事件参数（占位符格式 <code v-text="placeholderExample"></code>）或自定义文本。
                <el-button text type="primary" size="small" @click="showParamHelper = true" style="margin-left:8px">
                  查看所有占位符
                </el-button>
              </span>
              <el-button text size="small" @click="paramRawMode = !paramRawMode">
                {{ paramRawMode ? '切换到表格' : '切换到 JSON' }}
              </el-button>
            </div>

            <!-- 表格映射模式 -->
            <div v-if="!paramRawMode">
              <div v-if="targetParams.length" class="target-tip">
                目标接口参数：
                <el-tag
                  v-for="p in targetParams" :key="p.name"
                  size="small" :type="p.required ? 'danger' : 'info'"
                  class="tip-tag" @click="addTargetParam(p.name)"
                >
                  {{ p.name }}{{ p.required ? ' *' : '' }}<span v-if="p.type">（{{ p.type }}）</span>
                </el-tag>
                <span class="hint">（点击添加，红色为必填）</span>
              </div>
              <div v-else class="hint" style="margin-bottom:6px">
                选择目标接口后可自动带出其所需参数；也可手动添加行。
              </div>

              <div v-for="(r, i) in paramRows" :key="i" class="map-row">
                <el-select
                  v-model="r.key" filterable allow-create default-first-option
                  placeholder="目标参数名" size="small" class="map-key"
                >
                  <el-option v-for="p in targetParams" :key="p.name" :label="p.name" :value="p.name" />
                </el-select>
                <span class="map-eq">=</span>
                <el-select
                  v-model="r.src" filterable allow-create default-first-option
                  placeholder="占位符 / 自定义文本（支持多参数拼接）" size="small" class="map-val"
                >
                  <!-- 按分类分组显示 -->
                  <template v-for="cat in paramCategories" :key="cat">
                    <el-option-group :label="cat">
                      <el-option
                        v-for="ep in workOrderEventParamsByCategory[cat]" :key="ep.key"
                        :label="`${ep.label}  {{${ep.key}}}`" :value="`{{${ep.key}}}`"
                      >
                        <div style="display: flex; justify-content: space-between;">
                          <span>{{ ep.label }}</span>
                          <span style="color: #909399; font-size: 12px;" v-text="`{{${ep.key}}}`"></span>
                        </div>
                      </el-option>
                    </el-option-group>
                  </template>
                  <!-- 自定义示例 -->
                  <el-option-group label="多参数拼接示例">
                    <el-option label="设备_工单号_状态" value="{{device_name}}_{{code}}_{{status_name}}" />
                    <el-option label="设备信息描述" value="设备：{{device_name}}（{{device_serial}}），分组：{{device_group}}" />
                    <el-option label="提交人信息" value="{{created_by_username}} [{{created_by_role}}]" />
                    <el-option label="工单状态描述" value="工单{{code}}状态：{{status_name}}" />
                    <el-option label="工单优先级标题" value="【{{priority_name}}】{{title}}" />
                  </el-option-group>
                </el-select>
                <el-button text size="small" @click="paramRows.splice(i, 1)">删除</el-button>
              </div>
              <el-button text type="primary" size="small" @click="paramRows.push({ key: '', src: '' })">+ 添加映射</el-button>
            </div>

            <!-- 原始 JSON 模式 -->
            <div v-else>
              <WorkOrderParamsEditor
                v-model="editing.params_json"
                :min-height="200"
                placeholder='{"order_no": "{{code}}", "device": "{{device_name}}_{{device_serial}}", "reporter": "{{created_by_username}}"}'
              />
            </div>
          </div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="editing.sort_order" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="editing.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 占位符帮助对话框 -->
    <el-dialog v-model="showParamHelper" title="可用占位符参考" width="900px">
      <el-alert type="info" :closable="false" style="margin-bottom:12px">
        <span v-html="paramHelperTip"></span>
      </el-alert>
      <el-tabs>
        <el-tab-pane v-for="cat in paramCategories" :key="cat" :label="cat">
          <div class="param-list">
            <div v-for="p in workOrderEventParamsByCategory[cat]" :key="p.key" class="param-item">
              <div class="param-label">{{ p.label }}</div>
              <el-input
                :value="`{{${p.key}}}`" readonly size="small"
                style="width:200px"
              >
                <template #append>
                  <el-button @click="copyToClipboard(`{{${p.key}}}`)">复制</el-button>
                </template>
              </el-input>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="常用示例">
          <div class="example-list">
            <div class="example-item">
              <div class="example-title">多参数拼接（下划线分隔）</div>
              <el-input value="{{device_name}}_{{code}}_{{status}}" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('{{device_name}}_{{code}}_{{status}}')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">设备信息描述</div>
              <el-input value="设备：{{device_name}}（{{device_serial}}），分组：{{device_group}}" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('设备：{{device_name}}（{{device_serial}}），分组：{{device_group}}')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">提交人信息</div>
              <el-input value="{{created_by_username}} [{{created_by_role}}]" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('{{created_by_username}} [{{created_by_role}}]')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">设备硬件信息</div>
              <el-input value="型号：{{device_model}}，品牌：{{device_brand}}，系统：Android {{device_os_version}}，电量：{{device_battery}}%" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('型号：{{device_model}}，品牌：{{device_brand}}，系统：Android {{device_os_version}}，电量：{{device_battery}}%')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">工单标题（带优先级）</div>
              <el-input value="【{{priority_name}}】{{title}}" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('【{{priority_name}}】{{title}}')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">工单状态描述</div>
              <el-input value="工单 {{code}} 状态已更新为：{{status_name}}" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('工单 {{code}} 状态已更新为：{{status_name}}')">复制</el-button>
                </template>
              </el-input>
            </div>
            <div class="example-item">
              <div class="example-title">工单标签列表</div>
              <el-input value="标签：{{tags_names}}" readonly size="small">
                <template #append>
                  <el-button @click="copyToClipboard('标签：{{tags_names}}')">复制</el-button>
                </template>
              </el-input>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getWorkOrderWebhooks, createWorkOrderWebhook, updateWorkOrderWebhook, deleteWorkOrderWebhook,
  getWorkOrderTypes
} from '@/api/workOrder'
import {
  listOutboundEndpoints, listConnectorInterfaces,
  getEndpointParamSchema, getConnectorInterface
} from '@/api/outbound'
import { workOrderEvents, workOrderEventParams, workOrderEventParamsByCategory, paramCategories } from './workOrderConst'
import WorkOrderParamsEditor from '@/components/WorkOrderParamsEditor.vue'

defineProps({ embedded: { type: Boolean, default: false } })

const rows = ref([])
const types = ref([])
const endpoints = ref([])
const connectorInterfaces = ref([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref({})
const selectedEvents = ref([])
const showParamHelper = ref(false)

// 占位符示例文本（避免模板中的 {{ }} 冲突）
const placeholderExample = '{{key}}'
const multiParamExample = '"{{device_name}} - {{code}} - {{status_name}}"'
const paramHelperTip = '占位符格式：<code>{{key}}</code>，支持多参数拼接，例如：<code>"{{device_name}} - {{code}} - {{status_name}}"</code>。<br/>💡 <strong>提示：</strong>标签、状态、优先级都提供了「编码」和「名称」两种占位符，例如 <code>{{status}}</code> 输出 "open"，<code>{{status_name}}</code> 输出 "待处理"。'

// 入参映射：表格模式 + 原始 JSON 模式
const paramRawMode = ref(false)
const paramRows = ref([])        // [{ key, src }]
const targetParams = ref([])     // 目标接口所需参数 [{ name, type, required }]

// 复制到剪贴板
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.warning('复制失败，请手动复制')
  }
}

// params_json 字符串 → 表格行
const jsonToRows = (s) => {
  if (!s) return []
  try {
    const obj = JSON.parse(s)
    return Object.entries(obj).map(([key, src]) => ({ key, src: String(src) }))
  } catch { return [] }
}
// 表格行 → params_json 字符串（写回 editing.params_json）
const rowsToJson = () => {
  const obj = {}
  for (const r of paramRows.value) {
    const k = (r.key || '').trim()
    if (k) obj[k] = r.src ?? ''
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : ''
}
// 表格模式下，行变化实时同步回 editing.params_json
watch(paramRows, () => { if (!paramRawMode.value) editing.value.params_json = rowsToJson() }, { deep: true })
// 切到 JSON 模式时先用表格内容回填；切回表格时解析 JSON
watch(paramRawMode, (raw) => {
  if (raw) editing.value.params_json = rowsToJson()
  else paramRows.value = jsonToRows(editing.value.params_json)
})

const addTargetParam = (name) => {
  if (paramRows.value.some(r => r.key === name)) return
  paramRows.value.push({ key: name, src: '' })
}

// 拉取目标接口所需参数（endpoint → param-schema；connector → input_params_json）
const loadTargetParams = async () => {
  targetParams.value = []
  const e = editing.value
  try {
    if (e.target === 'endpoint' && e.endpoint_id) {
      const res = await getEndpointParamSchema(e.endpoint_id)
      targetParams.value = (res.params || res.data?.params || []).map(p => ({
        name: p.name, type: p.type, required: !!p.required
      }))
    } else if (e.target === 'connector' && e.connector_code) {
      const res = await getConnectorInterface(e.connector_code)
      const schema = res.data?.input_params_json || res.input_params_json
      targetParams.value = parseSchemaParams(schema)
    }
  } catch { targetParams.value = [] }
}
// 解析 JSON Schema 顶层属性为参数列表
const parseSchemaParams = (schemaJson) => {
  if (!schemaJson) return []
  try {
    const s = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson
    const props = s.properties || {}
    const required = Array.isArray(s.required) ? s.required : []
    return Object.entries(props).map(([name, def]) => ({
      name, type: def?.type || '', required: required.includes(name)
    }))
  } catch { return [] }
}

// 目标选择变化 → 重新拉所需参数
watch(() => [editing.value.target, editing.value.endpoint_id, editing.value.connector_code], () => {
  if (dialog.value) loadTargetParams()
})

const targetLabel = (row) => {
  if (row.target === 'connector') return row.connector_code || '-'
  const ep = endpoints.value.find(e => e.id === row.endpoint_id)
  return ep ? `${ep.app_name || ''} / ${ep.name}` : `#${row.endpoint_id}`
}
const eventsLabel = (s) => {
  if (!s) return '全部'
  try {
    const arr = JSON.parse(s)
    if (!arr.length) return '全部'
    return arr.map(v => workOrderEvents.find(e => e.value === v)?.label || v).join('、')
  } catch { return '全部' }
}

const load = async () => {
  loading.value = true
  try {
    const res = await getWorkOrderWebhooks()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editing.value = { name: '', type_code: '', target: 'endpoint', endpoint_id: null, connector_code: '', params_json: '', sort_order: 0, enabled: true }
  selectedEvents.value = []
  paramRawMode.value = false
  paramRows.value = []
  targetParams.value = []
  dialog.value = true
}
const openEdit = (row) => {
  editing.value = { ...row }
  try { selectedEvents.value = row.events ? JSON.parse(row.events) : [] } catch { selectedEvents.value = [] }
  // params_json 能解析成对象则用表格模式，否则退回原始 JSON 模式
  const parsedRows = jsonToRows(row.params_json)
  if (row.params_json && parsedRows.length === 0) {
    paramRawMode.value = true
  } else {
    paramRawMode.value = false
    paramRows.value = parsedRows
  }
  dialog.value = true
  loadTargetParams()
}

const save = async () => {
  const e = editing.value
  if (!e.name) { ElMessage.warning('名称必填'); return }
  if (e.target === 'endpoint' && !e.endpoint_id) { ElMessage.warning('请选择第三方接口'); return }
  if (e.target === 'connector' && !e.connector_code) { ElMessage.warning('请选择连接器接口'); return }
  // 表格模式：以表格内容为准生成 params_json
  if (!paramRawMode.value) e.params_json = rowsToJson()
  if (e.params_json) {
    try { JSON.parse(e.params_json) } catch { ElMessage.error('入参映射不是合法 JSON'); return }
  }
  e.events = JSON.stringify(selectedEvents.value || [])
  if (e.id) await updateWorkOrderWebhook(e.id, e)
  else await createWorkOrderWebhook(e)
  dialog.value = false
  ElMessage.success('已保存')
  load()
}

const remove = async (row) => {
  await ElMessageBox.confirm(`删除 Webhook「${row.name}」？`, '确认', { type: 'warning' })
  await deleteWorkOrderWebhook(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(async () => {
  const [t, ep, cn] = await Promise.all([
    getWorkOrderTypes(),
    listOutboundEndpoints().catch(() => ({ data: [] })),
    listConnectorInterfaces().catch(() => ({ data: [] }))
  ])
  types.value = t.data || []
  endpoints.value = ep.data || []
  connectorInterfaces.value = cn.data || []
  load()
})
</script>

<style scoped>
.toolbar { display: flex; align-items: center; margin-bottom: 12px; }
.spacer { flex: 1; }
.hint { font-size: 12px; color: #909399; margin-bottom: 6px; }
.map-head { display: flex; align-items: center; justify-content: space-between; }
.target-tip { margin-bottom: 8px; }
.tip-tag { margin: 0 4px 4px 0; cursor: pointer; }
.map-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.map-key { width: 200px; }
.map-val { flex: 1; }
.map-eq { color: #909399; }

/* 占位符帮助对话框样式 */
.param-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.param-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.param-label {
  min-width: 120px;
  font-size: 13px;
  color: #606266;
}
.example-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.example-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.example-title {
  font-size: 13px;
  font-weight: 500;
  color: #606266;
}
code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #e6a23c;
}
</style>
