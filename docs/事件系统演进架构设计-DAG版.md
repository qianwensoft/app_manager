# form-app 事件系统演进架构设计（DAG 编排版）

**版本**: v2.1
**日期**: 2026-06-18
**状态**: 待评审
**定位**: 本文档是事件系统的**总纲**（背景/选型/分层/分期/风险/评审）。各步的同粒度落地设计见下方索引，与本文配套阅读。

## 文档索引（配套落地设计）

| 文档 | 覆盖 | 状态 | 与本文关系 |
|---|---|---|---|
| **本文** `事件系统演进架构设计-DAG版.md` | 总纲：8 步路线 + 分层架构 + 对抗性评审 | 待评审 | 顶层 |
| `事件引擎脱Formily落地设计.md` | **第 1 步**：`StateScope`/`PageState`，事件引擎脱 Formily | ✅ 已实现 | 公共前置（5-8 步都依赖）|
| `第2步-AppState落地设计.md` | **第 2 步**：AppState + `state_change` 源 + app 级常驻事件 + 跨页范式 | ✅ 已实现 | 依赖第 1 步；答总纲待决 A3 |
| `第3-4步-ToolRegistry与降级守卫落地设计.md` | **第 3-4 步**：9 动作收敛为工具注册表 + 超时/重试/错误策略 + 环路守卫 | ✅ 已实现 | 依赖第 1-2 步；修 emit 死循环 |
| `第5步-窄DAG调度器落地设计.md` | **第 5 步**：自研精简 schema + 拓扑 BFS 调度 + $node 传递 + 静态环检测 + NodeTrace | ✅ 已实现 | 复用 1-4 步底座；能跑 DAG 但需第 6 步才能可视化配 |
| _（第 6 步：xyflow 画布）_ | 独立 React19 设计器微应用，绑自研 schema | **待细化** | 与第 5 步连续做才「能配且能跑」 |
| `A2-跨设备事件载荷契约设计.md` | **A2**：跨 form-app / 跨设备事件的载荷契约、安全边界、动作白名单 | ✅ 已定（v1.1，4 决策点已拍） | 第 7-8 步硬前置 |
| `第7a步-Android实现规格.md` | **第 7a 步**：同设备跨 form-app（AndroidBridge 中继）TS + Android 全链路 | ✅ 已实现 | 基于 A2 v1.1；最常见 PDA 协作场景 |
| _（第 7b 步：跨设备 STOMP）_ | 服务端 HTTP 端点 + form-app WebSocket 订阅 | **待细化** | 复用 7a TS 接收层 |
| _（第 8 步：yjs 协同）_ | AppState 作 yjs 文档 + CRDT 协同编辑 | **待细化** | 前置：A2 明确事件跨设备 ≠ 状态跨设备 |

> **阅读顺序**：先本文第一～三节（建立全局）→ 第九节对抗性评审（看清张力与已决项）→ 再按需读各步落地设计。**实施进度**：第 1-5 步 + 第 7a 步**已实现并验证**（56 单测 + 19 E2E + Android 编译通过 + 已合并 main）；第 6 步待开，第 7b-8 步待 7a 端到端验证后继续。

---

## 一、需求与已定决策

**产品规划（用户原话）**：事件系统作用于整个 form-app 层；可通过最底层事件流跨页面、甚至跨 form-app 简单交互；单页面内支持多种多条事件流；事件流符合 DAG 原则、执行过程有降级保护；支持多种 tools 调用（打印/语音/脚本/接口/设值…）；来源可以是独立事件定义、全局事件（如扫码）、状态字段监听等。

**已拍板的关键决策**：

| 决策点 | 选择 | 影响 |
|---|---|---|
| DAG 强度 | **窄 DAG（5 类节点，层级浅）+ 自研调度器** | 真实场景只需 tool/run_script/parallel/barrier/condition；不移植 workflow-engine（仅作结构参考）|
| 设计器 | **独立 React 19 微应用**（仿 scada-editor），画布借鉴 @xyflow/react，绑自研 schema | form-app 运行时不升 React |
| 跨域范围 | **跨设备**，后期引入 yjs 协同，**复用现有 STOMP 服务中继** | 事件系统扩成前后端联动 + CRDT 协同 |
| AppState | **是，紧接脱 Formily 后做** | 应用级共享状态 + `state_change` 源 |

---

## 二、对 workflow-engine 的复用判定（决定性约束）

实测 `qianwen/workflow-engine`（React 19 / @xyflow / zustand / zod 的 monorepo）。**最终判定：不复用其代码包，仅作结构参考。** 各包评估如下：

| 包 | 技术上能否进 R17 运行时 | 最终是否采用 | 原因 |
|---|---|---|---|
| `@workflow/schema` | ✅ 能（仅 zod） | ❌ 不采用，**自研精简 schema** | 它含 20 种 AI 节点 + budget/convergence 必填字段；我们只需 5 类节点 |
| `@workflow/frontend-engine` | ✅ 能（框架无关） | ❌ 不采用，**自研窄调度器** | 调度核心仅拓扑 BFS + Promise.all + 条件边，自研约一两百行；避免 fork 0.1.0 |
| `@workflow/editor` / `visualizer` | ❌ R19+xyflow，进不去 R17 | 🟡 **画布交互借鉴，schema 自绑** | 独立 R19 微应用里参考其 xyflow 用法，但数据模型用自研 schema |

**这一分裂决定了整个架构形态**：

- **运行时（form-app，React 17 不动）**：**自研**窄 DAG 调度器（拓扑 BFS + `Promise.all`，约一两百行），不复用 frontend-engine。**不需要为了事件系统升 React 19。**
- **设计器（节点画布）**：是 React 19 + xyflow，做成**独立微应用**——照搬你项目里 `scada-editor` 的成熟模式（独立 React app、Go 服务于 `/scada-editor/`、从外壳 `openScadaEditor()` 打开）。新建 `event-flow-editor/`，Go 服务于 `/event-flow-editor/`，从 form-app 控制台打开。**画布技术（@xyflow/react）可借鉴 workflow-engine 的 editor，但绑定的是我们自研的精简 schema，不绑它的 AI 数据模型。**

> **定调（2026-06-18）：不移植 workflow-engine，改为自研窄调度器。**
> 理由：① 已确认**层级浅、不需要完整 AI 语义 DAG**；② 真实场景只需 **5 类节点**（parallel-group / barrier-merge / condition / run_script / 普通 Tool），workflow-engine 的 loop/convergence/budget/agent/human/llm 等 14 种节点一个都用不上；③ 它的 `BaseNode` 把 retry/convergence/budget 设为必填、version 0.1.0、workspace 协议——vendor 进来即 fork，长期维护裁剪分支，性价比差于自研；④ 窄调度器核心就是拓扑 BFS + `Promise.all` + 条件边，自研可控、无新运行时依赖。
> **workflow-engine 的角色降为"参考资料"**：只在自研 schema/调度器/画布交互时**对照其结构与命名**，不引入任何包。

---

## 三、分层架构

```
┌─ 源层 Source ───────────────────────────────────────────────┐
│  独立事件定义 │ 全局事件(scan/nfc) │ 状态监听(field/state) │ 按钮 │ 生命周期 │
└────────────────────────────────────────────────────────────┘
            ↓ 触发
┌─ 编排层 Orchestration (自研窄调度器) ───────────────────────┐
│  事件流 = 浅层 DAG{nodes[], edges[]}（5 类节点，层级浅）     │
│  拓扑 BFS 调度 + Promise.all 并行 + barrier 汇合 + condition 分支│
│  降级保护: timeout / retry(backoff) / 错误策略 / 环路检测     │
│  节点间数据: $node.X.output 引用上游产出                      │
└────────────────────────────────────────────────────────────┘
            ↓ 节点执行
┌─ 工具层 Tools (统一注册表，取代闭合 union) ─────────────────┐
│  ToolRegistry: print/speak/run_script/call_interface/       │
│                set_field/set_field_prop/navigate/toast/emit │
│  每个 Tool: { name, paramsSchema(zod), execute, 默认超时/重试 } │
└────────────────────────────────────────────────────────────┘
            ↓ 读写
┌─ 作用域层 Scope (脱 Formily 的 StateScope 长成层级) ────────┐
│  AppState(应用级,常驻) ⊃ PageState(页面级,挂载期)            │
│  统一接口 StateScope: get/set/setProp/subscribe             │
│  表单页→FormilyPageState  非表单页→PlainPageState           │
└────────────────────────────────────────────────────────────┘
            ↕ 传输
┌─ 传输层 Transport ──────────────────────────────────────────┐
│  同SPA: 内存总线(eventManager) → 同设备: AndroidBridge       │
│  跨设备: 现有 /ws/stomp 中继 + (后期) yjs CRDT 协同          │
└────────────────────────────────────────────────────────────┘
```

### 3.1 数据模型演进

**现状**：`PageEvent { source, when, actions: EventAction[] }`，`actions` 是**线性 for 循环**。

**目标**：保留 `source`/`when`/`filters`（兼容），把 `actions[]` 升级为 **`graph: { nodes, edges }`**（自研精简结构，命名可对照 workflow-engine 但不引入其包）。

**节点种类只有 5 类**（由真实场景界定，不做完整 AI 语义 DAG）：

| 节点种类 | 作用 | 说明 |
|---|---|---|
| **tool** | 执行一个 Tool | print/speak/call_interface/set_field/set_field_prop/navigate/toast/emit（指向 ToolRegistry） |
| **run_script** | 受限 JS 决策 | 也是一种节点；可读 `$node.X` 上游产出、返回值供下游/分支用 |
| **parallel** | fan-out | 并发触发多个出边节点 |
| **barrier**（merge） | 汇合屏障 | 等所有入边节点完成再继续 |
| **condition** | 分支 | 按表达式选择走哪条出边 |

> 不含 loop / convergence / budget / agent / human / llm —— 层级浅、无 AI 语义。若日后出现"轮询直到条件"等真实需求再增 loop 节点。

```typescript
export interface EventFlow {
  id: string
  name?: string
  scope: 'page' | 'app'            // 页面级 / 应用级常驻
  source: EventSource              // 复用现有，扩 state_change
  filters?: ScanFilter             // 兼容
  when?: ConditionExpr             // 流级前置条件（兼容）
  graph: FlowGraph                 // 取代 actions[]
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]                // source→target，可带 condition
}

export type FlowNodeKind = 'tool' | 'run_script' | 'parallel' | 'barrier' | 'condition'

export interface FlowNode {
  id: string
  kind: FlowNodeKind
  tool?: ToolName                  // kind==='tool' 时指向 ToolRegistry
  script?: string                  // kind==='run_script' 时的脚本体
  params?: Record<string, ValueSrc> // 入参，值来源支持 $scan/$form.x/$node.X.out/字面量
  // 降级保护（自研，仅保留这三项；不要 budget/convergence）
  timeout?: number
  retry?: { maxAttempts: number; backoff: 'fixed'|'linear'|'exponential'; initialDelay: number }
  onError?: 'abort' | 'continue' | 'fallback'  // 错误策略
  fallbackNodeId?: string                       // onError=fallback 时的回退节点
  position?: { x: number; y: number }           // 画布坐标（运行时忽略）
}

export interface FlowEdge {
  id: string; source: string; target: string
  condition?: ConditionExpr        // 边级条件 → 分支
}
```

**节点间数据传递**：执行上下文新增 `$node.<nodeId>.<key>`，下游节点 params 可引用上游产出（自研，适配进现有 `resolveSrc`）。

**环路检测**：图保存时跑一次 DFS cycle detection（自研，约二三十行）；`emit_event` 跨流触发额外加**深度/广度守卫**（现状 `eventEngine.ts:298` 零守卫，是真实死循环 bug）。

> 因层级浅、节点少，整个调度器（拓扑 BFS + Promise.all 并行 + barrier 计数 + condition 选边 + 环检测）预计一两百行 TS，无外部依赖。

### 3.2 作用域层（StateScope，承接脱 Formily）

[事件引擎脱Formily落地设计.md] 里的 `PageState` 升级为通用 `StateScope`，长成层级：

```typescript
export interface StateScope {
  get(path): any
  set(path, value): void
  setProp(path, prop, value): void
  subscribe(cb: (name, value) => void): () => void
  getValues(): Record<string, any>
}

// 应用级：常驻于 form-app SPA 生命周期，跨页面存活
export function createAppState(): StateScope { /* 普通 reactive store (valtio/手写) */ }

// 页面级：挂载期存活；表单页 = FormilyPageState，非表单页 = PlainPageState
```

**`state_change` 源**：新增 `EventSource = { kind: 'state_change'; scope: 'app'|'page'; field: string }`，引擎对相应 scope 的 `subscribe` 注册——这就是"状态字段监听"的落地。`set_field`/`set_field_prop` 等工具也带 `scope`，决定写 AppState 还是 PageState。

### 3.3 工具层（ToolRegistry）

把现有 9 个 `EventAction` 从**闭合 union** 改为**注册表**：

```typescript
export interface Tool<P = any> {
  name: string
  paramsSchema: ZodSchema<P>                  // 设计器据此生成属性面板
  defaultTimeout?: number
  defaultRetry?: RetryConfig
  execute(params: P, ctx: ExecCtx): Promise<Record<string, any>>  // 返回值进 $node.X
}

export const toolRegistry = new Map<string, Tool>()
// 注册：print / speak / run_script / call_interface / set_field /
//       set_field_prop / navigate / toast / emit_event
```

加新工具只动一处（注册表），不再改类型 union + 引擎 switch + 设计器三处。现有 9 个 action 的执行逻辑逐个搬进对应 Tool.execute（语义不变）。

### 3.4 传输层

- **同 SPA 跨页面**：现有 `eventManager` 内存总线已支持；app 级事件流改为**常驻注册**（不随页面卸载清理）。
- **同设备跨 form-app**：经 `AndroidBridge`（agent WebView）中继。
- **跨设备**：经现有 `/ws/stomp`（server 已有 `stomp/` + `match-event`）。yjs CRDT 协同**后期**接入——yjs 文档作为协同事件流的共享状态，STOMP 作为 yjs 的 provider transport。

---

## 四、设计器：独立微应用（event-flow-editor）

照搬 `scada-editor` 模式，**不进 form-app SPA**：

- 新建 `event-flow-editor/`（Vite + React 19 + @xyflow/react + zustand）。画布交互**参考** workflow-engine 的 `editor` 包用法，但节点定义来自我们自研的 5 类 `FlowNodeKind` + Tool 列表（属性面板由 `Tool.paramsSchema` 生成），**不引入 `@workflow/*` 任何包**。
- Go 服务于 `/event-flow-editor/`（仿 scada 路由）。
- 从 form-app 控制台 `PagesPanel`/事件入口打开（仿 `openScadaEditor()`）。
- 读写同一个 `FormAppPage.config_json` 的 `events`（现在升级为 `event_flows`）/ 或 app 级事件存 `FormAppInfo` 级配置。
- 设计器产出 `FlowGraph`（含 position），运行时只读 nodes/edges 执行（忽略 position）。

> 收益：设计器用 React 19 + xyflow 全部现代能力，**form-app 运行时纹丝不动**。两个 app 通过**自研的 `FlowGraph` 类型定义**（一份纯 .d.ts，两处共享）保证数据模型一致。

---

## 五、实施顺序（每步独立可交付）

| 步 | 内容 | 依赖 | 可独立交付价值 |
|---|---|---|---|
| **1** | 事件引擎脱 Formily（StateScope/PageState）| 无 | 事件系统不再绑 Formily，公共前置 |
| **2** | AppState 层 + `state_change` 源 + app 级常驻事件 | 1 | "作用于整个 form-app 层" + 状态监听 + 跨页面 |
| **3** | ToolRegistry（9 action 收敛为注册表）| 1 | 加工具只动一处，统一超时/重试入口 |
| **4** | 降级保护 + 环路守卫（runActions 内）| 3 | 兑现"降级保护"，**修 emit 死循环 bug** |
| **5** | **自研**窄 DAG 数据模型 + 调度器（5 类节点，一两百行）| 3,4 | actions→graph，并行/汇合/分支/$node 传递 |
| **6** | 节点画布设计器（独立 event-flow-editor，xyflow 自绑 schema）| 5 | 可视化编排 |
| **7** | 跨设备（STOMP 中继）| 2,5 | 跨 form-app 简单交互 |
| **8** | yjs 协同 | 6,7 | 多人协同编辑事件流 |

**关键**：1-4 在**现有线性引擎上演进**，不需要 DAG 调度器和画布，已能兑现你规划里"应用级 / 状态监听 / 多工具 / 降级"四块。5-6 才是 DAG 强档（最重，但运行时仍 React 17，设计器独立 React 19）。7-8 是跨设备协同。**最贵最不确定的画布留在 5-6，且届时已有清晰的 graph 数据模型和复用源**。

---

## 六、对外契约与兼容

- **运行时数据**：`PageEvent.actions[]` → `EventFlow.graph`。需一个 `migrateActionsToGraph(actions)`：把线性 actions 转成单链 graph（n 个节点首尾相连），存量事件零迁移、零行为差异。`migrateScannerToEvents` 链路继续保留。
- **存储**：`FormAppPage.config_json.events` 升级；app 级事件流存 `FormAppInfo` 级配置（跨页面常驻的归属）。
- **`run_script` 的 ctx**：保持现有签名；DAG 下额外注入 `ctx.node` 读 `$node.X`。ScriptEditor 补全树相应增补一项。

---

## 七、风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 自研窄调度器的正确性（并行/屏障/分支/环检测边界） | 中 | 节点种类仅 5 类、层级浅，逻辑面小；配单元测试覆盖 fan-out/barrier/分支/环 |
| 画布设计器独立 app 增加部署/路由 | 低 | scada-editor 已验证此模式，照搬 |
| DAG 数据模型替换 actions，存量迁移 | 中 | migrateActionsToGraph 单链转换，逐字保行为；先在 1-4 把引擎抽象稳了再上 5 |
| 跨设备事件经 STOMP 的可靠性/重放语义 | 中 | 7 期单独设计幂等/去重；先做同设备(AndroidBridge)兜住主场景 |
| yjs + STOMP provider 集成复杂度 | 中 | 放最后(8)，前面步骤不依赖它 |

---

## 八、待决

1. **app 级事件流的存储归属**：`FormAppInfo` 级新字段，还是新建一张表？（跨页面常驻 + 跨 form-app 引用时的归属）
2. **跨 form-app 事件的寻址**：用 form_code 还是全局 topic？是否需要权限校验（A 应用能否 emit 到 B 应用）？
3. ~~设计器画布技术栈~~ **已定（2026-06-18）**：第 6 步设计器为独立微应用，**画布交互借鉴 workflow-engine 的 editor（@xyflow/react，React 19）**，但绑定自研的 5 类节点 schema，**不引入 `@workflow/*` 包**。
4. ~~是否移植 workflow-engine~~ **已定（2026-06-18）**：**不移植，自研窄调度器**。已确认层级浅、不需要 AI 语义 DAG，真实场景只需 5 类节点；自研可控、无新依赖、避免 fork 0.1.0。workflow-engine 仅作结构参考。

---

## 九、对抗性评审：未决张力与风险分级

> 本节是对前八节的自我攻击，目的是在动手前把"看起来顺、实则没想清楚"的地方摊开。分三级：**A 必须动手前定** / **B 可边做边定但要记着** / **C 已想清楚**。

### A 级——动手前必须有答案

**A1.（已解决）根本张力：DAG 为"长流程编排"设计，事件流多为"瞬时反应"——但有真实 DAG 场景，且界定为窄 DAG。**
原始张力：form-app 事件流主体是"扫码→填值→调接口→toast"这类**亚秒级、天然线性**的反应，那点并行需求 `run_script` 的 `Promise.all` 已能覆盖。曾担心强档 DAG 是"有锤子找钉子"。

> **2026-06-18 用户确认的真实场景**：前端并行调用多个接口 → 全部完成后执行一段 JS 判断决策 → 据此进入不同下游执行节点（复杂交互）。
> **评估**：这是真正 DAG 形状（fan-out → barrier-merge → run_script 决策 → condition 分支）。**DAG 成立**，因为：① 受众是非开发者配置者，可视化拖拽 > 手写 `Promise.all`；② 每个接口可声明式配超时/重试/回退；③ 失败节点可视化可观测；④ 下游 print/navigate 是已配好的复用 Tool 节点。
> **但它精确界定了所需节点种类**：parallel-group / barrier-merge / condition-branch / run_script / 普通 Tool ——**仅此五类**。**不需要** workflow-engine 的 loop/convergence/budget/agent/human/llm 等 14 种 AI 语义节点。
> **关键修正（强化 B2）**：→ **应自研窄调度器，不移植 workflow-engine。** 拓扑 BFS + `Promise.all` + 条件边，节点即 Tool，约几十到一两百行；移植 0.1.0 AI 引擎反需先剥离大量 AI 语义，性价比更差。schema 参考其结构自研。
> **关键洞察**：`run_script` 不是 DAG 的对立面，而是 **DAG 中的一种节点**（本场景"判断决策"步即 run_script 节点）。二者融合，不互斥。
> **待补**：此为 1 个场景，仍建议在 1-4 步落地后再积累 2-4 个，确认 DAG 节点集是否还需扩展（如循环/轮询）。

**A2. 跨设备事件存在语义鸿沟,不是"换个传输层"。**
同 SPA 内存总线是同步、可靠、共享上下文;跨设备经 STOMP 是异步、可丢、可重、延迟,且**两端 PageState 是两个不同的上下文**。
- 致命点:动作链里 `set_field`/`result_map` 回填、`$form.x` 取值,全假设"触发与上下文在同一处"。设备 A emit 一个事件到设备 B,B 的动作链里 `$form.x` 指谁的表单?A 的快照(需随事件序列化携带)还是 B 的当前页?
- 必答:**跨设备事件的载荷契约**——能携带什么(纯数据快照)、明令不能依赖什么(对端 form 状态/回填)。不定义清楚,第 7 步会变成"能 emit 但动作全是空指针"。建议:跨设备事件只允许**无副作用于对端本地状态**的动作(toast/speak/navigate/写 AppState),禁用依赖触发端上下文的 set_field/result_map。

**A3. AppState 生命周期没定义。**
"应用级常驻状态"听着简单,边界全是坑:何时初始化?何时重置(切 form-app?退出登录?手动清?)?多 form-app 共存时会不会串状态?app 级 `state_change` 事件常驻——若其动作含 `navigate`,从 A 页的状态变更触发、而当前在 B 页,跳转语义是什么?
- 必答:AppState 的**初始化/重置时机** + **作用域隔离**(每个 form_code 一个 AppState 实例,还是全局一个) + **常驻事件触发时当前页与目标页不一致时的动作语义**(尤其 navigate/set_field_prop 这种依赖"当前页 DOM"的动作)。

### B 级——可边做边定,但现在要记着

**B1. `$node.X.output` 把无状态求值变成有状态执行上下文。**
现状 `resolveSrc` 是纯函数(`$scan`/`$form.x`/字面量),引入 `$node.X.output` 后,执行器必须维护"本次执行的节点产出表",且节点并行时要保证只能引用**拓扑上游**的产出。这是 DAG 调度的固有复杂度。对照:`run_script` 用普通闭包变量传中间结果,零额外机制。→ 记着:`$node` 引用只在 DAG 调度器(第 5 步)上线后才有意义,1-4 步不要提前引入。

**B2.（已解决 → 自研）** 曾评估"移植 workflow-engine"实为 fork 一个 0.1.0 的 AI 引擎并裁剪：其 `BaseNode` 把 retry/convergence/budget 设为必填、20 种 AI 节点、execute/表达式都假设这套模型，裁剪即长期维护裁剪分支。
- **结论**：改为**自研窄调度器**——节点仅 5 类、层级浅，拓扑 BFS + Promise.all + 条件边 + 环检测约一两百行，无新依赖。workflow-engine 仅作 schema/命名的结构参考。**B2 不再是风险，已转为既定方案。**

**B3. 双 React 版本 + 共享 schema 包的工程债。**
form-app(R17) 运行时和 event-flow-editor(R19) 都要用同一份 `FlowGraph` 类型。app-manager **当前不是 monorepo**。两处各拷一份 → 改一处要手动同步;建 workspace → 引入 pnpm/turbo 改造。→ 记着:这是新的工程债,第 5-6 步前要定"共享类型怎么共享"(最轻量:一个纯 .d.ts 文件两处软链/脚本同步)。

**B4. 设计器(RFNode/RFEdge)与运行时(FlowNode/FlowEdge)两套模型 + 转换层 = 漂移点。**
xyflow 的 `toWorkflow`/`loadWorkflow` 双向转换是已知的 bug 温床(参考记忆里 @designable 的 transform 命名坑)。→ 记着:转换层必须有往返测试(load→to→load 幂等)。

**B5. DAG 的可观测性/调试是断崖。**
现状线性链失败 toast 一句即可。DAG 并行+分支+回退后,"哪个节点挂了、为什么、上游产出是什么"需要执行轨迹可视化——而那又是 React 19 + 画布的东西,**进不了 React 17 运行时**。→ 记着:运行时至少要有结构化的执行日志(节点级 status/耗时/错误),能回传设计器或控制台展示。第 5 步就要设计,不能等到出问题。

### C 级——已想清楚,作为约束守住

- C1. 脱 Formily(第 1 步)与 DAG/版本升级正交,且是公共前置——无论 DAG 强弱档都得做,先做不亏。
- C2. 运行时不升 React 19(复用可移植包),设计器独立 R19 微应用(scada 模式已验证)——版本鸿沟已化解。
- C3. ToolRegistry(第 3 步)、降级保护+环路守卫(第 4 步)收益明确、风险低,且不依赖 DAG。
- C4. `migrateActionsToGraph` 单链转换保证存量零迁移。

### 评审结论

**1-4 步:无保留推进**(脱 Formily / AppState / ToolRegistry / 降级守卫)。它们兑现你规划的"应用级/状态监听/多工具/降级"四块,风险低、彼此解耦、不依赖 DAG。其中 A3(AppState 生命周期)是第 2 步动手前的硬前置。

**5-6 步(窄 DAG + 画布):场景已确认(A1),方案已定为自研(B2)。** 仍建议在 1-4 步落地、积累 2-4 个真实事件流后再开工第 5 步,确认 5 类节点集是否需扩(如 loop)。第 5 步是**自研**精简 schema + 窄调度器(非移植),第 6 步画布借鉴 xyflow 但绑自研 schema。

**7-8 步(跨设备/协同):A2 是前置。** 载荷契约不定义,跨设备就是空指针工厂。
</content>

