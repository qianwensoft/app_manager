# 连接器接口模式 - 前端完善总结

## 完成的前端改进

### 1. 接口占位符说明区域

**位置：** `web/src/views/OutboundConnectorEdit.vue` 行 70-127

**功能：**
- 在接口模式配置区添加详细的占位符说明表格
- 展示所有可用的占位符类型：接口入参、HTTP 信息、系统变量
- 提供清晰的占位符引用方式对比（`{{param_name}}` vs `{{context.param_name}}`）
- 包含具体使用示例

**内容：**
```
┌─────────────┬──────────────────────────┬────────────────────┐
│   类别      │        占位符             │       说明         │
├─────────────┼──────────────────────────┼────────────────────┤
│ 接口入参    │ {{param_name}}           │ 直接引用参数名     │
│             │ {{context.param_name}}   │ 通过 context 引用  │
├─────────────┼──────────────────────────┼────────────────────┤
│ HTTP 信息   │ {{http.method}}          │ HTTP 方法          │
│             │ {{http.path}}            │ 请求路径           │
│             │ {{http.query}}           │ Query string       │
├─────────────┼──────────────────────────┼────────────────────┤
│ 系统变量    │ {{timestamp}}            │ Unix 时间戳（秒）  │
│             │ {{timestamp_ms}}         │ Unix 时间戳（毫秒）│
│             │ {{userid}} / {{deviceid}}│ 用户/设备 ID       │
└─────────────┴──────────────────────────┴────────────────────┘
```

### 2. 接口测试功能

**位置：** `web/src/views/OutboundConnectorEdit.vue` 行 1104-1161

**组成部分：**

#### 2.1 测试入口按钮
- 在接口模式配置区添加"测试调用与 Context 预览"按钮
- 仅在保存后且有接口编码时显示

#### 2.2 测试对话框
包含以下功能模块：

**参数配置区：**
- HTTP 方法选择（GET/POST/PUT/DELETE）
- 接口入参 JSON 编辑器
- "填充示例参数"按钮（自动从 input_params_json 生成）
- "执行测试"按钮

**结果展示区（三个标签页）：**

1. **Context 映射**
   - 展示所有占位符及其对应值
   - 标注来源（接口入参、HTTP 信息、系统变量、执行结果）
   - 表格形式，清晰直观

2. **执行结果**
   - 执行状态（成功/失败）
   - 耗时统计
   - 步骤数量
   - 返回数据展示

3. **完整响应**
   - JSON 格式的完整响应体

### 3. 步骤配置区域优化

**位置：** `web/src/views/OutboundConnectorEdit.vue` 行 505-534

**改进：**
- 根据 `form.interface_mode` 动态显示不同的说明文案
- 接口模式：强调接口入参自动作为 context，隐藏 event_data 合并选项
- 触发模式：保持原有的 event_data 合并配置
- 添加友好的提示信息，说明占位符可用性

**接口模式说明：**
```
接口模式：接口入参自动作为 context 初始值。本步执行前，将占位符展开进 URL、HTTP Body、消息正文等。
合并顺序为：接口入参（context.*） → 阶段默认占位符 → 本步专属占位符默认值；
再与上阶段 HTTP 执行后已写入的 context、以及 {{http.last.*}} 等一起作为本步入参。

可用占位符示例：{{context.employee_id}}、{{http.method}}、{{timestamp}}
```

**触发模式说明：**
```
触发模式：本步执行前，将占位符展开进 URL、HTTP Body、消息正文等。
合并顺序为：阶段默认占位符 → 可选的 event_data→context → 本步专属占位符默认值；
再与上阶段 HTTP 执行后已写入的 context、以及 {{http.last.*}} 等一起作为本步入参。
```

### 4. API 集成

**文件：** `web/src/api/outbound.js`

**新增方法：**

```javascript
// 列出所有接口模式连接器
export const listConnectorInterfaces = (params) => 
  http.get('/outbound/connector-interfaces', { params })

// 获取单个连接器接口详情
export const getConnectorInterface = (code) => 
  http.get(`/outbound/connector-interfaces/${code}`)

// 调用连接器接口（POST 方式）
export const callConnectorInterface = (data) => 
  http.post('/outbound/connector-interfaces/call', data)

// 通用调用（支持 GET/POST/PUT/DELETE）
export const callConnectorInterfaceByCode = (code, method, params) => {
  const config = {
    method: method.toLowerCase(),
    url: `/outbound/connector-interfaces/${code}/invoke`
  }
  if (method === 'GET') {
    config.params = params
  } else {
    config.data = params
  }
  return http.request(config)
}
```

### 5. JavaScript 逻辑

**新增状态：**
```javascript
const interfaceTestDlg = reactive({
  visible: false,
  loading: false,
  method: 'POST',
  paramsJson: '',
  innerTab: 'context',
  result: null,
  contextRows: []
})
```

**新增函数：**

1. **openInterfaceTest()** - 打开测试对话框
2. **fillInterfaceTestParams()** - 自动从 input_params_json 生成示例参数
3. **runInterfaceTest()** - 执行接口测试并构建 context 映射表

## 用户体验改进

### 使用流程

1. **配置接口**
   - 启用接口模式
   - 设置接口编码
   - 定义输入参数（JSON Schema）
   - 查看"可用占位符说明"了解如何引用参数

2. **配置步骤**
   - 在步骤配置区看到接口模式专属说明
   - 在 HTTP Body、消息等处使用 `{{context.param_name}}` 占位符
   - 系统自动提示可用的占位符类型

3. **测试验证**
   - 保存连接器后点击"测试调用与 Context 预览"
   - 填写测试参数或使用"填充示例参数"
   - 查看 Context 映射表，验证占位符是否正确
   - 查看执行结果，确认接口行为符合预期

### 界面改进亮点

1. **信息层次清晰**
   - 占位符说明 → 接口调用方式 → 测试功能，逐层递进
   - 使用不同颜色的 Alert 组件区分信息类型

2. **上下文感知**
   - 根据接口模式/触发模式动态调整说明文案
   - 隐藏不相关的配置选项（如接口模式下的 event_data 合并）

3. **即时反馈**
   - 测试功能提供实时的 context 映射预览
   - 清晰展示参数来源和最终值

4. **操作便捷**
   - 一键填充示例参数
   - 表格形式展示映射关系，易于查找

## 技术实现细节

### Context 映射表构建

测试执行后，自动构建 context 映射表，包含：

1. **接口入参**（每个参数生成两行）
   - `{{param_name}}` - 直接引用
   - `{{context.param_name}}` - 命名空间引用

2. **HTTP 信息**
   - `{{http.method}}` - 测试时选择的 HTTP 方法
   - 其他 HTTP 变量

3. **系统变量**
   - `{{timestamp}}` - 当前时间戳
   - `{{timestamp_ms}}` - 毫秒时间戳

4. **执行结果**
   - 从返回的 data 中提取新增的字段
   - 标注为"执行结果"来源

### 示例参数自动生成

从 `input_params_json` 中提取 Schema，按优先级填充值：
1. `examples[0]` - 优先使用示例值
2. `default` - 使用默认值
3. 根据类型生成占位值

```javascript
if (prop.examples && prop.examples.length > 0) {
  example[key] = prop.examples[0]
} else if (prop.default !== undefined) {
  example[key] = prop.default
} else if (prop.type === 'string') {
  example[key] = '示例_' + key
} else if (prop.type === 'number') {
  example[key] = 123
}
```

## 文件清单

### 前端文件
- `web/src/views/OutboundConnectorEdit.vue` - 主要修改文件
- `web/src/api/outbound.js` - API 方法

### 后端文件（已完成）
- `server/api/connector_interface.go` - 核心逻辑
- `server/api/connector_interface_test.go` - 测试用例
- `server/api/router.go` - 路由配置

### 文档文件
- `docs/connector-interface-usage.md` - 完整使用指南
- `docs/connector-interface-context-mapping.md` - Context 映射说明
- `docs/changelog/CHANGELOG-CONNECTOR-INTERFACE-2026-06-09.md` - 更新日志

## 测试建议

### 功能测试

1. **占位符说明显示**
   - 切换接口模式/触发模式，验证说明区域正确显示
   - 检查占位符表格渲染正常

2. **测试对话框**
   - 打开测试对话框
   - 点击"填充示例参数"，验证自动生成的参数合理
   - 手动修改参数，执行测试
   - 查看 Context 映射表，验证占位符映射正确

3. **步骤配置说明**
   - 在接口模式下，验证步骤说明正确
   - 在触发模式下，验证保留 event_data 配置选项

### 边界测试

1. **空参数**
   - 接口无输入参数时，测试对话框应正常工作
   - Context 映射表应只显示系统变量

2. **复杂参数**
   - 嵌套对象、数组参数
   - 特殊字符参数名

3. **错误处理**
   - 参数 JSON 格式错误
   - 接口调用失败
   - 网络错误

## 后续优化建议

1. **实时占位符提示**
   - 在 HTTP Body 编辑器中输入 `{{` 时显示可用占位符列表
   - 支持占位符自动完成

2. **历史测试记录**
   - 保存最近的测试参数
   - 支持快速重测

3. **占位符验证**
   - 检测步骤中使用的占位符是否存在
   - 高亮未定义的占位符

4. **批量测试**
   - 支持导入多组测试参数
   - 批量执行并对比结果

## 总结

本次前端改进完成了以下目标：

✅ **信息展示** - 清晰展示接口模式下可用的占位符  
✅ **功能测试** - 提供测试工具验证占位符映射  
✅ **上下文感知** - 根据模式动态调整界面说明  
✅ **用户体验** - 简化配置流程，降低学习成本

用户现在可以：
1. 快速了解接口模式下的 context 结构
2. 通过测试功能验证占位符配置
3. 实时查看参数映射关系
4. 排查占位符引用问题
