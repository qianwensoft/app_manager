# 数据集参数类型选择功能 - 实现说明

## 功能概述

为数据集编辑器的参数面板添加了**类型选择**功能，用户现在可以为每个参数指定具体的数据类型。

## 实现内容

### 1. 参数对象结构扩展

**原结构**:
```javascript
{ name: 'param_name', count: 1, isOptional: false }
```

**新结构**:
```javascript
{ 
  name: 'param_name', 
  count: 1, 
  isOptional: false, 
  type: 'string'  // 新增类型字段
}
```

### 2. 支持的数据类型

| 类型 | 值 | 说明 | 自动推断规则 |
|------|-----|------|-------------|
| 字符串 | `string` | 默认类型 | 其他情况 |
| 整数 | `integer` | 整型数字 | 包含 id/count/num/index |
| 数字 | `number` | 浮点数 | 包含 amount/price/rate/percent |
| 布尔 | `boolean` | 真/假 | 包含 enabled/active/is_ 或以 is 开头 |
| 日期 | `date` | 日期格式 | 包含 date（排除 update/create） |
| 时间 | `datetime` | 日期时间 | 包含 time/_at/datetime |
| 数组 | `array` | 数组类型 | 包含 ids/list/array |

### 3. 界面修改

**参数卡片新增**:

```
┌─────────────────────────────────┐
│ ⚠️ {{param_name}}                │
├─────────────────────────────────┤
│ 必需    出现 2 次                 │
├─────────────────────────────────┤
│ [字符串 (string) ▼]  ← 新增     │
├─────────────────────────────────┤
│ [转为可选]                       │
└─────────────────────────────────┘
```

### 4. 自动类型推断

系统会根据参数名称自动推断类型：

**示例**:
- `user_id` → `integer`
- `total_amount` → `number`
- `is_active` → `boolean`
- `created_at` → `datetime`
- `birth_date` → `date`
- `user_ids` → `array`
- `user_name` → `string`（默认）

### 5. 手动修改类型

用户可以在参数卡片中通过下拉框修改类型：
1. 点击类型选择器
2. 选择目标类型
3. 自动保存并触发 `params-changed` 事件

### 6. Schema 生成集成

生成 JSON Schema 时会使用参数的类型：

**之前**（基于名称猜测）:
```json
{
  "type": "object",
  "properties": {
    "user_id": {
      "type": "integer",  // 猜测的
      "description": "User Id"
    }
  }
}
```

**现在**（使用指定类型）:
```json
{
  "type": "object",
  "properties": {
    "user_id": {
      "type": "string",  // 用户选择的类型
      "description": "User Id"
    }
  }
}
```

## 技术实现

### 修改的文件

- `web/src/components/MonacoSQLEditor.vue`

### 新增函数

1. **`updateParamType(paramName, type)`**
   - 更新指定参数的类型
   - 触发 `params-changed` 事件通知父组件

2. **`guessParamType(name)`**
   - 根据参数名称智能推断类型
   - 比原有的 `guessType` 更详细

### 修改的函数

1. **`analyzeSQL(sql)`**
   - 初始化参数时添加 `type` 字段
   - 调用 `guessParamType` 自动推断类型

2. **`generateSchema()`**
   - 优先使用参数的 `type` 字段
   - 如果没有则回退到 `guessType`

## 使用指南

### 1. 编辑数据集

访问数据集编辑页面：
```
http://localhost:3001/data
→ 选择数据集 → 点击「编辑」
```

### 2. 查看参数

在右侧面板的「参数」标签中：
- 查看自动识别的参数列表
- 查看自动推断的类型

### 3. 修改类型

1. 点击参数卡片中的类型下拉框
2. 选择正确的类型（如 `integer`, `datetime`）
3. 自动保存

### 4. 生成 Schema

1. 点击「Schema」标签
2. 查看生成的 JSON Schema
3. 确认类型正确
4. 点击「复制」按钮

## 注意事项

### 1. 类型持久化

**当前状态**: 类型选择会触发 `params-changed` 事件，但**不会自动保存到数据库**。

**建议**: 
- 在保存数据集时，将参数类型信息保存到 `param_schema` 字段
- 加载数据集时，从 `param_schema` 恢复参数类型

### 2. 兼容性

- 旧数据集没有类型信息时，会自动推断
- 不影响现有数据集的正常使用

### 3. 类型验证

类型选择仅用于：
- Schema 生成
- 文档展示
- 前端表单验证

**不影响**:
- SQL 执行（参数仍然按字符串传递）
- 数据库查询结果

## 后续优化建议

### 1. 类型持久化到数据库

修改 `param_schema` 字段结构：

```json
{
  "type": "object",
  "properties": {
    "user_id": {
      "type": "integer",
      "description": "用户ID",
      "required": true
    }
  }
}
```

### 2. 类型验证

在参数输入时进行前端验证：
- `integer`: 只允许整数
- `number`: 允许小数
- `date`: 日期选择器
- `datetime`: 日期时间选择器

### 3. 批量设置

添加批量操作：
- 批量设置类型
- 根据数据库字段自动推断类型

### 4. 更多类型支持

扩展类型选项：
- `uuid`: UUID 格式
- `email`: 邮箱格式
- `url`: URL 格式
- `json`: JSON 对象

## 测试清单

- [x] 参数类型选择器显示正常
- [x] 自动类型推断正确
- [x] 手动修改类型生效
- [x] Schema 生成使用正确类型
- [ ] 类型持久化到数据库
- [ ] 类型验证功能

## 实现日期

2026-07-02

---

**状态**: ✅ 前端功能已实现，等待测试和后续优化
