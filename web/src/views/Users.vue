<template>
  <div>
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center">
      <span>共 {{ users.length }} 个用户</span>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </div>

    <el-table :data="users" border stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="username" label="用户名" />
      <el-table-column label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="180">
        <template #default="{ row }">{{ row.last_login_at ? new Date(row.last_login_at).toLocaleString() : '从未' }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm title="确认删除该用户？" @confirm="remove(row.id)">
            <template #reference>
              <el-button size="small" type="danger" :disabled="row.id === auth.user?.id">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="editId ? '编辑用户' : '新建用户'" width="400px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="用户名" v-if="!editId">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password :placeholder="editId ? '留空不修改' : ''" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="操作员" value="operator" />
            <el-option label="只读" value="viewer" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { listUsers, createUser, updateUser, deleteUser } from '@/api/user'

const auth = useAuthStore()
const users = ref([])
const dialogVisible = ref(false)
const saving = ref(false)
const editId = ref(null)
const form = ref({ username: '', password: '', role: 'viewer' })

const roleLabel = (r) => ({ admin: '管理员', operator: '操作员', viewer: '只读' }[r] || r)
const roleTagType = (r) => ({ admin: 'danger', operator: 'warning', viewer: '' }[r] || '')

const load = async () => {
  const res = await listUsers()
  users.value = res.data
}

const openCreate = () => {
  editId.value = null
  form.value = { username: '', password: '', role: 'viewer' }
  dialogVisible.value = true
}

const openEdit = (row) => {
  editId.value = row.id
  form.value = { password: '', role: row.role }
  dialogVisible.value = true
}

const save = async () => {
  saving.value = true
  try {
    if (editId.value) {
      const payload = { role: form.value.role }
      if (form.value.password) payload.password = form.value.password
      await updateUser(editId.value, payload)
    } else {
      await createUser(form.value)
    }
    ElMessage.success('保存成功')
    dialogVisible.value = false
    load()
  } finally {
    saving.value = false
  }
}

const remove = async (id) => {
  await deleteUser(id)
  ElMessage.success('删除成功')
  load()
}

onMounted(load)
</script>
