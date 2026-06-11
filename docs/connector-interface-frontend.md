# 连接器接口模式前端配置 - 2026-06-09

## 概述

为连接器编辑页面添加了"接口模式"配置区域，使用户能够在前端界面配置连接器的接口模式相关参数。

## 实现内容

### 1. 表单数据结构扩展

在 `OutboundConnectorEdit.vue` 的 `form` 对象中添加了以下字段：

```javascript
const form = reactive({
  // ... 原有字段
  
  // 接口模式相关字段
  interface_mode: false,          // 是否启用接口模式
  interface_code: '',             // 接口编码（全局唯一）
  input_params_json: '',          // 输入参数 JSON Schema
  output_schema_json: ''          // 输出结构 JSON Schema
})
```

### 2. UI 配置界面

在"表单配置"标签页中，"触发配置"之前添加了"接口模式"配置区域：

#### 配置项

1. **启用接口模式** (Switch)
   - 开关控制是否启用接口模式
   - 提示：启用后，此连接器可作为接口被外部调用

2. **接口编码** (必填，仅当启用接口模式时显示)
   - 输入框，占位符：`如：check_employee_status（全局唯一）`
   - 说明：用于调用此连接器接口，必须全局唯一

3. **输入参数 Schema** (文本域，仅当启用接口模式时显示)
   - 6 行文本域
   - 占位符：JSON Schema 示例
   - 说明：定义接口接受的参数结构（JSON Schema 格式）

4. **输出结构 Schema** (文本域，仅当启用接口模式时显示)
   - 6 行文本域
   - 占位符：JSON Schema 示例
   - 说明：定义接口返回的数据结构（JSON Schema 格式）

5. **接口调用方式** (提示框，仅当启用接口模式时显示)
   - 显示 API 端点和使用方式
   - 动态展示当前配置的 interface_code

#### UI 布局

```vue
<el-divider content-position="left">接口模式</el-divider>

<el-form-item label="启用接口模式">
  <el-switch v-model="form.interface_mode" />
  <span class="hint">启用后，此连接器可作为接口被外部调用</span>
</el-form-item>

<template v-if="form.interface_mode">
  <!-- 接口编码 -->
  <!-- 输入参数 Schema -->
  <!-- 输出结构 Schema -->
  <!-- 接口调用方式提示 -->
</template>

<el-divider content-position="left">触发配置</el-divider>
```

### 3. 数据加载和保存

#### 加载连接器数据
在 `applyRowToForm` 函数中添加：
```javascript
// 接口模式字段
form.interface_mode = row.interface_mode || false
form.interface_code = row.interface_code || ''
form.input_params_json = row.input_params_json || ''
form.output_schema_json = row.output_schema_json || ''
```

#### 保存连接器数据
在 `saveConn` 函数中添加：
```javascript
const body = {
  // ... 原有字段
  
  // 接口模式字段
  interface_mode: form.interface_mode || false,
  interface_code: form.interface_mode ? (form.interface_code || '') : '',
  input_params_json: form.interface_mode ? (form.input_params_json || '') : '',
  output_schema_json: form.interface_mode ? (form.output_schema_json || '') : ''
}
```

**注意**：仅当 `interface_mode` 为 true 时才保存相关字段，否则保存空值。

## 使用流程

### 创建接口模式连接器

1. 进入连接器编辑页面
2. 填写基本信息（名称、说明等）
3. 启用"接口模式"开关
4. 配置接口编码（如：`check_employee_status`）
5. 配置输入参数 Schema：
   ```json
   {
     "type": "object",
     "properties": {
       "employee_id": {
         "type": "string",
         "description": "员工工号"
       }
     }
   }
   ```
6. 配置输出结构 Schema：
   ```json
   {
     "type": "object",
     "properties": {
       "status": {
         "type": "string",
         "description": "员工状态"
       },
       "name": {
         "type": "string",
         "description": "员工姓名"
       }
     }
   }
   ```
7. 配置阶段和步骤（执行逻辑）
8. 保存连接器

### 调用接口

保存后，页面会显示调用方式：
```
API 端点：POST /api/outbound/connector-interfaces/call
请求体：{"connector_code": "check_employee_status", "params": {...}}
返回：{"success": true, "data": {...}, "duration_ms": 100, "step_count": 5}
```

## JSON Schema 示例

### 简单的输入参数

```json
{
  "type": "object",
  "properties": {
    "employee_id": {
      "type": "string",
      "description": "员工工号"
    }
  },
  "required": ["employee_id"]
}
```

### 复杂的输入参数

```json
{
  "type": "object",
  "properties": {
    "employee_id": {
      "type": "string",
      "description": "员工工号"
    },
    "include_departments": {
      "type": "boolean",
      "description": "是否包含部门信息",
      "default": false
    },
    "query_date": {
      "type": "string",
      "format": "date",
      "description": "查询日期"
    }
  },
  "required": ["employee_id"]
}
```

### 输出结构示例

```json
{
  "type": "object",
  "properties": {
    "employee_id": {
      "type": "string"
    },
    "name": {
      "type": "string"
    },
    "status": {
      "type": "string",
      "enum": ["active", "inactive", "pending"]
    },
    "department": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"}
      }
    },
    "hire_date": {
      "type": "string",
      "format": "date"
    }
  }
}
```

## UI 截图说明

### 未启用接口模式
- 只显示"启用接口模式"开关
- 开关默认关闭

### 启用接口模式后
- 显示完整的配置区域
- 接口编码输入框（必填）
- 输入参数 Schema 文本域
- 输出结构 Schema 文本域
- 蓝色提示框显示调用方式

## 与其他功能的关系

### 触发方式
- 接口模式与触发方式独立
- 可以同时配置接口模式和设备事件触发
- 接口模式提供主动调用能力，触发方式提供被动触发能力

### 阶段和步骤
- 接口模式的执行逻辑通过阶段和步骤配置
- 可以使用条件步骤（`condition`）实现分支逻辑
- 可以使用连接器调用步骤（`call_connector`）调用其他连接器

### 运行时变量
- 输入参数会自动加入运行时变量（`vars`）
- 阶段和步骤可以访问和修改这些变量
- 最终的 `vars` 内容作为接口返回值

## 验证和错误处理

### 前端验证（TODO）
目前前端未添加严格验证，建议后续添加：
- 接口编码格式验证（字母、数字、下划线）
- JSON Schema 格式验证
- 接口编码唯一性检查

### 后端验证
后端已有验证：
- `interface_code` 唯一性约束（数据库索引）
- JSON 格式验证（在解析时）

## 文件变更

### 修改文件
- `web/src/views/OutboundConnectorEdit.vue`
  - 添加表单字段
  - 添加 UI 配置区域
  - 更新 `applyRowToForm` 函数
  - 更新 `saveConn` 函数

### 编译状态
- ✅ Web 前端编译成功

## 后续优化建议

1. **JSON Schema 编辑器**
   - 使用可视化的 Schema 编辑器
   - 支持拖拽式字段配置
   - 实时预览和验证

2. **接口文档生成**
   - 根据 Schema 自动生成 API 文档
   - 支持导出 OpenAPI/Swagger 格式
   - 提供在线测试功能

3. **接口编码管理**
   - 显示已使用的接口编码列表
   - 自动建议可用的编码
   - 实时检查唯一性

4. **Schema 模板**
   - 提供常用的 Schema 模板
   - 支持保存和复用自定义模板

5. **调用示例**
   - 生成多语言的调用示例代码
   - 提供 curl、JavaScript、Python 等示例

---

**实现日期**：2026-06-09  
**状态**：✅ 完成并编译通过  
**相关文档**：`docs/connector-interface-mode.md`
