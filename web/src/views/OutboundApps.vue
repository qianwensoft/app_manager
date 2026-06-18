<template>
  <div class="outbound-apps">
    <el-page-header @back="router.push('/')" content="外部应用" />
    <p class="hint">在此管理外部系统与鉴权；具体 HTTP 接口在「应用详情」中维护。连接器中按应用选择接口。</p>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建应用</el-button>
      <el-button type="warning" plain @click="aiDlg = true">
        <el-icon style="margin-right: 4px"><MagicStick /></el-icon>AI 助手
      </el-button>
      <el-button
        type="success"
        :disabled="selected.length !== 1"
        :loading="cloning"
        @click="cloneApp"
      >复制</el-button>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-table :data="apps" border size="small" v-loading="loading" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="40" />
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="base_url" label="Base URL" min-width="200" show-overflow-tooltip />
      <el-table-column prop="auth_type" label="鉴权" width="130" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="router.push(`/outbound/apps/${row.id}`)">详情</el-button>
          <el-button link type="danger" size="small" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg.visible" title="新建应用" width="560px" destroy-on-close>
      <el-form :model="dlg.form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="dlg.form.name" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="dlg.form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="dlg.form.base_url" placeholder="https://api.example.com" />
        </el-form-item>
        <el-form-item label="鉴权类型">
          <el-select v-model="dlg.form.auth_type" style="width: 100%">
            <el-option label="无" value="none" />
            <el-option label="静态 Header" value="static_header" />
            <el-option label="静态 Cookie" value="static_cookie" />
            <el-option label="动态 Bearer（服务端缓存 Token）" value="dynamic_bearer" />
          </el-select>
        </el-form-item>
        <template v-if="dlg.form.auth_type === 'static_header'">
          <el-form-item label="Header 名">
            <el-input v-model="dlg.authHeaderName" placeholder="如 X-Api-Key" />
          </el-form-item>
          <el-form-item label="Header 值">
            <el-input v-model="dlg.authHeaderValue" type="password" show-password placeholder="密钥" />
          </el-form-item>
        </template>
        <template v-if="dlg.form.auth_type === 'static_cookie'">
          <el-form-item label="Cookie 值">
            <el-input v-model="dlg.authCookieValue" placeholder="如 session=xxx; token=yyy" />
          </el-form-item>
        </template>
        <el-form-item label="启用">
          <el-switch v-model="dlg.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="dlg.saving" @click="saveCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="aiDlg" title="AI 助手 · 按接口文档创建外部应用" width="780px" destroy-on-close top="6vh">
      <p class="hint" style="margin-top:0">粘贴第三方接口文档地址，AI 会抓取并探测下级链接，自动推断出一个外部应用及其下多条接口（含入参/返回 Schema），预览确认后创建。</p>
      <InterfaceImportAIAssistant :app-id="0" @created="onAiCreated" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'
import * as ob from '@/api/outbound'
import InterfaceImportAIAssistant from '@/components/InterfaceImportAIAssistant.vue'

const router = useRouter()
const apps = ref([])
const loading = ref(false)
const selected = ref([])
const cloning = ref(false)
const aiDlg = ref(false)
const dlg = reactive({
  visible: false,
  saving: false,
  authHeaderName: '',
  authHeaderValue: '',
  authCookieValue: '',
  form: { name: '', description: '', base_url: '', auth_type: 'none', enabled: true }
})

async function load() {
  loading.value = true
  try {
    const r = await ob.listOutboundApps()
    apps.value = r.data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dlg.authHeaderName = ''
  dlg.authHeaderValue = ''
  dlg.authCookieValue = ''
  dlg.form = { name: '', description: '', base_url: '', auth_type: 'none', enabled: true }
  dlg.visible = true
}

async function saveCreate() {
  const auth_config = {}
  if (dlg.form.auth_type === 'static_header') {
    auth_config.header_name = dlg.authHeaderName
    auth_config.header_value = dlg.authHeaderValue
  } else if (dlg.form.auth_type === 'static_cookie') {
    auth_config.cookie_value = dlg.authCookieValue
  }
  dlg.saving = true
  try {
    const r = await ob.createOutboundApp({ ...dlg.form, auth_config, token_provider: {} })
    dlg.visible = false
    const id = r.data?.id
    if (id) router.push(`/outbound/apps/${id}`)
    else await load()
  } finally {
    dlg.saving = false
  }
}

async function remove(row) {
  await ElMessageBox.confirm(`删除应用「${row.name}」？需先删除其下所有接口。`, '确认', { type: 'warning' })
  await ob.deleteOutboundApp(row.id)
  ElMessage.success('已删除')
  await load()
}

function onSelectionChange(rows) {
  selected.value = rows
}

async function onAiCreated({ appId } = {}) {
  aiDlg.value = false
  if (appId) router.push(`/outbound/apps/${appId}`)
  else await load()
}

async function cloneApp() {
  const row = selected.value[0]
  cloning.value = true
  try {
    const r = await ob.cloneOutboundApp(row.id)
    ElMessage.success('复制成功')
    const newId = r.data?.id
    if (newId) router.push(`/outbound/apps/${newId}`)
    else await load()
  } catch (e) {
    ElMessage.error('复制失败：' + (e?.message || e))
  } finally {
    cloning.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.outbound-apps {
  max-width: 1100px;
}
.hint {
  color: #64748b;
  font-size: 13px;
  margin: 12px 0;
  line-height: 1.5;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
</style>
