<template>
  <div class="wo-params-editor-wrap">
    <div class="editor-toolbar">
      <span class="hint">占位符格式：<code v-text="placeholderFormat"></code>，支持多参数拼接和转义字符（\n \t）</span>
      <el-button text size="small" type="primary" @click="showHelper = true">
        占位符列表
      </el-button>
    </div>
    <div ref="rootEl" class="wo-params-cm" :style="{ minHeight: minHeightPx }" />

    <!-- 占位符快速插入面板 -->
    <el-drawer v-model="showHelper" title="占位符快速插入" size="600px" direction="rtl">
      <el-tabs>
        <el-tab-pane v-for="cat in paramCategories" :key="cat" :label="cat">
          <div class="placeholder-list">
            <div
              v-for="p in workOrderEventParamsByCategory[cat]"
              :key="p.key"
              class="placeholder-item"
              @click="insertPlaceholder(p.key)"
            >
              <div class="placeholder-label">{{ p.label }}</div>
              <code class="placeholder-code" v-text="`{{${p.key}}}`"></code>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="常用模板">
          <div class="template-list">
            <div
              v-for="tpl in templates"
              :key="tpl.name"
              class="template-item"
              @click="insertTemplate(tpl.value)"
            >
              <div class="template-name">{{ tpl.name }}</div>
              <pre class="template-code">{{ tpl.value }}</pre>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { json, jsonLanguage, jsonParseLinter } from '@codemirror/lang-json'
import { linter } from '@codemirror/lint'
import { autocompletion } from '@codemirror/autocomplete'
import { placeholder as cmPlaceholder } from '@codemirror/view'
import { workOrderEventParams, workOrderEventParamsByCategory, paramCategories } from '@/views/work-orders/workOrderConst'

const props = defineProps({
  modelValue: { type: String, default: '' },
  minHeight: { type: Number, default: 200 },
  placeholder: { type: String, default: '{"key": "{{placeholder}}"}' }
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
const showHelper = ref(false)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)
const placeholderFormat = '{{key}}'

// 常用模板
const templates = [
  {
    name: '基础映射',
    value: `{
  "order_no": "{{code}}",
  "title": "{{title}}",
  "status": "{{status}}",
  "device": "{{device_name}}"
}`
  },
  {
    name: '多参数拼接',
    value: `{
  "title": "【{{priority}}】{{title}}",
  "device_info": "{{device_name}}_{{device_serial}}",
  "external_code": "{{code}}_{{device_id}}_{{type_code}}"
}`
  },
  {
    name: '详细描述（带换行）',
    value: `{
  "description": "设备信息：\\n型号：{{device_model}}\\n品牌：{{device_brand}}\\n系统：Android {{device_os_version}}\\n电量：{{device_battery}}%\\n\\n工单信息：\\n标题：{{title}}\\n优先级：{{priority}}\\n状态：{{status}}\\n提交人：{{created_by_username}}"
}`
  },
  {
    name: '完整上下文',
    value: `{
  "work_order": {
    "code": "{{code}}",
    "title": "{{title}}",
    "status": "{{status}}",
    "priority": "{{priority}}",
    "tags": "{{tags}}"
  },
  "device": {
    "name": "{{device_name}}",
    "serial": "{{device_serial}}",
    "model": "{{device_model}}",
    "group": "{{device_group}}"
  },
  "reporter": {
    "username": "{{created_by_username}}",
    "role": "{{created_by_role}}"
  }
}`
  }
]

// 占位符自动补全
function buildPlaceholderCompletion() {
  return autocompletion({
    override: [
      (context) => {
        const before = context.state.doc.sliceString(0, context.pos)

        // 触发1：输入 {{ 或在 {{ 之后
        const doubleBrace = before.match(/\{\{([^}]*)$/)
        if (doubleBrace) {
          const partial = doubleBrace[1].toLowerCase()
          const from = context.pos - doubleBrace[1].length

          const options = workOrderEventParams
            .filter(p => p.key.toLowerCase().includes(partial))
            .map(p => ({
              label: p.key,
              type: 'variable',
              detail: `${p.label} (${p.category})`,
              apply: `${p.key}}}`
            }))

          if (!options.length) return null
          return { from, options, validFor: /^[\w._]*$/ }
        }

        // 触发2：在字符串值中输入 {
        const inString = /:\s*"[^"]*\{$/.test(before)
        if (inString) {
          const from = context.pos
          const options = workOrderEventParams.map(p => ({
            label: `{{${p.key}}}`,
            type: 'variable',
            detail: `${p.label} (${p.category})`,
            apply: `{${p.key}}}`
          }))
          return { from, options, filter: false }
        }

        return null
      }
    ]
  })
}

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', border: '1px solid var(--el-border-color)', borderRadius: '4px' },
  '.cm-editor': { minHeight: 'inherit' },
  '.cm-scroller': { minHeight: 'inherit', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' },
  '.cm-content': { minHeight: 'inherit', padding: '10px 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--el-fill-color-light)',
    borderRight: '1px solid var(--el-border-color-light)'
  },
  '.cm-activeLineGutter': { backgroundColor: 'var(--el-color-primary-light-9)' }
})

function createEditor() {
  if (!rootEl.value) return

  const startState = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      json(),
      jsonLanguage,
      linter(jsonParseLinter()),
      buildPlaceholderCompletion(),
      cmPlaceholder(props.placeholder),
      editorTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !updatingFromParent) {
          emit('update:modelValue', update.state.doc.toString())
        }
      })
    ]
  })

  view = new EditorView({
    state: startState,
    parent: rootEl.value
  })
}

// 插入占位符
function insertPlaceholder(key) {
  if (!view) return
  const text = `{{${key}}}`
  const cursor = view.state.selection.main.head
  view.dispatch({
    changes: { from: cursor, insert: text },
    selection: { anchor: cursor + text.length }
  })
  view.focus()
}

// 插入模板
function insertTemplate(template) {
  if (!view) return
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: template }
  })
  view.focus()
  showHelper.value = false
}

watch(() => props.modelValue, (newVal) => {
  if (view && newVal !== view.state.doc.toString()) {
    updatingFromParent = true
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal }
    })
    updatingFromParent = false
  }
})

onMounted(() => {
  createEditor()
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})
</script>

<style scoped>
.wo-params-editor-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.hint {
  font-size: 12px;
  color: #909399;
}

.hint code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #e6a23c;
}

.wo-params-cm {
  border-radius: 4px;
  overflow: hidden;
}

/* 占位符列表 */
.placeholder-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.placeholder-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.placeholder-item:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.placeholder-label {
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

.placeholder-code {
  font-size: 12px;
  color: #909399;
  font-family: ui-monospace, monospace;
}

/* 模板列表 */
.template-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-item:hover {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.template-name {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.template-code {
  font-size: 12px;
  color: #909399;
  font-family: ui-monospace, monospace;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  margin: 0;
  max-height: 200px;
  overflow: auto;
}
</style>
