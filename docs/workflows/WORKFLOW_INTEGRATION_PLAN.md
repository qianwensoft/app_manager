# Form-App 事件系统集成 Workflow-Engine 实施计划

## 项目目标

将 workflow-engine 作为 app-manager 的可视化事件处理引擎，实现表单应用、设备事件、自定义事件的低代码自动化编排，同时保持向后兼容。

---

## 阶段 1：基础架构搭建（已完成 ✓）

**目标**: 建立数据模型、API 路由、事件触发基础

### 已完成任务

- [x] **数据库模型扩展** (`server/models/workflow.go`)
  - WorkflowDefinition: 工作流定义
  - WorkflowExecution: 执行记录
  - 兼容设计：无损扩展现有表
  
- [x] **数据库迁移** (`server/migrations/add_workflow_support.go`)
  - 创建 workflow_definitions 表
  - 创建 workflow_executions 表
  - 扩展 custom_event_definitions 表（添加 workflow_id, workflow_enabled）
  - 扩展 form_app_event_routes 表（添加 workflow_id, action_type）
  
- [x] **API 路由** (`server/api/workflow.go`)
  - CRUD: ListWorkflows, CreateWorkflow, GetWorkflow, UpdateWorkflow, DeleteWorkflow
  - 执行: ExecuteWorkflow, ListExecutions, GetExecution, TestWorkflow
  - 绑定: BindWorkflowToCustomEvent, UnbindWorkflowFromCustomEvent, BindWorkflowToFormEvent
  
- [x] **路由注册** (`server/api/router.go`)
  - /api/workflows/* - 工作流管理
  - /api/custom-events/:id/bind-workflow - 绑定到自定义事件
  - /api/form-apps/:id/event-routes/:route_id/bind-workflow - 绑定到表单事件
  
- [x] **事件触发系统** (`server/workflow/trigger.go`)
  - TriggerFromCustomEvent: 自定义事件触发
  - TriggerFromFormEvent: 表单事件触发
  - checkTriggerConditions: 条件判断
  - executeWorkflowAsync: 异步执行（占位）
  
- [x] **事件集成** (`server/event/workflow_integration.go`)
  - HandleCustomEventWithWorkflow: 扩展自定义事件处理
  - HandleFormEventWithWorkflow: 扩展表单事件处理

### 验收标准

- [x] 编译通过
- [ ] 数据库迁移成功
- [ ] API 端点可访问
- [ ] 基础 CRUD 功能正常

### 后续任务

1. **运行迁移脚本**
```bash
cd server
# 需要在 main.go 或迁移入口调用 migrations.AddWorkflowSupport(db)
```

2. **集成到现有事件处理**
   - 在 CustomEvent 处理流程中调用 `HandleCustomEventWithWorkflow`
   - 在 FormAppEventRoute 匹配后调用 `HandleFormEventWithWorkflow`

---

## 阶段 2：workflow-engine 后端集成（2周）

**目标**: 将 workflow-engine Go 后端集成到 app-manager，实现真实的工作流执行

### 2.1 集成 workflow-engine 包

**位置**: `/Volumes/data/workspace/qianwen/workflow-engine/packages/backend-engine`

**任务**:
- [ ] 将 workflow-engine 作为 Go module 依赖引入
- [ ] 创建适配层 `server/workflow/engine_adapter.go`
- [ ] 实现 `executeWorkflowAsync` 真实执行逻辑

**示例代码**:
```go
// server/workflow/engine_adapter.go
package workflow

import (
	"context"
	"encoding/json"
	workflowEngine "github.com/your-org/workflow-engine/backend/engine"
)

func executeWorkflowReal(executionID uint, schemaJSON string, inputData map[string]interface{}) error {
	// 解析 Workflow Schema
	var schema workflowEngine.WorkflowSchema
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return err
	}
	
	// 创建执行上下文
	ctx := context.Background()
	executor := workflowEngine.NewExecutor(schema)
	
	// 执行工作流
	result, err := executor.Execute(ctx, inputData)
	if err != nil {
		// 更新执行状态为 failed
		updateExecutionStatus(executionID, "failed", err.Error())
		return err
	}
	
	// 更新执行状态为 completed
	updateExecutionStatus(executionID, "completed", marshalJSON(result))
	return nil
}
```

### 2.2 自定义节点执行器

**位置**: `server/workflow/nodes/`

**任务**:
- [ ] 实现 FormTriggerNode (`form_trigger.go`)
- [ ] 实现 FormActionNode (`form_action.go`)
- [ ] 实现 DeviceScanNode (`device_scan.go`)
- [ ] 实现 DevicePhotoNode (`device_photo.go`)
- [ ] 实现 DeviceBluetoothNode (`device_bluetooth.go`)

**示例**:
```go
// server/workflow/nodes/form_action.go
package nodes

import (
	"app-manager/agent"
	"app-manager/stomp"
	"context"
)

type FormActionNode struct{}

func (n *FormActionNode) Execute(ctx context.Context, input NodeInput) (NodeOutput, error) {
	// 解析配置
	config := input.Config.(FormActionConfig)
	
	// 发送表单动作到前端（通过 STOMP）
	action := map[string]interface{}{
		"action": config.ActionType,
		"field":  config.TargetField,
		"value":  input.Variables["value"],
	}
	
	topic := fmt.Sprintf("/topic/form-action/%d", config.FormID)
	stomp.DefaultHub.PublishJSON(topic, action)
	
	// 如果有 DeviceID，通过 Agent WebSocket 发送
	if deviceID := input.Context.DeviceID; deviceID != nil {
		if conn := agent.AgentHub.Get(*deviceID); conn != nil {
			conn.SendJSON(map[string]interface{}{
				"type": "form_action",
				"data": action,
			})
		}
	}
	
	return NodeOutput{
		Variables: map[string]interface{}{"success": true},
		Logs: []string{"Form action executed"},
	}, nil
}
```

### 2.3 节点注册表

**任务**:
- [ ] 创建节点注册表 `server/workflow/registry.go`
- [ ] 注册所有自定义节点
- [ ] 实现节点工厂模式

**示例**:
```go
// server/workflow/registry.go
package workflow

import (
	"app-manager/workflow/nodes"
	"fmt"
)

var nodeRegistry = make(map[string]NodeExecutor)

func init() {
	// 注册 Form 相关节点
	RegisterNode("form_trigger", &nodes.FormTriggerNode{})
	RegisterNode("form_action", &nodes.FormActionNode{})
	RegisterNode("device_scan", &nodes.DeviceScanNode{})
	RegisterNode("device_photo", &nodes.DevicePhotoNode{})
	RegisterNode("device_bluetooth", &nodes.DeviceBluetoothNode{})
}

func RegisterNode(nodeType string, executor NodeExecutor) {
	nodeRegistry[nodeType] = executor
}

func GetNodeExecutor(nodeType string) (NodeExecutor, error) {
	if executor, ok := nodeRegistry[nodeType]; ok {
		return executor, nil
	}
	return nil, fmt.Errorf("node type not found: %s", nodeType)
}
```

### 验收标准

- [ ] workflow-engine 包集成成功
- [ ] 自定义节点执行器全部实现
- [ ] 手动触发工作流能正常执行
- [ ] 执行日志正确记录

---

## 阶段 3：前端编辑器（3周）

**目标**: 可视化工作流编辑器，基于 ReactFlow

### 3.1 编辑器基础

**位置**: `web/src/views/workflow/`

**任务**:
- [ ] 创建工作流列表页 `WorkflowList.vue`
- [ ] 创建工作流编辑器 `WorkflowEditor.vue`
- [ ] 集成 ReactFlow（通过 Vue wrapper）
- [ ] 节点拖拽面板
- [ ] 画布区域
- [ ] 属性配置面板

### 3.2 节点组件

**位置**: `web/src/components/workflow/nodes/`

**任务**:
- [ ] FormTriggerNode.vue - 表单触发器节点
- [ ] FormActionNode.vue - 表单动作节点
- [ ] DeviceScanNode.vue - 扫码节点
- [ ] DevicePhotoNode.vue - 拍照节点
- [ ] HttpNode.vue - HTTP 请求节点
- [ ] ConditionNode.vue - 条件分支节点

### 3.3 属性面板

**位置**: `web/src/components/workflow/panels/`

**任务**:
- [ ] FormTriggerPanel.vue - 表单触发器配置
  - 表单选择器（下拉，从 API 加载）
  - 触发类型选择（field.change / form.submit 等）
  - 字段选择器（动态加载字段列表）
  - 条件构建器
  
- [ ] FormActionPanel.vue - 表单动作配置
  - 动作类型选择
  - 目标字段选择
  - 值模板编辑器（支持变量引用 `{{upstream.node.output}}`）
  
- [ ] DeviceScanPanel.vue - 扫码配置
  - 扫码类型（qr / barcode / any）
  - 超时设置
  - 结果格式
  - 自动填入表单配置

### 3.4 扩展点实现

**任务**:
- [ ] 创建节点注册表 `web/src/workflow/registry.ts`
- [ ] 实现动态节点加载
- [ ] 实现属性面板动态渲染

**示例**:
```typescript
// web/src/workflow/registry.ts
import { NodeDefinition } from '@workflow-engine/schema'
import FormTriggerNode from '@/components/workflow/nodes/FormTriggerNode.vue'
import FormTriggerPanel from '@/components/workflow/panels/FormTriggerPanel.vue'

export const nodeRegistry = new Map<string, NodeDefinition>()

nodeRegistry.set('form_trigger', {
  type: 'form_trigger',
  label: '表单触发器',
  icon: 'el-icon-document',
  category: 'trigger',
  component: FormTriggerNode,
  propertyPanel: FormTriggerPanel,
  defaultConfig: {
    formId: '',
    triggerType: 'field.change',
  },
})
```

### 验收标准

- [ ] 能创建/编辑/删除工作流
- [ ] 节点拖拽连接正常
- [ ] 属性面板配置正确保存
- [ ] 工作流 Schema 符合 workflow-engine 格式

---

## 阶段 4：表单设计器集成（2周）

**目标**: 在表单设计器中直接配置事件触发 Workflow

### 4.1 表单设计器扩展

**位置**: `form-app/src/`

**任务**:
- [ ] 在字段属性面板添加"事件"Tab
- [ ] 事件配置组件
  - 触发类型选择
  - Workflow 选择器（下拉，从 API 加载）
  - 条件配置
  
- [ ] 保存事件配置到 FormPageSchema

**示例**:
```typescript
// form-app/src/components/FieldPropertyPanel.tsx
export function FieldPropertyPanel({ field, onUpdate }) {
  return (
    <Tabs>
      <Tab label="基础">...</Tab>
      <Tab label="校验">...</Tab>
      <Tab label="事件">
        <EventConfig
          events={field.events || []}
          onChange={(events) => onUpdate({ events })}
        />
      </Tab>
    </Tabs>
  )
}

// EventConfig 组件
function EventConfig({ events, onChange }) {
  return (
    <div>
      <Button onClick={addEvent}>添加事件</Button>
      {events.map(event => (
        <EventItem
          key={event.id}
          event={event}
          onUpdate={(updated) => updateEvent(event.id, updated)}
          onDelete={() => deleteEvent(event.id)}
        />
      ))}
    </div>
  )
}

function EventItem({ event, onUpdate, onDelete }) {
  const [workflows, setWorkflows] = useState([])
  
  useEffect(() => {
    // 加载可用的 Workflow 列表
    fetch('/api/workflows?category=form')
      .then(res => res.json())
      .then(data => setWorkflows(data))
  }, [])
  
  return (
    <Card>
      <Select
        label="触发类型"
        value={event.triggerType}
        onChange={(val) => onUpdate({ ...event, triggerType: val })}
        options={[
          { label: '字段变更时', value: 'field.change' },
          { label: '字段聚焦时', value: 'field.focus' },
          { label: '字段失焦时', value: 'field.blur' },
        ]}
      />
      
      <Select
        label="执行 Workflow"
        value={event.workflowId}
        onChange={(val) => onUpdate({ ...event, workflowId: val })}
        options={workflows.map(wf => ({ label: wf.name, value: wf.id }))}
      />
      
      <ConditionBuilder
        conditions={event.conditions}
        onChange={(conds) => onUpdate({ ...event, conditions: conds })}
      />
      
      <Button type="danger" onClick={onDelete}>删除</Button>
    </Card>
  )
}
```

### 4.2 运行时集成

**任务**:
- [ ] 表单渲染器监听 STOMP 消息
- [ ] 执行来自 Workflow 的表单动作
- [ ] 设备能力调用（扫码/拍照）

**示例**:
```typescript
// form-app/packages/runtime-react/src/FormRenderer.tsx
useEffect(() => {
  if (!enableWorkflow) return
  
  // 监听 Workflow 触发的表单动作
  const subscription = stomp.subscribe(
    `/topic/form-action/${schema.id}`,
    (message) => {
      const action = JSON.parse(message.body)
      
      switch (action.action) {
        case 'field.setValue':
          engine.form.setFieldState(action.field, state => {
            state.value = action.value
          })
          break
        case 'field.setVisible':
          engine.form.setFieldState(action.field, state => {
            state.visible = action.visible
          })
          break
        case 'device.scan':
          // 调用设备扫码能力
          if (window.AndroidBridge) {
            window.AndroidBridge.scan((result) => {
              engine.form.setFieldState(action.targetField, state => {
                state.value = result
              })
            })
          }
          break
      }
    }
  )
  
  return () => subscription.unsubscribe()
}, [schema.id, enableWorkflow])
```

### 验收标准

- [ ] 表单设计器能配置事件触发 Workflow
- [ ] 配置保存到 Schema
- [ ] 运行时能正确监听和执行动作
- [ ] 设备能力调用正常

---

## 阶段 5：Yjs 协同（2周）

**目标**: 实现设计时和运行时的多人协作

### 5.1 设计时协同

**任务**:
- [ ] 工作流编辑器 Yjs 集成
- [ ] 表单设计器 Yjs 集成
- [ ] WebSocket 服务端（Go）
- [ ] 多人光标/选中状态

### 5.2 运行时协同

**任务**:
- [ ] FormData Yjs 同步
- [ ] 离线支持（IndexedDB / AsyncStorage）
- [ ] 冲突合并策略

### 验收标准

- [ ] 多人同时编辑工作流/表单无冲突
- [ ] 表单数据跨设备实时同步
- [ ] 离线填写后自动同步

---

## 阶段 6：多端 Runtime（2周）

**目标**: 支持 React Native、Flutter、UniApp 运行时

### 6.1 React Native Runtime

**任务**:
- [ ] RN 渲染器集成 Yjs
- [ ] 原生设备能力桥接（扫码/拍照/蓝牙）
- [ ] AsyncStorage 离线存储

### 6.2 Flutter Runtime

**任务**:
- [ ] Flutter 渲染器实现
- [ ] Yjs Dart 绑定
- [ ] SQLite 离线存储

### 6.3 UniApp Runtime

**任务**:
- [ ] UniApp 组件适配
- [ ] 微信小程序兼容
- [ ] uni.storage 离线支持

### 验收标准

- [ ] 同一表单在 H5/RN/Flutter/小程序正常渲染
- [ ] 跨端数据实时同步
- [ ] 设备能力调用正常

---

## 阶段 7：测试与优化（1周）

### 7.1 功能测试

- [ ] 单元测试（Go 后端）
- [ ] 集成测试（API 端点）
- [ ] E2E 测试（Playwright）

### 7.2 性能优化

- [ ] Workflow 执行性能分析
- [ ] Yjs 消息优化
- [ ] 前端 Bundle 大小优化

### 7.3 文档

- [ ] API 文档
- [ ] 用户手册
- [ ] 开发者指南

---

## 里程碑

| 阶段 | 完成时间 | 关键交付物 |
|------|---------|-----------|
| 阶段 1 | Week 1 | 数据模型、API 路由、事件触发 |
| 阶段 2 | Week 3 | workflow-engine 集成、节点执行器 |
| 阶段 3 | Week 6 | 可视化编辑器 |
| 阶段 4 | Week 8 | 表单设计器集成 |
| 阶段 5 | Week 10 | Yjs 协同 |
| 阶段 6 | Week 12 | 多端 Runtime |
| 阶段 7 | Week 13 | 测试优化、上线 |

---

## 技术债务与风险

### 技术债务

1. **Workflow Engine 集成复杂度**
   - workflow-engine 是独立项目，需要作为 Go module 依赖
   - 可能需要调整 workflow-engine 的接口以适配 app-manager

2. **现有代码改动**
   - CustomEvent 和 FormAppEventRoute 处理逻辑需要小心改动
   - 需要全面回归测试

3. **Yjs 学习曲线**
   - 团队对 Yjs CRDT 可能不熟悉
   - 需要培训和文档

### 风险缓解

1. **向后兼容保证**
   - 所有新字段都是可空的
   - Workflow 功能是可选的，不绑定时走原有逻辑
   - 充分的测试覆盖

2. **渐进式迁移**
   - 先实现基础功能，再扩展高级特性
   - 每个阶段都有独立的验收标准

3. **文档先行**
   - 架构设计文档
   - API 接口文档
   - 用户使用手册

---

## 下一步行动

### 立即执行

1. **运行数据库迁移**
```bash
cd server
# 在 database.Init() 后添加迁移调用
migrations.AddWorkflowSupport(db)
```

2. **编译测试**
```bash
cd server
go build
```

3. **API 测试**
```bash
# 启动服务
./server

# 测试 API
curl -X GET http://localhost:8080/api/workflows \
  -H "Authorization: Bearer <token>"

curl -X POST http://localhost:8080/api/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "description": "测试工作流",
    "category": "form",
    "schema_json": "{}",
    "trigger_type": "manual",
    "enabled": true
  }'
```

### 本周任务

- [ ] 完成阶段 1 验收
- [ ] 开始阶段 2：集成 workflow-engine 包
- [ ] 实现第一个自定义节点执行器（FormActionNode）
- [ ] 手动触发测试工作流

---

## 联系人

- **技术负责人**: [Your Name]
- **产品负责人**: [Product Owner]
- **前端开发**: [Frontend Team]
- **后端开发**: [Backend Team]
