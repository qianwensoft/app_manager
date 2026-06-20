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

        <!-- Context Variables Section -->
        <div class="section-title">
          上下文变量（Context）
          <el-tooltip content="定义可在所有动作中引用的变量，格式：{{ctx.变量名}}">
            <el-icon style="margin-left:4px"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="context-section">
          <div v-if="contextVars.length === 0" class="empty-hint">
            暂无上下文变量，可在动作配置中定义
          </div>
          <el-tag
            v-for="(ctx, idx) in contextVars"
            :key="idx"
            closable
            @close="removeContextVar(idx)"
            style="margin-right:8px;margin-bottom:8px"
          >
            {{ctx.name}}: {{ctx.defaultValue || '(无默认值)'}}
          </el-tag>
          <el-button text type="primary" size="small" @click="openContextDialog">
            <el-icon><Plus /></el-icon> 添加变量
          </el-button>
        </div>

        <el-divider />
        <div class="section-title">
          动作配置
          <el-button text type="primary" size="small" @click="addAction">添加动作</el-button>
        </div>
        <div v-for="(action, idx) in actions" :key="idx" class="action-item">
          <div class="action-head">
            <span>动作 {{ idx + 1 }}</span>
            <div>
              <el-button text type="primary" size="small" @click="moveAction(idx, -1)" :disabled="idx === 0">
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button text type="primary" size="small" @click="moveAction(idx, 1)" :disabled="idx === actions.length - 1">
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <el-button text type="danger" size="small" @click="removeAction(idx)">删除</el-button>
            </div>
          </div>
          <el-form-item label="动作类型">
            <el-select v-model="action.type" placeholder="选择动作类型" style="width:100%" @change="onActionTypeChange(idx)">
              <el-option label="调用第三方接口" value="call_endpoint" />
              <el-option label="调用连接器" value="call_connector" />
              <el-option label="调用数据接口" value="call_data_interface" />
              <el-option label="执行 JavaScript" value="execute_js" />
              <el-option label="更新工单" value="update_work_order" />
              <el-option label="创建工单" value="create_work_order" />
              <el-option label="查询工单" value="query_work_orders" />
            </el-select>
          </el-form-item>

          <!-- Visual builder for call_endpoint -->
          <template v-if="action.type === 'call_endpoint' && action.useBuilder">
            <el-form-item label="选择第三方接口">
              <el-select
                v-model="action.builder.endpointId"
                placeholder="选择第三方接口"
                style="width:100%"
                filterable
                @change="onEndpointSelected(idx)"
              >
                <el-option
                  v-for="endpoint in outboundEndpoints"
                  :key="endpoint.id"
                  :label="`${endpoint.name}`"
                  :value="endpoint.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item v-if="action.builder.endpointId && action.builder.paramList" label="参数映射">
              <div class="param-mapping">
                <div v-if="!action.builder.paramList || action.builder.paramList.length === 0" class="no-params">
                  该接口无需参数
                </div>
                <div v-else>
                  <div v-for="param in action.builder.paramList" :key="param.name" class="param-row">
                    <div class="param-label">
                      <span class="param-name">{{ param.name }}</span>
                      <el-tag v-if="param.required" type="danger" size="small">必填</el-tag>
                      <span class="param-type">{{ param.type || 'string' }}</span>
                      <span v-if="param.description" class="param-desc">{{ param.description }}</span>
                    </div>
                    <el-input
                      v-model="action.builder.params[param.name]"
                      placeholder="输入值或模板变量 {{field}}"
                      @input="updateBuilderJSON(idx)"
                    >
                      <template #append>
                        <el-dropdown @command="cmd => insertTemplate(idx, param.name, cmd)" trigger="click">
                          <el-button>
                            <el-icon><More /></el-icon>
                          </el-button>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item disabled>工单字段</el-dropdown-item>
                              <el-dropdown-item command="{{code}}">{{code}} - 工单编号</el-dropdown-item>
                              <el-dropdown-item command="{{title}}">{{title}} - 工单标题</el-dropdown-item>
                              <el-dropdown-item command="{{description}}">{{description}} - 工单描述</el-dropdown-item>
                              <el-dropdown-item command="{{device_id}}">{{device_id}} - 设备ID</el-dropdown-item>
                              <el-dropdown-item command="{{status}}">{{status}} - 工单状态</el-dropdown-item>
                              <el-dropdown-item command="{{priority}}">{{priority}} - 优先级</el-dropdown-item>
                              <el-dropdown-item command="{{assignee_id}}">{{assignee_id}} - 指派人ID</el-dropdown-item>
                              <el-dropdown-item command="{{other_codes}}">{{other_codes}} - 其他编码</el-dropdown-item>
                              <el-dropdown-item divided disabled v-if="contextVars.length > 0">上下文变量</el-dropdown-item>
                              <el-dropdown-item
                                v-for="ctx in contextVars"
                                :key="ctx.name"
                                :command="ctxTemplate(ctx.name)"
                              >
                                {{ ctxTemplateLabel(ctx) }}
                              </el-dropdown-item>
                              <el-dropdown-item divided disabled v-if="idx > 0">前序动作结果</el-dropdown-item>
                              <el-dropdown-item
                                v-for="prevIdx in idx"
                                :key="prevIdx"
                                :command="actionResultTemplate(prevIdx)"
                              >
                                {{ actionResultLabel(prevIdx) }}
                              </el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </template>
                    </el-input>
                  </div>
                </div>
              </div>
            </el-form-item>

            <!-- Context variable to store result -->
            <el-form-item label="结果保存到上下文">
              <el-input
                v-model="action.builder.saveToContext"
                placeholder="变量名，如：api_response"
                @input="updateBuilderJSON(idx)"
              >
                <template #prepend>ctx.</template>
              </el-input>
              <div class="hint">可选，将接口响应保存到上下文变量中供后续动作使用</div>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
              <div class="hint">自动从上方配置生成，也可切换到手动模式直接编辑 JSON</div>
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Visual builder for call_data_interface -->
          <template v-if="action.type === 'call_data_interface' && action.useBuilder">
            <el-form-item label="选择数据接口">
              <el-select
                v-model="action.builder.interfaceId"
                placeholder="选择数据接口"
                style="width:100%"
                filterable
                @change="onInterfaceSelected(idx)"
              >
                <el-option
                  v-for="iface in dataInterfaces"
                  :key="iface.id"
                  :label="`${iface.name} (${iface.code})`"
                  :value="iface.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item v-if="action.builder.interfaceId && action.builder.paramList" label="参数映射">
              <div class="param-mapping">
                <div v-if="!action.builder.paramList || action.builder.paramList.length === 0" class="no-params">
                  该接口无需参数
                </div>
                <div v-else>
                  <div v-for="param in action.builder.paramList" :key="param.name" class="param-row">
                    <div class="param-label">
                      <span class="param-name">{{ param.name }}</span>
                      <el-tag v-if="param.required" type="danger" size="small">必填</el-tag>
                      <span class="param-type">{{ param.type || 'string' }}</span>
                      <span v-if="param.description" class="param-desc">{{ param.description }}</span>
                    </div>
                    <el-input
                      v-if="!param.enum || param.enum.length === 0"
                      v-model="action.builder.params[param.name]"
                      placeholder="输入值或模板变量 {{field}}"
                      @input="updateBuilderJSON(idx)"
                    >
                      <template #append>
                        <el-dropdown @command="cmd => insertTemplate(idx, param.name, cmd)">
                          <el-button>
                            <el-icon><More /></el-icon>
                          </el-button>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="{{code}}">{{code}}</el-dropdown-item>
                              <el-dropdown-item command="{{title}}">{{title}}</el-dropdown-item>
                              <el-dropdown-item command="{{description}}">{{description}}</el-dropdown-item>
                              <el-dropdown-item command="{{device_id}}">{{device_id}}</el-dropdown-item>
                              <el-dropdown-item command="{{status}}">{{status}}</el-dropdown-item>
                              <el-dropdown-item command="{{priority}}">{{priority}}</el-dropdown-item>
                              <el-dropdown-item command="{{assignee_id}}">{{assignee_id}}</el-dropdown-item>
                              <el-dropdown-item command="{{other_codes}}">{{other_codes}}</el-dropdown-item>
                              <el-dropdown-item command="{{created_at}}">{{created_at}}</el-dropdown-item>
                              <el-dropdown-item command="{{updated_at}}">{{updated_at}}</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </template>
                    </el-input>
                    <el-select
                      v-else
                      v-model="action.builder.params[param.name]"
                      placeholder="选择枚举值"
                      clearable
                      @change="updateBuilderJSON(idx)"
                    >
                      <el-option v-for="opt in param.enum" :key="opt" :label="opt" :value="opt" />
                    </el-select>
                  </div>
                </div>
              </div>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
              <div class="hint">自动从上方配置生成，也可切换到手动模式直接编辑 JSON</div>
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Fallback JSON editor -->
          <el-form-item v-else label="配置（JSON）">
            <el-input v-model="action.configJSON" type="textarea" :rows="6" placeholder="动作配置（JSON 对象）" />
            <div class="hint">
              <div v-if="action.type === 'call_endpoint'">
                格式：{"endpoint_id": 1, "params": {"key": "{{code}}"}, "save_to_context": "变量名"}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initEndpointBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'call_connector'">格式：{"connector_code": "xxx", "params": {"key": "{{title}}"}}</div>
              <div v-if="action.type === 'call_data_interface'">
                格式：{"interface_id": 1, "params": {"code": "{{other_codes}}"}}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initDataInterfaceBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
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

    <!-- Context Variable Dialog -->
    <el-dialog v-model="contextDialog" title="添加上下文变量" width="500px">
      <el-form label-width="100px">
        <el-form-item label="变量名" required>
          <el-input v-model="contextForm.name" placeholder="如：user_id" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="contextForm.description" placeholder="变量用途说明" />
        </el-form-item>
        <el-form-item label="默认值">
          <el-input v-model="contextForm.defaultValue" placeholder="可选，默认值" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contextDialog = false">取消</el-button>
        <el-button type="primary" @click="saveContextVar">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { More, QuestionFilled, Plus, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import {
  getWorkOrderWorkflows, createWorkOrderWorkflow, updateWorkOrderWorkflow, deleteWorkOrderWorkflow,
  testWorkOrderWorkflow, getWorkOrderTypes
} from '@/api/workOrder'
import { listDataInterfaces, getInterfaceParamSchema } from '@/api/dataStack'
import { listOutboundEndpoints, getEndpointParamSchema } from '@/api/outbound'

const workflows = ref([])
const types = ref([])
const dataInterfaces = ref([])
const outboundEndpoints = ref([])
const dialog = ref(false)
const form = ref({
  id: null, name: '', type_code: '', description: '', enabled: true, sort_order: 0
})
const eventList = ref([])
const actions = ref([])
const contextVars = ref([])
const contextDialog = ref(false)
const contextForm = ref({ name: '', description: '', defaultValue: '' })
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
  contextVars.value = []
  dialog.value = true
}

const openEdit = (row) => {
  form.value = { ...row }
  eventList.value = parseEvents(row.events)
  const acts = parseActions(row.actions_json)

  // Extract context variables from workflow metadata
  contextVars.value = []
  try {
    const firstAction = acts[0]
    if (firstAction?.config?.context) {
      contextVars.value = firstAction.config.context.map(c => ({
        name: c.name || c,
        description: c.description || '',
        defaultValue: c.defaultValue || c.default_value || ''
      }))
    }
  } catch (e) {
    // Ignore
  }

  actions.value = acts.map(a => {
    const action = { type: a.type, configJSON: JSON.stringify(a.config, null, 2), useBuilder: false, builder: {} }
    // Check if this is a call_endpoint action
    if (a.type === 'call_endpoint' && a.config?.endpoint_id) {
      action.builder = {
        endpointId: a.config.endpoint_id,
        params: a.config.params || {},
        saveToContext: a.config.save_to_context || '',
        paramList: null
      }
    }
    // Check if this is a call_data_interface action
    if (a.type === 'call_data_interface' && a.config?.interface_id) {
      action.builder = {
        interfaceId: a.config.interface_id,
        params: a.config.params || {},
        paramList: null
      }
    }
    return action
  })
  dialog.value = true
}

const addAction = () => {
  actions.value.push({ type: '', configJSON: '{}', useBuilder: false, builder: {} })
}

const removeAction = (idx) => {
  actions.value.splice(idx, 1)
}

const moveAction = (idx, direction) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= actions.value.length) return
  const temp = actions.value[idx]
  actions.value[idx] = actions.value[newIdx]
  actions.value[newIdx] = temp
}

const openContextDialog = () => {
  contextForm.value = { name: '', description: '', defaultValue: '' }
  contextDialog.value = true
}

const saveContextVar = () => {
  if (!contextForm.value.name?.trim()) {
    ElMessage.warning('变量名不能为空')
    return
  }
  if (contextVars.value.some(v => v.name === contextForm.value.name)) {
    ElMessage.warning('变量名已存在')
    return
  }
  contextVars.value.push({ ...contextForm.value })
  contextDialog.value = false
}

const removeContextVar = (idx) => {
  contextVars.value.splice(idx, 1)
}


const onActionTypeChange = (idx) => {
  const action = actions.value[idx]
  if (action.type === 'call_endpoint') {
    action.useBuilder = false
    action.builder = { endpointId: null, params: {}, saveToContext: '', paramList: null }
  } else if (action.type === 'call_data_interface') {
    action.useBuilder = false
    action.builder = { interfaceId: null, params: {}, paramList: null }
  }
}

const initEndpointBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { endpointId: null, params: {}, saveToContext: '', paramList: null }

  // Try to parse existing config
  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.endpoint_id) {
      action.builder.endpointId = config.endpoint_id
      action.builder.params = config.params || {}
      action.builder.saveToContext = config.save_to_context || ''
      await loadEndpointParams(idx, config.endpoint_id)
    }
  } catch (e) {
    // Ignore parse errors
  }
}

const initDataInterfaceBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { interfaceId: null, params: {}, paramList: null }

  // Try to parse existing config
  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.interface_id) {
      action.builder.interfaceId = config.interface_id
      action.builder.params = config.params || {}
      await loadInterfaceParams(idx, config.interface_id)
    }
  } catch (e) {
    // Ignore parse errors
  }
}

const onEndpointSelected = async (idx) => {
  const action = actions.value[idx]
  const endpointId = action.builder.endpointId
  if (!endpointId) {
    action.builder.paramList = null
    action.builder.params = {}
    updateEndpointBuilderJSON(idx)
    return
  }
  await loadEndpointParams(idx, endpointId)
  updateEndpointBuilderJSON(idx)
}

const loadEndpointParams = async (idx, endpointId) => {
  const action = actions.value[idx]
  try {
    const res = await getEndpointParamSchema(endpointId)
    action.builder.paramList = res.data?.params || []
  } catch (e) {
    ElMessage.warning('加载接口参数失败: ' + e.message)
    action.builder.paramList = []
  }
}

const updateEndpointBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = {
    endpoint_id: action.builder.endpointId,
    params: action.builder.params
  }
  if (action.builder.saveToContext) {
    config.save_to_context = action.builder.saveToContext
  }
  // Add context variables as metadata in the first action
  if (idx === 0 && contextVars.value.length > 0) {
    config.context = contextVars.value
  }
  action.configJSON = JSON.stringify(config, null, 2)
}

const onInterfaceSelected = async (idx) => {
  const action = actions.value[idx]
  const interfaceId = action.builder.interfaceId
  if (!interfaceId) {
    action.builder.paramList = null
    action.builder.params = {}
    updateBuilderJSON(idx)
    return
  }
  await loadInterfaceParams(idx, interfaceId)
  updateBuilderJSON(idx)
}

const loadInterfaceParams = async (idx, interfaceId) => {
  const action = actions.value[idx]
  try {
    const res = await getInterfaceParamSchema(interfaceId)
    action.builder.paramList = res.data?.params || []
  } catch (e) {
    ElMessage.warning('加载接口参数失败: ' + e.message)
    action.builder.paramList = []
  }
}

const updateBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = {
    interface_id: action.builder.interfaceId,
    params: action.builder.params
  }
  action.configJSON = JSON.stringify(config, null, 2)
}

const insertTemplate = (idx, paramName, template) => {
  const action = actions.value[idx]
  const current = action.builder.params[paramName] || ''
  action.builder.params[paramName] = current + template
  if (action.type === 'call_endpoint') {
    updateEndpointBuilderJSON(idx)
  } else if (action.type === 'call_data_interface') {
    updateBuilderJSON(idx)
  }
}

const ctxTemplate = (name) => {
  return '{{ctx.' + name + '}}'
}

const ctxTemplateLabel = (ctx) => {
  return '{{ctx.' + ctx.name + '}} - ' + (ctx.description || ctx.name)
}

const actionResultTemplate = (idx) => {
  return '{{actions[' + idx + '].result}}'
}

const actionResultLabel = (idx) => {
  return '{{actions[' + idx + '].result}} - 动作' + (idx + 1) + '结果'
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

  // Load data interfaces for the builder
  try {
    const res = await listDataInterfaces()
    dataInterfaces.value = res.data || []
  } catch (e) {
    console.error('Failed to load data interfaces:', e)
  }

  // Load outbound endpoints for the builder
  try {
    const res = await listOutboundEndpoints()
    outboundEndpoints.value = res.data || []
  } catch (e) {
    console.error('Failed to load outbound endpoints:', e)
  }

  load()
})
</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.section-title { font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
.action-item { border: 1px solid #dcdfe6; border-radius: 4px; padding: 12px; margin-bottom: 12px; }
.action-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: bold; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }

.context-section {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  min-height: 60px;
  margin-bottom: 16px;
}
.empty-hint {
  color: #909399;
  font-size: 13px;
  margin-bottom: 8px;
}

.param-mapping { border: 1px solid #ebeef5; border-radius: 4px; padding: 12px; background: #fafafa; }
.param-row { margin-bottom: 12px; }
.param-row:last-child { margin-bottom: 0; }
.param-label { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.param-name { font-weight: 600; color: #303133; }
.param-type { font-size: 12px; color: #909399; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
.param-desc { font-size: 12px; color: #606266; font-style: italic; }
.no-params { text-align: center; color: #909399; padding: 20px; }
</style>
