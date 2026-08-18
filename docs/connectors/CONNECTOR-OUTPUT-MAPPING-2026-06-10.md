# 连接器接口模式输出参数映射功能 - 2026-06-10

## 功能概述

在接口模式下，添加"输出参数映射"功能，允许用户配置如何从连接器执行后的 context 映射到最终返回的 JSON 结构，类似于输入参数的 schema 定义。

## 实现的功能

### 1. 前端配置界面

**位置：** `web/src/views/OutboundConnectorEdit.vue`

**功能：**
- 在"输出结构 Schema"配置后添加"输出参数映射"配置区
- 支持配置多个输出字段的映射规则
- 每个映射包含：输出字段名、数据源（context/var/fixed）、值
- 支持点路径（如 `user.name`）自动展开为嵌套 JSON
- 提供"一键匹配"功能，根据输出 Schema 自动补全映射

**UI 元素：**
```
输出参数映射
├─ 说明文字
├─ 映射行列表
│  ├─ 输出字段名（支持 a.b.c 点路径）
│  ├─ 数据源选择（context / var / fixed）
│  ├─ 值输入（带自动完成）
│  └─ 删除按钮
├─ 操作按钮
│  ├─ + 加字段
│  └─ 一键匹配
└─ 示例说明
```

**修改文件：**
- `web/src/views/OutboundConnectorEdit.vue:61-121` - 添加输出参数映射 UI

### 2. 一键匹配功能

**函数：** `autoMatchOutputParams()`

**匹配策略：**
1. **精确匹配** - 字段名完全相同（不区分大小写）
2. **后缀匹配** - 如 `name` 匹配 `context.employee_name`
3. **包含匹配** - 如 `name` 匹配 `employee_name`

**示例：**
```javascript
// 输出 Schema 定义
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "status": {"type": "string"},
    "department": {"type": "string"}
  }
}

// Context 中的数据
{
  "employee_name": "张三",
  "employee_status": "active",
  "department": "IT"
}

// 一键匹配结果
[
  {output_key: "name", source: "context", value: "employee_name"},
  {output_key: "status", source: "context", value: "employee_status"},
  {output_key: "department", source: "context", value: "department"}
]
```

**修改文件：**
- `web/src/views/OutboundConnectorEdit.vue:2330-2391` - 添加 `autoMatchOutputParams` 函数

### 3. 数据持久化

**前端：**
- `form.output_mappings` - 数组类型，存储映射配置
- 保存时序列化为 `output_mappings_json`
- 加载时反序列化到 `form.output_mappings`

**后端：**
- `OutboundConnector.OutputMappingsJSON` - 新增字段
- 类型：`string`（存储 JSON 数组）
- 在 `OutboundConnector` 模型中添加字段定义

**修改文件：**
- `web/src/views/OutboundConnectorEdit.vue:1527` - 添加 `output_mappings` 初始化
- `web/src/views/OutboundConnectorEdit.vue:2087-2091` - 添加 `resetFormNew` 处理
- `web/src/views/OutboundConnectorEdit.vue:2126-2135` - 添加 `applyRowToForm` 处理
- `web/src/views/OutboundConnectorEdit.vue:2947-2949` - 添加 `saveConn` 处理
- `server/models/outbound.go:85-86` - 添加模型字段

### 4. 后端执行逻辑

**位置：** `server/api/connector_interface.go`

**执行流程：**

1. **默认行为**（无输出映射）
   - 返回完整的 `context` 数据

2. **应用输出映射**（有配置）
   - 解析 `OutputMappingsJSON`
   - 遍历每个映射规则
   - 根据数据源获取值：
     - `context` - 从 `ctx.context` 获取
     - `var` - 从 `ctx.vars` 获取（支持 `{{...}}` 格式）
     - `fixed` - 使用固定值
   - 支持点路径（如 `user.name`）自动构建嵌套对象
   - 返回映射后的数据结构

**代码示例：**
```go
// 应用输出映射（如果配置了）
outputData := ctx.context // 默认返回完整 context
if connector.OutputMappingsJSON != "" {
    var mappings []map[string]interface{}
    if err := json.Unmarshal([]byte(connector.OutputMappingsJSON), &mappings); err == nil && len(mappings) > 0 {
        outputData = make(map[string]interface{})
        for _, mapping := range mappings {
            outputKey, _ := mapping["output_key"].(string)
            source, _ := mapping["source"].(string)
            value, _ := mapping["value"].(string)

            var outputValue interface{}
            switch source {
            case "context":
                // 从 context 中获取值
                if v, ok := ctx.context[value]; ok {
                    outputValue = v
                }
            case "var":
                // 从 vars 中获取值
                cleanValue := strings.Trim(value, "{} ")
                if v, ok := ctx.vars[cleanValue]; ok {
                    outputValue = v
                }
            case "fixed":
                // 固定值
                outputValue = value
            }

            // 支持点路径
            if strings.Contains(outputKey, ".") {
                setNestedValue(outputData, outputKey, outputValue)
            } else {
                outputData[outputKey] = outputValue
            }
        }
    }
}
```

**修改文件：**
- `server/api/connector_interface.go:1-12` - 添加 `strings` 导入
- `server/api/connector_interface.go:271-343` - 添加输出映射逻辑和 `setNestedValue` 函数

---

## 使用示例

### 场景：员工信息查询接口

**1. 配置输入参数**
```json
{
  "type": "object",
  "properties": {
    "employee_id": {"type": "string", "examples": ["E001"]}
  }
}
```

**2. 配置输出 Schema**
```json
{
  "type": "object",
  "properties": {
    "name": {"type": "string"},
    "status": {"type": "string"},
    "department": {"type": "string"},
    "position": {"type": "string"}
  }
}
```

**3. 配置输出映射**
```json
[
  {"output_key": "name", "source": "context", "value": "employee_name"},
  {"output_key": "status", "source": "context", "value": "employee_status"},
  {"output_key": "department", "source": "context", "value": "department_name"},
  {"output_key": "position", "source": "context", "value": "job_title"}
]
```

**4. 执行流程**

**输入：**
```bash
POST /api/outbound/connector-interfaces/check_employee/invoke
{"employee_id": "E001"}
```

**连接器执行后的 Context：**
```json
{
  "employee_id": "E001",
  "employee_name": "张三",
  "employee_status": "active",
  "department_name": "信息技术部",
  "job_title": "高级工程师",
  "hire_date": "2020-01-15",
  "salary": 15000
}
```

**输出映射后的结果：**
```json
{
  "success": true,
  "data": {
    "name": "张三",
    "status": "active",
    "department": "信息技术部",
    "position": "高级工程师"
  },
  "duration_ms": 156,
  "step_count": 3
}
```

### 场景：嵌套对象输出

**输出映射配置：**
```json
[
  {"output_key": "user.name", "source": "context", "value": "employee_name"},
  {"output_key": "user.id", "source": "context", "value": "employee_id"},
  {"output_key": "dept.name", "source": "context", "value": "department_name"},
  {"output_key": "dept.code", "source": "context", "value": "department_code"}
]
```

**输出结果：**
```json
{
  "success": true,
  "data": {
    "user": {
      "name": "张三",
      "id": "E001"
    },
    "dept": {
      "name": "信息技术部",
      "code": "IT"
    }
  },
  "duration_ms": 156,
  "step_count": 3
}
```

---

## 技术细节

### 数据源类型

| 数据源 | 说明 | 值格式 | 示例 |
|-------|------|--------|------|
| `context` | 从 context 命名空间获取 | 键名 | `employee_name` |
| `var` | 从 vars 全局变量获取 | 完整占位符或键名 | `{{context.employee_name}}` 或 `context.employee_name` |
| `fixed` | 固定值 | 任意字符串 | `"active"` |

### 点路径支持

输出字段名支持点路径语法，自动构建嵌套对象：

```
user.name       → {"user": {"name": "..."}}
user.info.age   → {"user": {"info": {"age": ...}}}
dept.code       → {"dept": {"code": "..."}}
```

**实现函数：** `setNestedValue()`

```go
func setNestedValue(obj map[string]interface{}, path string, value interface{}) {
    parts := strings.Split(path, ".")
    current := obj

    for i := 0; i < len(parts)-1; i++ {
        key := parts[i]
        if _, ok := current[key]; !ok {
            current[key] = make(map[string]interface{})
        }
        if next, ok := current[key].(map[string]interface{}); ok {
            current = next
        } else {
            return
        }
    }

    current[parts[len(parts)-1]] = value
}
```

### 映射规则匹配优先级

在一键匹配功能中，按以下优先级匹配：

1. **精确匹配** - `name` 精确匹配 `name`
2. **后缀匹配** - `name` 匹配 `context.employee_name` 的后缀
3. **包含匹配** - `name` 包含在 `employee_name` 中

---

## 编译验证

### 前端编译
```bash
cd web && npm run build
```
**结果：** ✅ 编译成功（20.18秒）

**产物：**
- `dist/assets/OutboundConnectorEdit-BiV9-qMB.js` - 98.92 kB (gzip: 28.49 kB)

### 后端编译
```bash
cd server && go build -o /tmp/test-build
```
**结果：** ✅ 编译成功，无错误

---

## 文件修改汇总

### 前端文件
1. `web/src/views/OutboundConnectorEdit.vue`
   - 行 61-121：添加输出参数映射 UI
   - 行 1527：添加 `output_mappings` 初始化
   - 行 2087-2091：`resetFormNew` 处理
   - 行 2126-2135：`applyRowToForm` 处理
   - 行 2330-2391：`autoMatchOutputParams` 函数
   - 行 2947-2949：`saveConn` 处理

### 后端文件
1. `server/models/outbound.go`
   - 行 85-86：添加 `OutputMappingsJSON` 字段

2. `server/api/connector_interface.go`
   - 行 1-12：添加 `strings` 导入
   - 行 271-343：添加输出映射逻辑和 `setNestedValue` 函数

---

## 测试建议

### 功能测试

1. **基本映射**
   - 配置简单的字段映射
   - 验证输出结果正确

2. **一键匹配**
   - 定义输出 Schema
   - 点击"一键匹配"
   - 验证自动匹配的映射规则

3. **嵌套对象**
   - 使用点路径（如 `user.name`）
   - 验证输出为嵌套 JSON 结构

4. **数据源类型**
   - 测试 `context` 源
   - 测试 `var` 源（包括 `{{...}}` 格式）
   - 测试 `fixed` 固定值

5. **空映射**
   - 不配置输出映射
   - 验证返回完整 context

### 边界测试

1. **空值处理**
   - context 中不存在的键
   - 空字符串值

2. **类型转换**
   - 数字、布尔值、字符串

3. **复杂路径**
   - 多层嵌套（`a.b.c.d`）
   - 路径中有特殊字符

---

## 后续优化建议

### 短期优化
1. **类型转换** - 根据输出 Schema 自动转换数据类型
2. **默认值** - 支持配置字段缺失时的默认值
3. **条件映射** - 根据条件选择不同的映射规则

### 长期优化
1. **表达式支持** - 支持简单的表达式计算（如字符串拼接、数学运算）
2. **数组映射** - 支持数组字段的映射和转换
3. **映射模板** - 提供常用映射模板快速应用

---

## 总结

### 完成的功能
1. ✅ 输出参数映射 UI
2. ✅ 支持 context、var、fixed 三种数据源
3. ✅ 支持点路径构建嵌套对象
4. ✅ 一键匹配功能
5. ✅ 后端输出映射逻辑
6. ✅ 数据持久化
7. ✅ 前后端编译通过

### 技术亮点
1. **灵活的映射规则** - 支持多种数据源和嵌套结构
2. **智能匹配** - 一键匹配提高配置效率
3. **向后兼容** - 不配置映射时返回完整 context
4. **清晰的 UI** - 与输入参数映射保持一致

### 用户价值
1. **精确控制返回结构** - 只返回需要的字段
2. **字段重命名** - 将内部字段名映射为外部友好名称
3. **嵌套结构** - 构建符合 API 规范的嵌套 JSON
4. **简化配置** - 一键匹配减少手动配置工作

---

**修改日期：** 2026-06-10  
**修改人：** Claude (Kiro)  
**状态：** ✅ 完成，已通过编译验证
