<!--
  增强的 SQL 编辑器组件
  功能：
  - 语法高亮（SQL + 可选参数块）
  - 参数自动提取和管理
  - 快速插入可选参数块模板
  - 参数列表实时预览
  - 错误提示
-->
<template>
  <div class="sql-editor-enhanced">
    <el-card>
      <!-- 工具栏 -->
      <template #header>
        <div class="toolbar">
          <span>SQL 编辑器</span>
          <div class="toolbar-actions">
            <el-button-group>
              <el-button size="small" @click="insertOptionalBlock">
                <el-icon><Plus /></el-icon>
                插入可选块
              </el-button>
              <el-button size="small" @click="insertNamedParam">
                <el-icon><Edit /></el-icon>
                插入参数
              </el-button>
              <el-button size="small" @click="formatSQL">
                <el-icon><MagicStick /></el-icon>
                格式化
              </el-button>
            </el-button-group>

            <el-dropdown @command="handleTemplate" style="margin-left: 8px">
              <el-button size="small">
                模板 <el-icon class="el-icon--right"><arrow-down /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="basic">基础查询模板</el-dropdown-item>
                  <el-dropdown-item command="pagination">分页查询模板</el-dropdown-item>
                  <el-dropdown-item command="search">搜索查询模板</el-dropdown-item>
                  <el-dropdown-item command="join">多表关联模板</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>

      <div class="editor-container">
        <!-- 左侧：SQL 编辑区 -->
        <div class="editor-main">
          <!-- CodeMirror 编辑器 -->
          <div ref="editorRef" class="codemirror-wrapper"></div>

          <!-- 行号和错误提示 -->
          <div v-if="syntaxErrors.length > 0" class="error-hints">
            <el-alert
              v-for="(error, index) in syntaxErrors"
              :key="index"
              type="error"
              :title="`第 ${error.line} 行: ${error.message}`"
              :closable="false"
              show-icon
            />
          </div>

          <!-- 快捷键提示 -->
          <div class="shortcuts-hint">
            <el-text type="info" size="small">
              快捷键：Ctrl+Space 自动补全 | Ctrl+/ 注释 | Ctrl+Shift+F 格式化
            </el-text>
          </div>
        </div>

        <!-- 右侧：参数面板 -->
        <div class="params-panel">
          <el-tabs v-model="activeParamTab">
            <!-- 参数列表 -->
            <el-tab-pane label="参数列表" name="params">
              <div v-if="extractedParams.length === 0" class="empty-params">
                <el-empty description="SQL 中未发现参数" />
                <el-text type="info" size="small">
                  提示：使用 :param_name 格式定义参数
                </el-text>
              </div>

              <div v-else class="param-list">
                <div
                  v-for="param in extractedParams"
                  :key="param.name"
                  class="param-item"
                  :class="{ 'is-optional': param.isOptional }"
                >
                  <div class="param-header">
                    <el-tag :type="param.isOptional ? 'info' : 'warning'" size="small">
                      {{ param.isOptional ? '可选' : '必需' }}
                    </el-tag>
                    <code>:{{ param.name }}</code>
                  </div>

                  <div class="param-meta">
                    <el-text size="small">出现次数: {{ param.count }}</el-text>
                    <el-button
                      link
                      type="primary"
                      size="small"
                      @click="highlightParam(param.name)"
                    >
                      定位
                    </el-button>
                  </div>

                  <!-- 快速操作 -->
                  <div class="param-actions">
                    <el-button
                      v-if="!param.isOptional"
                      link
                      size="small"
                      @click="wrapWithOptional(param.name)"
                    >
                      转为可选
                    </el-button>
                    <el-button
                      v-else
                      link
                      size="small"
                      @click="unwrapOptional(param.name)"
                    >
                      转为必需
                    </el-button>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 可选块列表 -->
            <el-tab-pane label="可选块" name="blocks">
              <div v-if="optionalBlocks.length === 0" class="empty-blocks">
                <el-empty description="未发现可选参数块" />
                <el-button type="primary" size="small" @click="insertOptionalBlock">
                  插入第一个可选块
                </el-button>
              </div>

              <div v-else class="block-list">
                <div
                  v-for="(block, index) in optionalBlocks"
                  :key="index"
                  class="block-item"
                >
                  <div class="block-header">
                    <el-tag type="success" size="small">块 {{ index + 1 }}</el-tag>
                    <el-button
                      link
                      type="primary"
                      size="small"
                      @click="highlightBlock(block)"
                    >
                      定位
                    </el-button>
                  </div>

                  <el-input
                    :value="block.content"
                    type="textarea"
                    :rows="2"
                    readonly
                    size="small"
                  />

                  <div class="block-params">
                    <el-text size="small">包含参数：</el-text>
                    <el-tag
                      v-for="param in block.params"
                      :key="param"
                      size="small"
                      style="margin-left: 4px"
                    >
                      :{{ param }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 参数 Schema -->
            <el-tab-pane label="Schema" name="schema">
              <el-alert
                title="自动生成参数 Schema"
                description="基于 SQL 中的参数自动生成，支持手动编辑"
                type="info"
                :closable="false"
                style="margin-bottom: 12px"
              />

              <el-button
                type="primary"
                size="small"
                @click="generateSchema"
                style="margin-bottom: 12px"
              >
                <el-icon><Refresh /></el-icon>
                重新生成 Schema
              </el-button>

              <el-input
                v-model="paramSchema"
                type="textarea"
                :rows="15"
                placeholder="JSON Schema 格式"
              />

              <el-button
                type="success"
                size="small"
                @click="validateSchema"
                style="margin-top: 8px"
              >
                验证 Schema
              </el-button>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </el-card>

    <!-- 插入参数对话框 -->
    <el-dialog v-model="paramDialogVisible" title="插入命名参数" width="400px">
      <el-form :model="paramForm" label-width="100px">
        <el-form-item label="参数名">
          <el-input
            v-model="paramForm.name"
            placeholder="例如: user_id"
            @keyup.enter="confirmInsertParam"
          />
        </el-form-item>
        <el-form-item label="参数类型">
          <el-select v-model="paramForm.type" style="width: 100%">
            <el-option label="字符串 (string)" value="string" />
            <el-option label="整数 (integer)" value="integer" />
            <el-option label="数字 (number)" value="number" />
            <el-option label="布尔 (boolean)" value="boolean" />
            <el-option label="日期 (date)" value="date" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否可选">
          <el-switch v-model="paramForm.optional" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input
            v-model="paramForm.description"
            type="textarea"
            :rows="2"
            placeholder="参数说明（可选）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="paramDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmInsertParam">插入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Plus,
  Edit,
  MagicStick,
  ArrowDown,
  Refresh
} from '@element-plus/icons-vue'

// 引入 CodeMirror（需要安装依赖）
import { EditorView, basicSetup } from 'codemirror'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorState } from '@codemirror/state'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  dialect: {
    type: String,
    default: 'mysql'
  }
})

const emit = defineEmits(['update:modelValue', 'params-changed', 'schema-changed'])

// 编辑器实例
const editorRef = ref(null)
let editorView = null

// 状态
const activeParamTab = ref('params')
const syntaxErrors = ref([])
const extractedParams = ref([])
const optionalBlocks = ref([])
const paramSchema = ref('')

// 插入参数对话框
const paramDialogVisible = ref(false)
const paramForm = reactive({
  name: '',
  type: 'string',
  optional: false,
  description: ''
})

// 初始化 CodeMirror
onMounted(() => {
  initEditor()
  analyzeSQL(props.modelValue)
})

const initEditor = () => {
  if (!editorRef.value) return

  const startState = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      sql({ dialect: props.dialect }),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const content = update.state.doc.toString()
          emit('update:modelValue', content)
          analyzeSQL(content)
        }
      })
    ]
  })

  editorView = new EditorView({
    state: startState,
    parent: editorRef.value
  })
}

// 分析 SQL，提取参数和可选块
const analyzeSQL = (sql) => {
  if (!sql) {
    extractedParams.value = []
    optionalBlocks.value = []
    return
  }

  // 提取所有命名参数
  const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g
  const paramMap = new Map()
  let match

  while ((match = paramRegex.exec(sql)) !== null) {
    const name = match[1]
    if (paramMap.has(name)) {
      paramMap.get(name).count++
    } else {
      paramMap.set(name, {
        name,
        count: 1,
        isOptional: false,
        positions: []
      })
    }
    paramMap.get(name).positions.push(match.index)
  }

  // 提取可选块
  const blockRegex = /\/\*\?\s*(.*?)\s*\?\*\//gs
  const blocks = []

  while ((match = blockRegex.exec(sql)) !== null) {
    const content = match[1]
    const blockParams = []

    // 提取块内参数
    const blockParamRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g
    let paramMatch
    while ((paramMatch = blockParamRegex.exec(content)) !== null) {
      const paramName = paramMatch[1]
      blockParams.push(paramName)

      // 标记为可选参数
      if (paramMap.has(paramName)) {
        paramMap.get(paramName).isOptional = true
      }
    }

    blocks.push({
      content,
      params: [...new Set(blockParams)],
      start: match.index,
      end: match.index + match[0].length
    })
  }

  extractedParams.value = Array.from(paramMap.values()).sort((a, b) => {
    // 必需参数排前面
    if (a.isOptional !== b.isOptional) {
      return a.isOptional ? 1 : -1
    }
    return a.name.localeCompare(b.name)
  })

  optionalBlocks.value = blocks

  emit('params-changed', extractedParams.value)
}

// 插入可选参数块
const insertOptionalBlock = () => {
  if (!editorView) return

  const selection = editorView.state.selection.main
  const template = `/*? AND column_name = :param_name ?*/`

  editorView.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: template
    },
    selection: {
      anchor: selection.from + 8 // 定位到 column_name
    }
  })

  editorView.focus()
  ElMessage.success('已插入可选参数块模板')
}

// 插入命名参数
const insertNamedParam = () => {
  paramForm.name = ''
  paramForm.type = 'string'
  paramForm.optional = false
  paramForm.description = ''
  paramDialogVisible.value = true
}

const confirmInsertParam = () => {
  if (!paramForm.name.trim()) {
    ElMessage.error('请输入参数名')
    return
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(paramForm.name)) {
    ElMessage.error('参数名只能包含字母、数字和下划线，且不能以数字开头')
    return
  }

  const paramText = `:${paramForm.name}`
  const wrappedText = paramForm.optional
    ? `/*? AND column_name = ${paramText} ?*/`
    : paramText

  if (editorView) {
    const selection = editorView.state.selection.main
    editorView.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: wrappedText
      }
    })
    editorView.focus()
  }

  paramDialogVisible.value = false
  ElMessage.success('已插入参数')
}

// 格式化 SQL
const formatSQL = () => {
  if (!editorView) return

  let sql = editorView.state.doc.toString()

  // 简单格式化（可以集成 sql-formatter 库）
  sql = sql
    .replace(/\bSELECT\b/gi, 'SELECT')
    .replace(/\bFROM\b/gi, '\nFROM')
    .replace(/\bWHERE\b/gi, '\nWHERE')
    .replace(/\bAND\b/gi, '\n  AND')
    .replace(/\bOR\b/gi, '\n  OR')
    .replace(/\bORDER BY\b/gi, '\nORDER BY')
    .replace(/\bLIMIT\b/gi, '\nLIMIT')
    .replace(/\bJOIN\b/gi, '\nJOIN')
    .replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN')
    .replace(/\bRIGHT JOIN\b/gi, '\nRIGHT JOIN')

  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: sql
    }
  })

  ElMessage.success('SQL 已格式化')
}

// 高亮参数
const highlightParam = (paramName) => {
  if (!editorView) return

  const sql = editorView.state.doc.toString()
  const regex = new RegExp(`:${paramName}\\b`, 'g')
  const match = regex.exec(sql)

  if (match) {
    const pos = match.index
    editorView.dispatch({
      selection: { anchor: pos, head: pos + match[0].length }
    })
    editorView.focus()
  }
}

// 高亮可选块
const highlightBlock = (block) => {
  if (!editorView) return

  editorView.dispatch({
    selection: { anchor: block.start, head: block.end }
  })
  editorView.focus()
}

// 将参数转为可选
const wrapWithOptional = (paramName) => {
  if (!editorView) return

  const sql = editorView.state.doc.toString()
  const lines = sql.split('\n')

  // 查找包含该参数的行
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(`:${paramName}`) && !line.includes('/*?')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('AND ') || trimmed.startsWith('OR ')) {
        lines[i] = line.replace(
          trimmed,
          `/*? ${trimmed} ?*/`
        )
      }
    }
  }

  const newSQL = lines.join('\n')
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: newSQL
    }
  })

  ElMessage.success(`参数 :${paramName} 已转为可选`)
}

// 将参数转为必需
const unwrapOptional = (paramName) => {
  if (!editorView) return

  let sql = editorView.state.doc.toString()

  // 移除包含该参数的可选块标记
  const blockRegex = /\/\*\?\s*(.*?)\s*\?\*\//gs
  sql = sql.replace(blockRegex, (match, content) => {
    if (content.includes(`:${paramName}`)) {
      return content.trim()
    }
    return match
  })

  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: sql
    }
  })

  ElMessage.success(`参数 :${paramName} 已转为必需`)
}

// 生成参数 Schema
const generateSchema = () => {
  const properties = {}
  const required = []

  extractedParams.value.forEach(param => {
    properties[param.name] = {
      type: guessParamType(param.name),
      description: generateDescription(param.name)
    }

    if (!param.isOptional) {
      required.push(param.name)
    }
  })

  const schema = {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  }

  paramSchema.value = JSON.stringify(schema, null, 2)
  emit('schema-changed', schema)
  ElMessage.success('已生成参数 Schema')
}

// 根据参数名猜测类型
const guessParamType = (name) => {
  const lower = name.toLowerCase()

  if (lower.includes('id') || lower.includes('count') || lower.includes('num')) {
    return 'integer'
  }
  if (lower.includes('amount') || lower.includes('price') || lower.includes('rate')) {
    return 'number'
  }
  if (lower.includes('enabled') || lower.includes('active') || lower.includes('is_')) {
    return 'boolean'
  }
  if (lower.includes('date') || lower.includes('time') || lower.includes('_at')) {
    return 'string' // 可以标注 format: date-time
  }

  return 'string'
}

// 生成参数描述
const generateDescription = (name) => {
  const parts = name.split('_')
  const readable = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
  return readable
}

// 验证 Schema
const validateSchema = () => {
  try {
    JSON.parse(paramSchema.value)
    ElMessage.success('Schema 格式正确')
  } catch (error) {
    ElMessage.error(`Schema 格式错误: ${error.message}`)
  }
}

// SQL 模板
const handleTemplate = (command) => {
  const templates = {
    basic: `SELECT * FROM table_name
WHERE 1=1
  /*? AND column1 = :param1 ?*/
  /*? AND column2 = :param2 ?*/
ORDER BY id DESC`,

    pagination: `SELECT * FROM table_name
WHERE 1=1
  /*? AND status = :status ?*/
  /*? AND created_at >= :start_date ?*/
  /*? AND created_at <= :end_date ?*/
ORDER BY created_at DESC
LIMIT :limit OFFSET :offset`,

    search: `SELECT * FROM table_name
WHERE 1=1
  /*? AND (name LIKE :keyword OR description LIKE :keyword) ?*/
  /*? AND category_id = :category_id ?*/
  /*? AND status = :status ?*/
ORDER BY id DESC`,

    join: `SELECT
  a.*,
  b.name as related_name
FROM table_a a
LEFT JOIN table_b b ON a.b_id = b.id
WHERE 1=1
  /*? AND a.status = :status ?*/
  /*? AND b.type = :type ?*/
ORDER BY a.created_at DESC`
  }

  if (editorView && templates[command]) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: templates[command]
      }
    })
    ElMessage.success('已应用模板')
  }
}

// 监听 modelValue 变化
watch(() => props.modelValue, (newVal) => {
  if (editorView && newVal !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newVal
      }
    })
  }
})
</script>

<style scoped>
.sql-editor-enhanced {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.editor-container {
  display: flex;
  gap: 16px;
  min-height: 500px;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.codemirror-wrapper {
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  flex: 1;
}

.codemirror-wrapper :deep(.cm-editor) {
  height: 100%;
  font-size: 14px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.error-hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcuts-hint {
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  text-align: center;
}

.params-panel {
  width: 320px;
  border-left: 1px solid var(--el-border-color);
  padding-left: 16px;
}

.empty-params,
.empty-blocks {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  gap: 12px;
}

.param-list,
.block-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 450px;
  overflow-y: auto;
}

.param-item {
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  transition: all 0.3s;
}

.param-item:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-lighter);
}

.param-item.is-optional {
  border-left: 3px solid var(--el-color-info);
}

.param-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.param-header code {
  font-weight: bold;
  color: var(--el-color-primary);
}

.param-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.param-actions {
  display: flex;
  gap: 8px;
}

.block-item {
  padding: 12px;
  border: 1px solid var(--el-color-success-light-7);
  border-left: 3px solid var(--el-color-success);
  border-radius: 4px;
  background: var(--el-color-success-light-9);
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.block-params {
  margin-top: 8px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
