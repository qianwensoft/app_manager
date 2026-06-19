<template>
  <div>
    <el-page-header content="工单工作流" @back="$router.push('/work-orders/settings')" style="margin-bottom:16px" />

    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">新建工作流</el-button>
        <el-button @click="$router.push('/work-orders/workflow-logs')">查看执行日志</el-button>
      </div>

      <el-table :data="workflows" stripe>
        <el-table-column label="ID" prop="id" width="60" />
        <el-table-column label="名称" prop="name" min-width="150" />
        <el-table-column label="工单类型">
          <template #default="{row}">
            {{ row.type_code || '全局（所有类型）' }}
          </template>
        </el-table-column>
        <el-table-column label="监听事件" min-width="200">
          <template #default="{row}">
            <span v-if="!row.events || parseEvents(row.events).length === 0">全部事件</span>
            <el-tag v-else v-for="e in parseEvents(row.events)" :key="e" size="small" style="margin-right:4px">
              {{ eventLabel(e) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="动作数">
          <template #default="{row}">{{ parseActions(row.actions_json).length }}</template>
        </el-table-column>
        <el-table-column label="启用">
          <template #default="{row}">
            <el-switch v-model="row.enabled" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sort_order" width="80" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{row}">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="primary" size="small" @click="openTest(row)">测试</el-button>
            <el-button text type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="form.id ? '编辑工作流' : '新建工作流'" width="800px" destroy-on-close>
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="工作流名称" />
        </el-form-item>
        <el-form-item label="工单类型">
          <el-select v-model="form.type_code" placeholder="留空表示全局（所有类型）" clearable style="width:100%">
            <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听事件">
          <el-select v-model="eventList" multiple placeholder="留空监听所有事件" style="width:100%">
            <el-option v-for="e in availableEvents" :key="e.value" :label="e.label" :value="e.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-divider />
        <div class="section-title">
          动作配置
          <el-button text type="primary" size="small" @click="addAction">添加动作</el-button>
        </div>
        <div v-for="(action, idx) in actions" :key="idx" class="action-item">
          <div class="action-head">
            <span>动作 {{ idx + 1 }}</span>
            <el-button text type="danger" size="small" @click="removeAction(idx)">删除</el-button>
          </div>
          <el-form-item label="动作类型">
            <el-select v-model="action.type" placeholder="选择动作类型" style="width:100%">
              <el-option label="调用第三方接口" value="call_endpoint" />
              <el-option label="调用连接器" value="call_connector" />
              <el-option label="调用数据接口" value="call_data_interface" />
              <el-option label="执行 JavaScript" value="execute_js" />
              <el-option label="更新工单" value="update_work_order" />
              <el-option label="创建工单" value="create_work_order" />
              <el-option label="查询工单" value="query_work_orders" />
            </el-select>
          </el-form-item>
          <el-form-item label="配置（JSON）">
            <el-input v-model="action.configJSON" type="textarea" :rows="6" placeholder="动作配置（JSON 对象）" />
            <div class="hint">
              <div v-if="action.type === 'call_endpoint'">格式：{"endpoint_id": 1, "params": {"key": "{{code}}"}}</div>
              <div v-if="action.type === 'call_connector'">格式：{"connector_code": "xxx", "params": {"key": "{{title}}"}}</div>
              <div v-if="action.type === 'call_data_interface'">格式：{"interface_id": 1, "params": {"code": "{{other_codes}}"}}</div>
              <div v-if="action.type === 'execute_js'">格式：{"code": "log('工单: ' + workOrder.code);"}</div>
              <div v-if="action.type === 'update_work_order'">格式：{"updates": {"status": "in_progress"}} 或 {"work_order_id": 123, "updates": {...}}</div>
              <div v-if="action.type === 'create_work_order'">格式：{"fields": {"title": "自动创建", "type_code": "xxx"}}</div>
              <div v-if="action.type === 'query_work_orders'">格式：{"conditions": {"device_id": "{{device_id}}"}, "limit": 10}</div>
            </div>
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="testDialog" title="测试工作流" width="460px">
      <el-form label-width="100px">
        <el-form-item label="工单 ID">
          <el-input v-model.number="testForm.workOrderId" type="number" placeholder="测试用工单 ID" />
        </el-form-item>
        <el-form-item label="触发事件">
          <el-input v-model="testForm.event" placeholder="如 work_order.test" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testDialog = false">取消</el-button>
        <el-button type="primary" @click="runTest">执行测试</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getWorkOrderWorkflows, createWorkOrderWorkflow, updateWorkOrderWorkflow, deleteWorkOrderWorkflow,
  testWorkOrderWorkflow, getWorkOrderTypes
} from '@/api/workOrder'

const workflows = ref([])
const types = ref([])
const dialog = ref(false)
const form = ref({
  id: null, name: '', type_code: '', description: '', enabled: true, sort_order: 0
})
const eventList = ref([])
const actions = ref([])
const testDialog = ref(false)
const testForm = ref({ workflowId: null, workOrderId: null, event: 'work_order.test' })

const availableEvents = [
  { label: '创建', value: 'work_order.created' },
  { label: '更新', value: 'work_order.updated' },
  { label: '状态变更', value: 'work_order.status_changed' },
  { label: '关闭', value: 'work_order.closed' }
]

const eventLabel = (e) => availableEvents.find(ev => ev.value === e)?.label || e

const parseEvents = (json) => {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}
const parseActions = (json) => {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

const load = async () => {
  const res = await getWorkOrderWorkflows()
  workflows.value = res.data || []
}

const openCreate = () => {
  form.value = { id: null, name: '', type_code: '', description: '', enabled: true, sort_order: 0 }
  eventList.value = []
  actions.value = []
  dialog.value = true
}

const openEdit = (row) => {
  form.value = { ...row }
  eventList.value = parseEvents(row.events)
  const acts = parseActions(row.actions_json)
  actions.value = acts.map(a => ({ type: a.type, configJSON: JSON.stringify(a.config, null, 2) }))
  dialog.value = true
}

const addAction = () => {
  actions.value.push({ type: '', configJSON: '{}' })
}
const removeAction = (idx) => {
  actions.value.splice(idx, 1)
}

const save = async () => {
  if (!form.value.name?.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  // 构建 actions_json
  const actionsData = []
  for (const a of actions.value) {
    if (!a.type) {
      ElMessage.warning('请选择动作类型')
      return
    }
    let config
    try {
      config = JSON.parse(a.configJSON || '{}')
    } catch (e) {
      ElMessage.error('动作配置 JSON 格式错误: ' + e.message)
      return
    }
    actionsData.push({ type: a.type, config })
  }
  const payload = {
    name: form.value.name,
    type_code: form.value.type_code || '',
    events: eventList.value.length ? JSON.stringify(eventList.value) : '',
    actions_json: JSON.stringify(actionsData),
    description: form.value.description || '',
    enabled: form.value.enabled,
    sort_order: form.value.sort_order || 0
  }
  if (form.value.id) {
    await updateWorkOrderWorkflow(form.value.id, payload)
    ElMessage.success('已更新')
  } else {
    await createWorkOrderWorkflow(payload)
    ElMessage.success('已创建')
  }
  dialog.value = false
  load()
}

const toggleEnabled = async (row) => {
  await updateWorkOrderWorkflow(row.id, { enabled: row.enabled })
  ElMessage.success('已更新')
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该工作流？', '提示', { type: 'warning' })
  } catch { return }
  await deleteWorkOrderWorkflow(row.id)
  ElMessage.success('已删除')
  load()
}

const openTest = (row) => {
  testForm.value.workflowId = row.id
  testForm.value.workOrderId = null
  testForm.value.event = 'work_order.test'
  testDialog.value = true
}

const runTest = async () => {
  if (!testForm.value.workOrderId) {
    ElMessage.warning('请输入工单 ID')
    return
  }
  await testWorkOrderWorkflow(testForm.value.workflowId, testForm.value.workOrderId, testForm.value.event)
  testDialog.value = false
  ElMessage.success('工作流已触发，请查看执行日志')
}

onMounted(async () => {
  const t = await getWorkOrderTypes()
  types.value = t.data || []
  load()
})
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.section-title { font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
.action-item { border: 1px solid #dcdfe6; border-radius: 4px; padding: 12px; margin-bottom: 12px; }
.action-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: bold; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }
</style>
