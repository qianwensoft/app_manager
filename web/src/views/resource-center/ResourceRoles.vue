<template>
  <div class="rc-roles">
    <div class="rc-toolbar">
      <b>资源角色</b>
      <div>
        <el-button size="small" type="primary" @click="openCreate">新建角色</el-button>
        <el-button size="small" @click="load">刷新</el-button>
        <el-button size="small" @click="openPortal">前台预览 ↗</el-button>
      </div>
    </div>

    <el-table :data="roles" border v-loading="loading">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="code" label="编码" min-width="140" />
      <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
      <el-table-column label="资源节点" width="100" align="center">
        <template #default="{ row }">{{ (row.node_ids || []).length }} 个</template>
      </el-table-column>
      <el-table-column label="设备授权" width="120" align="center">
        <template #default="{ row }">
          <div style="line-height:1.4">
            <div v-if="(row.device_group_ids || []).length">{{ (row.device_group_ids || []).length }} 个分组</div>
            <div v-if="(row.device_ids || []).length">{{ (row.device_ids || []).length }} 台设备</div>
            <div v-if="!(row.device_group_ids || []).length && !(row.device_ids || []).length">-</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="工单类型" width="100" align="center">
        <template #default="{ row }">{{ (row.work_order_type_codes || []).length }} 个</template>
      </el-table-column>
      <el-table-column label="用户" width="90" align="center">
        <template #default="{ row }">{{ (row.user_ids || []).length }} 人</template>
      </el-table-column>
      <el-table-column label="操作" width="420">
        <template #default="{ row }">
          <el-button link type="primary" @click="openBindNodes(row)">分配节点</el-button>
          <el-button link type="primary" @click="openBindDevices(row)">设备授权</el-button>
          <el-button link type="primary" @click="openBindWorkOrderTypes(row)">工单类型</el-button>
          <el-button link type="primary" @click="openBindUsers(row)">分配用户</el-button>
          <el-button link @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 角色新建/编辑 -->
    <el-dialog v-model="roleDlg" :title="form.id ? '编辑角色' : '新建角色'" width="480px" destroy-on-close>
      <el-form :model="form" label-width="72px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：一号仓运维" />
        </el-form-item>
        <el-form-item label="编码">
          <el-input v-model="form.code" placeholder="可选，唯一标识，如 wh1_ops" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配资源节点 -->
    <el-dialog v-model="nodesDlg" title="分配资源节点" width="520px" destroy-on-close>
      <div class="rc-hint">勾选该角色可见的资源节点（分组节点仅用于组织层级，通常同时勾选其下的设备/工单管理节点）。</div>
      <el-tree
        ref="nodeTreeRef"
        :data="nodeTree"
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        show-checkbox
        default-expand-all
        check-strictly
      >
        <template #default="{ data }">
          <span>
            <el-tag size="small" :type="nodeTagType(data.node_type)" disable-transitions>
              {{ nodeTypeLabel(data.node_type) }}
            </el-tag>
            <span style="margin-left:6px">{{ data.name }}</span>
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button @click="nodesDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNodes">保存</el-button>
      </template>
    </el-dialog>

    <!-- 分配用户 -->
    <el-dialog v-model="usersDlg" title="分配用户" width="480px" destroy-on-close>
      <el-select v-model="userSel" multiple filterable placeholder="选择用户" style="width:100%">
        <el-option
          v-for="u in users"
          :key="u.id"
          :label="`${u.username} (${roleLabel(u.role)})`"
          :value="u.id"
        />
      </el-select>
      <template #footer>
        <el-button @click="usersDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveUsers">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设备授权 -->
    <el-dialog v-model="devicesDlg" title="设备授权" width="760px" destroy-on-close>
      <div class="rc-hint">选择该角色可访问的设备分组或单独设备。勾选分组后，该分组下的所有设备都会被授权。</div>
      <el-tabs v-model="deviceTabActive">
        <el-tab-pane label="设备分组" name="groups">
          <el-tree
            ref="deviceGroupTreeRef"
            :data="deviceGroupTree"
            node-key="id"
            :props="{ label: 'name', children: 'children' }"
            show-checkbox
            default-expand-all
          >
            <template #default="{ data }">
              <span>{{ data.name }}</span>
            </template>
          </el-tree>
          <div v-if="!deviceGroupTree.length" style="text-align:center;color:#c0c4cc;padding:40px">
            暂无设备分组
          </div>
        </el-tab-pane>
        <el-tab-pane label="单独设备" name="devices">
          <el-input
            v-model="deviceSearchKey"
            placeholder="搜索设备名称、别名、型号"
            clearable
            style="margin-bottom:12px"
          />
          <div style="max-height:400px;overflow:auto;border:1px solid #dcdfe6;border-radius:4px">
            <el-checkbox-group v-model="deviceSel" style="display:flex;flex-direction:column">
              <el-checkbox
                v-for="d in filteredDevices"
                :key="d.id"
                :label="d.id"
                style="margin:0;padding:8px 12px;border-bottom:1px solid #f0f0f0"
              >
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-weight:500">{{ d.name }}</span>
                  <el-tag v-if="d.server_alias || d.agent_alias" size="small" type="info">
                    {{ d.server_alias || d.agent_alias }}
                  </el-tag>
                  <span style="color:#909399;font-size:12px">{{ d.model }}</span>
                  <span style="color:#c0c4cc;font-size:12px">ID: {{ d.id }}</span>
                </div>
              </el-checkbox>
            </el-checkbox-group>
            <div v-if="!filteredDevices.length" style="text-align:center;color:#c0c4cc;padding:40px">
              {{ deviceSearchKey ? '无匹配设备' : '暂无设备' }}
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="devicesDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveDevices">保存</el-button>
      </template>
    </el-dialog>

    <!-- 工单类型授权 -->
    <el-dialog v-model="woTypesDlg" title="工单类型授权" width="560px" destroy-on-close>
      <div class="rc-hint">选择该角色可访问的工单类型。</div>
      <el-checkbox-group v-model="woTypeSel" style="display:flex;flex-direction:column">
        <el-checkbox
          v-for="t in woTypes"
          :key="t.code"
          :label="t.code"
          style="margin:0;padding:8px 12px;border-bottom:1px solid #f0f0f0"
        >
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:500">{{ t.name }}</span>
            <el-tag size="small" type="info">{{ t.code }}</el-tag>
          </div>
        </el-checkbox>
      </el-checkbox-group>
      <div v-if="!woTypes.length" style="text-align:center;color:#c0c4cc;padding:40px">
        暂无工单类型
      </div>
      <template #footer>
        <el-button @click="woTypesDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveWorkOrderTypes">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getResourceRoles, createResourceRole, updateResourceRole, deleteResourceRole,
  setResourceRoleNodes, setResourceRoleUsers, setResourceRoleDevices, setResourceRoleWorkOrderTypes, getResourceNodes,
  getUsersForConfig, getDeviceGroupsTree, getAllDevices, getWorkOrderTypesForConfig
} from '@/api/resourceCenter'

const roles = ref([])
const loading = ref(false)
const saving = ref(false)

const roleDlg = ref(false)
const nodesDlg = ref(false)
const usersDlg = ref(false)
const devicesDlg = ref(false)
const woTypesDlg = ref(false)

const form = ref({ id: null, name: '', code: '', description: '' })
const current = ref(null)

const nodeTree = ref([])
const nodeTreeRef = ref(null)
const users = ref([])
const userSel = ref([])
const deviceGroupTree = ref([])
const deviceGroupTreeRef = ref(null)
const devices = ref([])
const deviceSel = ref([])
const deviceTabActive = ref('groups')
const deviceSearchKey = ref('')
const woTypes = ref([])
const woTypeSel = ref([])

const filteredDevices = computed(() => {
  const sk = deviceSearchKey.value.trim().toLowerCase()
  if (!sk) return devices.value
  return devices.value.filter(d =>
    (d.name || '').toLowerCase().includes(sk) ||
    (d.server_alias || '').toLowerCase().includes(sk) ||
    (d.agent_alias || '').toLowerCase().includes(sk) ||
    (d.model || '').toLowerCase().includes(sk)
  )
})

const NODE_TYPE_LABELS = { group: '分组', device_mgmt: '设备管理', workorder_mgmt: '工单管理' }
const nodeTypeLabel = (t) => NODE_TYPE_LABELS[t] || t
const nodeTagType = (t) => ({ group: 'info', device_mgmt: 'primary', workorder_mgmt: 'success' }[t] || '')
const ROLE_LABELS = { admin: '管理员', operator: '操作员', viewer: '访客' }
const roleLabel = (r) => ROLE_LABELS[r] || r

const load = async () => {
  loading.value = true
  try {
    roles.value = (await getResourceRoles()).data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.value = { id: null, name: '', code: '', description: '' }
  roleDlg.value = true
}

// 打开前台资源中心（新标签页），便于配置后就地验收效果。
const openPortal = () => {
  window.open(`${window.location.origin}/portal`, '_blank')
}
const openEdit = (row) => {
  form.value = { id: row.id, name: row.name, code: row.code, description: row.description }
  roleDlg.value = true
}
const saveRole = async () => {
  if (!form.value.name?.trim()) { ElMessage.warning('请填写角色名称'); return }
  saving.value = true
  try {
    const payload = { name: form.value.name.trim(), code: form.value.code?.trim() || '', description: form.value.description || '' }
    if (form.value.id) {
      await updateResourceRole(form.value.id, payload)
      ElMessage.success('已更新')
    } else {
      await createResourceRole(payload)
      ElMessage.success('已创建')
    }
    roleDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteResourceRole(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

const openBindNodes = async (row) => {
  current.value = row
  if (!nodeTree.value.length) {
    nodeTree.value = (await getResourceNodes()).data || []
  }
  nodesDlg.value = true
  await nextTick()
  nodeTreeRef.value?.setCheckedKeys(row.node_ids || [])
}
const saveNodes = async () => {
  if (!current.value) return
  saving.value = true
  try {
    const keys = nodeTreeRef.value?.getCheckedKeys() || []
    await setResourceRoleNodes(current.value.id, keys)
    ElMessage.success('已保存节点分配')
    nodesDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const openBindUsers = async (row) => {
  current.value = row
  if (!users.value.length) {
    users.value = (await getUsersForConfig()).data || []
  }
  userSel.value = [...(row.user_ids || [])]
  usersDlg.value = true
}
const saveUsers = async () => {
  if (!current.value) return
  saving.value = true
  try {
    await setResourceRoleUsers(current.value.id, userSel.value)
    ElMessage.success('已保存用户分配')
    usersDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const openBindDevices = async (row) => {
  current.value = row
  if (!deviceGroupTree.value.length) {
    deviceGroupTree.value = (await getDeviceGroupsTree()).data || []
  }
  if (!devices.value.length) {
    const res = await getAllDevices()
    devices.value = res.data || []
  }
  devicesDlg.value = true
  deviceTabActive.value = 'groups'
  deviceSearchKey.value = ''
  await nextTick()
  deviceGroupTreeRef.value?.setCheckedKeys(row.device_group_ids || [])
  deviceSel.value = [...(row.device_ids || [])]
}
const saveDevices = async () => {
  if (!current.value) return
  saving.value = true
  try {
    const groupIds = deviceGroupTreeRef.value?.getCheckedKeys() || []
    await setResourceRoleDevices(current.value.id, groupIds, deviceSel.value)
    ElMessage.success('已保存设备授权')
    devicesDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const openBindWorkOrderTypes = async (row) => {
  current.value = row
  if (!woTypes.value.length) {
    const res = await getWorkOrderTypesForConfig()
    woTypes.value = res.data || []
  }
  woTypeSel.value = [...(row.work_order_type_codes || [])]
  woTypesDlg.value = true
}
const saveWorkOrderTypes = async () => {
  if (!current.value) return
  saving.value = true
  try {
    await setResourceRoleWorkOrderTypes(current.value.id, woTypeSel.value)
    ElMessage.success('已保存工单类型授权')
    woTypesDlg.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.rc-roles { max-width: 1100px; }
.rc-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rc-hint { font-size: 12px; color: #909399; margin-bottom: 12px; }
</style>
