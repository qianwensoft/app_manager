<template>
  <div>
    <el-button type="primary" @click="openCreate" style="margin-bottom:12px">创建授权令牌</el-button>
    <el-table :data="keys" border>
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="key" label="令牌" min-width="280" />
      <el-table-column label="授权范围" min-width="240">
        <template #default="{ row }">
          <span style="font-size:12px;color:#606266">{{ formatKeyScopes(row.permissions) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="expires_at" label="过期时间" width="180" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button size="small" type="danger" @click="revoke(row.id)">撤销</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="showCreate" title="创建授权令牌" width="480px" @open="onCreateOpen">
      <el-form :model="form">
        <el-form-item label="名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="过期时间">
          <el-date-picker v-model="form.expires_at" type="datetime" style="width:100%" />
        </el-form-item>
        <el-form-item label="开放 API 范围">
          <div style="display:flex;flex-direction:column;gap:8px">
            <el-checkbox
              v-for="opt in openScopeOptions"
              :key="opt.id"
              v-model="scopeChecked[opt.id]"
            >
              {{ opt.name }}
            </el-checkbox>
          </div>
          <div style="font-size:12px;color:#909399;margin-top:8px">
            用于请求头 <code>X-API-Key</code> 访问 <code>/api/open/v1/*</code>；不勾选任何项则该令牌无法调用开放接口。
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="create">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { getApiKeys, createApiKey, revokeApiKey, getScopeCatalog } from '@/api/misc'

const keys = ref([])
const showCreate = ref(false)
const form = ref({ name: '', expires_at: null })
const openScopeOptions = ref([])
const scopeChecked = reactive({})

const loadCatalog = async () => {
  try {
    const res = await getScopeCatalog()
    openScopeOptions.value = res.open || []
    for (const o of openScopeOptions.value) {
      if (scopeChecked[o.id] === undefined) scopeChecked[o.id] = true
    }
  } catch {
    openScopeOptions.value = []
  }
}

const onCreateOpen = () => {
  for (const o of openScopeOptions.value) {
    scopeChecked[o.id] = true
  }
}

const openCreate = async () => {
  await loadCatalog()
  form.value = { name: '', expires_at: null }
  showCreate.value = true
}

const selectedScopes = () => {
  return openScopeOptions.value.filter((o) => scopeChecked[o.id]).map((o) => o.id)
}

const formatKeyScopes = (permissions) => {
  if (permissions == null || String(permissions).trim() === '') {
    return '全部（旧数据）'
  }
  try {
    const arr = JSON.parse(permissions)
    if (!Array.isArray(arr) || arr.length === 0) return '无'
    const byId = Object.fromEntries(openScopeOptions.value.map((o) => [o.id, o.name]))
    return arr.map((id) => byId[id] || id).join('、')
  } catch {
    return String(permissions).slice(0, 80)
  }
}

const load = async () => {
  await loadCatalog()
  const res = await getApiKeys()
  keys.value = res.data
}

const create = async () => {
  await createApiKey({
    ...form.value,
    scopes: selectedScopes()
  })
  showCreate.value = false
  ElMessage.success('创建成功')
  load()
}

const revoke = async (id) => {
  await revokeApiKey(id)
  ElMessage.success('已撤销')
  load()
}

onMounted(load)
</script>
