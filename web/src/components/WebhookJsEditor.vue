<template>
  <div ref="rootEl" class="webhook-js-cm" :style="{ minHeight: minHeightPx }" />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript'
import { highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view'

const props = defineProps({
  modelValue: { type: String, default: '' },
  minHeight: { type: Number, default: 240 }
})
const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)

// ── autocomplete ──────────────────────────────────────────────────────────────
// Nested member tree for payload. Each node may have a `children` map for sub-keys.
// Leaf nodes (no children) produce a flat completion item.
// Nodes with children produce a completion item AND recurse to offer their children.
const payloadTree = {
  event_type: { detail: '事件类型字段（常见平台）' },
  EventType:  {},
  msgtype:    {},
  MsgType:    {},
  event:      { detail: '飞书 event 对象' },
  header:     { detail: '飞书 header 对象' },
  content:    {},
  text:       {},
  data:       {},
  // encrypted envelope used by platforms like Feishu / WeCom
  encrypt:    {
    detail: '加密信封对象',
    children: {
      header: { detail: '加密 header 字段' },
      data:   { detail: '加密 data 字段' }
    }
  }
}

const consoleMethods = [
  { label: 'log',   type: 'method', apply: 'log()' },
  { label: 'warn',  type: 'method', apply: 'warn()' },
  { label: 'error', type: 'method', apply: 'error()' }
]

const jsonStatic = [
  { label: 'parse',     type: 'method', apply: "parse('')" },
  { label: 'stringify', type: 'method', apply: 'stringify(null, null, 2)' }
]

// Resolve a dot-path like ['encrypt'] inside a tree, returning the matching node or null.
function resolveTreePath(tree, segments) {
  let node = tree
  for (const seg of segments) {
    if (!node || typeof node !== 'object') return null
    const children = node.children || node
    node = children[seg]
  }
  return node || null
}

// Build a flat completion list from a tree node's direct keys.
function treeNodeToOptions(tree) {
  return Object.entries(tree).map(([label, node]) => ({
    label,
    type: node.children ? 'namespace' : 'property',
    detail: node.detail
  }))
}

// Complete members for a dot-expression of any depth.
// `rootPrefix` is the base variable name, e.g. 'payload'.
// `rootTree` is the nested member tree for that variable.
// Handles: payload.<partial>, payload.encrypt.<partial>, etc.
function dotCompletionTree(before, pos, rootPrefix, rootTree) {
  // Escape the root prefix for use in a regex
  const esc = rootPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match: rootPrefix, then one or more .segment pairs, then a final dot and optional partial word
  const m = before.match(new RegExp(`${esc}(\\.\\w+)*\\.(\\w*)$`))
  if (!m) return null

  const partial = (m[2] || '').toLowerCase()
  const from = pos - (m[2] || '').length

  // Extract intermediate segments between rootPrefix and the final dot
  // m[1] is the last captured group of (\.\w+)*, which is only the last segment.
  // We need all intermediate segments — re-match the full chain.
  const chainMatch = before.match(new RegExp(`${esc}((?:\\.\\w+)*)\\.(\\w*)$`))
  if (!chainMatch) return null
  const chainStr = chainMatch[1] || '' // e.g. '' or '.encrypt' or '.encrypt.foo'
  const segments = chainStr ? chainStr.replace(/^\\./, '').split('.') : []

  // Navigate to the subtree for the accumulated segments
  let subtree
  if (segments.length === 0) {
    subtree = rootTree
  } else {
    const node = resolveTreePath(rootTree, segments)
    if (!node) return null
    subtree = node.children || null
    if (!subtree) return null
  }

  const list = treeNodeToOptions(subtree).filter(o => o.label.toLowerCase().startsWith(partial))
  if (!list.length) return null
  return { from, options: list, validFor: /^\w*$/ }
}

// Simple single-level dot completion for flat option arrays (console, JSON).
function dotCompletion(before, pos, prefix, options) {
  const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = before.match(new RegExp(`${esc}\\.(\\w*)$`))
  if (!m) return null
  const partial = (m[1] || '').toLowerCase()
  const from = pos - (m[1] || '').length
  const list = options.filter(o => o.label.toLowerCase().startsWith(partial))
  if (!list.length) return null
  return { from, options: list, validFor: /^\w*$/ }
}

const webhookCompletion = javascriptLanguage.data.of({
  autocomplete(context) {
    const before = context.state.doc.sliceString(0, context.pos)
    let r = dotCompletionTree(before, context.pos, 'payload', payloadTree)
    if (r) return r
    r = dotCompletion(before, context.pos, 'console', consoleMethods)
    if (r) return r
    r = dotCompletion(before, context.pos, 'JSON', jsonStatic)
    if (r) return r
    return null
  }
})

// ── theme ─────────────────────────────────────────────────────────────────────
const editorTheme = EditorView.theme({
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

const PLACEHOLDER = `// 可选：对解密后 payload 做二次处理
function main(payload) {
  return payload;
}`

function buildExtensions() {
  return [
    editorTheme,
    basicSetup,
    javascript(),
    webhookCompletion,
    highlightActiveLine(),
    cmPlaceholder(PLACEHOLDER),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || updatingFromParent) return
      const t = update.state.doc.toString()
      if (t !== props.modelValue) emit('update:modelValue', t)
    })
  ]
}

function mountEditor() {
  if (!rootEl.value || view) return
  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue || '', extensions: buildExtensions() }),
    parent: rootEl.value
  })
}

function destroyEditor() {
  if (view) { view.destroy(); view = null }
}

watch(() => props.modelValue, (v) => {
  if (!view) return
  const cur = view.state.doc.toString()
  const next = v ?? ''
  if (cur === next) return
  updatingFromParent = true
  view.dispatch({ changes: { from: 0, to: cur.length, insert: next } })
  updatingFromParent = false
})

onMounted(mountEditor)
onBeforeUnmount(destroyEditor)
</script>

<style scoped>
.webhook-js-cm { width: 100%; }
.webhook-js-cm :deep(.cm-editor) { border-radius: 4px; }
</style>
