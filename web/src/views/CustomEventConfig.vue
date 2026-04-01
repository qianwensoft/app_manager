<template>
  <div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
      title="自定义事件定义"
      description="按业务分组管理：每条定义包含上报键（event_type）、若干广播动作（Intent action）、按顺序尝试的数据标签（Intent extra 键）。保存后可在「自定义事件」页按定义或分组批量下发到多台 Agent。"
    />
    <div class="toolbar">
      <el-button type="success" :loading="importing" @click="openImportDialog">
        一键导入常用 PDA 扫码
      </el-button>
      <span class="toolbar-hint">覆盖 Honeywell、Zebra DataWedge、新大陆、商米等常见 Intent；已存在的上报键会自动跳过</span>
    </div>

    <el-row :gutter="16">
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="hdr">
              <span>分组</span>
              <el-button type="primary" size="small" @click="openGroupDialog()">新建</el-button>
            </div>
          </template>
          <el-table :data="groups" border size="small" highlight-current-row @current-change="onGroupRow">
            <el-table-column prop="name" label="名称" />
            <el-table-column prop="sort_order" label="排序" width="70" />
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="openGroupDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click.stop="removeGroup(row)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="hdr">
              <span>事件定义{{ currentGroup ? ` — ${currentGroup.name}` : '（全部分组）' }}</span>
              <el-button type="primary" size="small" :disabled="!groups.length" @click="openDefDialog()">新建定义</el-button>
            </div>
          </template>
          <el-table :data="definitions" border size="small" max-height="440">
            <el-table-column prop="key" label="上报键" width="140" show-overflow-tooltip />
            <el-table-column prop="name" label="名称" min-width="100" show-overflow-tooltip />
            <el-table-column prop="enabled" label="启用" width="70">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="广播动作数" width="100" align="center">
              <template #default="{ row }">{{ (row.broadcast_actions || []).length }}</template>
            </el-table-column>
            <el-table-column label="数据标签数" width="100" align="center">
              <template #default="{ row }">{{ (row.extra_keys || []).length }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openDefDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeDef(row)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="importDlg.visible" title="一键导入常用 PDA 扫码" width="520px" destroy-on-close @open="onImportOpen">
      <p class="import-desc">
        将导入多条预设事件定义（各品牌典型广播 action 与 extra 键）。请在设备上将扫码输出配置为「广播/Intent」并与预设对齐；DataWedge 等需在工具里自行匹配 action 与数据标签。
      </p>
      <el-form label-width="120px">
        <el-form-item label="目标分组" required>
          <el-radio-group v-model="importDlg.mode">
            <el-radio label="selected">使用当前选中的分组</el-radio>
            <el-radio label="new">新建分组「常用 PDA 扫码」</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="importDlg.mode === 'selected'" label="当前分组">
          <span v-if="currentGroup">{{ currentGroup.name }}（#{{ currentGroup.id }}）</span>
          <span v-else class="warn">请先在左侧表格点选一行分组</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="runImport">开始导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="groupDlg.visible" :title="groupDlg.editId ? '编辑分组' : '新建分组'" width="480px" destroy-on-close>
      <el-form :model="groupDlg.form" label-width="88px">
        <el-form-item label="名称" required>
          <el-input v-model="groupDlg.form.name" placeholder="如：一号仓库 / 产线 A" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="groupDlg.form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="groupDlg.form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="MQTT 转发">
          <el-switch v-model="groupDlg.form.mqtt_enabled" />
        </el-form-item>
        <el-form-item v-if="groupDlg.form.mqtt_enabled" label="MQTT 主题">
          <el-input v-model="groupDlg.form.mqtt_topic" placeholder="如：devices/events/group1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="groupDlg.saving" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="defDlg.visible" :title="defDlg.editId ? '编辑定义' : '新建定义'" width="640px" destroy-on-close>
      <el-form :model="defDlg.form" label-width="110px">
        <el-form-item label="所属分组" required>
          <el-select v-model="defDlg.form.group_id" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上报键 key" required>
          <el-input v-model="defDlg.form.key" placeholder="字母开头，如 honeywell_scan" :disabled="!!defDlg.editId" />
        </el-form-item>
        <el-form-item label="显示名称" required>
          <el-input v-model="defDlg.form.name" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="defDlg.form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="defDlg.form.enabled" />
        </el-form-item>
        <el-form-item label="MQTT 转发">
          <el-switch v-model="defDlg.form.mqtt_enabled" />
          <span style="margin-left: 8px; font-size: 12px; color: #999">优先级高于分组配置</span>
        </el-form-item>
        <el-form-item v-if="defDlg.form.mqtt_enabled" label="MQTT 主题">
          <el-input v-model="defDlg.form.mqtt_topic" placeholder="如：devices/events/scan" />
        </el-form-item>
        <el-form-item label="广播动作" required>
          <el-input
            v-model="defDlg.actionsText"
            type="textarea"
            :rows="5"
            placeholder="每行一个 Intent action，例如：&#10;com.honeywell.decode.intent.action.BARCODE_DATA"
          />
        </el-form-item>
        <el-form-item label="数据标签" required>
          <el-input
            v-model="defDlg.keysText"
            type="textarea"
            :rows="4"
            placeholder="每行一个 Intent extra 键名，按从上到下顺序尝试取值，例如：&#10;data&#10;barcode_string"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="defDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="defDlg.saving" @click="saveDef">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/customEventConfig'

const groups = ref([])
const definitions = ref([])
const currentGroup = ref(null)
const importing = ref(false)
const importDlg = reactive({
  visible: false,
  mode: 'selected'
})

const groupDlg = reactive({
  visible: false,
  editId: null,
  saving: false,
  form: { name: '', description: '', sort_order: 0, mqtt_enabled: false, mqtt_topic: '' }
})

const defDlg = reactive({
  visible: false,
  editId: null,
  saving: false,
  form: {
    group_id: null,
    key: '',
    name: '',
    description: '',
    enabled: true,
    mqtt_enabled: false,
    mqtt_topic: ''
  },
  actionsText: '',
  keysText: ''
})

function linesToArr(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function loadGroups() {
  const r = await api.listCustomEventGroups()
  groups.value = r.data || []
  if (!groups.value.length) currentGroup.value = null
}

async function loadDefinitions() {
  const params = {}
  if (currentGroup.value?.id) params.group_id = currentGroup.value.id
  const r = await api.listCustomEventDefinitions(params)
  definitions.value = r.data || []
}

function onGroupRow(row) {
  currentGroup.value = row || null
}

watch(currentGroup, () => {
  loadDefinitions()
})

function openGroupDialog(row) {
  groupDlg.editId = row?.id ?? null
  groupDlg.form = row
    ? { name: row.name, description: row.description || '', sort_order: row.sort_order ?? 0, mqtt_enabled: row.mqtt_enabled ?? false, mqtt_topic: row.mqtt_topic || '' }
    : { name: '', description: '', sort_order: 0, mqtt_enabled: false, mqtt_topic: '' }
  groupDlg.visible = true
}

async function saveGroup() {
  if (!groupDlg.form.name?.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  groupDlg.saving = true
  try {
    if (groupDlg.editId) {
      await api.updateCustomEventGroup(groupDlg.editId, groupDlg.form)
    } else {
      await api.createCustomEventGroup(groupDlg.form)
    }
    ElMessage.success('已保存')
    groupDlg.visible = false
    await loadGroups()
    await loadDefinitions()
  } finally {
    groupDlg.saving = false
  }
}

async function removeGroup(row) {
  await ElMessageBox.confirm(`删除分组「${row.name}」及其下所有事件定义？`, '确认', { type: 'warning' })
  await api.deleteCustomEventGroup(row.id)
  ElMessage.success('已删除')
  if (currentGroup.value?.id === row.id) currentGroup.value = null
  await loadGroups()
  await loadDefinitions()
}

function openDefDialog(row) {
  if (!groups.value.length) {
    ElMessage.warning('请先创建分组')
    return
  }
  defDlg.editId = row?.id ?? null
  const gid = row?.group_id ?? currentGroup.value?.id ?? groups.value[0].id
  defDlg.form = row
    ? {
        group_id: row.group_id,
        key: row.key,
        name: row.name,
        description: row.description || '',
        enabled: row.enabled !== false,
        mqtt_enabled: row.mqtt_enabled ?? false,
        mqtt_topic: row.mqtt_topic || ''
      }
    : {
        group_id: gid,
        key: '',
        name: '',
        description: '',
        enabled: true,
        mqtt_enabled: false,
        mqtt_topic: ''
      }
  defDlg.actionsText = row?.broadcast_actions?.length ? row.broadcast_actions.join('\n') : ''
  defDlg.keysText = row?.extra_keys?.length ? row.extra_keys.join('\n') : ''
  defDlg.visible = true
}

async function saveDef() {
  const acts = linesToArr(defDlg.actionsText)
  const keys = linesToArr(defDlg.keysText)
  const body = {
    ...defDlg.form,
    broadcast_actions: acts,
    extra_keys: keys
  }
  if (!body.group_id || !body.key?.trim() || !body.name?.trim()) {
    ElMessage.warning('请填写分组、上报键与名称')
    return
  }
  if (!acts.length || !keys.length) {
    ElMessage.warning('请填写广播动作与数据标签（每行一项）')
    return
  }
  defDlg.saving = true
  try {
    if (defDlg.editId) {
      await api.updateCustomEventDefinition(defDlg.editId, body)
    } else {
      await api.createCustomEventDefinition(body)
    }
    ElMessage.success('已保存')
    defDlg.visible = false
    await loadDefinitions()
  } finally {
    defDlg.saving = false
  }
}

async function removeDef(row) {
  await ElMessageBox.confirm(`删除定义「${row.name}」？`, '确认', { type: 'warning' })
  await api.deleteCustomEventDefinition(row.id)
  ElMessage.success('已删除')
  await loadDefinitions()
}

function openImportDialog() {
  importDlg.visible = true
}

function onImportOpen() {
  if (!groups.value.length) {
    importDlg.mode = 'new'
  } else if (!currentGroup.value) {
    importDlg.mode = 'new'
  }
}

async function runImport() {
  let gid = null
  if (importDlg.mode === 'new') {
    importing.value = true
    try {
      const r = await api.createCustomEventGroup({
        name: '常用 PDA 扫码',
        description: '一键导入的厂商典型 Intent 模板，可按现场调整',
        sort_order: 10
      })
      gid = r.data?.id
      if (!gid) {
        ElMessage.error('创建分组失败')
        return
      }
      await loadGroups()
      currentGroup.value = groups.value.find((x) => x.id === gid) || null
    } finally {
      importing.value = false
    }
  } else {
    if (!currentGroup.value?.id) {
      ElMessage.warning('请先在左侧选中一个分组')
      return
    }
    gid = currentGroup.value.id
  }
  if (!gid) return
  importing.value = true
  try {
    const r = await api.importPdaScanPresets(gid)
    const d = r.data || {}
    ElMessage.success(`导入完成：新建 ${d.created ?? 0} 条，跳过 ${d.skipped ?? 0} 条（上报键已存在）`)
    importDlg.visible = false
    await loadDefinitions()
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  await loadGroups()
  await loadDefinitions()
})
</script>

<style scoped>
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.toolbar-hint {
  font-size: 13px;
  color: #909399;
}
.import-desc {
  margin: 0 0 16px;
  font-size: 13px;
  color: #606266;
  line-height: 1.5;
}
.warn {
  color: #e6a23c;
}
</style>
