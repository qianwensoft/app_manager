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
      <el-table-column label="用户" width="90" align="center">
        <template #default="{ row }">{{ (row.user_ids || []).length }} 人</template>
      </el-table-column>
      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-button link type="primary" @click="openBindNodes(row)">分配节点</el-button>
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
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getResourceRoles, createResourceRole, updateResourceRole, deleteResourceRole,
  setResourceRoleNodes, setResourceRoleUsers, getResourceNodes, getUsersForConfig
} from '@/api/resourceCenter'

const roles = ref([])
const loading = ref(false)
const saving = ref(false)

const roleDlg = ref(false)
const nodesDlg = ref(false)
const usersDlg = ref(false)

const form = ref({ id: null, name: '', code: '', description: '' })
const current = ref(null)

const nodeTree = ref([])
const nodeTreeRef = ref(null)
const users = ref([])
const userSel = ref([])

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

onMounted(load)
</script>

<style scoped>
.rc-roles { max-width: 1100px; }
.rc-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rc-hint { font-size: 12px; color: #909399; margin-bottom: 12px; }
</style>
