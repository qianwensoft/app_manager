<template>
  <div class="iface-ai">
    <!-- 输入区 -->
    <div class="iface-ai-input">
      <el-form label-width="92px" @submit.prevent>
        <el-form-item label="文档地址">
          <el-input
            v-model="docUrl"
            placeholder="粘贴第三方接口文档 URL，如 Swagger/OpenAPI JSON、API 文档页"
            :disabled="streaming"
            clearable
          />
        </el-form-item>
        <el-form-item label="探测深度">
          <el-radio-group v-model="maxDepth" :disabled="streaming">
            <el-radio-button :value="1">1 层</el-radio-button>
            <el-radio-button :value="2">2 层</el-radio-button>
            <el-radio-button :value="3">3 层</el-radio-button>
            <el-radio-button :value="4">4 层</el-radio-button>
            <el-radio-button :value="5">5 层</el-radio-button>
          </el-radio-group>
          <span class="iface-ai-hint">无头浏览器执行 JS 后，跟随同源下级链接逐层分析（最多 5 层）</span>
        </el-form-item>
        <el-form-item label="补充说明">
          <el-input
            v-model="draft"
            type="textarea"
            :rows="2"
            :disabled="streaming"
            placeholder="可选：补充需求或对生成结果的纠正，例如「只要消息相关接口」"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="streaming" :disabled="!canSend" @click="send">
            <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
            {{ messages.length ? '继续生成' : '开始分析' }}
          </el-button>
          <el-button :disabled="streaming || (!messages.length && !plan)" @click="resetAll">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 进度 / 流式输出 -->
    <div v-if="progressMsg" class="iface-ai-progress">
      <el-icon class="is-loading" v-if="streaming"><Loading /></el-icon>
      <span>{{ progressMsg }}</span>
    </div>
    <div v-if="streaming && streamText" class="iface-ai-stream">{{ streamText }}</div>

    <!-- 结构化预览 -->
    <template v-if="plan">
      <el-divider content-position="left">应用（分组）</el-divider>
      <el-form label-width="92px" class="iface-ai-app">
        <el-form-item label="名称" required>
          <el-input v-model="plan.app.name" :disabled="appendMode" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="plan.app.description" type="textarea" :rows="2" :disabled="appendMode" />
        </el-form-item>
        <el-form-item label="Base URL" required>
          <el-input v-model="plan.app.base_url" :disabled="appendMode" />
        </el-form-item>
        <el-form-item label="鉴权">
          <el-select v-model="plan.app.auth_type" style="width: 220px" :disabled="appendMode">
            <el-option label="无" value="none" />
            <el-option label="静态 Header" value="static_header" />
            <el-option label="动态 Bearer" value="dynamic_bearer" />
          </el-select>
          <span v-if="plan.app.auth_hint" class="iface-ai-hint">{{ plan.app.auth_hint }}</span>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="appendMode"
        type="info"
        :closable="false"
        show-icon
        title="追加模式：接口将创建到当前应用下，应用信息不可修改。"
        style="margin-bottom: 12px"
      />

      <el-divider content-position="left">
        接口（已选 {{ selectedCount }} / {{ plan.endpoints.length }}）
      </el-divider>
      <el-empty v-if="!plan.endpoints.length" description="未识别到接口，可补充说明后继续生成" :image-size="60" />
      <el-collapse v-else v-model="activeNames">
        <el-collapse-item v-for="(ep, i) in plan.endpoints" :key="i" :name="i">
          <template #title>
            <el-checkbox v-model="ep._selected" @click.stop @change="() => {}" style="margin-right: 8px" />
            <el-tag size="small" :type="methodTagType(ep.method)" style="margin-right: 8px">{{ ep.method || 'POST' }}</el-tag>
            <span class="iface-ai-ep-name">{{ ep.name || '(未命名)' }}</span>
            <span class="iface-ai-ep-path">{{ ep.path }}</span>
          </template>
          <el-form label-width="92px" class="iface-ai-ep-form">
            <el-form-item label="名称">
              <el-input v-model="ep.name" />
            </el-form-item>
            <el-form-item label="方法">
              <el-select v-model="ep.method" style="width: 140px">
                <el-option v-for="m in METHODS" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>
            <el-form-item label="Path">
              <el-input v-model="ep.path" />
            </el-form-item>
            <el-form-item label="Headers">
              <el-input v-model="ep._headersText" type="textarea" :rows="2" placeholder='{"Content-Type":"application/json"}' />
            </el-form-item>
            <el-form-item label="Body 模板">
              <el-input v-model="ep.body_template" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="入参 Schema">
              <el-input v-model="ep.param_schema" type="textarea" :rows="3" placeholder="JSON Schema 字符串" />
            </el-form-item>
            <el-form-item label="返回 Schema">
              <el-input v-model="ep.response_schema" type="textarea" :rows="3" placeholder="JSON Schema 字符串" />
            </el-form-item>
            <el-form-item label="Demo 入参">
              <el-input v-model="ep.demo_params" type="textarea" :rows="3" placeholder='{"{{access_token}}":"DEMO_TOKEN","{{user_id}}":"1001"}' />
              <span class="iface-ai-hint">示例入参模版，保存后调试/二次执行自动回填，无需重填。</span>
            </el-form-item>
          </el-form>
        </el-collapse-item>
      </el-collapse>

      <div class="iface-ai-footer">
        <el-button
          type="primary"
          :loading="creating"
          :disabled="!selectedCount"
          @click="doCreate"
        >确认创建（{{ selectedCount }} 个接口）</el-button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Loading } from '@element-plus/icons-vue'
import { createOutboundApp, createOutboundEndpoint } from '@/api/outbound'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

const props = defineProps({
  // >0：在该应用下追加接口（详情页场景）；0：新建应用（列表页场景）
  appId: { type: [Number, String], default: 0 }
})
const emit = defineEmits(['created'])

const appendMode = computed(() => Number(props.appId) > 0)

const docUrl = ref('')
const maxDepth = ref(2)
const draft = ref('')
const messages = ref([]) // { role, content }
const streaming = ref(false)
const streamText = ref('')
const progressMsg = ref('')
const plan = ref(null)
const activeNames = ref([])
const creating = ref(false)

const canSend = computed(() => !streaming.value && (!!docUrl.value.trim() || !!draft.value.trim() || messages.value.length > 0))
const selectedCount = computed(() => (plan.value?.endpoints || []).filter((e) => e._selected).length)

function methodTagType(m) {
  switch ((m || '').toUpperCase()) {
    case 'GET': return 'success'
    case 'DELETE': return 'danger'
    case 'PUT':
    case 'PATCH': return 'warning'
    default: return 'primary'
  }
}

function resetAll() {
  messages.value = []
  streamText.value = ''
  progressMsg.value = ''
  plan.value = null
  activeNames.value = []
}

function normalizePlan(raw) {
  const app = raw.app || {}
  const eps = Array.isArray(raw.endpoints) ? raw.endpoints : []
  return {
    app: {
      name: app.name || '',
      description: app.description || '',
      base_url: app.base_url || '',
      auth_type: app.auth_type || 'none',
      auth_hint: app.auth_hint || ''
    },
    endpoints: eps.map((e) => {
      let headersText = ''
      if (e.headers && typeof e.headers === 'object') {
        try { headersText = JSON.stringify(e.headers) } catch { headersText = '' }
      }
      let demoText = ''
      if (e.demo_params && typeof e.demo_params === 'object') {
        try { demoText = JSON.stringify(e.demo_params, null, 2) } catch { demoText = '' }
      } else if (typeof e.demo_params === 'string' && e.demo_params.trim()) {
        // 尝试美化字符串形式的 JSON，失败则原样保留
        try { demoText = JSON.stringify(JSON.parse(e.demo_params), null, 2) } catch { demoText = e.demo_params }
      }
      return reactive({
        name: e.name || '',
        method: (e.method || 'POST').toUpperCase(),
        path: e.path || '',
        body_template: e.body_template || '',
        param_schema: typeof e.param_schema === 'string' ? e.param_schema : (e.param_schema ? JSON.stringify(e.param_schema) : ''),
        response_schema: typeof e.response_schema === 'string' ? e.response_schema : (e.response_schema ? JSON.stringify(e.response_schema) : ''),
        demo_params: demoText,
        _headersText: headersText,
        _selected: true
      })
    })
  }
}

async function send() {
  if (!canSend.value) return
  const text = draft.value.trim()
  if (text) messages.value.push({ role: 'user', content: text })
  draft.value = ''
  streaming.value = true
  streamText.value = ''
  progressMsg.value = ''

  const token = localStorage.getItem('token') || ''
  const payload = {
    doc_url: docUrl.value.trim(),
    app_id: Number(props.appId) || 0,
    max_depth: maxDepth.value,
    messages: messages.value.map((m) => ({ role: m.role, content: m.content }))
  }

  let acc = ''
  let gotPlan = null
  try {
    const resp = await fetch('/api/outbound/interface-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    })
    if (!resp.ok || !resp.body) {
      let msg = `HTTP ${resp.status}`
      try { const d = await resp.json(); if (d?.error) msg = d.error } catch { /* ignore */ }
      ElMessage.error(msg)
      streaming.value = false
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const blocks = buf.split('\n\n')
      buf = blocks.pop() || ''
      for (const block of blocks) {
        let event = 'message'
        let data = ''
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data += line.slice(5).trim()
        }
        if (!data) continue
        let parsed
        try { parsed = JSON.parse(data) } catch { continue }
        if (event === 'progress') {
          progressMsg.value = parsed.message || ''
        } else if (event === 'delta') {
          acc += parsed.text || ''
          streamText.value = acc.length > 600 ? '…' + acc.slice(-600) : acc
        } else if (event === 'done') {
          gotPlan = parsed.plan || null
        } else if (event === 'error') {
          ElMessage.error(parsed.message || '生成失败')
        }
      }
    }
  } catch (e) {
    ElMessage.error(e?.message || '请求失败')
  } finally {
    streaming.value = false
    streamText.value = ''
    if (gotPlan) {
      messages.value.push({ role: 'assistant', content: '已生成接口方案，请在下方预览、勾选后创建。' })
      plan.value = normalizePlan(gotPlan)
      activeNames.value = plan.value.endpoints.map((_, i) => i)
      progressMsg.value = `已识别 ${plan.value.endpoints.length} 个接口`
    }
  }
}

function parseHeaders(text) {
  const t = (text || '').trim()
  if (!t) return {}
  try {
    const o = JSON.parse(t)
    return o && typeof o === 'object' ? o : {}
  } catch {
    throw new Error('Headers JSON 无效')
  }
}

async function doCreate() {
  const eps = plan.value.endpoints.filter((e) => e._selected)
  if (!eps.length) return

  // 预解析 headers，提前暴露格式错误
  let headersList
  try {
    headersList = eps.map((e) => parseHeaders(e._headersText))
  } catch (e) {
    ElMessage.error(e.message)
    return
  }

  creating.value = true
  try {
    let targetAppId = Number(props.appId) || 0
    if (!appendMode.value) {
      const a = plan.value.app
      if (!a.name.trim() || !a.base_url.trim()) {
        ElMessage.error('应用名称与 Base URL 不能为空')
        return
      }
      const r = await createOutboundApp({
        name: a.name.trim(),
        description: a.description || '',
        base_url: a.base_url.trim(),
        auth_type: a.auth_type || 'none',
        auth_config: {},
        token_provider: {}
      })
      targetAppId = r.data?.id
      if (!targetAppId) {
        ElMessage.error('创建应用失败')
        return
      }
    }

    let ok = 0
    let fail = 0
    for (let i = 0; i < eps.length; i++) {
      const e = eps[i]
      try {
        await createOutboundEndpoint({
          app_id: targetAppId,
          name: e.name || `接口${i + 1}`,
          method: e.method || 'POST',
          path: e.path || '',
          headers: headersList[i],
          body_template: e.body_template || '',
          param_schema: e.param_schema || '',
          response_schema: e.response_schema || '',
          demo_params: e.demo_params || '',
          enabled: true
        })
        ok++
      } catch {
        fail++
      }
    }
    if (fail === 0) ElMessage.success(`已创建 ${ok} 个接口`)
    else ElMessage.warning(`创建完成：成功 ${ok}，失败 ${fail}`)
    emit('created', { appId: targetAppId })
  } finally {
    creating.value = false
  }
}
</script>

<style scoped>
.iface-ai-hint {
  color: #909399;
  font-size: 12px;
  margin-left: 10px;
}
.iface-ai-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409eff;
  font-size: 13px;
  margin: 8px 0;
}
.iface-ai-stream {
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 12px;
  color: #606266;
  white-space: pre-wrap;
  max-height: 140px;
  overflow: auto;
  margin-bottom: 8px;
}
.iface-ai-ep-name {
  font-weight: 600;
  margin-right: 10px;
}
.iface-ai-ep-path {
  color: #909399;
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
}
.iface-ai-footer {
  margin-top: 16px;
  text-align: right;
}
</style>
