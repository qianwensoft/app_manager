<template>
  <div ref="rootEl" class="sql-dialect-cm" :class="{ 'is-disabled': readOnly }" :style="{ minHeight: minHeightPx }" />
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { sql, SQLite, MySQL, PostgreSQL, MSSQL } from '@codemirror/lang-sql'
import { highlightActiveLine, placeholder as cmPlaceholder } from '@codemirror/view'

const props = defineProps({
  modelValue: { type: String, default: '' },
  /** 与后端 normalize 一致：sqlite | mysql | postgres | sqlserver 及常见别名 */
  dialect: { type: String, default: 'sqlite' },
  /** 来自当前数据源表列表，用于表名补全 */
  tableNames: { type: Array, default: () => [] },
  placeholder: { type: String, default: '' },
  minHeight: { type: Number, default: 160 },
  readOnly: { type: Boolean, default: false },
  /** query：查询 SQL；ddl：建表 DDL，附加方言相关片段提示 */
  mode: { type: String, default: 'query' }
})

const emit = defineEmits(['update:modelValue'])

const rootEl = ref(null)
let view = null
let updatingFromParent = false

const minHeightPx = computed(() => `${props.minHeight}px`)

function normalizeDialectKey (raw) {
  const t = String(raw || '')
    .toLowerCase()
    .trim()
  if (['postgres', 'postgresql', 'pgsql', 'postgree', 'postgre'].includes(t)) return 'postgres'
  if (['mysql', 'mariadb'].includes(t)) return 'mysql'
  if (['sqlserver', 'mssql', 'sql_server', 'microsoftsqlserver'].includes(t)) return 'sqlserver'
  if (['sqlite', 'sqllite', ''].includes(t)) return 'sqlite'
  return 'sqlite'
}

function dialectObject (key) {
  switch (key) {
    case 'postgres':
      return PostgreSQL
    case 'mysql':
      return MySQL
    case 'sqlserver':
      return MSSQL
    default:
      return SQLite
  }
}

function schemaFromTableNames (names) {
  const o = {}
  for (const n of names || []) {
    if (typeof n === 'string' && n.trim()) o[n.trim()] = []
  }
  return Object.keys(o).length ? o : undefined
}

/** 方言 + 模式相关的额外补全（与 lang-sql 关键字补全并存） */
function ddlExtraCompletionSource (dialectKey, mode) {
  return (context) => {
    if (mode !== 'ddl') return null
    const word = context.matchBefore(/[\w]*$/)
    if (!word && !context.explicit) return null
    const from = word ? word.from : context.pos
    const partial = (word?.text || '').toLowerCase()

    const byDialect = {
      sqlite: [
        { label: 'INTEGER PRIMARY KEY', type: 'snippet', detail: 'SQLite' },
        { label: 'AUTOINCREMENT', type: 'keyword', detail: 'SQLite' },
        { label: 'WITHOUT ROWID', type: 'keyword', detail: 'SQLite' },
        { label: 'REAL', type: 'type' },
        { label: 'TEXT', type: 'type' },
        { label: 'BLOB', type: 'type' },
        { label: 'NUMERIC', type: 'type' }
      ],
      mysql: [
        { label: 'AUTO_INCREMENT', type: 'keyword', detail: 'MySQL' },
        { label: 'BIGINT UNSIGNED', type: 'type', detail: 'MySQL' },
        { label: 'ENGINE=InnoDB', type: 'snippet', detail: 'MySQL' },
        { label: 'DEFAULT CHARSET=utf8mb4', type: 'snippet', detail: 'MySQL' }
      ],
      postgres: [
        { label: 'BIGSERIAL', type: 'type', detail: 'PostgreSQL' },
        { label: 'SERIAL', type: 'type', detail: 'PostgreSQL' },
        { label: 'GENERATED ALWAYS AS IDENTITY', type: 'snippet', detail: 'PostgreSQL' },
        { label: 'TEXT', type: 'type' },
        { label: 'JSONB', type: 'type' }
      ],
      sqlserver: [
        { label: 'IDENTITY(1,1)', type: 'snippet', detail: 'SQL Server' },
        { label: 'NVARCHAR(255)', type: 'type', detail: 'SQL Server' },
        { label: 'BIT', type: 'type' },
        { label: 'DATETIME2', type: 'type' }
      ]
    }
    const list = byDialect[dialectKey] || byDialect.sqlite
    const filtered = list.filter((o) => o.label.toLowerCase().startsWith(partial) || partial === '')
    if (!filtered.length) return null
    return { from, options: filtered, validFor: /^[\w.]*$/i }
  }
}

const editorBaseTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    border: '1px solid var(--el-border-color)',
    borderRadius: '4px',
    backgroundColor: 'var(--el-fill-color-blank, #fff)'
  },
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

function buildExtensions (docDialect, tableNames, hint, readOnly, editorMode) {
  const dKey = normalizeDialectKey(docDialect)
  const dialect = dialectObject(dKey)
  const schema = schemaFromTableNames(tableNames)
  const sqlSupport = sql({
    dialect,
    schema,
    upperCaseKeywords: false
  })
  const ddlExtra = dialect.language.data.of({
    autocomplete: ddlExtraCompletionSource(dKey, editorMode)
  })
  const ext = [
    editorBaseTheme,
    basicSetup,
    sqlSupport,
    ddlExtra,
    highlightActiveLine(),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged || updatingFromParent) return
      const t = update.state.doc.toString()
      if (t !== props.modelValue) emit('update:modelValue', t)
    })
  ]
  if (hint) ext.push(cmPlaceholder(hint))
  return ext
}

function createState (doc, docDialect, tableNames, hint, readOnly, editorMode) {
  return EditorState.create({
    doc: doc ?? '',
    extensions: buildExtensions(docDialect, tableNames, hint, readOnly, editorMode)
  })
}

function mountEditor () {
  if (!rootEl.value || view) return
  view = new EditorView({
    state: createState(
      props.modelValue || '',
      props.dialect,
      props.tableNames,
      props.placeholder || '',
      props.readOnly,
      props.mode
    ),
    parent: rootEl.value
  })
}

function destroyEditor () {
  if (view) {
    view.destroy()
    view = null
  }
}

function remount () {
  destroyEditor()
  mountEditor()
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
  () => [
    normalizeDialectKey(props.dialect),
    props.readOnly,
    props.mode,
    (props.tableNames || []).join('\n')
  ],
  () => {
    remount()
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
.sql-dialect-cm {
  width: 100%;
}
.sql-dialect-cm :deep(.cm-editor) {
  border-radius: 4px;
}
.sql-dialect-cm.is-disabled {
  opacity: 0.72;
  pointer-events: none;
}
</style>
