<template>
  <div class="oauth-clients-page">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div>
        <div style="font-size:13px;color:#606266;margin-top:4px">
          OAuth 2.0 Client Credentials 流程 — 外部应用凭 <code>client_id</code> + <code>client_secret</code>
          向 <code>POST /api/oauth/token</code> 获取 Bearer Token，再以该 Token 调用开放接口。
        </div>
      </div>
      <el-button type="primary" @click="openCreate">新建客户端</el-button>
    </div>

    <el-table :data="clients" border stripe>
      <el-table-column prop="client_id" label="Client ID" min-width="180" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="授权范围" min-width="200">
        <template #default="{ row }">
          <span style="font-size:12px;color:#606266">{{ formatScopes(row.scopes_json) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Token TTL" width="120">
        <template #default="{ row }">
          {{ row.token_ttl_seconds > 0 ? row.token_ttl_seconds + ' 秒' : '系统默认' }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'danger'" size="small">
            {{ row.enabled ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="revokeTokens(row)">撤销 Token</el-button>
          <el-popconfirm title="确认删除此客户端？" @confirm="deleteClient(row.id)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- Create/Edit dialog -->
    <el-dialog
      v-model="showDialog"
      :title="editingId ? '编辑 OAuth 客户端' : '新建 OAuth 客户端'"
      width="540px"
      @closed="resetForm"
    >
      <el-form :model="form" label-width="110px">
        <el-form-item label="Client ID" v-if="!editingId">
          <el-input v-model="form.client_id" placeholder="唯一标识符，如 my-app" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="Token TTL（秒）">
          <el-input-number v-model="form.token_ttl_seconds" :min="0" :step="3600" style="width:100%" />
          <div style="font-size:11px;color:#909399;margin-top:2px">0 = 使用系统默认（config.jwt.expire_hour × 3600）</div>
        </el-form-item>
        <el-form-item v-if="editingId" label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item v-if="editingId" label="重置密钥">
          <el-switch v-model="form.reset_secret" active-text="生成新 client_secret" />
        </el-form-item>
        <el-form-item label="授权范围">
          <div style="display:flex;flex-direction:column;gap:6px">
            <el-checkbox
              v-for="opt in scopeOptions"
              :key="opt.id"
              v-model="scopeChecked[opt.id]"
            >
              {{ opt.name }}
              <span style="font-size:11px;color:#909399;margin-left:4px">{{ opt.id }}</span>
            </el-checkbox>
          </div>
          <div style="font-size:11px;color:#909399;margin-top:6px">
            不勾选任何项则令牌无法调用开放接口（等同于空白权限）。
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">
          {{ editingId ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Show secret after creation/reset -->
    <el-dialog v-model="showSecret" title="Client Secret（请妥善保存）" width="480px" :close-on-click-modal="false">
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="此密钥仅显示一次，关闭后无法再次查看。请立即复制并妥善保存。"
        style="margin-bottom:12px"
      />
      <div style="display:flex;align-items:center;gap:8px">
        <el-input v-model="newSecret" readonly style="font-family:monospace" />
        <el-button @click="copySecret">复制</el-button>
      </div>
      <template #footer>
        <el-button type="primary" @click="showSecret = false">我已保存，关闭</el-button>
      </template>
    </el-dialog>

    <!-- Usage guide -->
    <el-card shadow="never" style="margin-top:20px">
      <template #header><span style="font-weight:600">接入示例</span></template>
      <div style="font-size:13px;line-height:1.8">
        <p><strong>Step 1 — 获取 Token</strong></p>
        <pre style="background:#f5f7fa;padding:10px 14px;border-radius:4px;overflow-x:auto;font-size:12px">POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&amp;client_id=&lt;your-client-id&gt;
&amp;client_secret=&lt;your-client-secret&gt;</pre>
        <p style="margin-top:8px">响应：</p>
        <pre style="background:#f5f7fa;padding:10px 14px;border-radius:4px;overflow-x:auto;font-size:12px">{{ exampleResponse }}</pre>
        <p style="margin-top:8px"><strong>Step 2 — 调用开放接口</strong></p>
        <pre style="background:#f5f7fa;padding:10px 14px;border-radius:4px;overflow-x:auto;font-size:12px">GET /api/open/v1/devices
Authorization: Bearer &lt;access_token&gt;</pre>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listOAuthClients,
  createOAuthClient,
  updateOAuthClient,
  deleteOAuthClient,
  revokeOAuthClientTokens,
  getScopeCatalogOAuth
} from '@/api/oauth'

const clients = ref([])
const scopeOptions = ref([])
const scopeChecked = reactive({})
const showDialog = ref(false)
const showSecret = ref(false)
const newSecret = ref('')
const saving = ref(false)
const editingId = ref(null)

const form = ref({
  client_id: '',
  name: '',
  description: '',
  token_ttl_seconds: 0,
  enabled: true,
  reset_secret: false
})

const exampleResponse = JSON.stringify({ access_token: 'oa_...', token_type: 'Bearer', expires_in: 86400, scope: 'open:devices:list' }, null, 2)

const loadCatalog = async () => {
  try {
    const res = await getScopeCatalogOAuth()
    scopeOptions.value = res.open || []
  } catch {
    scopeOptions.value = []
  }
}

const load = async () => {
  await loadCatalog()
  clients.value = await listOAuthClients()
}

const resetForm = () => {
  editingId.value = null
  form.value = { client_id: '', name: '', description: '', token_ttl_seconds: 0, enabled: true, reset_secret: false }
  scopeOptions.value.forEach((o) => { scopeChecked[o.id] = true })
}

const openCreate = async () => {
  await loadCatalog()
  resetForm()
  showDialog.value = true
}

const openEdit = async (row) => {
  await loadCatalog()
  editingId.value = row.id
  form.value = {
    name: row.name,
    description: row.description || '',
    token_ttl_seconds: row.token_ttl_seconds || 0,
    enabled: row.enabled,
    reset_secret: false
  }
  const selectedScopes = parseScopes(row.scopes_json)
  scopeOptions.value.forEach((o) => { scopeChecked[o.id] = selectedScopes.includes(o.id) })
  showDialog.value = true
}

const save = async () => {
  saving.value = true
  try {
    const scopes = scopeOptions.value.filter((o) => scopeChecked[o.id]).map((o) => o.id)
    if (editingId.value) {
      const payload = { ...form.value, scopes }
      const res = await updateOAuthClient(editingId.value, payload)
      if (res.client_secret) {
        newSecret.value = res.client_secret
        showSecret.value = true
      }
      ElMessage.success('已保存')
    } else {
      const res = await createOAuthClient({ ...form.value, scopes })
      if (res.client_secret) {
        newSecret.value = res.client_secret
        showSecret.value = true
      }
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    load()
  } catch {
    // error shown by http interceptor
  } finally {
    saving.value = false
  }
}

const revokeTokens = async (row) => {
  const res = await revokeOAuthClientTokens(row.id)
  ElMessage.success(`已撤销 ${res.revoked} 个活跃 Token`)
}

const deleteClient = async (id) => {
  await deleteOAuthClient(id)
  ElMessage.success('已删除')
  load()
}

const copySecret = () => {
  navigator.clipboard.writeText(newSecret.value).then(() => ElMessage.success('已复制'))
}

const parseScopes = (json) => {
  try { return JSON.parse(json) || [] } catch { return [] }
}

const formatScopes = (json) => {
  const arr = parseScopes(json)
  if (!arr.length) return '无'
  const byId = Object.fromEntries(scopeOptions.value.map((o) => [o.id, o.name]))
  return arr.map((id) => byId[id] || id).join('、')
}

const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN') : '-'

onMounted(load)
</script>
