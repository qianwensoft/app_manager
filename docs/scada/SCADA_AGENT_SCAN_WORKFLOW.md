# SCADA 组态编辑器：Agent 扫码触发工作流 + 外部应用接口调用

## 功能概述

为 SCADA 组态编辑器的全局工作流和画布工作流新增了以下功能：

1. **Agent 扫码触发事件** - 新增 `agent_scan` 触发源，监听设备扫码事件（二维码/条码/NFC）
2. **外部应用接口调用** - `call_interface` 动作支持调用外部应用接口（outbound apps/endpoints），支持动态参数映射

## 实现细节

### 1. 新增触发源类型 `agent_scan`

**文件**: `scada-editor/src/types/workflow.ts`

```typescript
export type WorkflowSource =
  | { kind: 'point_change'; pointKey: string }
  | { kind: 'condition'; expr: string }
  | { kind: 'component'; elementId: string; event: 'click' | 'dblclick' | 'hover' }
  | { kind: 'timer'; delay: number; interval?: number; repeat?: number }
  | { kind: 'canvas_enter' }
  | { kind: 'canvas_exit' }
  | { kind: 'custom_event'; eventName: string }
  | { kind: 'context_change'; scope: Exclude<StateScopeKind, 'element'>; key: string }
  | { kind: 'agent_scan'; deviceId?: number; scanType?: 'qrcode' | 'barcode' | 'nfc' | 'any' }  // 新增
```

**配置项**:
- `deviceId` (可选): 指定设备 ID，留空则监听所有设备
- `scanType` (可选): 扫码类型过滤 - `qrcode`/`barcode`/`nfc`/`any`

**触发数据访问**:
- `$event.value` - 扫码内容
- `$event.device_id` - 设备 ID
- `$event.event_type` - 原始事件类型

### 2. 触发源编辑器支持

**文件**: `scada-editor/src/components/workflow/SourceEditor.tsx`

- 新增 "Agent 扫码触发" 选项到触发源类型下拉框
- 动态加载设备列表（通过 `/api/devices` 接口）
- UI 支持选择设备和扫码类型
- 显示扫码数据访问说明

### 3. 工作流引擎监听设备扫码事件

**文件**: `scada-editor/src/runtime/workflow/engine.ts`

新增 `triggerAgentScan` 方法：

```typescript
export interface WorkflowRuntime {
  cleanup: () => void
  triggerComponent: (elementId: string, event: 'click' | 'dblclick' | 'hover') => void
  triggerLifecycle: (kind: 'canvas_enter' | 'canvas_exit') => void
  notifyPointData: (next: PointDataMap) => void
  runWorkflowById: (id: string, base?: Partial<WorkflowContext>) => void
  triggerAgentScan: (eventData: { device_id: number; event_type: string; value: string }) => void  // 新增
}
```

**触发逻辑**:
- 遍历所有启用的 `agent_scan` 工作流
- 按 `deviceId` 过滤（如果配置了）
- 按 `scanType` 过滤事件类型（如果配置了）
- 将扫码数据作为 `$event` 传递给工作流

### 4. STOMP 订阅设备事件

**文件**: `scada-editor/src/hooks/useWorkflowRuntime.ts`

新增 STOMP WebSocket 订阅：

```typescript
// 订阅 /topic/device-events
client.subscribe('/topic/device-events', (msg) => {
  const event = JSON.parse(msg.body) as { device_id: number; event_type: string; event_data: string }
  // 解析 event_data 提取扫码值
  const data = JSON.parse(event.event_data || '{}')
  const scanValue = data.value || data.barcode || data.data || ''
  
  runtimeRef.current?.triggerAgentScan({
    device_id: event.device_id,
    event_type: event.event_type,
    value: scanValue,
  })
})
```

**连接策略**:
- 仅当存在 `agent_scan` 类型工作流时才建立连接
- 支持分享模式（通过 `shareToken`）
- 自动重连（5 秒间隔）

### 5. 外部应用接口调用支持

**文件**: `scada-editor/src/types/workflow.ts`

扩展 `CallInterfaceAction` 类型：

```typescript
export interface CallInterfaceAction extends ActionBase {
  type: 'call_interface'
  ifaceId?: number
  ifaceCode?: string
  // 新增：外部应用支持
  outboundAppId?: number           // 外部应用 ID
  outboundEndpointId?: number      // 外部接口 ID
  param_map?: Array<{ key: string; src: ValueSrc }>
  result_map?: Array<{ response_field: string; context_key: string }>
  result_scope?: Exclude<StateScopeKind, 'element'>
}
```

### 6. 动作编辑器 UI 增强

**文件**: `scada-editor/src/components/workflow/ActionEditor.tsx`

在 `call_interface` 动作编辑器中：

1. **调用类型选择**:
   - "数据接口（内部）" - 原有数据接口
   - "外部应用接口" - 新增外部应用

2. **外部应用配置**:
   - 外部应用下拉框（动态加载 `/api/outbound/apps`）
   - 外部接口下拉框（根据选中应用加载 `/api/outbound/endpoints?app_id=X`）
   - 显示接口的 Method 和 Path

3. **参数映射**:
   - 入参映射：从工作流上下文映射到接口参数
   - 结果回填：从接口响应映射回工作流上下文

### 7. 接口调用实现

**文件**: `scada-editor/src/runtime/workflow/tools/callInterface.ts`

调用逻辑：

```typescript
// 优先外部应用接口
if (a.outboundAppId && a.outboundEndpointId) {
  const callRes = await http.post('/outbound/endpoints/debug', {
    endpoint_id: a.outboundEndpointId,
    sample_vars: Object.fromEntries(
      Object.entries(params).map(([k, v]) => [`{{${k}}}`, String(v ?? '')])
    ),
  })
  res = callRes.response_body ? JSON.parse(callRes.response_body) : {}
} else if (deps.callInterface) {
  // 降级到数据接口
  res = await deps.callInterface({ ifaceId: a.ifaceId, ifaceCode: a.ifaceCode, params })
}
```

**参数格式转换**:
- 工作流参数 `{ key: value }` 转换为外部应用占位符格式 `{ "{{key}}": "value" }`
- 调用 `/api/outbound/endpoints/debug` 接口执行

## 使用场景示例

### 场景 1: 扫码触发设备控制

1. 创建画布工作流
2. 触发源选择 "Agent 扫码触发"
3. 设备选择 "设备 A"，扫码类型选择 "二维码"
4. 添加动作：
   - 动作类型: "设置元素属性"
   - 目标元素: 状态指示灯
   - 属性: `fill`
   - 值来源: `$event.value` （将扫码值设置为颜色）

### 场景 2: 扫码后调用外部 API

1. 创建全局工作流
2. 触发源选择 "Agent 扫码触发"，留空设备（监听所有）
3. 添加条件判断（when）: `$event.value` 不为空
4. 添加动作：
   - 动作类型: "调用数据接口"
   - 调用类型: "外部应用接口"
   - 外部应用: "MES 系统"
   - 外部接口: "POST /api/barcode/verify"
   - 入参映射: `barcode` ← `$event.value`
   - 结果回填: `result.status` → `scanStatus`（回填到 workflow 上下文）

5. 添加后续动作：
   - 动作类型: "顶部提示"
   - 消息来源: `$workflow.scanStatus`

### 场景 3: 不同设备扫码触发不同流程

创建两个工作流：

**工作流 A（入库）**:
- 触发源: Agent 扫码，设备 = "入库扫码枪"
- 动作: 调用外部接口 `/inventory/inbound`

**工作流 B（出库）**:
- 触发源: Agent 扫码，设备 = "出库扫码枪"
- 动作: 调用外部接口 `/inventory/outbound`

## 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│  Agent (Android App)                                        │
│  - 扫码枪广播监听 / 摄像头扫码                                │
│  - 上报设备事件到服务端                                       │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP POST /api/events
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Go Server                                                  │
│  - 接收设备事件，存入 device_events 表                        │
│  - 通过 STOMP 推送到 /topic/device-events                    │
└────────────────────┬────────────────────────────────────────┘
                     │ STOMP /ws/stomp
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  SCADA Editor (React)                                       │
│  - useWorkflowRuntime Hook 订阅 /topic/device-events        │
│  - 解析扫码事件，调用 triggerAgentScan()                     │
│  - 工作流引擎过滤并触发匹配的工作流                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Workflow Engine                                            │
│  - 执行动作链 / DAG                                          │
│  - call_interface 动作调用外部应用接口                        │
│  - 通过 /api/outbound/endpoints/debug 执行                   │
└─────────────────────────────────────────────────────────────┘
```

## 修改文件清单

1. `scada-editor/src/types/workflow.ts` - 类型定义
2. `scada-editor/src/components/workflow/SourceEditor.tsx` - 触发源编辑器
3. `scada-editor/src/components/workflow/ActionEditor.tsx` - 动作编辑器
4. `scada-editor/src/components/workflow/WorkflowListPanel.tsx` - 工作流列表标签
5. `scada-editor/src/runtime/workflow/engine.ts` - 工作流引擎
6. `scada-editor/src/runtime/workflow/tools/callInterface.ts` - 接口调用工具
7. `scada-editor/src/hooks/useWorkflowRuntime.ts` - 运行时 Hook

## 测试建议

1. **触发源测试**:
   - 创建 `agent_scan` 工作流，检查 UI 配置是否正常显示
   - 验证设备列表动态加载
   - 检查不同扫码类型过滤逻辑

2. **STOMP 连接测试**:
   - 监听 WebSocket 连接是否建立
   - 使用 Agent 扫码，检查事件是否推送到浏览器
   - 验证重连机制

3. **外部应用接口测试**:
   - 创建外部应用和接口
   - 在工作流中配置调用外部接口
   - 验证参数映射和结果回填
   - 检查调试模式下的接口响应

4. **集成测试**:
   - Agent 扫码 → STOMP 推送 → 工作流触发 → 外部接口调用 → 结果回填 → UI 更新
   - 多设备同时扫码，验证设备过滤
   - 不同扫码类型混合触发，验证类型过滤

## 注意事项

1. **STOMP 主题名称**: 当前订阅 `/topic/device-events`，需确保服务端推送到此主题
2. **事件数据格式**: 假设 `event_data` 为 JSON 字符串，包含 `value`/`barcode`/`data` 字段
3. **认证**: STOMP 连接通过 `token` 查询参数或分享 `shareToken` 认证
4. **性能**: 仅当存在 `agent_scan` 工作流时才建立 STOMP 连接，避免不必要的资源消耗
5. **外部接口调试模式**: 当前通过 `/api/outbound/endpoints/debug` 调用，生产环境可能需要调整为正式执行接口

## 后续优化建议

1. **扫码内容预处理**: 支持正则表达式提取扫码值的特定部分
2. **扫码历史记录**: 在工作流上下文中保存最近 N 次扫码记录
3. **批量扫码触发**: 短时间内多次扫码合并为一次触发（防抖）
4. **外部接口缓存**: 对接口响应进行缓存，减少重复调用
5. **错误处理增强**: 外部接口调用失败时的重试和降级策略
6. **权限控制**: 限制哪些用户/角色可以配置 agent_scan 工作流
7. **监控告警**: 扫码事件处理失败率、外部接口调用延迟等指标

## 相关文档

- [AGENTS.md](./AGENTS.md) - Agent 架构文档
- [CLAUDE.md](./CLAUDE.md) - 项目开发指南
- [scada-editor/CONDITIONAL_STYLES_GUIDE.md](./scada-editor/CONDITIONAL_STYLES_GUIDE.md) - 组态编辑器条件样式
