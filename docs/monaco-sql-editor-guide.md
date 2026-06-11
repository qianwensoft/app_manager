# Monaco SQL 编辑器使用指南

## 安装依赖

```bash
cd web
npm install monaco-editor
```

## 组件使用

### 基础用法

```vue
<template>
  <div>
    <MonacoSQLEditor
      v-model="sqlContent"
      :dialect="'mysql'"
      @params-changed="handleParamsChanged"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import MonacoSQLEditor from '@/components/MonacoSQLEditor.vue'

const sqlContent = ref(`SELECT * FROM users
WHERE 1=1
  /*? AND name = :name ?*/
  /*? AND age > :min_age ?*/
ORDER BY id DESC`)

const handleParamsChanged = (params) => {
  console.log('提取的参数:', params)
}
</script>
```

### 属性（Props）

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| modelValue | String | '' | SQL 内容（支持 v-model） |
| dialect | String | 'mysql' | SQL 方言（mysql/postgresql/sqlite/mssql） |

### 事件（Events）

| 事件 | 参数 | 说明 |
|------|------|------|
| update:modelValue | String | SQL 内容变化 |
| params-changed | Array | 参数列表变化 |

---

## 功能特性

### 1. 代码编辑器功能

#### Monaco Editor 特性
- ✅ 语法高亮（SQL）
- ✅ 代码补全（Ctrl+Space）
- ✅ 括号匹配
- ✅ 自动缩进
- ✅ 多光标编辑（Alt+Click）
- ✅ 代码折叠
- ✅ 小地图导航
- ✅ 查找替换（Ctrl+F / Ctrl+H）
- ✅ 格式化代码（Ctrl+Shift+F）

#### 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+K | 切换快速插入菜单 |
| Ctrl+Space | 代码补全 |
| Ctrl+/ | 注释/取消注释 |
| Ctrl+F | 查找 |
| Ctrl+H | 替换 |
| Ctrl+Shift+F | 格式化代码 |
| Alt+↑/↓ | 移动当前行 |
| Shift+Alt+↑/↓ | 复制当前行 |
| Ctrl+D | 选择下一个匹配项 |

### 2. 快速插入

点击"快速插入"按钮，快速插入常用代码片段：

- **📦 可选参数块**: `/*? AND column_name = :param_name ?*/`
- **🔤 命名参数**: `:param_name`
- **🔍 WHERE 条件**: `WHERE 1=1`
- **🔗 JOIN 关联**: `LEFT JOIN table_name ON ...`
- **⬇️ ORDER BY 排序**: `ORDER BY column_name DESC`

### 3. SQL 模板

点击"模板"下拉菜单，快速应用预设模板：

#### 基础查询模板
```sql
SELECT * FROM table_name
WHERE 1=1
  /*? AND column1 = :param1 ?*/
  /*? AND column2 = :param2 ?*/
ORDER BY id DESC
```

#### 搜索查询模板
```sql
SELECT * FROM table_name
WHERE 1=1
  /*? AND (name LIKE :keyword OR description LIKE :keyword) ?*/
  /*? AND category_id = :category_id ?*/
  /*? AND status = :status ?*/
ORDER BY id DESC
```

#### 分页查询模板
```sql
SELECT * FROM table_name
WHERE 1=1
  /*? AND status = :status ?*/
  /*? AND created_at >= :start_date ?*/
  /*? AND created_at <= :end_date ?*/
ORDER BY created_at DESC
```

#### 多表关联模板
```sql
SELECT
  a.*,
  b.name as related_name
FROM table_a a
LEFT JOIN table_b b ON a.b_id = b.id
WHERE 1=1
  /*? AND a.status = :status ?*/
  /*? AND b.type = :type ?*/
ORDER BY a.created_at DESC
```

#### 聚合统计模板
```sql
SELECT
  category_id,
  COUNT(*) as total_count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount
FROM table_name
WHERE 1=1
  /*? AND status = :status ?*/
  /*? AND created_at >= :start_date ?*/
GROUP BY category_id
ORDER BY total_amount DESC
```

### 4. 参数管理

#### 参数列表标签

自动提取 SQL 中的所有命名参数（`:param_name` 格式），显示：
- 参数名称
- 类型（可选/必需）
- 出现次数

#### 参数操作

- **定位参数**: 点击参数卡片，编辑器自动跳转并高亮
- **转为可选**: 将必需参数转换为可选参数（自动添加 `/*? ?*/` 包裹）
- **转为必需**: 将可选参数转换为必需参数（自动移除 `/*? ?*/`）

#### 参数图标

- 🔵 蓝色圆圈 ✓ = 可选参数
- 🔴 红色警告 ⚠ = 必需参数

### 5. 可选块管理

#### 可选块标签

显示所有 `/*? ... ?*/` 包裹的可选参数块：
- 块编号
- 块内容预览
- 包含的参数列表

#### 可选块操作

- **定位块**: 点击块卡片，编辑器自动选中整个可选块
- **查看参数**: 点击参数标签，跳转到对应参数

### 6. Schema 自动生成

#### Schema 标签

- 点击"生成 Schema"按钮，自动根据 SQL 中的参数生成 JSON Schema
- 类型推断：根据参数名自动推断类型
  - `*_id`, `*_count` → integer
  - `*_amount`, `*_price` → number
  - `*_enabled`, `*_active` → boolean
  - 其他 → string
- 必需/可选：根据参数是否在可选块中自动标记
- 点击"复制 Schema"，将 Schema 复制到剪贴板

#### Schema 示例

```json
{
  "type": "object",
  "properties": {
    "user_id": {
      "type": "integer",
      "description": "User Id"
    },
    "status": {
      "type": "string",
      "description": "Status"
    },
    "min_amount": {
      "type": "number",
      "description": "Min Amount"
    }
  },
  "required": ["user_id"]
}
```

---

## 实际使用场景

### 场景 1：创建新的数据集查询

1. 选择一个 SQL 模板（如"搜索查询模板"）
2. 修改表名和字段名
3. 使用"快速插入"添加更多可选条件
4. 在右侧参数列表查看提取的参数
5. 生成 Schema 并保存

### 场景 2：编辑现有查询

1. 加载现有 SQL 到编辑器
2. 在参数列表中查看所有参数
3. 点击"转为可选"将某些条件变为可选
4. 使用格式化功能美化代码
5. 保存修改

### 场景 3：调试参数问题

1. 在可选块列表中查看所有块
2. 点击块卡片定位到源码位置
3. 查看每个块包含的参数
4. 点击参数标签快速跳转
5. 修改参数名或条件

---

## 与数据集管理集成

### 在数据集编辑页面使用

```vue
<template>
  <el-form :model="datasetForm">
    <!-- 其他字段 -->

    <el-form-item label="SQL 定义">
      <MonacoSQLEditor
        v-model="datasetForm.definition"
        :dialect="dataSourceDialect"
        @params-changed="handleParamsChanged"
      />
    </el-form-item>

    <el-form-item label="参数 Schema">
      <el-input
        v-model="datasetForm.param_schema"
        type="textarea"
        :rows="10"
        readonly
      />
    </el-form-item>

    <!-- 保存按钮 -->
  </el-form>
</template>

<script setup>
import { ref, computed } from 'vue'
import MonacoSQLEditor from '@/components/MonacoSQLEditor.vue'

const datasetForm = ref({
  definition: '',
  param_schema: '',
  // ... 其他字段
})

const dataSourceDialect = computed(() => {
  // 从选中的数据源获取方言
  return 'mysql'
})

const handleParamsChanged = (params) => {
  // 自动更新参数 Schema（或手动点击生成）
  console.log('参数变化:', params)
}
</script>
```

---

## 自定义主题

Monaco Editor 支持自定义主题，可以在初始化时配置：

```javascript
// 在 MonacoSQLEditor.vue 的 initMonaco() 中修改
editor = monaco.editor.create(editorContainer.value, {
  // ... 其他配置
  theme: 'vs-dark', // 'vs' (浅色) | 'vs-dark' (深色) | 'hc-black' (高对比度)
})
```

或者注册自定义主题：

```javascript
monaco.editor.defineTheme('myCustomTheme', {
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

monaco.editor.setTheme('myCustomTheme')
```

---

## 性能优化

### 大文件处理

对于超过 10000 行的 SQL 文件，建议：

1. 禁用小地图：`minimap: { enabled: false }`
2. 减少语法高亮范围
3. 分段编辑

### 参数提取优化

参数提取使用正则表达式，在 SQL 内容变化时实时执行。如果感觉卡顿，可以：

1. 添加防抖（debounce）处理
2. 使用 Web Worker 在后台线程处理
3. 只在失去焦点时分析

---

## 常见问题

### Q: 如何禁用某些快捷键？

A: 在 `initMonaco()` 中添加：

```javascript
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
  // 自定义保存逻辑，覆盖默认行为
})
```

### Q: 如何添加自定义代码片段？

A: 修改 `insertItems` 数组：

```javascript
const insertItems = [
  // ... 现有项
  { command: 'custom', label: '🎯 自定义片段' },
]

// 在 handleInsert() 中添加对应逻辑
```

### Q: 如何自定义参数类型推断？

A: 修改 `guessType()` 函数：

```javascript
const guessType = (name) => {
  const lower = name.toLowerCase()
  if (lower.includes('email')) return 'string' // 添加自定义规则
  // ... 其他规则
  return 'string'
}
```

### Q: Monaco Editor 体积太大怎么办？

A: 使用 CDN 加载或按需导入：

```javascript
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    include: ['monaco-editor']
  }
})
```

---

## 更多资源

- [Monaco Editor 官方文档](https://microsoft.github.io/monaco-editor/)
- [Monaco Editor Playground](https://microsoft.github.io/monaco-editor/playground.html)
- [SQL 语法参考](https://www.w3schools.com/sql/)
- [动态 SQL 完整指南](./dynamic-sql-guide.md)

---

**版本**: v1.0  
**最后更新**: 2024-06-09  
**维护者**: 开发团队
