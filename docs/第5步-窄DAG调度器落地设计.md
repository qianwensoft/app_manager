# 第 5 步：窄 DAG 调度器 落地设计

**版本**: v1.0
**日期**: 2026-06-19
**前置**: 第 1-4 步（StateScope / AppState / ToolRegistry / 降级守卫 + 环路守卫）均已落地并测过
**对应**: [事件系统演进架构设计-DAG版.md] 第 5 步 + 3.1 节
**范围**: 把事件流的动作链从**线性 `runActions`** 升级为**窄 DAG 调度**（5 类节点：tool/run_script/parallel/barrier/condition）。**自研**，不引入 workflow-engine。不含画布设计器（第 6 步）。

> 真实场景（用户确认）：并行调多接口 → 全部完成 → run_script 决策 → condition 分支进下游。本步只为这个形状服务，不做完整 workflow 引擎。

---

## 一、为什么现在能写得很实

1-4 步已把 DAG 要复用的底座建好且**单测覆盖**：

| 复用点 | 现状 | DAG 如何用 |
|---|---|---|
| `runEventAction(action, ctx, deps, emitScope)` | 已查表化，**返回 `Record<string,any>\|void`** | 节点执行直接调它；返回值即 `$node.<id>` 来源 |
| `ToolExecCtx.resolve` | 解析 `$scan/$form/$app/$event` | 扩 `$node.<id>.<key>` 一个分支即可 |
| `withTimeout/withRetry` | 已测 | 节点级降级直接复用（节点已带 timeout/retry 字段） |
| `EmitScope` 环路守卫 | 已测 | 图执行沿用；另加**图内 DFS 静态环检测** |
| `scopeOf` | 已测 | 节点写值分流不变 |

**结论**：第 5 步是"把 `runActions` 的线性 for 换成拓扑调度 + 给 resolve 加一个 `$node` 分支"，复用面 ≥ 80%。

---

## 二、数据模型（自研精简 schema）

新增 `runtime/dag/types.ts`：

```typescript
import type { EventAction, ConditionExpr, StateScopeKind } from '../eventTypes'

export type FlowNodeKind = 'tool' | 'run_script' | 'parallel' | 'barrier' | 'condition'

export interface FlowNode {
  id: string
  kind: FlowNodeKind
  /** kind==='tool' → 内嵌一个现有 EventAction（含其 type/params/降级字段） */
  action?: EventAction
  /** kind==='run_script' → 脚本体（决策节点，可读 $node 上游产出、写状态、返回值供下游/分支） */
  script?: string
  /** kind==='condition' → 出边按各自 edge.condition 选择；无显式则此字段留空 */
  label?: string
  position?: { x: number; y: number }   // 画布坐标，运行时忽略
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  /** 边级条件：condition 节点据此选择走哪条出边；普通边留空=无条件 */
  condition?: ConditionExpr
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}
```

**关键设计决定**：
- **tool 节点内嵌现有 `EventAction`**，不另立 params 模型——这样 9 个工具、降级字段、设计器编辑块**全部零改动复用**。DAG 只是动作的"编排容器"。
- **run_script 是一种节点**（不是动作的特例）——兑现"run_script 是 DAG 里的节点"的设计洞察。它的 `ctx.node('X')` 能读上游产出。
- **parallel/barrier/condition 是纯控制节点**，无 action，只影响调度走向。

**存量兼容**：`PageEvent.actions: EventAction[]` 与 `PageEvent.graph?: FlowGraph` 并存。`migrateActionsToGraph(actions)` 把线性链转为单链 graph（n 节点首尾相连），运行时优先用 `graph`，无则用 `actions`（走旧 `runActions`）。存量事件零迁移。

---

## 三、调度器（自研，约一两百行）

新增 `runtime/dag/scheduler.ts`：

```typescript
export async function runGraph(
  graph: FlowGraph,
  ctx: EventContext,
  deps: EventEngineDeps,
  emitScope: EmitScope,
): Promise<NodeOutputs>
```

### 3.1 拓扑调度（BFS + Promise.all）

```
1. 入度统计；入度 0 的节点为起点
2. ready 队列并发执行（Promise.all）
3. 节点完成 → 产出存入 outputs[nodeId] → 其后继入度 -1
4. 后继入度归零且「边条件满足」→ 进 ready
5. 循环至 ready 空
```

- **parallel 节点**：本身 no-op，其多条出边天然并发（调度器对 ready 队列 `Promise.all`）。即"fan-out"。
- **barrier 节点**：入度=上游分支数；调度器**等所有入边节点完成**才执行它（拓扑调度的自然语义）。即"汇合"。
- **condition 节点**：执行时对每条出边求值 `edge.condition`，**只放行满足的出边**（其余分支剪掉，其独占下游不执行）。即"分支"。
- **tool / run_script 节点**：调 `runEventAction` / `execScript`，返回值存 `outputs[id]`。

### 3.2 节点间数据：`$node.<id>.<key>`

`resolveSrc` 加一个分支（`eventEngine.ts`）：

```typescript
if (s.startsWith('$node.')) return resolveNestedField(ctx.nodeOutputs, s.slice(6))
```

`EventContext` 加可选 `nodeOutputs?: Record<string, any>`；调度器每完成一个节点就写入，下游 `resolve('$node.fetchA.result')` 即取上游产出。**只在 DAG 路径注入**，线性路径 `nodeOutputs` 为空，旧表达式零影响。

### 3.3 降级与环路守卫

- **节点级降级**：tool 节点内嵌 action 已带 timeout/retry/onError → `runEventAction` 内部已套 `withTimeout/withRetry`，**白拿**。节点级 onError=fallback 时，`fallbackNodeId`（DAG 版，替代 `fallbackActionIndex`）指向回退节点。
- **运行期环路守卫**：沿用 `EmitScope`（emit_event 节点跨流触发仍受深度/链守卫）。
- **图内静态环检测**：`runtime/dag/validate.ts` 的 `detectCycle(graph)`（DFS 三色标记），**保存时**校验，运行前再兜一次（防御坏数据导致调度死循环）。

### 3.4 与 runEventAction 的接缝

调度器执行 tool 节点：
```typescript
const out = await runEventAction(node.action, { ...ctx, nodeOutputs }, deps, emitScope)
outputs[node.id] = out ?? {}
```
**`runEventAction` 一行不用改**（它已返回 `Record<string,any>|void`、已查表、已套降级）。这是 1-4 步打的地基在此兑现。

---

## 四、接入点

`eventEngine.ts` 的 `runActions` 改为分流（保持函数签名）：

```typescript
async function runActions(ev, ctx, deps, emitScope = rootEmitScope()) {
  if (ev.graph && ev.graph.nodes?.length) {
    await runGraph(ev.graph, ctx, deps, emitScope)   // 新：DAG 路径
    return
  }
  // 旧：线性路径（存量事件，逐字不变）
  for (let i = 0; i < (ev.actions||[]).length; i++) { /* ...现状不动... */ }
}
```

所有调用 `runActions` 的源（scan/custom/state_change/button/lifecycle）**零改动**——它们只管触发，不关心动作链是线性还是 DAG。

`eventTypes.ts`：`PageEvent` 加可选 `graph?: FlowGraph`；`ActionBase` 的 `fallbackActionIndex` 在 DAG 节点语境用 `fallbackNodeId`（两者并存，线性用 index、图用 nodeId）。

---

## 五、可观测性（评审 B5，本步必做）

DAG 失败比线性难诊断，运行时必须产结构化执行轨迹：

```typescript
export interface NodeTrace {
  nodeId: string; kind: FlowNodeKind
  status: 'ok' | 'failed' | 'skipped' | 'timeout'
  startedAt: number; elapsedMs: number
  error?: string
  output?: any            // 截断后的产出预览
}
```

- `runGraph` 收集 `NodeTrace[]`，挂在一个可选回调 `deps.onTrace?(traces)` 上。
- 浏览器控制台开发期打印；生产可上报。**不依赖画布**（画布是第 6 步，运行时先有数据）。
- 失败节点 toast 带 nodeId + label，便于定位（线性版只有动作序号）。

---

## 六、改动清单

| 文件 | 改动 |
|---|---|
| `runtime/dag/types.ts` | 新增：FlowNode/FlowEdge/FlowGraph/NodeTrace |
| `runtime/dag/scheduler.ts` | 新增：runGraph（拓扑 BFS + Promise.all + condition 选边 + barrier 汇合 + trace） |
| `runtime/dag/validate.ts` | 新增：detectCycle（DFS）+ 保存期校验 |
| `runtime/dag/migrate.ts` | 新增：migrateActionsToGraph（线性→单链，存量兼容） |
| `runtime/eventEngine.ts` | resolveSrc 加 `$node.` 分支；EventContext 加 nodeOutputs；runActions 分流到 runGraph |
| `runtime/eventTypes.ts` | PageEvent 加 graph?；节点 fallbackNodeId |
| 单测 | scheduler.test：fan-out 并发、barrier 等齐、condition 选边/剪枝、$node 传递、节点超时、静态环检测 |

**对外契约**：`actions` 路径完全不变；`graph` 是新增可选字段。存量事件零行为变化、零迁移。

---

## 七、验收

1. `tsc` + `npm test` + 生产构建通过。
2. 单测覆盖窄 DAG 的每种节点语义（fan-out / barrier / condition / $node / 节点降级 / 静态环）。
3. `migrateActionsToGraph(actions)` 往返：线性事件转 graph 后经 runGraph 执行，结果与旧 runActions 逐一致。
4. 真实场景跑通（单测模拟）：parallel 调 3 接口 → barrier → run_script 读 3 个 $node 决策 → condition 进不同 toast/navigate。

---

## 八、本步不做（划界）

- ❌ 节点画布设计器（第 6 步，独立 React19 微应用）。本步 graph 只能由 migrate 生成或手写 JSON，**没有可视化编辑**——所以本步交付的是"运行时能执行 DAG"，能配出 DAG 要等第 6 步。
- ❌ loop 节点（真实场景不需要；出现"轮询直到"再加）。
- ❌ 跨设备节点（第 7 步）。

> 重要提醒：第 5 步交付后，DAG 能跑但**还配不出来**（无画布）。若希望"能配且能跑"，第 5、6 步需连续做。是否值得在画布就绪前先交付纯运行时，取决于是否有 migrate 来的存量需求或愿手写 JSON 验证。
</content>
