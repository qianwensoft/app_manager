<template>
  <div ref="rootEl" class="ext-script-cm" :style="{ minHeight: minHeightPx }" />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** before_request：含 body 模板 API；after_response：含 HTTP 响应 API */
  phase: { type: String, default: 'before' },
  placeholder: { type: String, default: '' },
  minHeight: { type: Number, default: 200 }
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)

function ctxMethodOptions(phase) {
  const common = [
    { label: 'getVar', type: 'method', detail: 'ctx.getVar(占位符键)', apply: "getVar('{{}}')" },
    { label: 'setVar', type: 'method', detail: 'ctx.setVar(键, 值)', apply: "setVar('{{}}', '')" }
  ]
  const beforeOnly = [
    { label: 'getBodyTemplate', type: 'method', detail: '当前请求 Body 模板', apply: 'getBodyTemplate()' },
    { label: 'setBodyTemplate', type: 'method', detail: '替换 Body 模板', apply: "setBodyTemplate('')" }
  ]
  const afterOnly = [
    { label: 'getResponseStatus', type: 'method', detail: 'HTTP 状态码 number', apply: 'getResponseStatus()' },
    { label: 'getResponseBody', type: 'method', detail: '响应 body 字符串', apply: 'getResponseBody()' }
  ]
  if (phase === 'after') return [...common, ...afterOnly]
  return [...common, ...beforeOnly]
}

const consoleMethods = [
  { label: 'log', type: 'method', apply: 'log()' },
  { label: 'info', type: 'method', apply: 'info()' },
  { label: 'warn', type: 'method', apply: 'warn()' },
  { label: 'error', type: 'method', apply: 'error()' },
  { label: 'debug', type: 'method', apply: 'debug()' }
]

const jsonStatic = [
  { label: 'parse', type: 'method', apply: "parse('')" },
  { label: 'stringify', type: 'method', apply: 'stringify(null)' }
]

function dotCompletion(before, pos, prefix, options) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = before.match(new RegExp(`${esc}\\.(\\w*)$`))
  if (!m) return null
  const partial = (m[1] || '').toLowerCase()
  const from = pos - (m[1] || '').length
  const list = options.filter((o) => o.label.toLowerCase().startsWith(partial))
  if (!list.length) return null
  return { from, options: list, validFor: /^\w*$/ }
}

function buildOutboundApiCompletion(phase) {
  return javascriptLanguage.data.of({
    autocomplete(context) {
      const before = context.state.doc.sliceString(0, context.pos)
      const ph = phase === 'after' ? 'after' : 'before'
      let r = dotCompletion(before, context.pos, 'ctx', ctxMethodOptions(ph))
      if (r) return r
      r = dotCompletion(before, context.pos, 'console', consoleMethods)
      if (r) return r
      r = dotCompletion(before, context.pos, 'JSON', jsonStatic)
      if (r) return r
      return null
    }
  })
}

const editorBaseTheme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid var(--el-border-color)', borderRadius: '4px' },
  '.cm-editor': { minHeight: 'inherit' },
  '.cm-scroller': { minHeight: 'inherit', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { minHeight: 'inherit', padding: '10px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--el-fill-color-light)',
    color: 'var(--el-text-color-secondary)',
    borderRight: '1px solid var(--el-border-color)'
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--el-fill-color)' },
  '&.cm-focused': { outline: '2px solid var(--el-color-primary-light-7)', outlineOffset: 0 }
})

function buildExtensions(phase, hint) {
  const ext = [
    editorBaseTheme,
    basicSetup,
    javascript(),
    buildOutboundApiCompletion(phase),
    highlightActiveLine()
  ]
  if (hint) ext.push(cmPlaceholder(hint))
  return [
    ...ext,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || updatingFromParent) return
      const t = update.state.doc.toString()
      if (t !== props.modelValue) emit('update:modelValue', t)
    })
  ]
}

function createState(doc, phase, hint) {
  return EditorState.create({
    doc: doc ?? '',
    extensions: buildExtensions(phase, hint)
  })
}

function mountEditor() {
  if (!rootEl.value || view) return
  const phase = props.phase === 'after' ? 'after' : 'before'
  view = new EditorView({
    state: createState(props.modelValue || '', phase, props.placeholder || ''),
    parent: rootEl.value
  })
}

function destroyEditor() {
  if (view) {
    view.destroy()
    view = null
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!view) return
    const cur = view.state.doc.toString()
    const next = v ?? ''
    if (cur === next) return
    updatingFromParent = true
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: next }
    })
    updatingFromParent = false
  }
)

watch(
  () => props.phase,
  () => {
    destroyEditor()
    mountEditor()
  }
)

onMounted(() => {
  mountEditor()
})

onBeforeUnmount(() => {
  destroyEditor()
})
</script>

<style scoped>
.ext-script-cm {
  width: 100%;
}
.ext-script-cm :deep(.cm-editor) {
  border-radius: 4px;
}
</style>
