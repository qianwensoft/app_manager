<template>
  <div>
    <div class="tbar">
      <el-button type="primary" @click="openItem()">新建菜单</el-button>
    </div>
    <el-table :data="items" border v-loading="loading">
      <el-table-column prop="title" label="标题" />
      <el-table-column prop="target_type" label="类型" width="120" />
      <el-table-column prop="target_ref" label="目标(scada_code/URL)" min-width="160" />
      <el-table-column prop="intent_action" label="Intent" width="180" />
      <el-table-column prop="show_on_agent_home" label="首页" width="70">
        <template #default="{ row }">{{ row.show_on_agent_home ? '是' : '否' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <el-button link type="primary" @click="openItem(row)">编辑</el-button>
          <el-button link @click="deploy(row)">下发</el-button>
          <el-button link type="danger" @click="delItem(row)">删</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form.id ? '菜单' : '新建菜单'" width="560px">
      <el-form label-width="120px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.target_type" style="width: 100%">
            <el-option label="组态预览" value="scada_preview" />
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
          <el-input v-else v-model="form.target_ref" placeholder="URL" />
        </el-form-item>
        <el-form-item label="Intent Action"><el-input v-model="form.intent_action" placeholder="com.appmanager.agent.ACTION_SCADA_xxx" /></el-form-item>
        <el-form-item label="首页磁贴"><el-switch v-model="form.show_on_agent_home" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort_order" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="dlgDeploy" title="下发到设备" width="480px">
      <p class="hint">选择设备（多选）</p>
      <el-select v-model="deployDeviceIds" multiple filterable placeholder="设备" style="width: 100%">
        <el-option v-for="d in devices" :key="d.id" :label="`${d.name || d.serial} (#${d.id})`" :value="d.id" />
      </el-select>
      <template #footer>
        <el-button @click="dlgDeploy = false">取消</el-button>
        <el-button type="primary" @click="doDeploy">下发</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/agentMenus'
import http from '@/api/http'

const loading = ref(false)
const items = ref([])
const devices = ref([])
const publishedScadas = ref([])
const dlg = ref(false)
const form = ref({
  id: null,
  title: '',
  target_type: 'scada_preview',
  target_ref: '',
  intent_action: '',
  show_on_agent_home: true,
  sort_order: 0
})
const dlgDeploy = ref(false)
const deployMenuId = ref(null)
const deployDeviceIds = ref([])

const load = async () => {
  loading.value = true
  try {
    const res = await api.listAgentMenuItems()
    items.value = res.data || []
    const devRes = await http.get('/devices')
    devices.value = devRes.data || []
    const scadaRes = await http.get('/scada/infos')
    publishedScadas.value = (scadaRes.data || []).filter(s => s.publish_status === 1)
  } finally {
    loading.value = false
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
        intent_action: 'com.appmanager.agent.ACTION_SCADA_MENU',
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
  await api.deployAgentMenus({ menu_ids: [deployMenuId.value], device_ids: deployDeviceIds.value })
  dlgDeploy.value = false
  ElMessage.success('已下发')
}

onMounted(load)
</script>

<style scoped>
.tbar {
  margin-bottom: 12px;
}
.hint {
  margin-bottom: 8px;
  color: #888;
  font-size: 13px;
}
</style>
