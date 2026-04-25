<template>
  <div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:13px;color:#606266">
        配置第三方平台凭证，平台将代表用户完成 OAuth 授权并自动维护 token。
      </div>
      <el-button type="primary" @click="openCreate">新建平台</el-button>
    </div>

    <el-table :data="providers" border stripe>
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
                {{ t.authorizer_appid && t.authorizer_appid !== '__component__' ? t.authorizer_appid + ' · ' : '' }}
                {{ t.expires_at ? '到期 ' + formatTime(t.expires_at) : '未授权' }}
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
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="primary" @click="authorize(row)">授权</el-button>
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
  getThirdPartyTokenStatus,
  getFreePassAuthorizeURL,
  refreshFreePassToken,
  getWechatPreAuthCode,
  refreshWechatToken,
  setWechatTicket
} from '@/api/thirdparty'

const providers = ref([])
const tokenMap = reactive({})
const showDialog = ref(false)
const saving = ref(false)
const editingId = ref(null)
const showTicketDialog = ref(false)
const ticketValue = ref('')
const ticketProviderId = ref(null)

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
  enabled: true
})
const form = ref(defaultForm())

const typeLabel = (t) => ({ freepass: 'FreePass', wechat: '微信开放平台' }[t] || t)
const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN') : '-'

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

const resetForm = () => {
  editingId.value = null
  form.value = defaultForm()
}

const openCreate = () => {
  resetForm()
  showDialog.value = true
}

const openEdit = (row) => {
  editingId.value = row.id
  form.value = {
    name: row.name,
    type: row.type,
    description: row.description || '',
    open_api_origin: row.open_api_origin || '',
    corp_id: row.corp_id || '',
    app_key: row.app_key || '',
    app_secret: '',
    component_app_id: row.component_app_id || '',
    component_app_secret: '',
    callback_url: row.callback_url || '',
    enabled: row.enabled
  }
  showDialog.value = true
}

const save = async () => {
  saving.value = true
  try {
    if (editingId.value) {
      await updateThirdPartyProvider(editingId.value, form.value)
      ElMessage.success('已保存')
    } else {
      await createThirdPartyProvider(form.value)
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

onMounted(load)
</script>
