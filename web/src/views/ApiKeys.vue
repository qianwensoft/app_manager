<template>
  <div>
    <el-tabs v-model="activeTab">
      <!-- ── Tab 1: 直接令牌 ── -->
      <el-tab-pane label="直接令牌（API Key）" name="apikey">
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
      </el-tab-pane>

      <!-- ── Tab 2: OAuth 客户端 ── -->
      <el-tab-pane label="OAuth 客户端" name="oauth">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:13px;color:#606266">
            外部应用通过 OAuth 2.0 获取 Bearer Token，再调用开放接口。支持 Client Credentials 和 Authorization Code 两种模式。
          </div>
          <el-button type="primary" @click="openOAuthCreate">新建客户端</el-button>
        </div>

        <el-table :data="clients" border stripe>
          <el-table-column prop="client_id" label="Client ID" min-width="160" />
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column label="授权模式" width="200">
            <template #default="{ row }">
              <el-tag
                v-for="gt in (row.grant_types || 'client_credentials').split(',')"
                :key="gt"
                size="small"
                style="margin-right:4px"
              >{{ grantTypeLabel(gt.trim()) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="授权范围" min-width="180">
            <template #default="{ row }">
              <span style="font-size:12px;color:#606266">{{ formatScopes(row.scopes_json) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Token TTL" width="110">
            <template #default="{ row }">
              {{ row.token_ttl_seconds > 0 ? row.token_ttl_seconds + ' 秒' : '系统默认' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.enabled ? 'success' : 'danger'" size="small">
                {{ row.enabled ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openOAuthEdit(row)">编辑</el-button>
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
          v-model="showOAuthDialog"
          :title="oauthEditingId ? '编辑 OAuth 客户端' : '新建 OAuth 客户端'"
          width="560px"
          @closed="resetOAuthForm"
        >
          <el-form :model="oauthForm" label-width="120px">
            <el-form-item label="Client ID" v-if="!oauthEditingId">
              <el-input v-model="oauthForm.client_id" placeholder="唯一标识符，如 my-app" />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="oauthForm.name" placeholder="显示名称" />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="oauthForm.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="授权模式">
              <el-checkbox-group v-model="oauthForm.grant_types">
                <el-checkbox value="client_credentials">Client Credentials（服务端）</el-checkbox>
                <el-checkbox value="authorization_code">Authorization Code（用户授权）</el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item
              label="回调地址"
              v-if="oauthForm.grant_types.includes('authorization_code')"
            >
              <el-input
                v-model="oauthForm.redirect_uris_text"
                type="textarea"
                :rows="3"
                placeholder="每行一个 URI，如&#10;https://your-app.com/callback"
              />
              <div style="font-size:11px;color:#909399;margin-top:4px">
                Authorization Code 模式必填，仅允许列表内的 redirect_uri。
              </div>
            </el-form-item>
            <el-form-item label="Token TTL（秒）">
              <el-input-number v-model="oauthForm.token_ttl_seconds" :min="0" :step="3600" style="width:100%" />
              <div style="font-size:11px;color:#909399;margin-top:2px">0 = 使用系统默认</div>
            </el-form-item>
            <el-form-item v-if="oauthEditingId" label="状态">
              <el-switch v-model="oauthForm.enabled" active-text="启用" inactive-text="禁用" />
            </el-form-item>
            <el-form-item v-if="oauthEditingId" label="重置密钥">
              <el-switch v-model="oauthForm.reset_secret" active-text="生成新 client_secret" />
            </el-form-item>
            <el-form-item label="授权范围">
              <div style="display:flex;flex-direction:column;gap:6px">
                <el-checkbox
                  v-for="opt in scopeOptions"
                  :key="opt.id"
                  v-model="oauthScopeChecked[opt.id]"
                >
                  {{ opt.name }}
                  <span style="font-size:11px;color:#909399;margin-left:4px">{{ opt.id }}</span>
                </el-checkbox>
              </div>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showOAuthDialog = false">取消</el-button>
            <el-button type="primary" :loading="oauthSaving" @click="saveOAuth">
              {{ oauthEditingId ? '保存' : '创建' }}
            </el-button>
          </template>
        </el-dialog>

        <!-- Show secret -->
        <el-dialog v-model="showSecret" title="Client Secret（请妥善保存）" width="480px" :close-on-click-modal="false">
          <el-alert type="warning" :closable="false" show-icon title="此密钥仅显示一次，关闭后无法再次查看。" style="margin-bottom:12px" />
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
          <el-tabs>
            <el-tab-pane label="Client Credentials">
              <pre style="background:#f5f7fa;padding:10px 14px;border-radius:4px;overflow-x:auto;font-size:12px">POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&amp;client_id=&lt;your-client-id&gt;
&amp;client_secret=&lt;your-client-secret&gt;</pre>
            </el-tab-pane>
            <el-tab-pane label="Authorization Code">
              <pre style="background:#f5f7fa;padding:10px 14px;border-radius:4px;overflow-x:auto;font-size:12px">// Step 1 — 引导用户跳转授权页
GET /oauth/authorize?response_type=code
  &amp;client_id=&lt;client-id&gt;
  &amp;redirect_uri=&lt;your-callback&gt;
  &amp;scope=open:devices:list
  &amp;state=&lt;random-state&gt;

// Step 2 — 用 code 换 token
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&amp;code=&lt;code&gt;
&amp;redirect_uri=&lt;your-callback&gt;
&amp;client_id=&lt;client-id&gt;
&amp;client_secret=&lt;client-secret&gt;</pre>
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-tab-pane>

      <!-- ── Tab 3: 第三方平台 ── -->
      <el-tab-pane label="第三方平台" name="thirdparty">
        <ThirdPartyProviders />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import ThirdPartyProviders from './ThirdPartyProviders.vue'
import { getApiKeys, createApiKey, revokeApiKey, getScopeCatalog } from '@/api/misc'
import {
  listOAuthClients,
  createOAuthClient,
  updateOAuthClient,
  deleteOAuthClient,
  revokeOAuthClientTokens,
  getScopeCatalogOAuth
} from '@/api/oauth'

const activeTab = ref('apikey')

// ── API Key ──────────────────────────────────────────────────────────────────
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
  for (const o of openScopeOptions.value) scopeChecked[o.id] = true
}

const openCreate = async () => {
  await loadCatalog()
  form.value = { name: '', expires_at: null }
  showCreate.value = true
}

const selectedScopes = () => openScopeOptions.value.filter((o) => scopeChecked[o.id]).map((o) => o.id)

const formatKeyScopes = (permissions) => {
  if (permissions == null || String(permissions).trim() === '') return '全部（旧数据）'
  try {
    const arr = JSON.parse(permissions)
    if (!Array.isArray(arr) || arr.length === 0) return '无'
    const byId = Object.fromEntries(openScopeOptions.value.map((o) => [o.id, o.name]))
    return arr.map((id) => byId[id] || id).join('、')
  } catch {
    return String(permissions).slice(0, 80)
  }
}

const loadKeys = async () => {
  await loadCatalog()
  const res = await getApiKeys()
  keys.value = res.data
}

const create = async () => {
  await createApiKey({ ...form.value, scopes: selectedScopes() })
  showCreate.value = false
  ElMessage.success('创建成功')
  loadKeys()
}

const revoke = async (id) => {
  await revokeApiKey(id)
  ElMessage.success('已撤销')
  loadKeys()
}

// ── OAuth Clients ─────────────────────────────────────────────────────────────
const clients = ref([])
const scopeOptions = ref([])
const oauthScopeChecked = reactive({})
const showOAuthDialog = ref(false)
const showSecret = ref(false)
const newSecret = ref('')
const oauthSaving = ref(false)
const oauthEditingId = ref(null)

const defaultOAuthForm = () => ({
  client_id: '',
  name: '',
  description: '',
  grant_types: ['client_credentials'],
  redirect_uris_text: '',
  token_ttl_seconds: 0,
  enabled: true,
  reset_secret: false
})
const oauthForm = ref(defaultOAuthForm())

const loadOAuthCatalog = async () => {
  try {
    const res = await getScopeCatalogOAuth()
    scopeOptions.value = res.open || []
  } catch {
    scopeOptions.value = []
  }
}

const loadClients = async () => {
  await loadOAuthCatalog()
  clients.value = await listOAuthClients()
}

const resetOAuthForm = () => {
  oauthEditingId.value = null
  oauthForm.value = defaultOAuthForm()
  scopeOptions.value.forEach((o) => { oauthScopeChecked[o.id] = true })
}

const openOAuthCreate = async () => {
  await loadOAuthCatalog()
  resetOAuthForm()
  showOAuthDialog.value = true
}

const openOAuthEdit = async (row) => {
  await loadOAuthCatalog()
  oauthEditingId.value = row.id
  const grantTypes = (row.grant_types || 'client_credentials').split(',').map((s) => s.trim())
  let redirectUrisText = ''
  try {
    const arr = JSON.parse(row.redirect_uris || '[]')
    redirectUrisText = arr.join('\n')
  } catch { /* empty */ }
  oauthForm.value = {
    name: row.name,
    description: row.description || '',
    grant_types: grantTypes,
    redirect_uris_text: redirectUrisText,
    token_ttl_seconds: row.token_ttl_seconds || 0,
    enabled: row.enabled,
    reset_secret: false
  }
  const selected = parseScopes(row.scopes_json)
  scopeOptions.value.forEach((o) => { oauthScopeChecked[o.id] = selected.includes(o.id) })
  showOAuthDialog.value = true
}

const saveOAuth = async () => {
  oauthSaving.value = true
  try {
    const scopes = scopeOptions.value.filter((o) => oauthScopeChecked[o.id]).map((o) => o.id)
    const redirectUris = oauthForm.value.redirect_uris_text
      .split('\n').map((s) => s.trim()).filter(Boolean)
    const payload = {
      ...oauthForm.value,
      scopes,
      redirect_uris: redirectUris
    }
    delete payload.redirect_uris_text

    if (oauthEditingId.value) {
      const res = await updateOAuthClient(oauthEditingId.value, payload)
      if (res.client_secret) { newSecret.value = res.client_secret; showSecret.value = true }
      ElMessage.success('已保存')
    } else {
      const res = await createOAuthClient(payload)
      if (res.client_secret) { newSecret.value = res.client_secret; showSecret.value = true }
      ElMessage.success('创建成功')
    }
    showOAuthDialog.value = false
    loadClients()
  } catch { /* error shown by http interceptor */ } finally {
    oauthSaving.value = false
  }
}

const revokeTokens = async (row) => {
  const res = await revokeOAuthClientTokens(row.id)
  ElMessage.success(`已撤销 ${res.revoked} 个活跃 Token`)
}

const deleteClient = async (id) => {
  await deleteOAuthClient(id)
  ElMessage.success('已删除')
  loadClients()
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

const grantTypeLabel = (gt) => {
  const map = { client_credentials: 'Client Credentials', authorization_code: 'Authorization Code' }
  return map[gt] || gt
}

onMounted(() => {
  loadKeys()
  loadClients()
})
</script>
