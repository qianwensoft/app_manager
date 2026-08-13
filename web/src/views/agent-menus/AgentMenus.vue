<template>
  <div>
    <el-tabs v-model="tab">
      <!-- 菜单管理 -->
      <el-tab-pane label="菜单管理" name="items">
        <div class="tbar">
          <el-button type="primary" @click="openItem()">新建菜单</el-button>
        </div>
        <el-table :data="items" border v-loading="loading">
          <el-table-column prop="title" label="标题" />
          <el-table-column prop="target_type" label="类型" width="120" />
          <el-table-column prop="target_ref" label="目标(ref)" min-width="160" />
          <el-table-column prop="intent_action" label="Intent" width="180" />
          <el-table-column prop="min_agent_version" label="最小版本" width="120" />
          <el-table-column prop="show_on_agent_home" label="显示位置" width="100">
            <template #default="{ row }">
              <el-tag :type="row.show_on_agent_home ? 'success' : 'info'" size="small">
                {{ row.show_on_agent_home ? '前台' : '后台' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button link type="primary" @click="openItem(row)">编辑</el-button>
              <el-button link @click="deploy(row)">追加下发</el-button>
              <el-button link type="danger" @click="delItem(row)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 下发矩阵 -->
      <el-tab-pane label="下发矩阵" name="matrix">
        <div class="tbar">
          <span class="hint">勾选「设备 × 菜单」分配，逐行保存。追加下发不会覆盖其它菜单；矩阵保存会按勾选整体设置该设备的菜单集合。</span>
          <el-button @click="loadMatrix" :loading="matrixLoading">刷新</el-button>
        </div>
        <el-table
          :data="matrix.devices"
          border
          v-loading="matrixLoading"
          size="small"
          max-height="600"
        >
          <el-table-column label="设备" min-width="160" fixed>
            <template #default="{ row }">
              <div>{{ row.name }}</div>
              <div class="sub">#{{ row.id }} · {{ row.serial }}</div>
            </template>
          </el-table-column>
          <el-table-column
            v-for="m in matrix.menus"
            :key="m.id"
            :label="m.title"
            width="110"
            align="center"
          >
            <template #default="{ row }">
              <el-checkbox
                :model-value="isChecked(row.id, m.id)"
                @change="val => toggle(row.id, m.id, val)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :loading="savingDeviceId === row.id"
                @click="saveRow(row.id)"
              >保存</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!matrixLoading && !matrix.menus.length" description="暂无可分配的菜单，请先在「菜单管理」创建" />
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dlg" :title="form.id ? '菜单' : '新建菜单'" width="720px">
      <el-form label-width="120px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.target_type" style="width: 100%">
            <el-option label="组态预览" value="scada_preview" />
            <el-option label="表单页面" value="form_app" />
            <el-option label="表单预览" value="form_app_preview" />
            <el-option label="扫码入口" value="form_app_scan_entry" />
            <el-option label="网页" value="webview_url" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标 ref">
          <el-select
            v-if="form.target_type === 'scada_preview'"
            v-model="form.target_ref"
            filterable
            placeholder="选择已发布的组态"
            style="width: 100%"
          >
            <el-option
              v-for="s in publishedScadas"
              :key="s.scada_code"
              :label="`${s.scada_name}（${s.scada_code}）`"
              :value="s.scada_code"
            />
          </el-select>
          <el-select
            v-else-if="form.target_type.startsWith('form_app')"
            v-model="form.target_ref"
            filterable
            placeholder="选择已发布的表单应用"
            style="width: 100%"
          >
            <el-option
              v-for="f in publishedForms"
              :key="f.code"
              :label="`${f.name}（${f.code}）`"
              :value="f.code"
            />
          </el-select>
          <el-input v-else v-model="form.target_ref" placeholder="URL" />
        </el-form-item>
        <el-form-item v-if="form.target_type && form.target_type.startsWith('form_app')" label="表单调试地址">
          <el-input v-model="form.form_app_base_url" placeholder="如 http://192.168.1.x:5175，留空则用服务器地址" clearable />
          <div style="font-size:12px;color:#909399;margin-top:4px">填写后下发给设备，Agent 加载表单时优先使用此地址（调试用）</div>
        </el-form-item>
        <el-form-item label="Intent Action"><el-input v-model="form.intent_action" placeholder="com.appmanager.agent.ACTION_SCADA_xxx" /></el-form-item>
        <el-form-item label="最小 Agent 版本"><el-input v-model="form.min_agent_version" placeholder="如 1.2.0" /></el-form-item>
        <el-form-item label="能力要求(JSON)">
          <el-input v-model="form.required_caps_json" type="textarea" :rows="2" placeholder='["scan_router_v1","exclusive_scan_v1"]' />
        </el-form-item>
        <el-form-item label="扫码配置(JSON)">
          <el-input v-model="form.scan_config_json" type="textarea" :rows="6" placeholder='{"mode":"router","scan_router_key":"default","matchers":[]}' />
        </el-form-item>
        <el-form-item label="显示位置">
          <el-radio-group v-model="form.show_on_agent_home">
            <el-radio :label="true">前台（主屏幕直接显示）</el-radio>
            <el-radio :label="false">后台（点「管理后台」后可见）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort_order" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dlgDeploy" title="追加下发到设备" width="480px">
      <p class="hint">选择设备（多选）。追加下发只新增本菜单，不会覆盖设备上已有的其它菜单。</p>
      <el-select v-model="deployDeviceIds" multiple filterable placeholder="设备" style="width: 100%">
        <el-option v-for="d in devices" :key="d.id" :label="`${d.name || d.serial} (#${d.id})`" :value="d.id" />
      </el-select>
      <template #footer>
        <el-button @click="dlgDeploy = false">取消</el-button>
        <el-button type="primary" @click="doDeploy">追加下发</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/agentMenus'
import http from '@/api/http'

const tab = ref('items')
const loading = ref(false)
const items = ref([])
const devices = ref([])
const publishedScadas = ref([])
const publishedForms = ref([])
const dlg = ref(false)
const form = ref({
  id: null,
  title: '',
  target_type: 'scada_preview',
  target_ref: '',
  form_app_base_url: '',
  intent_action: '',
  min_agent_version: '',
  required_caps_json: '[]',
  scan_config_json: '{"mode":"router","scan_router_key":"default","matchers":[]}',
  show_on_agent_home: true,
  sort_order: 0
})
const dlgDeploy = ref(false)
const deployMenuId = ref(null)
const deployDeviceIds = ref([])

// 矩阵：devices/menus 列表 + assignments(deviceId -> Set<menuId>) 的本地编辑副本
const matrixLoading = ref(false)
const matrix = ref({ devices: [], menus: [], assignments: {} })
const checked = ref({}) // deviceId -> Set<menuId>
const savingDeviceId = ref(null)

const load = async () => {
  loading.value = true
  try {
    const res = await api.listAgentMenuItems()
    items.value = res.data || []
    const devRes = await http.get('/devices')
    devices.value = devRes.data || []
    const scadaRes = await http.get('/scada/infos')
    publishedScadas.value = (scadaRes.data || []).filter(s => s.publish_status === 1 && s.share_token)
    const formRes = await http.get('/form-app/infos')
    publishedForms.value = (formRes.data || []).filter(f => f.publish_status === 1)
  } finally {
    loading.value = false
  }
}

const loadMatrix = async () => {
  matrixLoading.value = true
  try {
    const res = await api.getAgentMenuMatrix()
    matrix.value = {
      devices: res.devices || [],
      menus: res.menus || [],
      assignments: res.assignments || {}
    }
    const next = {}
    for (const d of matrix.value.devices) {
      const list = matrix.value.assignments[d.id] || []
      next[d.id] = new Set(list)
    }
    checked.value = next
  } finally {
    matrixLoading.value = false
  }
}

const isChecked = (deviceId, menuId) => !!checked.value[deviceId]?.has(menuId)

const toggle = (deviceId, menuId, val) => {
  const set = checked.value[deviceId] || new Set()
  if (val) set.add(menuId)
  else set.delete(menuId)
  checked.value = { ...checked.value, [deviceId]: set }
}

const saveRow = async deviceId => {
  savingDeviceId.value = deviceId
  try {
    const menuIds = Array.from(checked.value[deviceId] || [])
    await api.setAgentMenuAssignments({ device_id: deviceId, menu_ids: menuIds })
    ElMessage.success('已保存并下发')
  } finally {
    savingDeviceId.value = null
  }
}

const openItem = row => {
  form.value = row
    ? { ...row }
    : {
        id: null,
        title: '组态',
        target_type: 'scada_preview',
        target_ref: '',
        form_app_base_url: '',
        intent_action: 'com.appmanager.agent.ACTION_SCADA_MENU',
        min_agent_version: '',
        required_caps_json: '[]',
        scan_config_json: '{"mode":"router","scan_router_key":"default","matchers":[]}',
        show_on_agent_home: true,
        sort_order: 0
      }
  dlg.value = true
}

const saveItem = async () => {
  if (form.value.id) await api.updateAgentMenuItem(form.value.id, form.value)
  else await api.createAgentMenuItem(form.value)
  dlg.value = false
  ElMessage.success('已保存')
  load()
}

const delItem = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteAgentMenuItem(row.id)
  load()
}

const deploy = row => {
  deployMenuId.value = row.id
  deployDeviceIds.value = []
  dlgDeploy.value = true
}

const doDeploy = async () => {
  if (!deployDeviceIds.value.length) {
    ElMessage.warning('请选择设备')
    return
  }
  await api.deployAgentMenus({
    menu_ids: [deployMenuId.value],
    device_ids: deployDeviceIds.value,
    mode: 'append'
  })
  dlgDeploy.value = false
  ElMessage.success('已追加下发')
}

onMounted(async () => {
  await load()
  await loadMatrix()
})
</script>

<style scoped>
.tbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint {
  color: #888;
  font-size: 13px;
}
.sub {
  color: #aaa;
  font-size: 12px;
}
</style>
