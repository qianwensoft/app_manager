<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:13px;color:#606266">
        配置第三方平台凭证，平台将代表用户完成 OAuth 授权并自动维护 token。
      </div>
      <el-button type="primary" @click="openCreate">新建平台</el-button>
    </div>

    <el-table :data="providers" border stripe>
      <el-table-column prop="id" label="ID" width="64" />
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column label="类型" width="140">
        <template #default="{ row }">
          <el-tag :type="row.type === 'wechat' ? 'success' : 'primary'" size="small">
            {{ typeLabel(row.type) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="Token 状态" min-width="200">
        <template #default="{ row }">
          <div v-if="tokenMap[row.id]">
            <div v-for="t in tokenMap[row.id]" :key="t.id" style="font-size:12px;line-height:1.8">
              <el-tag :type="t.valid ? 'success' : 'danger'" size="small" style="margin-right:4px">
                {{ t.valid ? '有效' : '已过期' }}
              </el-tag>
              <span style="color:#606266">
                <template v-if="t.source === 'outbound_app'">
                  使用外部应用: {{ t.outbound_app_name }}
                </template>
                <template v-else>
                  {{ t.authorizer_appid && t.authorizer_appid !== '__component__' ? t.authorizer_appid + ' · ' : '' }}
                  {{ t.expires_at ? '到期 ' + formatTime(t.expires_at) : '未授权' }}
                </template>
              </span>
            </div>
          </div>
          <span v-else style="color:#909399;font-size:12px">未授权</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="SSO 安全" min-width="160">
        <template #default="{ row }">
          <div style="font-size:12px;line-height:1.7">
            <div>
              <el-tag :type="row.redirect_allow_enabled === false ? 'info' : 'success'" size="small" style="margin-right:4px">
                白名单{{ row.redirect_allow_enabled === false ? '关' : '开' }}
              </el-tag>
              <el-tag :type="row.hmac_configured ? 'success' : 'danger'" size="small">
                HMAC {{ row.hmac_configured ? '已配置' : '未配置' }}
              </el-tag>
            </div>
            <div style="color:#909399;margin-top:2px">
              key: {{ row.hmac_key_source || '—' }}
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="340" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="primary" @click="authorize(row)">授权</el-button>
          <el-button size="small" type="success" @click="openTestSso(row)">测试 SSO</el-button>
          <el-button size="small" type="warning" @click="manualRefresh(row)">刷新 Token</el-button>
          <el-popconfirm title="确认删除？" @confirm="remove(row.id)">
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
      :title="editingId ? '编辑第三方平台' : '新建第三方平台'"
      width="540px"
      @closed="resetForm"
    >
      <el-form :model="form" label-width="130px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="如：企业 FreePass" />
        </el-form-item>
        <el-form-item label="平台类型" v-if="!editingId">
          <el-radio-group v-model="form.type">
            <el-radio value="freepass">FreePass 企业平台</el-radio>
            <el-radio value="wechat">微信开放平台</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="关联外部应用">
          <el-select v-model="form.outbound_app_id" placeholder="选择外部应用（用于 token 管理）" clearable filterable style="width: 100%">
            <el-option
              v-for="app in outboundApps"
              :key="app.id"
              :label="`${app.name} (${app.base_url})`"
              :value="app.id"
            />
          </el-select>
          <div style="font-size:11px;color:#909399;margin-top:4px">
            选择外部应用后，第三方平台将复用该应用的 token 管理机制，无需单独配置 token 获取逻辑。
          </div>
        </el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="form.callback_url" placeholder="https://your-platform.com/api/thirdparty/{id}/xxx/callback" />
          <div style="font-size:11px;color:#909399;margin-top:4px">填写本平台的 OAuth 回调 URL，需在第三方平台注册。</div>
        </el-form-item>

        <!-- FreePass fields -->
        <template v-if="form.type === 'freepass'">
          <el-form-item label="OpenAPI Origin">
            <el-input v-model="form.open_api_origin" placeholder="https://xxx.freepass.com" />
          </el-form-item>
          <el-form-item label="Corp ID">
            <el-input v-model="form.corp_id" />
          </el-form-item>
          <el-form-item label="App Key">
            <el-input v-model="form.app_key" />
          </el-form-item>
          <el-form-item label="App Secret">
            <el-input v-model="form.app_secret" type="password" show-password placeholder="留空则不修改" />
          </el-form-item>
        </template>

        <!-- WeChat fields -->
        <template v-if="form.type === 'wechat'">
          <el-form-item label="Component AppID">
            <el-input v-model="form.component_app_id" />
          </el-form-item>
          <el-form-item label="Component AppSecret">
            <el-input v-model="form.component_app_secret" type="password" show-password placeholder="留空则不修改" />
          </el-form-item>
        </template>

        <el-form-item label="SSO 用户默认角色">
          <el-radio-group v-model="form.default_role">
            <el-radio value="viewer">只读 (viewer)</el-radio>
            <el-radio value="operator">操作员 (operator)</el-radio>
            <el-radio value="admin">管理员 (admin)</el-radio>
          </el-radio-group>
          <div style="font-size:11px;color:#909399;margin-top:4px">
            通过 SSO 首次登录的用户将被赋予此角色。若需发送「可操作」工单链接，请选择 operator 或以上。
          </div>
        </el-form-item>

        <!-- SSO 跳转安全配置（P0） -->
        <el-divider content-position="left">SSO 跳转安全（P0）</el-divider>

        <el-form-item label="启用白名单校验">
          <el-switch
            v-model="form.redirect_allow_enabled"
            active-text="启用"
            inactive-text="禁用（向后兼容）"
          />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            启用后，第三方登录后的目标路径必须在下方白名单中且 HMAC 签名有效；否则拒绝登录。
          </div>
        </el-form-item>

        <el-form-item label="redirect_to 白名单">
          <el-input
            v-model="form.redirectAllowText"
            type="textarea"
            :rows="3"
            placeholder='["/", "/devices", "/work-orders/*", "/embed/work-orders/*"]'
          />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            JSON 数组，支持精确路径与 "/*" 前缀通配。留空时回退到系统级 server.sso.redirect_to_whitelist 配置。
          </div>
          <div v-if="form.effective_allowlist && form.effective_allowlist.length" style="font-size:11px;color:#67c23a;margin-top:4px">
            实际生效：{{ JSON.stringify(form.effective_allowlist) }}
          </div>
        </el-form-item>

        <el-form-item label="HMAC 签名密钥">
          <el-input
            v-model="form.hmac_secret"
            type="password"
            show-password
            placeholder="留空则使用系统级 server.sso.hmac_secret；密钥 ≥ 32 字节"
          />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            当前 key 来源：<b>{{ form.hmac_key_source || '未配置' }}</b>。修改后将立即用于签发新的 SSO 链接。
          </div>
        </el-form-item>

        <el-form-item v-if="editingId && form.hmac_configured" label=" ">
          <el-checkbox v-model="form.clear_hmac_secret">
            清空本 Provider 的 HMAC 密钥（回退到系统密钥）
          </el-checkbox>
        </el-form-item>

        <el-form-item label="时钟偏移容忍(秒)">
          <el-input-number v-model="form.hmac_clock_skew_sec" :min="0" :max="3600" :step="30" />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            默认 300 秒；签名过期判定允许此范围的偏差。
          </div>
        </el-form-item>

        <el-form-item v-if="editingId" label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ editingId ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>

    <!-- WeChat ticket dialog -->
    <el-dialog v-model="showTicketDialog" title="设置微信 Verify Ticket" width="480px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px"
        title="微信会每隔 10 分钟推送 component_verify_ticket，请将收到的 ticket 填入此处以获取 component_access_token。" />
      <el-input v-model="ticketValue" placeholder="component_verify_ticket" />
      <template #footer>
        <el-button @click="showTicketDialog = false">取消</el-button>
        <el-button type="primary" @click="submitTicket">保存</el-button>
      </template>
    </el-dialog>

    <!-- SSO Test dialog -->
    <el-dialog v-model="showTestDialog" title="测试 SSO 免登链接（带白名单与 HMAC 签名）" width="760px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:16px">
        生成 SSO 免登链接，跳转目标会在白名单内校验并附带 HMAC-SHA256 签名（防 open-redirect 与链接篡改）。
      </el-alert>

      <el-form label-width="120px">
        <el-form-item label="目标页面">
          <el-radio-group v-model="testForm.targetType" @change="handleTargetTypeChange">
            <el-radio value="work-order">工单详情</el-radio>
            <el-radio value="custom">自定义路径</el-radio>
            <el-radio value="home">首页</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="testForm.targetType === 'work-order'" label="选择工单">
          <el-select
            v-model="testForm.workOrderId"
            placeholder="搜索工单编号、业务编号或其他编码"
            filterable
            remote
            :remote-method="searchWorkOrders"
            :loading="searchLoading"
            style="width: 100%"
            clearable
            popper-class="work-order-select-popper"
          >
            <el-option
              v-for="wo in searchedWorkOrders"
              :key="wo.id"
              :label="`${wo.code} - ${wo.title}`"
              :value="wo.id"
            >
              <div class="work-order-option">
                <div class="wo-main">{{ wo.code }} - {{ wo.title }}</div>
                <div class="wo-meta">
                  <span v-if="wo.business_no" class="wo-field">业务编号: {{ wo.business_no }}</span>
                  <span v-if="wo.business_no && wo.other_codes" class="wo-separator">|</span>
                  <span v-if="wo.other_codes" class="wo-field">其他编码: {{ wo.other_codes }}</span>
                  <el-tag size="small" class="wo-status" :type="getStatusType(wo.status)">{{ getStatusLabel(wo.status) }}</el-tag>
                </div>
              </div>
            </el-option>
          </el-select>
          <div style="font-size:11px;color:#909399;margin-top:4px">
            可搜索工单编号、业务编号、其他编码
          </div>
        </el-form-item>

        <el-form-item v-if="testForm.targetType === 'custom'" label="目标路径">
          <el-input v-model="testForm.customPath" placeholder="如: /devices 或 /work-orders/123" />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            输入相对路径，如 /devices、/work-orders/123 等
          </div>
        </el-form-item>

        <el-form-item v-if="testForm.targetType === 'work-order'" label="操作权限">
          <el-switch v-model="testForm.operable" active-text="可操作" inactive-text="只读" @change="generatedSsoUrl = ''" />
          <div style="font-size:11px;color:#909399;margin-top:4px">
            关闭后用户只能查看工单内容，不能修改状态或添加进展
          </div>
        </el-form-item>

        <el-form-item label="签名有效期">
          <el-input-number v-model="testForm.ttlSeconds" :min="60" :max="86400" :step="60" />
          <span style="margin-left:8px;color:#909399;font-size:12px">秒（默认 300，最大 86400）</span>
        </el-form-item>

        <el-form-item v-if="generatedSsoUrl" label="生成的链接">
          <el-input v-model="generatedSsoUrl" readonly>
            <template #append>
              <el-button @click="copySsoUrl">复制</el-button>
            </template>
          </el-input>
          <div style="font-size:11px;color:#909399;margin-top:4px">
            链接带 sig/exp/kid 参数；签名密钥后端保存，前端不可见。
          </div>
        </el-form-item>

        <el-form-item v-if="generatedSigInfo" label="签名信息">
          <div style="font-size:12px;color:#606266;line-height:1.7">
            <div>key_id：<code>{{ generatedSigInfo.key_id }}</code></div>
            <div>exp：<code>{{ generatedSigInfo.exp }}</code>（{{ formatExp(generatedSigInfo.exp) }}）</div>
            <div>sig：<code>{{ generatedSigInfo.sig.slice(0, 16) }}…</code></div>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showTestDialog = false">关闭</el-button>
        <el-button type="primary" @click="generateSsoUrl">生成链接</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listThirdPartyProviders,
  createThirdPartyProvider,
  updateThirdPartyProvider,
  deleteThirdPartyProvider,
  getThirdPartyProvider,
  getThirdPartyTokenStatus,
  getFreePassAuthorizeURL,
  refreshFreePassToken,
  getWechatPreAuthCode,
  refreshWechatToken,
  setWechatTicket,
  buildSignedSSOCallback,
  previewThirdPartyAllowlist
} from '@/api/thirdparty'
import { listOutboundApps } from '@/api/outbound'
import { getWorkOrders } from '@/api/workOrder'

const providers = ref([])
const tokenMap = reactive({})
const outboundApps = ref([])
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref(null)
const showTicketDialog = ref(false)
const ticketValue = ref('')
const ticketProviderId = ref(null)
const showTestDialog = ref(false)
const testProviderId = ref(null)
const generatedSsoUrl = ref('')
const generatedSigInfo = ref(null)

const testForm = ref({
  targetType: 'work-order',
  workOrderId: null,
  customPath: '',
  operable: false,
  ttlSeconds: 300
})

const searchedWorkOrders = ref([])
const searchLoading = ref(false)

const defaultForm = () => ({
  name: '',
  type: 'freepass',
  description: '',
  open_api_origin: '',
  corp_id: '',
  app_key: '',
  app_secret: '',
  component_app_id: '',
  component_app_secret: '',
  callback_url: '',
  outbound_app_id: null,
  default_role: 'viewer',
  // SSO 安全
  redirect_allow_enabled: true,
  redirectAllowText: '',
  redirect_allowlist_json: '',
  effective_allowlist: [],
  hmac_secret: '',
  clear_hmac_secret: false,
  hmac_configured: false,
  hmac_key_source: '',
  hmac_clock_skew_sec: 300,
  enabled: true
})
const form = ref(defaultForm())

const typeLabel = (t) => ({ freepass: 'FreePass', wechat: '微信开放平台' }[t] || t)
const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN') : '-'
const formatExp = (exp) => {
  const d = new Date(Number(exp) * 1000)
  if (isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN')
}

const load = async () => {
  providers.value = await listThirdPartyProviders()
  for (const p of providers.value) {
    try {
      const tokens = await getThirdPartyTokenStatus(p.id)
      tokenMap[p.id] = tokens.filter((t) => t.authorizer_appid !== '__component__')
    } catch {
      tokenMap[p.id] = []
    }
  }
}

const loadOutboundApps = async () => {
  try {
    const res = await listOutboundApps()
    outboundApps.value = res.data || []
  } catch {
    outboundApps.value = []
  }
}

const resetForm = () => {
  editingId.value = null
  form.value = defaultForm()
}

const openCreate = () => {
  resetForm()
  showDialog.value = true
}

const openEdit = async (row) => {
  editingId.value = row.id
  try {
    const detail = await getThirdPartyProvider(row.id)
    form.value = {
      name: detail.name,
      type: detail.type,
      description: detail.description || '',
      open_api_origin: detail.open_api_origin || '',
      corp_id: detail.corp_id || '',
      app_key: detail.app_key || '',
      app_secret: '',
      component_app_id: detail.component_app_id || '',
      component_app_secret: '',
      callback_url: detail.callback_url || '',
      outbound_app_id: detail.outbound_app_id ? Number(detail.outbound_app_id) : null,
      default_role: detail.default_role || 'viewer',
      redirect_allow_enabled: detail.redirect_allow_enabled !== false,
      redirectAllowText: detail.redirect_allowlist_json || '',
      redirect_allowlist_json: detail.redirect_allowlist_json || '',
      effective_allowlist: detail.effective_redirect_allowlist || [],
      hmac_secret: '',
      clear_hmac_secret: false,
      hmac_configured: !!detail.hmac_configured,
      hmac_key_source: detail.hmac_key_source || '',
      hmac_clock_skew_sec: detail.hmac_clock_skew_sec || 300,
      enabled: detail.enabled
    }
  } catch {
    ElMessage.error('加载平台详情失败')
  }
  showDialog.value = true
}

const save = async () => {
  saving.value = true
  try {
    // 将白名单文本框转换为 JSON 字符串
    const redirectText = (form.value.redirectAllowText || '').trim()
    let allowJson = ''
    if (redirectText) {
      // 用户可直接粘贴 JSON；也接受逗号/换行分隔的纯列表
      if (redirectText.startsWith('[')) {
        allowJson = redirectText
      } else {
        const arr = redirectText.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
        allowJson = JSON.stringify(arr)
      }
      // 校验 JSON 合法性
      try { JSON.parse(allowJson) } catch {
        ElMessage.error('白名单 JSON 格式错误')
        saving.value = false
        return
      }
    }
    const payload = {
      ...form.value,
      redirect_allowlist_json: allowJson,
      redirect_allow_enabled: form.value.redirect_allow_enabled
    }
    if (!payload.hmac_secret && !payload.clear_hmac_secret) {
      // 编辑时未填密钥且未勾选清空 → 不提交字段，保留原值
      delete payload.hmac_secret
      delete payload.clear_hmac_secret
    }
    // 新建且未勾选清空也允许留空（自动使用系统密钥）
    if (editingId.value) {
      await updateThirdPartyProvider(editingId.value, payload)
      ElMessage.success('已保存')
    } else {
      await createThirdPartyProvider(payload)
      ElMessage.success('创建成功')
    }
    showDialog.value = false
    load()
  } catch { /* http interceptor */ } finally {
    saving.value = false
  }
}

const remove = async (id) => {
  await deleteThirdPartyProvider(id)
  ElMessage.success('已删除')
  load()
}

const authorize = async (row) => {
  if (row.type === 'freepass') {
    const res = await getFreePassAuthorizeURL(row.id)
    window.open(res.authorize_url, '_blank')
  } else if (row.type === 'wechat') {
    // 先确认 ticket 已设置，再获取 pre_auth_code
    try {
      const res = await getWechatPreAuthCode(row.id)
      if (res.pre_auth_code) {
        const authUrl = `https://mp.weixin.qq.com/cgi-bin/componentloginpage?component_appid=${row.component_app_id}&pre_auth_code=${res.pre_auth_code}&redirect_uri=${encodeURIComponent(row.callback_url)}`
        window.open(authUrl, '_blank')
      } else {
        ElMessage.error(res.errmsg || '获取预授权码失败')
      }
    } catch (e) {
      // 可能是 ticket 未设置
      ticketProviderId.value = row.id
      ticketValue.value = ''
      showTicketDialog.value = true
    }
  }
}

const manualRefresh = async (row) => {
  try {
    if (row.type === 'freepass') {
      await refreshFreePassToken(row.id)
    } else {
      await refreshWechatToken(row.id)
    }
    ElMessage.success('Token 已刷新')
    load()
  } catch { /* http interceptor */ }
}

const submitTicket = async () => {
  if (!ticketValue.value.trim()) return
  await setWechatTicket(ticketProviderId.value, ticketValue.value.trim())
  ElMessage.success('Ticket 已保存，请重新点击授权')
  showTicketDialog.value = false
}

const openTestSso = (row) => {
  testProviderId.value = row.id
  generatedSsoUrl.value = ''
  generatedSigInfo.value = null
  testForm.value = {
    targetType: 'work-order',
    workOrderId: null,
    customPath: '',
    operable: false,
    ttlSeconds: 300
  }
  searchedWorkOrders.value = []
  showTestDialog.value = true
}

const handleTargetTypeChange = () => {
  generatedSsoUrl.value = ''
  generatedSigInfo.value = null
}

const searchWorkOrders = async (query) => {
  if (!query) {
    searchedWorkOrders.value = []
    return
  }
  searchLoading.value = true
  try {
    const res = await getWorkOrders({
      search_key: query,
      page: 1,
      limit: 20
    })
    searchedWorkOrders.value = res.data || []
  } catch (e) {
    console.error('Search work orders failed:', e)
    searchedWorkOrders.value = []
  } finally {
    searchLoading.value = false
  }
}

const getStatusType = (status) => {
  const map = {
    open: '',
    in_progress: 'warning',
    pending: 'info',
    resolved: 'success',
    closed: 'info'
  }
  return map[status] || ''
}

const getStatusLabel = (status) => {
  const map = {
    open: '待处理',
    in_progress: '处理中',
    pending: '待审核',
    resolved: '已解决',
    closed: '已关闭'
  }
  return map[status] || status
}

const generateSsoUrl = async () => {
  const provider = providers.value.find(p => p.id === testProviderId.value)
  if (!provider) {
    ElMessage.error('平台配置不存在')
    return
  }

  // 0) 先快速校验 Provider 已配置签名（避免后端再 403）
  if (!provider.hmac_configured) {
    ElMessage.warning('该第三方平台尚未配置 HMAC 密钥；请到「编辑」中填写，或确认系统级 server.sso.hmac_secret 已配置。')
    return
  }

  let redirectTo = '/'

  if (testForm.value.targetType === 'work-order') {
    if (!testForm.value.workOrderId) {
      ElMessage.warning('请选择工单')
      return
    }
    const readonlyParam = testForm.value.operable ? '' : '?readonly=1'
    redirectTo = `/embed/work-orders/${testForm.value.workOrderId}${readonlyParam}`
  } else if (testForm.value.customPath && testForm.value.customPath.trim()) {
    redirectTo = testForm.value.customPath.trim()
    if (!redirectTo.startsWith('/')) {
      redirectTo = '/' + redirectTo
    }
  }

  // 1) 走后端签名接口（白名单 + HMAC 都在后端校验，前端永不接触密钥）
  try {
    const resp = await buildSignedSSOCallback(provider.id, {
      redirect_to: redirectTo,
      base_url: window.location.origin,
      ttl_seconds: testForm.value.ttlSeconds || 300
    })
    let callbackUrl = resp.callback_url
    // 工单「可操作」→ 追加工单级写权限 scope（wo_scopes 不参与 HMAC 签名，
    // 由回调页透传给 /api/auth/thirdparty/login，写入 JWT）。只读则不下发任何 scope。
    if (testForm.value.targetType === 'work-order' && testForm.value.operable && testForm.value.workOrderId) {
      const sep = callbackUrl.includes('?') ? '&' : '?'
      callbackUrl += `${sep}wo_scopes=${encodeURIComponent('wo:rw:' + testForm.value.workOrderId)}`
    }
    generatedSsoUrl.value = callbackUrl
    generatedSigInfo.value = { sig: resp.sig, exp: resp.exp, key_id: resp.key_id }

    // 2) 把这个 callback URL 拼到 eTeams 免登入口
    const baseUrl = (provider.open_api_origin || '').replace(/\/$/, '')
    if (!baseUrl) {
      ElMessage.warning('第三方平台 open_api_origin 为空，无法拼接免登入口')
      return
    }
    generatedSsoUrl.value =
      `${baseUrl}/api/bs/open/auth/third?app_key=${encodeURIComponent(provider.app_key)}&redirect_uri=${encodeURIComponent(callbackUrl)}`

    ElMessage.success(`链接已生成（key=${resp.key_id}，有效期 ${resp.ttl_seconds}s）`)
  } catch (e) {
    const detail = e?.response?.data || {}
    ElMessage.error(`生成失败：${detail.error || e.message}${detail.allowlist ? '（允许：' + JSON.stringify(detail.allowlist) + '）' : ''}`)
  }
}

const copySsoUrl = () => {
  if (!generatedSsoUrl.value) return
  navigator.clipboard.writeText(generatedSsoUrl.value).then(() => {
    ElMessage.success('已复制到剪贴板')
  }).catch(() => {
    ElMessage.error('复制失败，请手动复制')
  })
}

onMounted(() => {
  load()
  loadOutboundApps()
})
</script>

<style scoped>
.work-order-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wo-main {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}
.wo-meta {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.wo-field {
  white-space: nowrap;
}
.wo-separator {
  color: #dcdfe6;
}
.wo-status {
  margin-left: auto;
}
</style>

<style>
.work-order-select-popper .el-select-dropdown__item {
  height: auto;
  padding: 8px 12px;
  line-height: 1.4;
}
</style>
