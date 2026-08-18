# 数据集表单集成 Monaco Editor - 更新说明

## 更新内容

### 1. 动态 SQL 编辑器升级

**位置**: `web/src/views/data/DatasetForm.vue`

**变更**:
- ✅ 将动态 SQL 部分的 `SqlDialectEditor` 替换为 `MonacoSQLEditor`
- ✅ 添加参数自动提取功能
- ✅ 添加 Schema 自动生成按钮
- ✅ 优化参数 Schema 输入框样式

### 2. 新增功能

#### 实时参数提取
编辑 SQL 时，Monaco Editor 会自动提取所有命名参数（`:param_name`），并识别：
- 可选参数（在 `/*? ?*/` 块中）
- 必需参数（不在可选块中）

#### 自动生成 Schema
点击"自动生成 Schema"按钮，系统会：
1. 基于提取的参数自动生成 JSON Schema
2. 根据参数名推断类型（integer / number / boolean / string）
3. 自动标记必需/可选字段
4. 生成易读的参数描述

#### Monaco Editor 功能
- ✅ 语法高亮（SQL）
- ✅ 智能补全（Ctrl+Space）
- ✅ 代码格式化（Ctrl+Shift+F）
- ✅ 参数管理侧边栏
- ✅ 可选块可视化
- ✅ 快速插入工具
- ✅ SQL 模板库

---

## 使用演示

### 场景 1：创建新的动态 SQL 数据集

1. **选择数据形态**
   - 数据形态 → 选择"动态 SQL"

2. **编写 SQL**（使用 Monaco Editor）
   ```sql
   SELECT * FROM orders
   WHERE 1=1
     /*? AND status = :status ?*/
     /*? AND user_id = :user_id ?*/
     /*? AND created_at >= :start_date ?*/
     /*? AND created_at <= :end_date ?*/
   ORDER BY created_at DESC
   ```

3. **查看提取的参数**
   - 右侧参数面板自动显示 4 个参数
   - 所有参数都标记为"可选"（因为在 `/*? ?*/` 块中）

4. **生成 Schema**
   - 点击"自动生成 Schema"按钮
   - 自动生成 JSON Schema：
   ```json
   {
     "type": "object",
     "properties": {
       "status": {
         "type": "string",
         "description": "Status"
       },
       "user_id": {
         "type": "integer",
         "description": "User Id"
       },
       "start_date": {
         "type": "string",
         "description": "Start Date"
       },
       "end_date": {
         "type": "string",
         "description": "End Date"
       }
     }
   }
   ```

5. **保存数据集**

### 场景 2：编辑现有数据集

1. **打开数据集编辑对话框**
   - SQL 内容自动加载到 Monaco Editor

2. **使用编辑器功能**
   - **快速定位参数**: 点击右侧参数卡片，自动跳转到代码位置
   - **参数类型转换**: 点击"转为可选"将必需参数转换为可选
   - **快速插入**: 点击"快速插入"按钮，插入常用代码片段
   - **格式化代码**: 点击"格式化"按钮或按 Ctrl+Shift+F

3. **更新 Schema**
   - 修改 SQL 后，点击"自动生成 Schema"更新参数定义

---

## 界面对比

### 修改前（SqlDialectEditor）
```
┌────────────────────────────────┐
│ SQL                            │
├────────────────────────────────┤
│ [简单的 Textarea 编辑器]        │
│                                │
│ SELECT * FROM users            │
│ WHERE 1=1                      │
│   AND status = :status         │
│                                │
└────────────────────────────────┘
```

### 修改后（MonacoSQLEditor）
```
┌─────────────────────────────────────────────────────┐
│ SQL 定义              [快速插入][格式化][模板]        │
├───────────────────────┬─────────────────────────────┤
│                       │  📋 参数 (1)                 │
│ Monaco Editor         │  ┌─────────────────────────┐ │
│ (语法高亮)            │  │ ⚠️ :status              │ │
│                       │  │ 必需 | 出现 1 次         │ │
│ SELECT * FROM users   │  │ [转为可选]              │ │
│ WHERE 1=1             │  └─────────────────────────┘ │
│   AND status = :status│                              │
│                       │  📦 可选块 (0)               │
│                       │  🔧 Schema                   │
└───────────────────────┴─────────────────────────────┘
```

---

## 技术实现

### 组件集成

**导入 Monaco Editor**:
```javascript
import MonacoSQLEditor from '@/components/MonacoSQLEditor.vue'
import { MagicStick } from '@element-plus/icons-vue'
```

**使用组件**:
```vue
<MonacoSQLEditor
  v-model="form.definition"
  :dialect="dsSqlDialect"
  @params-changed="handleDynamicSqlParamsChanged"
/>
```

**处理参数变化**:
```javascript
const extractedParams = ref([])

function handleDynamicSqlParamsChanged (params) {
  extractedParams.value = params
}
```

**自动生成 Schema**:
```javascript
function autoGenerateParamSchema () {
  const properties = {}
  const required = []

  extractedParams.value.forEach(param => {
    properties[param.name] = {
      type: guessParamType(param.name),
      description: formatParamDescription(param.name)
    }
    if (!param.isOptional) {
      required.push(param.name)
    }
  })

  const schema = { type: 'object', properties }
  if (required.length > 0) {
    schema.required = required
  }

  form.param_schema = JSON.stringify(schema, null, 2)
}
```

---

## 注意事项

### 1. 仅动态 SQL 模式使用

Monaco Editor 仅在以下条件下显示：
- 数据集类型 = `query`
- 数据形态 = `动态 SQL`
- 已选择数据源

其他模式（固定表、缓存表、事务）仍使用原有的 `SqlDialectEditor`。

### 2. 依赖安装

确保已安装 Monaco Editor：
```bash
cd web
npm install monaco-editor
```

### 3. 性能考虑

- Monaco Editor 首次加载可能需要 1-2 秒
- 大型 SQL（> 10000 行）可能略有延迟
- 建议使用懒加载（已在组件中实现）

### 4. 浏览器兼容性

- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅

---

## 后续增强

### 计划中的功能

- [ ] 在其他 SQL 编辑位置集成 Monaco Editor
  - 固定表模式的 SQL 编辑
  - 事务步骤 SQL 编辑
  - 缓存表查询 SQL 编辑

- [ ] 编辑器功能增强
  - SQL 语法实时验证
  - 表名和字段名自动补全
  - SQL 执行计划预览
  - 查询结果预览

- [ ] 用户体验优化
  - 保存 SQL 历史记录
  - 支持 SQL 模板收藏
  - 快捷键自定义配置
  - 深色/浅色主题切换

---

## 测试清单

### 功能测试

- [x] 新建动态 SQL 数据集
- [x] 编辑现有动态 SQL 数据集
- [x] 参数自动提取（必需参数）
- [x] 参数自动提取（可选参数）
- [x] Schema 自动生成
- [x] 参数类型推断
- [x] 保存数据集

### 边界测试

- [x] SQL 为空时的处理
- [x] 无参数时的 Schema 生成
- [x] 参数名特殊字符处理
- [x] 超大 SQL（10000+ 行）

### 兼容性测试

- [x] Chrome 浏览器
- [x] Firefox 浏览器
- [x] Safari 浏览器
- [x] Edge 浏览器

---

## 相关文档

- **Monaco Editor 使用指南**: `docs/monaco-sql-editor-guide.md`
- **动态 SQL 功能指南**: `docs/dynamic-sql-guide.md`
- **完整交付文档**: `docs/delivery/DELIVERY-2026-06-09-dynamic-sql.md`

---

**更新日期**: 2024-06-09  
**版本**: v1.1  
**状态**: ✅ 已完成并测试
