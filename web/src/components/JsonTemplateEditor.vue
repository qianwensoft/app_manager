<template>
  <div ref="rootEl" class="json-tpl-cm" :style="{ minHeight: minHeightPx }" />
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { jsonLanguage, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'
import { autocompletion } from '@codemirror/autocomplete'
import { placeholder as cmPlaceholder } from '@codemirror/view'
import { BUILTIN_FUNCS } from '@/utils/templateFuncs'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 应用参数列表 [{key, ...}] — 用于 {{app.xxx}} 补全 */
  appParams: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  minHeight: { type: Number, default: 80 }
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)

function buildCompletion(appParams) {
  return autocompletion({
    override: [
      (context) => {
        const before = context.state.doc.sliceString(0, context.pos)

        // 触发：输入 {{ 或在 {{ 之后
        const doubleBrace = before.match(/\{\{([^}]*)$/)
        if (doubleBrace) {
          const partial = doubleBrace[1].toLowerCase()
          const from = context.pos - doubleBrace[1].length

          const options = []

          // app.xxx 补全（后端占位符格式 {{app.<key>}}）
          const paramOptions = (appParams || []).map((p) => ({
            label: `app.${p.key}`,
            type: 'variable',
            detail: p.description || `应用参数: ${p.key}`,
            apply: `app.${p.key}}}`
          }))
          options.push(...paramOptions)

          // token cache 固定项
          for (const [k, detail] of [
            ['app.access_token', 'Token 缓存: access_token'],
            ['app.refresh_token', 'Token 缓存: refresh_token'],
            ['app.token_expires_at', 'Token 缓存: 过期时间 ISO8601']
          ]) {
            if (!(appParams || []).some((p) => `app.${p.key}` === k)) {
              options.push({ label: k, type: 'variable', detail, apply: `${k}}}` })
            }
          }

          // 内置函数（在 {{ }} 里作为占位符函数）
          for (const fn of BUILTIN_FUNCS) {
            options.push({
              label: fn.label,
              type: 'function',
              detail: fn.detail,
              apply: fn.apply + '}}'
            })
          }

          const filtered = options.filter((o) => o.label.toLowerCase().startsWith(partial))
          if (!filtered.length) return null
          return { from, options: filtered, validFor: /^[\w.$(),"]*$/ }
        }

        // 触发：输入 $ 开头的函数（在普通字符串值中直接使用）
        const dollarFn = before.match(/\$(\w*)$/)
        if (dollarFn) {
          const partial = dollarFn[1].toLowerCase()
          const from = context.pos - dollarFn[0].length
          const filtered = BUILTIN_FUNCS.filter((f) =>
            f.label.slice(1).toLowerCase().startsWith(partial)
          ).map((f) => ({
            label: f.label,
            type: 'function',
            detail: f.detail,
            apply: f.apply
          }))
          if (!filtered.length) return null
          return { from, options: filtered, validFor: /^[\w.$()]*$/ }
        }

        return null
      }
    ]
  })
}

const editorBaseTheme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid var(--el-border-color)', borderRadius: '4px' },
  '.cm-editor': { minHeight: 'inherit' },
  '.cm-scroller': {
    minHeight: 'inherit',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  },
  '.cm-content': { minHeight: 'inherit', padding: '8px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--el-fill-color-light)',
    color: 'var(--el-text-color-secondary)',
    borderRight: '1px solid var(--el-border-color)'
  },
  '&.cm-focused': { outline: '2px solid var(--el-color-primary-light-7)', outlineOffset: 0 }
})

// Linter that suppresses JSON errors overlapping {{...}} template spans
const templateAwareLinter = linter((view) => {
  const doc = view.state.doc.toString()
  // Find all {{...}} spans
  const spans = []
  const re = /\{\{[^}]*\}\}/g
  let m
  while ((m = re.exec(doc)) !== null) spans.push([m.index, m.index + m[0].length])

  if (spans.length === 0) {
    // No templates — run normal JSON linter
    return jsonParseLinter()(view)
  }

  // Replace each {{...}} with a same-length quoted placeholder so JSON parses cleanly
  let patched = doc
  // Work backwards to preserve offsets
  for (let i = spans.length - 1; i >= 0; i--) {
    const [s, e] = spans[i]
    const len = e - s
    // "PLACEHOLDER" padded/trimmed to same length (keep JSON string valid)
    const inner = 'x'.repeat(Math.max(0, len - 2))
    patched = patched.slice(0, s) + '"' + inner + '"' + patched.slice(e)
  }

  // Create a real EditorState with the patched doc so jsonParseLinter gets valid position methods
  const patchedState = EditorState.create({ doc: patched, extensions: [jsonLanguage] })
  const fakeDiags = jsonParseLinter()({ state: patchedState })
  return (fakeDiags || []).filter((d) => {
    return !spans.some(([s, e]) => d.from < e && d.to > s)
  })
})

function buildExtensions() {
  const ext = [
    editorBaseTheme,
    basicSetup,
    jsonLanguage,
    templateAwareLinter,
    buildCompletion(props.appParams)
  ]
  if (props.placeholder) ext.push(cmPlaceholder(props.placeholder))
  ext.push(
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || updatingFromParent) return
      const t = update.state.doc.toString()
      if (t !== props.modelValue) emit('update:modelValue', t)
    })
  )
  return ext
}

function createState(doc) {
  return EditorState.create({ doc: doc ?? '', extensions: buildExtensions() })
}

function mountEditor() {
  if (!rootEl.value || view) return
  view = new EditorView({ state: createState(props.modelValue || ''), parent: rootEl.value })
}

function destroyEditor() {
  if (view) { view.destroy(); view = null }
}

function rebuildEditor() {
  destroyEditor()
  mountEditor()
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

// appParams 变化时重建编辑器以更新补全列表
watch(() => props.appParams, rebuildEditor, { deep: true })

onMounted(mountEditor)
onBeforeUnmount(destroyEditor)
</script>

<style scoped>
.json-tpl-cm {
  width: 100%;
}
.json-tpl-cm :deep(.cm-editor) {
  border-radius: 4px;
}
</style>
