<template>
  <div class="wh-debug" v-loading="loading">
    <el-page-header @back="router.push('/outbound/apps/' + appId)">
      <template #content>
        <span class="title">Webhook 调试</span>
        <el-tag v-if="webhook" size="small" style="margin-left: 8px">{{ webhook.name }}</el-tag>
        <el-tag size="small" type="info" style="margin-left: 4px">#{{ webhookId }}</el-tag>
        <el-button size="small" plain style="margin-left:12px" @click="router.push(`/outbound/apps/${appId}/webhooks/${webhookId}/logs`)">历史记录</el-button>
      </template>
    </el-page-header>

    <!-- 接收端点 -->
    <el-card shadow="never" class="block" style="margin-top: 16px">
      <template #header>
        <div style="display:flex;align-items:center;gap:12px">
          <span>接收端点</span>
          <el-tag :type="connected ? 'success' : 'info'" size="small">{{ connected ? '监听中' : '未连接' }}</el-tag>
          <el-button v-if="!connected" size="small" type="primary" @click="startListen">开始监听</el-button>
          <el-button v-else size="small" @click="stopListen">停止</el-button>
          <el-button size="small" plain @click="frames = []">清空</el-button>
        </div>
      </template>
      <div v-if="webhook" style="font-size:13px;color:#555;margin-bottom:8px">
        接收地址：
        <el-tag size="small" type="warning" style="margin-right:4px">{{ webhook.method || 'POST' }}</el-tag>
        <code>{{ receiveUrl }}</code>
        <el-button link size="small" style="margin-left:6px" @click="copyUrl">复制</el-button>
      </div>
      <div v-if="webhook" style="font-size:12px;color:#888">
        编码：<strong>{{ webhook.receive_token || '—' }}</strong>
        &nbsp;|&nbsp;鉴权：<strong>{{ webhook.auth_method || 'none' }}</strong>
        &nbsp;|&nbsp;解密：<strong>{{ webhook.decrypt_method || 'none' }}</strong>
        <template v-if="webhook.decrypt_key_path">
          &nbsp;|&nbsp;解密路径：<strong>{{ webhook.decrypt_key_path }}</strong>
        </template>
      </div>
    </el-card>

    <!-- 鉴权 & 解密配置 -->
    <el-card shadow="never" class="block" style="margin-top: 12px">
      <template #header>
        <div class="cfg-header">
          <span class="cfg-header-title">鉴权 & 解密配置</span>
          <span class="cfg-header-label">鉴权方式</span>
          <el-select v-model="cfgForm.auth_method" size="small" style="width:150px">
            <el-option label="无" value="none" />
            <el-option label="HMAC-SHA256" value="hmac_sha256" />
            <el-option label="Token Header" value="token_header" />
            <el-option label="Token Query" value="token_query" />
          </el-select>
          <span class="cfg-header-label">解密方式</span>
          <el-select v-model="cfgForm.decrypt_method" size="small" style="width:160px">
            <el-option label="无" value="none" />
            <el-option label="AES-CBC-PKCS7" value="aes_cbc_pkcs7" />
            <el-option label="AES-ECB-PKCS7" value="aes_ecb_pkcs7" />
          </el-select>
          <el-button size="small" type="primary" :loading="cfgSaving" @click="saveConfig">保存</el-button>
        </div>
      </template>

      <!-- 鉴权子字段（条件展示） -->
      <el-form v-if="cfgForm.auth_method !== 'none' || cfgForm.decrypt_method !== 'none'" label-width="110px" size="small" style="margin-bottom:4px">
        <template v-if="cfgForm.auth_method === 'hmac_sha256'">
          <el-form-item label="Secret">
            <el-input v-model="cfgForm.config.secret" placeholder="HMAC 签名密钥" show-password style="width:360px" />
          </el-form-item>
        </template>
        <template v-if="cfgForm.auth_method === 'token_header'">
          <el-form-item label="Token">
            <el-input v-model="cfgForm.config.token" placeholder="Header 中的 Token 值" show-password style="width:360px" />
          </el-form-item>
          <el-form-item label="Header 名">
            <el-input v-model="cfgForm.config.header" placeholder="默认 X-Webhook-Token" style="width:240px" />
          </el-form-item>
        </template>
        <template v-if="cfgForm.auth_method === 'token_query'">
          <el-form-item label="Token">
            <el-input v-model="cfgForm.config.token" placeholder="Query 参数中的 Token 值" show-password style="width:360px" />
          </el-form-item>
          <el-form-item label="参数名">
            <el-input v-model="cfgForm.config.param" placeholder="默认 token" style="width:240px" />
          </el-form-item>
        </template>
        <template v-if="cfgForm.decrypt_method !== 'none'">
          <el-form-item label="AES Key">
            <el-input v-model="cfgForm.config.key" placeholder="Hex 字符串或原始密钥" style="width:360px" />
            <div style="font-size:11px;color:#aaa;margin-top:2px">支持 16/24/32 字节 Hex 或原始字符串；可用 &#123;&#123;app.参数名&#125;&#125; 引用应用参数</div>
          </el-form-item>
          <el-form-item label="Key 预处理">
            <el-select v-model="cfgForm.config.key_hash" style="width:200px">
              <el-option label="raw（不处理）" value="raw" />
              <el-option label="MD5 → 16 字节" value="md5" />
              <el-option label="SHA-256 → 32 字节" value="sha256" />
              <el-option label="Zero Pad → 16/24/32" value="zero_pad" />
            </el-select>
            <div style="font-size:11px;color:#aaa;margin-top:2px">SHA-256 兼容大多数开放平台（如飞书、钉钉等）</div>
          </el-form-item>
          <el-form-item label="解密字段路径">
            <el-input v-model="cfgForm.decrypt_key_path" placeholder="不填 = 整个 body；如 data.encryptedContent" style="width:360px" clearable />
            <div style="font-size:11px;color:#aaa;margin-top:2px">点分隔路径，指定 JSON body 中需解密的字段；不填则对整个 body 解密</div>
          </el-form-item>
        </template>
      </el-form>

      <el-form label-width="110px" size="small">
        <el-form-item label="返回数据 JS">
          <!-- 第一行：模板 -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
            <span style="font-size:12px;color:#888">模板：</span>
            <el-button size="small" plain @click="applyJsTemplate('passthrough')">透传</el-button>
            <el-button size="small" plain @click="applyJsTemplate('feishu')">飞书</el-button>
            <el-button size="small" plain @click="applyJsTemplate('dingtalk')">钉钉</el-button>
            <el-button size="small" plain @click="applyJsTemplate('wechat')">企业微信</el-button>
            <el-button size="small" plain @click="applyJsTemplate('extract_event')">提取事件类型</el-button>
          </div>
          <!-- 第二行：编辑器（CodeMirror，支持代码提示） -->
          <WebhookJsEditor
            v-model="cfgForm.response_transform_js"
            :min-height="150"
            style="width:600px"
          />
          <!-- 第三行：说明 -->
          <div style="font-size:11px;color:#aaa;margin-top:6px;line-height:1.8">
            ECMAScript 5，入口 <code>function main(payload)</code>，<strong>返回值</strong>作为 <code>return_data</code> 返回给调用方。<br>
            可用变量：<code>payload</code>（解密后 JSON 对象或字符串）。<br>
            内置 <code>console.log()</code> 输出到调试面板。支持 <code>payload.</code>、<code>JSON.</code>、<code>console.</code> 代码提示（Ctrl+Space）。
          </div>
        </el-form-item>

        <!-- 已观测到的事件类型 -->
        <el-form-item v-if="webhook && webhook.observed_event_types && webhook.observed_event_types.length" label="已观测类型">
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <el-tag
              v-for="et in webhook.observed_event_types"
              :key="et"
              size="small"
              type="warning"
            >{{ et }}</el-tag>
          </div>
          <div style="font-size:11px;color:#aaa;margin-top:2px">收到请求时自动从 payload 提取，可用于连接器事件类型过滤</div>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 事件类型管理 -->
    <el-card shadow="never" class="block" style="margin-top: 12px">
      <template #header>
        <div style="display:flex;align-items:center;gap:12px">
          <span>事件类型管理</span>
          <el-button size="small" type="primary" @click="openEtDialog()">新增</el-button>
        </div>
      </template>
      <el-table :data="eventTypes" size="small" style="width:100%" v-loading="etLoading">
        <el-table-column prop="event_type" label="事件类型 (event_type)" min-width="160" />
        <el-table-column prop="label" label="中文名" min-width="120" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="JSON Schema" min-width="100">
          <template #default="{ row }">
            <el-tag v-if="row.schema_json && row.schema_json.trim()" size="small" type="success">已配置</el-tag>
            <span v-else style="color:#aaa;font-size:12px">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" type="primary" @click="openEtDialog(row)">编辑</el-button>
            <el-popconfirm title="确认删除该事件类型？" @confirm="deleteEt(row)">
              <template #reference>
                <el-button link size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div v-if="eventTypes.length === 0 && !etLoading" style="text-align:center;color:#aaa;font-size:13px;padding:16px 0">
        暂无事件类型，点击「新增」添加
      </div>
    </el-card>

    <!-- 事件类型 Dialog -->
    <el-dialog
      v-model="etDialogVisible"
      :title="etForm.id ? '编辑事件类型' : '新增事件类型'"
      width="640px"
      destroy-on-close
    >
      <el-form :model="etForm" label-width="100px" size="small">
        <el-form-item label="事件类型" required>
          <el-input v-model="etForm.event_type" placeholder="如 order.created" style="width:360px" />
          <div style="font-size:11px;color:#aaa;margin-top:2px">唯一标识，对应 payload 中的事件类型字段值</div>
        </el-form-item>
        <el-form-item label="中文名">
          <el-input v-model="etForm.label" placeholder="可选，便于阅读的中文名称" style="width:280px" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="etForm.remark" type="textarea" :rows="2" placeholder="可选，说明该事件类型的用途" style="width:460px" />
        </el-form-item>
        <el-form-item label="JSON Schema">
          <el-input
            v-model="etForm.schema_json"
            type="textarea"
            :rows="8"
            placeholder='{"type":"object","properties":{"event_type":{"type":"string"}}}'
            style="width:460px;font-family:monospace;font-size:12px"
          />
          <div style="font-size:11px;color:#aaa;margin-top:2px">描述该事件 payload 结构的 JSON Schema（可选）</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="etDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="etSaving" @click="saveEt">保存</el-button>
      </template>
    </el-dialog>



    <!-- 请求记录 -->
    <el-card shadow="never" class="block" style="margin-top: 12px">
      <template #header>
        <span>请求记录</span>
        <span style="font-size:12px;color:#999;margin-left:8px">最近 {{ frames.length }} 条（最多保留 200）</span>
      </template>

      <div v-if="frames.length === 0" class="empty-hint">暂无请求，等待外部推送…</div>

      <div v-for="(f, idx) in frames" :key="idx" class="frame-item">
        <div class="frame-header" @click="f._open = !f._open">
          <span class="frame-ts">{{ fmtTs(f.ts) }}</span>
          <el-tag size="small" :type="f.error ? 'danger' : 'success'" style="margin-left:8px">
            {{ f.error ? '失败' : 'OK' }}
          </el-tag>
          <el-tag v-if="extractFrameEventType(f)" size="small" type="warning" style="margin-left:4px">
            {{ extractFrameEventType(f) }}
          </el-tag>
          <span class="frame-path">{{ f.method }} {{ f.path }}<span v-if="f.query">?{{ f.query }}</span></span>
          <el-icon style="margin-left:auto"><ArrowDown v-if="!f._open" /><ArrowUp v-else /></el-icon>
        </div>

        <div v-if="f._open" class="frame-body">
          <div v-if="f.error" class="frame-error">{{ f.error }}</div>

          <el-descriptions :column="1" border size="small" style="margin-bottom:10px">
            <el-descriptions-item v-for="(v, k) in f.headers" :key="k" :label="k">{{ v }}</el-descriptions-item>
          </el-descriptions>

          <!-- Raw body + decrypted side by side when both exist -->
          <template v-if="f.decrypted_raw !== null && f.decrypted_raw !== undefined">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <div class="frame-section-label">Raw Body（解密前）</div>
                <pre class="frame-pre">{{ f.raw_body || '(empty)' }}</pre>
              </div>
              <div>
                <div class="frame-section-label">解密内容</div>
                <pre class="frame-pre">{{ prettyJson(f.decrypted_raw) }}</pre>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="frame-section-label">Raw Body</div>
            <pre class="frame-pre">{{ f.raw_body || '(empty)' }}</pre>
          </template>

          <template v-if="f.payload !== null && f.payload !== undefined">
            <div style="display:flex;align-items:center;gap:8px;margin:8px 0 4px">
              <span class="frame-section-label" style="margin:0">Payload（最终）</span>
              <el-button
                size="small" link type="primary"
                :loading="f.__saving"
                @click="saveFrameSchema(f)"
              >生成 Schema</el-button>
              <el-tag v-if="f.__saved" size="small" type="success">已保存</el-tag>
            </div>
            <pre class="frame-pre">{{ prettyJson(f.payload) }}</pre>
          </template>

          <!-- JS console logs -->
          <template v-if="f.js_logs && f.js_logs.length">
            <div class="frame-section-label" style="margin-top:8px">JS Console</div>
            <pre class="frame-pre" style="background:#1e1e1e;color:#d4d4d4">{{ f.js_logs.join('\n') }}</pre>
          </template>

          <!-- Return data -->
          <template v-if="f.return_data !== null && f.return_data !== undefined">
            <div class="frame-section-label" style="margin-top:8px">返回数据（return_data）</div>
            <pre class="frame-pre" style="border-color:#67c23a">{{ prettyJson(extractReturnData(f.return_data)) }}</pre>
          </template>
        </div>
      </div>
    </el-card>

    <!-- cURL 模拟 -->
    <el-card shadow="never" class="block" style="margin-top: 12px">
      <template #header>
        <div style="display:flex;align-items:center;gap:12px">
          <span>cURL 模拟</span>
          <el-button size="small" type="primary" :loading="curlSending" @click="sendCurl">发送</el-button>
          <el-button size="small" plain @click="copyCurl">复制命令</el-button>
        </div>
      </template>
      <el-form label-width="90px" size="small">
        <el-form-item label="接收地址">
          <code style="font-size:12px;color:#555;word-break:break-all">{{ receiveUrl }}</code>
        </el-form-item>
        <el-form-item label="请求体">
          <el-input v-model="curlBody" type="textarea" :rows="5" placeholder='{"key":"value"}' style="font-family:monospace" />
        </el-form-item>
        <el-form-item label="附加 Header">
          <el-input v-model="curlHeaders" placeholder="Key: Value（每行一个）" type="textarea" :rows="3" style="font-family:monospace" />
        </el-form-item>
      </el-form>
      <div style="margin-top:8px">
        <div style="font-size:12px;color:#888;margin-bottom:4px">生成命令</div>
        <pre class="frame-pre">{{ curlCommand }}</pre>
      </div>

      <!-- 返回值处理 -->
      <div v-if="curlResult" style="margin-top:12px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-size:12px;color:#888">响应</span>
          <el-tag size="small" :type="curlResult.ok ? 'success' : 'danger'">HTTP {{ curlResult.status }}</el-tag>
          <el-button
              v-if="curlResult.ok && curlResult.json !== null"
              size="small" plain :loading="schemaSaving" @click="saveResponseSchema"
          >生成返回参数 Schema</el-button>
          <el-tag v-if="schemaSaved" size="small" type="success">已保存</el-tag>
        </div>
        <pre class="frame-pre" :style="curlResult.ok ? '' : 'border-color:#f56c6c;color:#f56c6c'">{{ curlResult.text }}</pre>
        <template v-if="curlResult.json !== null && curlResult.json !== undefined">
          <div style="font-size:12px;color:#888;margin:8px 0 4px">解析 JSON</div>
          <pre class="frame-pre">{{ prettyJson(curlResult.json) }}</pre>
        </template>
        <template v-if="webhook && webhook.response_schema">
          <div style="font-size:12px;color:#888;margin:8px 0 4px">已保存 Schema</div>
          <pre class="frame-pre" style="max-height:200px">{{ prettyJson(webhook.response_schema) }}</pre>
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { getOutboundWebhook, updateOutboundWebhook, listWebhookEventTypes, createWebhookEventType, updateWebhookEventType, deleteWebhookEventType, getOutboundApp } from '@/api/outbound'
import { createWebhookDebugStomp } from '@/utils/outboundWebhookDebugStomp'
import { copyText } from '@/utils/clipboard'
import WebhookJsEditor from '@/components/WebhookJsEditor.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const webhookId = computed(() => route.params.webhookId)
const appId = computed(() => route.params.appId)

const loading = ref(false)
const webhook = ref(null)
const appCode = ref('')
const connected = ref(false)
const frames = ref([])

const receiveUrl = computed(() => {
  const base = window.location.origin
  const ac = appCode.value
  const token = webhook.value?.receive_token
  if (!ac || !token) return `${base}/api/open/v1/outbound/webhooks/receive/(loading...)`
  return `${base}/api/open/v1/outbound/webhooks/receive/${ac}/${token}`
})

let stomp = null

async function load() {
  loading.value = true
  try {
    const res = await getOutboundWebhook(webhookId.value)
    webhook.value = res.data
    syncCfgForm()
    if (res.data?.app_id) {
      try {
        const ar = await getOutboundApp(res.data.app_id)
        appCode.value = ar.data?.app_code || ''
      } catch { appCode.value = '' }
    }
  } catch (e) {
    ElMessage.error('加载 Webhook 失败：' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

// --- Config form ---
const cfgForm = ref({ auth_method: 'none', decrypt_method: 'none', decrypt_key_path: '', response_transform_js: '', config: {} })
const cfgSaving = ref(false)

function syncCfgForm() {
  if (!webhook.value) return
  const config = { ...(webhook.value.config || {}) }
  if (!config.key_hash) config.key_hash = 'raw'
  cfgForm.value = {
    auth_method: webhook.value.auth_method || 'none',
    decrypt_method: webhook.value.decrypt_method || 'none',
    decrypt_key_path: webhook.value.decrypt_key_path || '',
    response_transform_js: webhook.value.response_transform_js || '',
    config,
  }
}

watch(() => cfgForm.value.auth_method, () => {
  // 不整体替换对象（会导致 Vue patch 时拿到 null 组件引用），改为逐键删除
  const cfg = cfgForm.value.config
  for (const k of Object.keys(cfg)) delete cfg[k]
})
watch(() => cfgForm.value.decrypt_method, (v) => {
  if (v === 'none') {
    delete cfgForm.value.config.key
    delete cfgForm.value.config.key_hash
  }
})

async function saveConfig() {
  if (!webhook.value) return
  cfgSaving.value = true
  try {
    const res = await updateOutboundWebhook(webhookId.value, {
      app_id: webhook.value.app_id,
      name: webhook.value.name,
      description: webhook.value.description || '',
      method: webhook.value.method,
      auth_method: cfgForm.value.auth_method,
      decrypt_method: cfgForm.value.decrypt_method,
      decrypt_key_path: cfgForm.value.decrypt_key_path,
      response_transform_js: cfgForm.value.response_transform_js,
      config: cfgForm.value.config,
      enabled: webhook.value.enabled,
    })
    webhook.value = res.data
    ElMessage.success('配置已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    cfgSaving.value = false
  }
}

// --- Listen ---
function startListen() {
  if (stomp) stomp.stop()
  stomp = createWebhookDebugStomp(webhookId.value, () => auth.token, (msg) => {
    const frame = reactive({ ...msg, _open: true, __saving: false, __saved: false })
    frames.value.unshift(frame)
    if (frames.value.length > 200) frames.value.splice(200)
  })
  stomp.start()
  connected.value = true
}

function stopListen() {
  stomp?.stop()
  stomp = null
  connected.value = false
}

// --- cURL ---
const curlBody = ref('{\n  "key": "value"\n}')
const curlHeaders = ref('')
const curlSending = ref(false)
const curlResult = ref(null)

const curlCommand = computed(() => {
  if (!webhook.value) return '# 加载中...'
  const method = webhook.value.method || 'POST'
  const url = receiveUrl.value
  const headerLines = curlHeaders.value.split('\n').filter(l => l.trim())
  const headerArgs = headerLines.map(l => `-H "${l.trim()}"`).join(' \\\n  ')
  const body = curlBody.value.trim()
  const parts = [`curl -X ${method} "${url}"`]
  parts.push(`  -H "Content-Type: application/json"`)
  if (headerArgs) parts.push(`  ${headerArgs}`)
  if (body && method !== 'GET') parts.push(`  -d '${body.replace(/'/g, "'\\''")}'`)
  return parts.join(' \\\n')
})

async function sendCurl() {
  if (!webhook.value) return
  curlSending.value = true
  curlResult.value = null
  schemaSaved.value = false
  try {
    const method = webhook.value.method || 'POST'
    const headers = { 'Content-Type': 'application/json' }
    curlHeaders.value.split('\n').filter(l => l.trim()).forEach(l => {
      const idx = l.indexOf(':')
      if (idx > 0) headers[l.slice(0, idx).trim()] = l.slice(idx + 1).trim()
    })
    const opts = { method, headers }
    if (method !== 'GET') opts.body = curlBody.value.trim()
    const res = await fetch(receiveUrl.value, opts)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    curlResult.value = { ok: res.ok, status: res.status, text, json }
  } catch (e) {
    curlResult.value = { ok: false, status: 0, text: String(e), json: null }
  } finally {
    curlSending.value = false
  }
}

// --- Schema helpers ---
function inferSchema(val) {
  if (val === null) return { type: 'null' }
  if (Array.isArray(val)) return { type: 'array', items: val.length > 0 ? inferSchema(val[0]) : {} }
  if (typeof val === 'object') {
    const props = {}
    for (const k of Object.keys(val)) props[k] = inferSchema(val[k])
    return { type: 'object', properties: props }
  }
  return { type: typeof val }
}

async function doSaveSchema(schema) {
  const res = await updateOutboundWebhook(webhookId.value, {
    app_id: webhook.value.app_id,
    name: webhook.value.name,
    description: webhook.value.description || '',
    method: webhook.value.method,
    auth_method: webhook.value.auth_method,
    decrypt_method: webhook.value.decrypt_method,
    decrypt_key_path: webhook.value.decrypt_key_path || '',
    response_transform_js: webhook.value.response_transform_js || '',
    enabled: webhook.value.enabled,
    response_schema: schema,
  })
  webhook.value = res.data
}

// Schema from cURL response
const schemaSaving = ref(false)
const schemaSaved = ref(false)

async function saveResponseSchema() {
  if (!curlResult.value?.json || !webhook.value) return
  schemaSaving.value = true
  try {
    await doSaveSchema(inferSchema(curlResult.value.json))
    schemaSaved.value = true
    ElMessage.success('Schema 已保存')
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    schemaSaving.value = false
  }
}

async function saveFrameSchema(f) {
  if (!f.payload || !webhook.value) return
  f.__saving = true
  try {
    const src = typeof f.payload === 'string' ? JSON.parse(f.payload) : f.payload
    const schema = inferSchema(src)
    const schemaStr = JSON.stringify(schema, null, 2)

    // 从 frame payload 提取事件类型，查找是否已有对应记录
    const et = extractFrameEventType(f)
    const matched = et ? eventTypes.value.find((r) => r.event_type === et) : null

    if (matched) {
      // 存在对应事件类型 → 写入事件类型表的 schema_json 并刷新列表
      await updateWebhookEventType(webhookId.value, matched.id, {
        event_type: matched.event_type,
        label: matched.label || '',
        remark: matched.remark || '',
        schema_json: schemaStr,
      })
      await loadEventTypes()
      f.__saved = true
      ElMessage.success(`Schema 已保存到事件类型「${et}」`)
    } else {
      // 无匹配事件类型 → 写入 webhook 统一 schema
      await doSaveSchema(schema)
      f.__saved = true
      ElMessage.success('Schema 已保存到 Webhook 统一 Schema')
    }
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    f.__saving = false
  }
}

function copyCurl() { copyText(curlCommand.value) }
function copyUrl() { copyText(receiveUrl.value) }

const JS_TEMPLATES = {
  passthrough: `function main(payload) {
  return payload;
}`,
  feishu: `function main(payload) {
  // 飞书事件回调：提取 event 对象，附加 event_type
  var header = payload.header || {};
  var event = payload.event || {};
  return {
    event_type: header.event_type || payload.type || '',
    app_id: header.app_id || '',
    event: event,
    raw: payload
  };
}`,
  dingtalk: `function main(payload) {
  // 钉钉事件回调：提取消息类型与内容
  return {
    event_type: payload.msgtype || payload.EventType || '',
    sender_id: (payload.senderStaffId || payload.staffId || ''),
    content: payload.text || payload.content || payload,
    raw: payload
  };
}`,
  wechat: `function main(payload) {
  // 企业微信回调：提取 MsgType 与内容
  return {
    event_type: payload.MsgType || payload.Event || '',
    from_user: payload.FromUserName || '',
    to_user: payload.ToUserName || '',
    content: payload.Content || payload.EventKey || '',
    raw: payload
  };
}`,
  extract_event: `function main(payload) {
  // 通用：尝试提取事件类型字段
  var keys = ['event_type','EventType','msgtype','MsgType','msg_type','type','Type'];
  var et = '';
  for (var i = 0; i < keys.length; i++) {
    if (payload[keys[i]]) { et = payload[keys[i]]; break; }
  }
  return { event_type: et, payload: payload };
}`
}

function applyJsTemplate(name) {
  cfgForm.value.response_transform_js = JS_TEMPLATES[name] || ''
}

const EVENT_TYPE_KEYS = ['event_type', 'EventType', 'msgtype', 'MsgType', 'msg_type', 'type', 'Type']

function extractFrameEventType(f) {
  const src = f.payload || f.decrypted_raw
  if (!src) return ''
  try {
    const obj = typeof src === 'object' ? src : JSON.parse(src)
    for (const k of EVENT_TYPE_KEYS) {
      if (obj[k] && typeof obj[k] === 'string') return obj[k]
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') {
        for (const k of EVENT_TYPE_KEYS) {
          if (v[k] && typeof v[k] === 'string') return v[k]
        }
      }
    }
  } catch {}
  return ''
}

function fmtTs(ms) {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, fractionalSecondDigits: 3 })
}

function prettyJson(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}

// 从响应对象中提取 return_data 字段；若对象本身就是内容（非包装结构）则原样返回
function extractReturnData(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'return_data' in v) {
    return v.return_data
  }
  return v
}

// --- Event Types ---
const eventTypes = ref([])
const etLoading = ref(false)
const etDialogVisible = ref(false)
const etSaving = ref(false)
const etForm = ref({ id: 0, event_type: '', label: '', remark: '', schema_json: '' })

async function loadEventTypes() {
  etLoading.value = true
  try {
    const res = await listWebhookEventTypes(webhookId.value)
    eventTypes.value = res.data || []
  } catch (e) {
    ElMessage.error('加载事件类型失败：' + (e?.message || e))
  } finally {
    etLoading.value = false
  }
}

function openEtDialog(row) {
  if (row) {
    etForm.value = { id: row.id, event_type: row.event_type, label: row.label || '', remark: row.remark || '', schema_json: row.schema_json || '' }
  } else {
    etForm.value = { id: 0, event_type: '', label: '', remark: '', schema_json: '' }
  }
  etDialogVisible.value = true
}

async function saveEt() {
  if (!etForm.value.event_type.trim()) {
    ElMessage.warning('事件类型不能为空')
    return
  }
  etSaving.value = true
  try {
    const payload = { event_type: etForm.value.event_type.trim(), label: etForm.value.label, remark: etForm.value.remark, schema_json: etForm.value.schema_json }
    if (etForm.value.id) {
      await updateWebhookEventType(webhookId.value, etForm.value.id, payload)
    } else {
      await createWebhookEventType(webhookId.value, payload)
    }
    ElMessage.success('保存成功')
    etDialogVisible.value = false
    await loadEventTypes()
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e))
  } finally {
    etSaving.value = false
  }
}

async function deleteEt(row) {
  try {
    await deleteWebhookEventType(webhookId.value, row.id)
    ElMessage.success('已删除')
    await loadEventTypes()
  } catch (e) {
    ElMessage.error('删除失败：' + (e?.message || e))
  }
}

onMounted(async () => {
  await load()
  await loadEventTypes()
  startListen()
})

onBeforeUnmount(() => {
  stomp?.stop()
})
</script>

<style scoped>
.wh-debug { padding: 20px; max-width: 1200px; }
.block { margin-top: 12px; }
.empty-hint { color: #aaa; font-size: 13px; padding: 20px 0; text-align: center; }

.cfg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cfg-header-title {
  font-weight: 600;
  margin-right: 4px;
}
.cfg-header-label {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
}

.frame-item { border: 1px solid #e4e7ed; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
.frame-header {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; cursor: pointer; background: #fafafa; font-size: 13px;
}
.frame-header:hover { background: #f0f2f5; }
.frame-ts { color: #888; font-size: 12px; white-space: nowrap; }
.frame-path { color: #333; margin-left: 8px; font-family: monospace; }
.frame-body { padding: 12px; background: #fff; }
.frame-error { color: #f56c6c; font-size: 13px; margin-bottom: 8px; }
.frame-section-label { font-size: 12px; color: #888; margin: 8px 0 4px; }
.frame-pre {
  background: #f5f7fa; border: 1px solid #e4e7ed; border-radius: 4px;
  padding: 8px 10px; font-size: 12px; font-family: monospace;
  white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow: auto;
  margin: 0;
}
</style>
