# 连接器接口模式优化 - 2026-06-09

## 本次更新内容

### 一、运行模式互斥设计 ✅

**问题**：接口模式和触发模式可以同时配置，逻辑混乱

**解决方案**：将两种模式设计为互斥的单选

#### UI 改进

将原来的"启用接口模式"开关改为"运行模式"单选组：

```vue
<el-radio-group v-model="form.interface_mode">
  <el-radio :label="false">触发模式（被动触发）</el-radio>
  <el-radio :label="true">接口模式（主动调用）</el-radio>
</el-radio-group>
```

**说明文本**：
- 触发模式：连接器被设备事件、Webhook、定时任务等触发执行
- 接口模式：连接器作为接口供外部主动调用，无需配置触发器

#### 模式切换逻辑

添加 `onRunModeChange` 函数处理模式切换：

```javascript
function onRunModeChange(isInterfaceMode) {
  if (isInterfaceMode) {
    // 切换到接口模式：清空触发配置
    form.trigger_type = 'device_event'
    form.webhook_id = 0
    form.trigger_config = {}
    form.definition_ids = []
    form.device_ids = []
  } else {
    // 切换到触发模式：清空接口配置
    form.interface_code = ''
    form.input_params_json = ''
    form.output_schema_json = ''
  }
}
```

#### UI 布局优化

```
运行模式
 ├─ 触发模式（选中）
 │   ├─ 触发配置区域（显示）
 │   │   ├─ 触发方式
 │   │   ├─ Webhook/Cron/事件配置
 │   │   ├─ 事件定义
 │   │   └─ 设备范围
 │   └─ 执行流程（共用）
 │
 └─ 接口模式（选中）
     ├─ 接口配置区域（显示）
     │   ├─ 接口编码
     │   ├─ 输入参数
     │   └─ 输出结构 Schema
     └─ 执行流程（共用）
```

---

### 二、输入参数可视化配置 ✅

**问题**：直接编辑 JSON Schema 不够直观，容易出错

**解决方案**：创建可视化的参数配置组件

#### 新增组件：ParamSchemaEditor.vue

**功能特性**：
- ✅ 参数列表可视化编辑
- ✅ 支持字段：参数名、类型、说明、必填
- ✅ 支持类型：string、number、integer、boolean、object、array
- ✅ 添加/删除参数
- ✅ 实时生成 JSON Schema
- ✅ Schema 预览显示

#### UI 界面

```
参数列表：
┌─────────────┬──────────┬──────────────┬────┬────┐
│ 参数名      │ 类型     │ 说明         │必填│删除│
├─────────────┼──────────┼──────────────┼────┼────┤
│ employee_id │ string   │ 员工工号     │ ☑  │ × │
│ dept_id     │ string   │ 部门ID       │ □  │ × │
│ include_    │ boolean  │ 是否包含详情 │ □  │ × │
│   details   │          │              │    │    │
└─────────────┴──────────┴──────────────┴────┴────┘

[+ 添加参数]

生成的 JSON Schema：
{
  "type": "object",
  "properties": {
    "employee_id": {
      "type": "string",
      "description": "员工工号"
    },
    "dept_id": {
      "type": "string",
      "description": "部门ID"
    },
    "include_details": {
      "type": "boolean",
      "description": "是否包含详情"
    }
  },
  "required": ["employee_id"]
}
```

#### 组件特性

**双向绑定**：
- 输入：从 JSON Schema 字符串解析参数列表
- 输出：参数列表变化时实时生成 JSON Schema

**自动解析**：
```javascript
// 加载时从 JSON Schema 解析
watch(() => props.modelValue, (newVal) => {
  const schema = JSON.parse(newVal)
  params.value = Object.keys(schema.properties).map(key => ({
    name: key,
    type: schema.properties[key].type,
    description: schema.properties[key].description,
    required: schema.required?.includes(key)
  }))
})
```

**实时生成**：
```javascript
// 修改时实时生成 JSON Schema
const generatedSchema = computed(() => {
  const properties = {}
  const required = []
  
  params.value.forEach(param => {
    properties[param.name] = {
      type: param.type,
      description: param.description
    }
    if (param.required) required.push(param.name)
  })
  
  return JSON.stringify({
    type: 'object',
    properties,
    required
  }, null, 2)
})
```

---

## 使用流程

### 创建接口模式连接器

1. **选择运行模式**
   - 选择"接口模式（主动调用）"

2. **配置接口编码**
   - 输入唯一的接口编码，如：`check_employee_status`

3. **配置输入参数**（可视化）
   - 点击"添加参数"
   - 填写参数名：`employee_id`
   - 选择类型：`string`
   - 填写说明：`员工工号`
   - 勾选"必填"
   - 继续添加其他参数

4. **配置输出结构**
   - 填写 JSON Schema（未来可考虑也做成可视化）

5. **配置执行流程**
   - 添加阶段和步骤

6. **保存**

### 创建触发模式连接器

1. **选择运行模式**
   - 选择"触发模式（被动触发）"

2. **配置触发方式**
   - 设备事件 / Webhook / Cron / STOMP / 系统事件

3. **配置触发条件**
   - 事件定义、设备范围等

4. **配置执行流程**
   - 添加阶段和步骤

5. **保存**

---

## 文件变更

### 新增文件
- `web/src/components/ParamSchemaEditor.vue`

### 修改文件
- `web/src/views/OutboundConnectorEdit.vue`
  - 运行模式单选组
  - 模式切换处理函数
  - 集成 ParamSchemaEditor 组件
  - UI 布局调整

---

## 技术细节

### 1. 运行模式状态管理

```javascript
// form.interface_mode 作为运行模式标识
// false = 触发模式
// true = 接口模式

// 切换时清空对方的配置
function onRunModeChange(isInterfaceMode) {
  if (isInterfaceMode) {
    // 清空触发配置
  } else {
    // 清空接口配置
  }
}
```

### 2. 参数配置双向绑定

```vue
<!-- 父组件 -->
<ParamSchemaEditor v-model="form.input_params_json" />

<!-- 子组件 -->
<script setup>
const props = defineProps({
  modelValue: String
})
const emit = defineEmits(['update:modelValue'])

// 修改时触发
function emitChange() {
  emit('update:modelValue', generatedSchema.value)
}
</script>
```

### 3. JSON Schema 生成逻辑

```javascript
const generatedSchema = computed(() => {
  const properties = {}
  const required = []

  params.value.forEach(param => {
    if (!param.name) return
    
    properties[param.name] = {
      type: param.type,
      description: param.description || undefined
    }
    
    if (param.required) {
      required.push(param.name)
    }
  })

  const schema = { type: 'object', properties }
  if (required.length > 0) {
    schema.required = required
  }

  return JSON.stringify(schema, null, 2)
})
```

---

## 优势

### 1. 逻辑清晰
- ✅ 运行模式互斥，不会混淆
- ✅ UI 明确指示当前模式
- ✅ 切换时自动清理配置

### 2. 易用性提升
- ✅ 参数配置可视化，无需手写 JSON
- ✅ 类型下拉选择，减少错误
- ✅ 必填字段直观标识
- ✅ 实时预览生成的 Schema

### 3. 扩展性
- ✅ 参数类型易于扩展（date、enum 等）
- ✅ 可添加更多验证规则（min、max、pattern）
- ✅ 输出结构也可采用相同方式

---

## 后续优化建议

### 短期
1. **输出结构可视化**
   - 复用 ParamSchemaEditor 组件
   - 或创建 ResponseSchemaEditor

2. **参数类型增强**
   - 支持枚举类型（enum）
   - 支持日期类型（date、date-time）
   - 支持嵌套对象和数组

3. **验证规则**
   - 字符串：minLength、maxLength、pattern
   - 数字：minimum、maximum
   - 数组：minItems、maxItems

### 中期
1. **Schema 导入导出**
   - 支持从其他接口导入 Schema
   - 支持导出为 OpenAPI 格式

2. **参数模板**
   - 预设常用参数组合
   - 支持保存自定义模板

3. **在线测试**
   - 在配置页面直接测试接口
   - 实时验证参数格式

### 长期
1. **可视化 Schema 编辑器**
   - 支持拖拽式编辑
   - 支持嵌套结构展示
   - 树形视图

2. **API 文档生成**
   - 根据 Schema 自动生成文档
   - 支持导出 Markdown/HTML

---

## 编译状态

- ✅ Web 前端编译成功
- ✅ 新组件正常工作
- ✅ 所有功能验证通过

---

**更新日期**：2026-06-09  
**状态**：✅ 完成  
**相关文档**：
- `docs/connector-interface-frontend.md`
- `docs/connector-interface-mode.md`
