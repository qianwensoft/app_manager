<!--
  基于 Monaco Editor 的增强 SQL 编辑器
  功能：
  - Monaco Editor（VS Code 内核）
  - SQL 语法高亮和智能提示
  - 可选参数块可视化标记
  - 参数快速插入和管理
  - 实时参数提取
-->
<template>
  <div class="monaco-sql-editor">
    <el-card>
      <!-- 工具栏 -->
      <template #header>
        <div class="toolbar">
          <span>SQL 编辑器</span>
          <div class="toolbar-actions">
            <el-button size="small" @click="showInsertMenu = !showInsertMenu">
              <el-icon><Plus /></el-icon>
              快速插入
            </el-button>
            <el-button size="small" @click="formatCode">
              <el-icon><MagicStick /></el-icon>
              格式化
            </el-button>
            <el-dropdown @command="applyTemplate">
              <el-button size="small">
                模板 <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="basic">基础查询</el-dropdown-item>
                  <el-dropdown-item command="search">搜索查询</el-dropdown-item>
                  <el-dropdown-item command="pagination">分页查询</el-dropdown-item>
                  <el-dropdown-item command="join">多表关联</el-dropdown-item>
                  <el-dropdown-item command="aggregate">聚合统计</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </template>

      <div class="editor-layout">
        <!-- 快速插入菜单 -->
        <transition name="el-fade-in">
          <div v-if="showInsertMenu" class="insert-menu">
            <el-card shadow="hover">
              <template #header>
                <div style="display: flex; justify-content: space-between">
                  <span>快速插入</span>
                  <el-button text @click="showInsertMenu = false">
                    <el-icon><Close /></el-icon>
                  </el-button>
                </div>
              </template>

              <el-space direction="vertical" style="width: 100%">
                <el-button
                  v-for="item in insertItems"
                  :key="item.command"
                  type="primary"
                  plain
                  style="width: 100%"
                  @click="handleInsert(item.command)"
                >
                  {{ item.label }}
                </el-button>
              </el-space>
            </el-card>
          </div>
        </transition>

        <!-- 主编辑区 -->
        <div class="editor-main">
          <!-- Monaco Editor 容器 -->
          <div ref="editorContainer" class="monaco-container"></div>

          <!-- 底部信息栏 -->
          <div class="editor-statusbar">
            <div class="status-left">
              <el-tag size="small" type="info">
                {{ dialect.toUpperCase() }}
              </el-tag>
              <el-text size="small" style="margin-left: 8px">
                行 {{ cursorPosition.line }}, 列 {{ cursorPosition.column }}
              </el-text>
            </div>
            <div class="status-right">
              <el-text size="small" type="info">
                {{ extractedParams.length }} 个参数 | {{ optionalBlocks.length }} 个可选块
              </el-text>
            </div>
          </div>
        </div>

        <!-- 侧边栏 -->
        <div class="editor-sidebar">
          <el-tabs v-model="activeSidebarTab">
            <!-- 参数列表 -->
            <el-tab-pane name="params">
              <template #label>
                <span>
                  <el-icon><List /></el-icon>
                  参数 ({{ extractedParams.length }})
                </span>
              </template>

              <div v-if="extractedParams.length === 0" class="empty-state">
                <el-empty description="暂无参数" :image-size="80" />
                <el-button type="primary" size="small" @click="handleInsert('param')">
                  插入参数
                </el-button>
              </div>

              <div v-else class="param-list">
                <div
                  v-for="param in extractedParams"
                  :key="param.name"
                  class="param-card"
                  :class="{ optional: param.isOptional }"
                  @click="locateParam(param.name)"
                >
                  <div class="param-header">
                    <el-icon v-if="param.isOptional" color="#409eff">
                      <CircleCheck />
                    </el-icon>
                    <el-icon v-else color="#f56c6c">
                      <Warning />
                    </el-icon>
                    <code class="param-name">:{{ param.name }}</code>
                  </div>

                  <div class="param-meta">
                    <el-tag size="small" :type="param.isOptional ? 'info' : 'warning'">
                      {{ param.isOptional ? '可选' : '必需' }}
                    </el-tag>
                    <el-text size="small" type="info">
                      出现 {{ param.count }} 次
                    </el-text>
                  </div>

                  <div class="param-actions">
                    <el-button
                      v-if="!param.isOptional"
                      link
                      type="primary"
                      size="small"
                      @click.stop="convertToOptional(param.name)"
                    >
                      转为可选
                    </el-button>
                    <el-button
                      v-else
                      link
                      type="warning"
                      size="small"
                      @click.stop="convertToRequired(param.name)"
                    >
                      转为必需
                    </el-button>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- 可选块列表 -->
            <el-tab-pane name="blocks">
              <template #label>
                <span>
                  <el-icon><Box /></el-icon>
                  可选块 ({{ optionalBlocks.length }})
                </span>
              </template>

              <div v-if="optionalBlocks.length === 0" class="empty-state">
                <el-empty description="暂无可选块" :image-size="80" />
                <el-button type="primary" size="small" @click="handleInsert('optional')">
                  插入可选块
                </el-button>
              </div>

              <div v-else class="block-list">
                <div
                  v-for="(block, index) in optionalBlocks"
                  :key="index"
                  class="block-card"
                  @click="locateBlock(block)"
                >
                  <div class="block-header">
                    <el-tag type="success" size="small">块 {{ index + 1 }}</el-tag>
                  </div>

                  <el-input
                    :value="block.content"
                    type="textarea"
                    :rows="3"
                    readonly
                    size="small"
                    class="block-content"
                  />

                  <div v-if="block.params.length > 0" class="block-params">
                    <el-text size="small">包含参数:</el-text>
                    <div class="param-tags">
                      <el-tag
                        v-for="p in block.params"
                        :key="p"
                        size="small"
                        @click.stop="locateParam(p)"
                      >
                        :{{ p }}
                      </el-tag>
                    </div>
                  </div>
                </div>
              </div>
            </el-tab-pane>

            <!-- Schema 生成 -->
            <el-tab-pane name="schema">
              <template #label>
                <span>
                  <el-icon><Document /></el-icon>
                  Schema
                </span>
              </template>

              <div class="schema-panel">
                <el-alert
                  title="自动生成参数 Schema"
                  type="info"
                  :closable="false"
                  style="margin-bottom: 12px"
                />

                <el-button
                  type="primary"
                  size="small"
                  @click="generateSchema"
                  style="margin-bottom: 12px; width: 100%"
                >
                  <el-icon><Refresh /></el-icon>
                  生成 Schema
                </el-button>

                <el-input
                  v-model="generatedSchema"
                  type="textarea"
                  :rows="20"
                  style="font-family: monospace; font-size: 12px"
                />

                <el-button
                  type="success"
                  size="small"
                  @click="copySchema"
                  style="margin-top: 8px; width: 100%"
                >
                  <el-icon><CopyDocument /></el-icon>
                  复制 Schema
                </el-button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Plus,
  MagicStick,
  ArrowDown,
  Close,
  List,
  Box,
  Document,
  Refresh,
  CopyDocument,
  CircleCheck,
  Warning
} from '@element-plus/icons-vue'
import * as monaco from 'monaco-editor'

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

const emit = defineEmits(['update:modelValue', 'params-changed'])

// 状态
const editorContainer = ref(null)
let editor = null

const showInsertMenu = ref(false)
const activeSidebarTab = ref('params')
const cursorPosition = ref({ line: 1, column: 1 })
const extractedParams = ref([])
const optionalBlocks = ref([])
const generatedSchema = ref('')

// 快速插入项
const insertItems = [
  { command: 'optional', label: '📦 可选条件' },
  { command: 'param', label: '🔤 命名参数 {{ }}' },
  { command: 'where', label: '🔍 WHERE 条件' },
  { command: 'join', label: '🔗 JOIN 关联' },
  { command: 'orderby', label: '⬇️ ORDER BY 排序' },
]

// SQL 模板（{{name}} 占位符：参数缺失时该条件自动剔除）
const templates = {
  basic: `SELECT * FROM table_name
WHERE 1=1
  AND column1 = {{param1}}
  AND column2 = {{param2}}
ORDER BY id DESC`,

  search: `SELECT * FROM table_name
WHERE 1=1
  AND (name LIKE {{keyword}} OR description LIKE {{keyword}})
  AND category_id = {{category_id}}
  AND status = {{status}}
ORDER BY id DESC`,

  pagination: `SELECT * FROM table_name
WHERE 1=1
  AND status = {{status}}
  AND created_at >= {{start_date}}
  AND created_at <= {{end_date}}
ORDER BY created_at DESC`,

  join: `SELECT
  a.*,
  b.name as related_name
FROM table_a a
LEFT JOIN table_b b ON a.b_id = b.id
WHERE 1=1
  AND a.status = {{status}}
  AND b.type = {{type}}
ORDER BY a.created_at DESC`,

  aggregate: `SELECT
  category_id,
  COUNT(*) as total_count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount
FROM table_name
WHERE 1=1
  AND status = {{status}}
  AND created_at >= {{start_date}}
GROUP BY category_id
ORDER BY total_amount DESC`
}

// 初始化 Monaco Editor
onMounted(() => {
  nextTick(() => {
    initMonaco()
  })
})

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose()
  }
})

const initMonaco = () => {
  if (!editorContainer.value) return

  // 创建编辑器
  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue,
    language: 'sql',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: true },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    lineNumbers: 'on',
    renderWhitespace: 'selection',
    tabSize: 2,
    folding: true,
    formatOnPaste: true,
    formatOnType: true
  })

  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    const value = editor.getValue()
    emit('update:modelValue', value)
    analyzeSQL(value)
  })

  // 监听光标位置变化
  editor.onDidChangeCursorPosition((e) => {
    cursorPosition.value = {
      line: e.position.lineNumber,
      column: e.position.column
    }
  })

  // 注册自定义命令
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
    showInsertMenu.value = !showInsertMenu.value
  })

  // 初始分析
  analyzeSQL(props.modelValue)
}

// 分析 SQL
const analyzeSQL = (sql) => {
  if (!sql) {
    extractedParams.value = []
    optionalBlocks.value = []
    return
  }

  // 提取命名参数 {{name}}
  const paramRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
  const paramMap = new Map()
  let match

  while ((match = paramRegex.exec(sql)) !== null) {
    const name = match[1]
    if (paramMap.has(name)) {
      paramMap.get(name).count++
    } else {
      paramMap.set(name, { name, count: 1, isOptional: false })
    }
  }

  // 提取可选块（兼容旧 /*? ?*/ 写法）
  const blockRegex = /\/\*\?\s*(.*?)\s*\?\*\//gs
  const blocks = []

  while ((match = blockRegex.exec(sql)) !== null) {
    const content = match[1]
    const blockParams = []
    const blockParamRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g
    let paramMatch

    while ((paramMatch = blockParamRegex.exec(content)) !== null) {
      const paramName = paramMatch[1]
      blockParams.push(paramName)
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
    if (a.isOptional !== b.isOptional) {
      return a.isOptional ? 1 : -1
    }
    return a.name.localeCompare(b.name)
  })

  optionalBlocks.value = blocks
  emit('params-changed', extractedParams.value)
}

// 快速插入
const handleInsert = (command) => {
  if (!editor) return

  const selection = editor.getSelection()
  let insertText = ''

  switch (command) {
    case 'optional':
      insertText = 'AND column_name = {{param_name}}'
      break
    case 'param':
      insertText = '{{param_name}}'
      break
    case 'where':
      insertText = 'WHERE 1=1\n  '
      break
    case 'join':
      insertText = 'LEFT JOIN table_name ON a.id = table_name.a_id'
      break
    case 'orderby':
      insertText = 'ORDER BY column_name DESC'
      break
  }

  editor.executeEdits('', [{
    range: selection,
    text: insertText
  }])

  editor.focus()
  showInsertMenu.value = false
  ElMessage.success('已插入模板')
}

// 应用模板
const applyTemplate = (command) => {
  if (!editor || !templates[command]) return

  editor.setValue(templates[command])
  ElMessage.success('已应用模板')
}

// 格式化代码
const formatCode = () => {
  if (!editor) return

  editor.getAction('editor.action.formatDocument').run()
  ElMessage.success('代码已格式化')
}

// 定位参数
const locateParam = (paramName) => {
  if (!editor) return

  const model = editor.getModel()
  const content = model.getValue()
  const regex = new RegExp(`\\{\\{\\s*${paramName}\\s*\\}\\}`)
  const match = regex.exec(content)

  if (match) {
    const pos = model.getPositionAt(match.index)
    editor.setSelection({
      startLineNumber: pos.lineNumber,
      startColumn: pos.column,
      endLineNumber: pos.lineNumber,
      endColumn: pos.column + match[0].length
    })
    editor.revealPositionInCenter(pos)
    editor.focus()
  }
}

// 定位可选块
const locateBlock = (block) => {
  if (!editor) return

  const model = editor.getModel()
  const startPos = model.getPositionAt(block.start)
  const endPos = model.getPositionAt(block.end)

  editor.setSelection({
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column
  })
  editor.revealRangeInCenter({
    startLineNumber: startPos.lineNumber,
    startColumn: startPos.column,
    endLineNumber: endPos.lineNumber,
    endColumn: endPos.column
  })
  editor.focus()
}

// 转为可选参数
const convertToOptional = (paramName) => {
  if (!editor) return

  const model = editor.getModel()
  const content = model.getValue()
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(`{{${paramName}}}`) && !line.includes('/*?')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('AND ') || trimmed.startsWith('OR ')) {
        const indent = line.match(/^\s*/)[0]
        lines[i] = `${indent}/*? ${trimmed} ?*/`
      }
    }
  }

  editor.setValue(lines.join('\n'))
  ElMessage.success(`参数 {{${paramName}}} 已转为可选`)
}

// 转为必需参数
const convertToRequired = (paramName) => {
  if (!editor) return

  let content = editor.getValue()
  const blockRegex = /\/\*\?\s*(.*?)\s*\?\*\//gs

  content = content.replace(blockRegex, (match, blockContent) => {
    if (blockContent.includes(`{{${paramName}}}`)) {
      return blockContent.trim()
    }
    return match
  })

  editor.setValue(content)
  ElMessage.success(`参数 {{${paramName}}} 已转为必需`)
}

// 生成 Schema
const generateSchema = () => {
  const properties = {}
  const required = []

  extractedParams.value.forEach(param => {
    properties[param.name] = {
      type: guessType(param.name),
      description: formatDescription(param.name)
    }

    if (!param.isOptional) {
      required.push(param.name)
    }
  })

  const schema = {
    type: 'object',
    properties,
    ...(required.length > 0 && { required })
  }

  generatedSchema.value = JSON.stringify(schema, null, 2)
  ElMessage.success('Schema 已生成')
}

const guessType = (name) => {
  const lower = name.toLowerCase()
  if (lower.includes('id') || lower.includes('count')) return 'integer'
  if (lower.includes('amount') || lower.includes('price')) return 'number'
  if (lower.includes('enabled') || lower.includes('active')) return 'boolean'
  return 'string'
}

const formatDescription = (name) => {
  return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

// 复制 Schema
const copySchema = () => {
  navigator.clipboard.writeText(generatedSchema.value)
  ElMessage.success('Schema 已复制到剪贴板')
}

// 监听 props 变化
watch(() => props.modelValue, (newVal) => {
  if (editor && newVal !== editor.getValue()) {
    editor.setValue(newVal)
  }
})
</script>

<style scoped>
.monaco-sql-editor {
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

.editor-layout {
  display: flex;
  gap: 16px;
  height: 600px;
  position: relative;
}

.insert-menu {
  position: absolute;
  left: 16px;
  top: 16px;
  z-index: 100;
  width: 220px;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.monaco-container {
  flex: 1;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
}

.editor-statusbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-top: 8px;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.editor-sidebar {
  width: 340px;
  border-left: 1px solid var(--el-border-color);
  padding-left: 16px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  gap: 16px;
}

.param-list,
.block-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

.param-card,
.block-card {
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
}

.param-card:hover,
.block-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.2);
  transform: translateY(-2px);
}

.param-card.optional {
  border-left: 3px solid var(--el-color-info);
}

.param-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.param-name {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
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

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.block-content {
  margin-bottom: 8px;
}

.block-params {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.schema-panel {
  padding: 8px 0;
}
</style>
