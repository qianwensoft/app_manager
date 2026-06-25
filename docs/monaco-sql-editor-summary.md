# Monaco SQL 编辑器 - 完整实现总结

## 📦 组件清单

### 核心组件

| 文件 | 说明 | 功能 |
|------|------|------|
| `MonacoSQLEditor.vue` | Monaco Editor SQL 编辑器 | • VS Code 内核<br>• 语法高亮<br>• 智能提示<br>• 参数管理<br>• 可选块管理<br>• Schema 生成 |

### 依赖安装

```bash
cd web
npm install monaco-editor
```

---

## 🎯 核心功能

### 1. 专业代码编辑器（Monaco Editor）

✅ **VS Code 同款编辑体验**
- 语法高亮（SQL）
- 智能补全（Ctrl+Space）
- 括号匹配和自动闭合
- 多光标编辑（Alt+Click）
- 代码折叠
- 小地图导航
- 查找替换（Ctrl+F / Ctrl+H）
- 代码格式化（Ctrl+Shift+F）

### 2. 动态参数管理

**实时参数提取**
- 自动识别 `:param_name` 格式参数
- 区分可选参数和必需参数
- 显示参数出现次数
- 一键定位参数位置

**参数转换**
- 必需 → 可选：自动添加 `/*? ?*/` 包裹
- 可选 → 必需：自动移除 `/*? ?*/` 标记

### 3. 可选块可视化

**块列表展示**
- 显示所有 `/*? ... ?*/` 块
- 预览块内容
- 列出块内参数
- 点击定位到源码

### 4. 快速插入工具

**代码片段**
- 📦 可选参数块
- 🔤 命名参数
- 🔍 WHERE 条件
- 🔗 JOIN 关联
- ⬇️ ORDER BY 排序

**SQL 模板**
- 基础查询
- 搜索查询
- 分页查询
- 多表关联
- 聚合统计

### 5. Schema 自动生成

**智能类型推断**
- `*_id`, `*_count` → integer
- `*_amount`, `*_price` → number
- `*_enabled`, `*_active` → boolean
- `*_date`, `*_time`, `*_at` → string (date)
- 其他 → string

**自动标记必需/可选**
- 在可选块中的参数 → 非必需
- 不在可选块中的参数 → 必需

---

## 💻 使用示例

### 基础使用

```vue
<template>
  <MonacoSQLEditor
    v-model="sql"
    dialect="mysql"
    @params-changed="handleParamsChanged"
  />
</template>

<script setup>
import { ref } from 'vue'
import MonacoSQLEditor from '@/components/MonacoSQLEditor.vue'

const sql = ref(`SELECT * FROM users
WHERE 1=1
  /*? AND name = :name ?*/
  /*? AND age > :min_age ?*/
ORDER BY id DESC`)

const handleParamsChanged = (params) => {
  console.log('提取的参数:', params)
  // params 结构:
  // [
  //   { name: 'name', count: 1, isOptional: true },
  //   { name: 'min_age', count: 1, isOptional: true }
  // ]
}
</script>
```

### 与数据集表单集成

```vue
<template>
  <el-card>
    <el-form :model="form" label-width="120px">
      <el-form-item label="数据集名称">
        <el-input v-model="form.name" />
      </el-form-item>

      <el-form-item label="数据源">
        <el-select v-model="form.data_source_id">
          <el-option
            v-for="ds in dataSources"
            :key="ds.id"
            :label="ds.name"
            :value="ds.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="SQL 定义">
        <MonacoSQLEditor
          v-model="form.definition"
          :dialect="currentDialect"
          @params-changed="updateParamSchema"
        />
      </el-form-item>

      <el-form-item label="参数 Schema">
        <el-input
          v-model="form.param_schema"
          type="textarea"
          :rows="8"
          placeholder="点击编辑器中的'生成 Schema'按钮"
        />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="saveDataset">
          保存数据集
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import MonacoSQLEditor from '@/components/MonacoSQLEditor.vue'
import { createDataset, updateDataset } from '@/api/dataset'

const props = defineProps({
  datasetId: Number
})

const form = ref({
  name: '',
  data_source_id: null,
  definition: '',
  param_schema: '',
  kind: 'query'
})

const dataSources = ref([])

const currentDialect = computed(() => {
  const ds = dataSources.value.find(d => d.id === form.value.data_source_id)
  return ds?.type || 'mysql'
})

const updateParamSchema = (params) => {
  // 可以在这里自动更新 param_schema
  // 或者让用户手动点击编辑器中的"生成 Schema"按钮
  console.log('参数更新:', params)
}

const saveDataset = async () => {
  try {
    if (props.datasetId) {
      await updateDataset(props.datasetId, form.value)
    } else {
      await createDataset(form.value)
    }
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error('保存失败: ' + error.message)
  }
}
</script>
```

---

## 🎨 界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  SQL 编辑器                          [快速插入] [格式化] [模板] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────┐  ┌─────────────────────────┐ │
│  │                          │  │  📋 参数 (3)             │ │
│  │                          │  │  ┌─────────────────────┐ │ │
│  │  [快速插入菜单]           │  │  │ ⚠️ :user_id         │ │ │
│  │  📦 可选参数块            │  │  │ 必需 | 出现 1 次     │ │ │
│  │  🔤 命名参数              │  │  │ [转为可选]          │ │ │
│  │  🔍 WHERE 条件            │  │  └─────────────────────┘ │ │
│  │  🔗 JOIN 关联             │  │                          │ │
│  │  ⬇️ ORDER BY 排序         │  │  ┌─────────────────────┐ │ │
│  │                          │  │  │ ✓ :status           │ │ │
│  │  Monaco Editor           │  │  │ 可选 | 出现 2 次     │ │ │
│  │  (代码编辑区域)           │  │  │ [转为必需]          │ │ │
│  │                          │  │  └─────────────────────┘ │ │
│  │                          │  │                          │ │
│  │                          │  │  📦 可选块 (2)           │ │
│  │                          │  │  🔧 Schema               │ │
│  │                          │  │                          │ │
│  └──────────────────────────┘  └─────────────────────────┘ │
│                                                               │
│  [MySQL] 行 15, 列 8        3 个参数 | 2 个可选块            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 高级功能

### 1. 自定义快捷键

```javascript
// 在 initMonaco() 中添加
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
  () => {
    // 自定义保存逻辑
    emit('save')
  }
)
```

### 2. 自定义主题

```javascript
monaco.editor.defineTheme('customTheme', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6A9955' },
    { token: 'keyword', foreground: '569CD6' },
  ],
  colors: {
    'editor.background': '#1E1E1E',
  }
})

monaco.editor.setTheme('customTheme')
```

### 3. 代码片段（Snippets）

```javascript
monaco.languages.registerCompletionItemProvider('sql', {
  provideCompletionItems: () => {
    return {
      suggestions: [
        {
          label: 'optional-block',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '/*? AND ${1:column} = :${2:param} ?*/',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: '插入可选参数块'
        }
      ]
    }
  }
})
```

---

## 📊 性能优化

### 1. 懒加载 Monaco Editor

```javascript
// 使用动态导入
const initMonaco = async () => {
  const monaco = await import('monaco-editor')
  // 初始化编辑器
}
```

### 2. 参数提取防抖

```javascript
import { debounce } from 'lodash-es'

const analyzeSQL = debounce((sql) => {
  // 分析逻辑
}, 300)
```

### 3. Web Worker 处理

```javascript
// 创建 worker
const worker = new Worker('/sql-analyzer.worker.js')

worker.postMessage({ type: 'analyze', sql: content })

worker.onmessage = (e) => {
  const { params, blocks } = e.data
  extractedParams.value = params
  optionalBlocks.value = blocks
}
```

---

## 🔧 常见问题

### Q1: Monaco Editor 体积太大？

**A**: 使用 CDN 或按需加载

```javascript
// vite.config.js
export default {
  optimizeDeps: {
    include: ['monaco-editor']
  }
}
```

### Q2: 如何支持更多 SQL 方言？

**A**: Monaco Editor 内置支持多种 SQL 方言，通过 `dialect` prop 切换：

```vue
<MonacoSQLEditor
  :dialect="'postgresql'"  <!-- mysql | postgresql | mssql | sqlite -->
/>
```

### Q3: 如何自定义参数识别规则？

**A**: 修改 `analyzeSQL()` 中的正则表达式：

```javascript
// 默认: :param_name
const paramRegex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g

// 自定义: ${param_name} 或 #{param_name}
const paramRegex = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
```

### Q4: 如何添加 SQL 验证？

**A**: 集成后端验证 API：

```javascript
const validateSQL = async (sql) => {
  try {
    const { data } = await api.post('/datasets/validate-sql', {
      sql,
      dialect: props.dialect
    })
    // 显示验证结果
  } catch (error) {
    // 显示错误
  }
}

// 在编辑器内容变化时触发
editor.onDidChangeModelContent(
  debounce(() => {
    validateSQL(editor.getValue())
  }, 1000)
)
```

---

## 📚 相关文档

1. **动态 SQL 使用指南**: `docs/dynamic-sql-guide.md`
2. **技术实现文档**: `docs/dynamic-sql-implementation.md`
3. **Monaco Editor 官方文档**: https://microsoft.github.io/monaco-editor/

---

## ✅ 功能清单

- [x] Monaco Editor 集成
- [x] SQL 语法高亮
- [x] 智能代码补全
- [x] 实时参数提取
- [x] 参数类型标识（可选/必需）
- [x] 参数快速定位
- [x] 参数类型转换（可选↔必需）
- [x] 可选块可视化
- [x] 可选块定位
- [x] 快速插入菜单
- [x] SQL 模板库
- [x] Schema 自动生成
- [x] 类型智能推断
- [x] 代码格式化
- [x] 光标位置显示
- [x] 统计信息展示

---

## 🎯 后续增强

### 计划中的功能

- [ ] SQL 语法实时验证
- [ ] 表结构智能提示
- [ ] 字段名自动补全
- [ ] SQL 执行计划预览
- [ ] 历史记录管理
- [ ] 协同编辑（多人）
- [ ] SQL 片段库（用户自定义）
- [ ] 快捷键自定义配置
- [ ] 深色/浅色主题切换
- [ ] 导入/导出 SQL 文件

### 集成建议

1. **在数据集管理页面使用**
   - 替换现有的 textarea
   - 提供更好的编辑体验

2. **在数据接口配置使用**
   - 编辑事务步骤 SQL
   - 管理复杂查询

3. **在查询测试页面使用**
   - 临时 SQL 测试
   - 参数调试

---

**版本**: v1.0  
**创建日期**: 2024-06-09  
**状态**: ✅ 完成，可投入使用  
**依赖**: monaco-editor ^0.44.0
