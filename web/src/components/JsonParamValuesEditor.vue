<template>
  <div class="json-param-wrap">
    <div ref="rootEl" class="json-param-cm" :style="{ minHeight: minHeightPx }" />
    <p v-if="hintText" class="field-tip json-param-hint">{{ hintText }}</p>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json, jsonLanguage, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'
import { highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** SQL {{name}} 与 param_schema 合并后的键名，用于补全 */
  suggestedKeys: { type: Array, default: () => [] },
  minHeight: { type: Number, default: 200 },
  placeholder: { type: String, default: '' },
  hintText: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)

function demoValueForParamName (name) {
  const n = String(name).toLowerCase()
  if (n === 'id' || n.endsWith('_id')) return 1
  if (n.includes('email')) return 'demo@example.com'
  if (n.includes('phone') || n.includes('mobile')) return '13800138000'
  if (n.includes('name') || n.includes('title') || n.includes('code') || n.includes('slug')) return 'demo'
  if (n === 'limit' || n === 'page_size' || n === 'size') return 10
  if (n === 'offset' || n === 'page') return 0
  if (n.includes('count') || n.includes('num') || n.includes('amount') || n.includes('qty')) return 1
  if (n.includes('time') || n.includes('date')) return '2026-01-01'
  if (n.includes('enabled') || n === 'active' || n === 'deleted') return 0
  return null
}

function buildParamAutocomplete (keys) {
  return (context) => {
    if (!keys?.length) return null
    const docBefore = context.state.doc.sliceString(0, context.pos)
    const tail = docBefore.slice(Math.max(0, docBefore.length - 160))

    const quoted = tail.match(/"([A-Za-z_][\w]*)$/)
    if (quoted) {
      const partial = quoted[1]
      const from = context.pos - partial.length
      const opts = keys
        .filter((k) => k.startsWith(partial))
        .map((k) => ({
          label: k,
          type: 'property',
          detail: JSON.stringify(demoValueForParamName(k)),
          apply: (v, _c, fromPos, toPos) => {
            const dv = demoValueForParamName(k)
            const lit = JSON.stringify(dv)
            const ins = `${k}": ${lit}`
            v.dispatch({ changes: { from: fromPos, to: toPos, insert: ins } })
          }
        }))
      if (!opts.length) return null
      return { from, to: context.pos, options: opts, filter: false }
    }

    const afterBraceOrComma = /\{\s*$/.test(tail) || /,\s*$/.test(tail)
    if (afterBraceOrComma) {
      const from = context.pos
      const opts = keys.map((k) => ({
        label: `"${k}"`,
        type: 'property',
        detail: JSON.stringify(demoValueForParamName(k)),
        apply: (v, _c, fromPos, toPos) => {
          const lit = JSON.stringify(demoValueForParamName(k))
          const sep = /\{\s*$/.test(tail) ? '' : ' '
          v.dispatch({ changes: { from: fromPos, to: toPos, insert: `${sep}"${k}": ${lit}` } })
        }
      }))
      return { from, options: opts, filter: false }
    }

    return null
  }
}

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

function buildExtensions (keys, hint) {
  const ext = [
    editorTheme,
    basicSetup,
    json(),
    jsonLanguage.data.of({ autocomplete: buildParamAutocomplete(keys) }),
    linter(jsonParseLinter()),
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

function createState (doc, keys, hint) {
  return EditorState.create({
    doc: doc ?? '',
    extensions: buildExtensions(keys, hint)
  })
}

function mountEditor () {
  if (!rootEl.value || view) return
  const keys = Array.isArray(props.suggestedKeys) ? [...props.suggestedKeys] : []
  view = new EditorView({
    state: createState(props.modelValue || '', keys, props.placeholder || ''),
    parent: rootEl.value
  })
}

function destroyEditor () {
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
  () => [...(props.suggestedKeys || [])],
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
.json-param-wrap {
  width: 100%;
}
.json-param-cm {
  width: 100%;
}
.json-param-cm :deep(.cm-editor) {
  border-radius: 4px;
}
.json-param-hint {
  margin-top: 6px;
  margin-bottom: 0;
}
</style>
