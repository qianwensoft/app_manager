<template>
  <div class="ext-ai">
    <div class="ext-ai-bar">
      <el-button size="small" text type="primary" @click="expanded = !expanded">
        <el-icon style="margin-right: 4px"><MagicStick /></el-icon>
        AI 助手{{ expanded ? '（收起）' : '' }}
      </el-button>
      <span class="ext-ai-hint">用自然语言描述需求，AI 按当前阶段生成 {{ phaseLabel }} 脚本</span>
    </div>

    <div v-if="expanded" class="ext-ai-body">
      <!-- 对话记录 -->
      <div v-if="messages.length" class="ext-ai-msgs">
        <div v-for="(m, i) in messages" :key="i" :class="['ext-ai-msg', m.role]">
          <span class="ext-ai-role">{{ m.role === 'user' ? '我' : 'AI' }}</span>
          <span class="ext-ai-text">{{ m.content }}</span>
        </div>
      </div>

      <!-- 流式输出区 -->
      <div v-if="streaming || streamText" class="ext-ai-stream">
        <span class="ext-ai-role">AI</span>
        <span class="ext-ai-text">{{ streamText || '生成中…' }}</span>
      </div>

      <!-- 待应用代码预览 -->
      <div v-if="pendingCode" class="ext-ai-preview">
        <div class="ext-ai-preview-head">
          <span>生成的脚本（预览）</span>
          <div>
            <el-button size="small" type="primary" @click="applyPending">应用到编辑器</el-button>
            <el-button size="small" @click="pendingCode = ''">丢弃</el-button>
          </div>
        </div>
        <pre class="ext-ai-code">{{ pendingCode }}</pre>
      </div>

      <!-- 输入框 -->
      <div class="ext-ai-input">
        <el-input
          v-model="draft"
          type="textarea"
          :rows="2"
          :disabled="streaming"
          placeholder="例如：解析响应 JSON 的 data，把一级键写入 context"
          @keydown.enter.exact.prevent="send"
        />
        <div class="ext-ai-actions">
          <el-button size="small" :loading="streaming" type="primary" :disabled="!draft.trim()" @click="send">
            发送
          </el-button>
          <el-button size="small" :disabled="streaming || !messages.length" @click="resetChat">清空对话</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick } from '@element-plus/icons-vue'

const props = defineProps({
  phase: { type: String, default: 'before' }, // 'before' | 'after'
  appId: { type: [Number, String], default: 0 },
  currentCode: { type: String, default: '' },
  // 自定义 AI 接口地址；缺省用应用级 /api/outbound/apps/:appId/script-ai。
  // 连接器场景传 '/api/outbound/connectors/script-ai'（不依赖具体 app）。
  endpoint: { type: String, default: '' }
})
const emit = defineEmits(['apply'])

const expanded = ref(false)
const draft = ref('')
const messages = ref([]) // { role: 'user'|'assistant', content }
const streaming = ref(false)
const streamText = ref('')
const pendingCode = ref('')

const phaseLabel = computed(() => (props.phase === 'after' ? '响应后' : '请求前'))

function resetChat() {
  messages.value = []
  streamText.value = ''
  pendingCode.value = ''
}

async function send() {
  const text = draft.value.trim()
  if (!text || streaming.value) return
  const url = props.endpoint || `/api/outbound/apps/${props.appId}/script-ai`
  if (!props.endpoint && !props.appId) {
    ElMessage.warning('请先保存应用后再使用 AI 助手')
    return
  }
  messages.value.push({ role: 'user', content: text })
  draft.value = ''
  streaming.value = true
  streamText.value = ''
  pendingCode.value = ''

  const token = localStorage.getItem('token') || ''
  const payload = {
    phase: props.phase === 'after' ? 'after' : 'before',
    current_code: props.currentCode || '',
    messages: messages.value.map((m) => ({ role: m.role, content: m.content }))
  }

  let acc = ''
  let gotCode = ''
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    })
    if (!resp.ok || !resp.body) {
      let msg = `HTTP ${resp.status}`
      try {
        const d = await resp.json()
        if (d?.error) msg = d.error
      } catch (e) { /* ignore */ }
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
        try {
          parsed = JSON.parse(data)
        } catch (e) {
          continue
        }
        if (event === 'delta') {
          acc += parsed.text || ''
          streamText.value = acc
        } else if (event === 'done') {
          gotCode = parsed.code || ''
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
    const finalCode = gotCode || acc
    if (finalCode) {
      messages.value.push({ role: 'assistant', content: '已生成脚本，请在下方预览后应用。' })
      pendingCode.value = finalCode
    }
  }
}

function applyPending() {
  if (!pendingCode.value) return
  emit('apply', pendingCode.value)
  pendingCode.value = ''
}
</script>

<style scoped>
.ext-ai {
  margin: 8px 0 4px;
}
.ext-ai-bar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ext-ai-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.ext-ai-body {
  margin-top: 8px;
  padding: 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}
.ext-ai-msgs {
  max-height: 160px;
  overflow-y: auto;
  margin-bottom: 8px;
}
.ext-ai-msg {
  display: flex;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 4px;
}
.ext-ai-stream {
  display: flex;
  gap: 6px;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
  color: var(--el-text-color-regular);
}
.ext-ai-role {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--el-color-primary);
}
.ext-ai-msg.user .ext-ai-role {
  color: var(--el-text-color-secondary);
}
.ext-ai-text {
  white-space: pre-wrap;
  word-break: break-word;
}
.ext-ai-preview {
  margin-bottom: 8px;
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 6px;
  overflow: hidden;
}
.ext-ai-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--el-color-primary-light-9);
  font-size: 13px;
}
.ext-ai-code {
  margin: 0;
  padding: 10px;
  max-height: 260px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--el-fill-color-light);
  white-space: pre;
}
.ext-ai-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ext-ai-actions {
  display: flex;
  gap: 8px;
}
</style>
