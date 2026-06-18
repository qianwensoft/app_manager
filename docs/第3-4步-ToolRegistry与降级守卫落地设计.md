# 第 3-4 步：ToolRegistry + 降级守卫 落地设计

**版本**: v1.0
**日期**: 2026-06-18
**前置**: 第 1 步（脱 Formily，`StateScope`）；第 2 步（AppState，双 scope deps + `$app.`）
**对应**: [事件系统演进架构设计-DAG版.md] 3.3 节 + 第 4 步 + 评审 B1
**范围**: 把 9 个动作从闭合 union 收敛为**工具注册表**；在动作执行层加**超时/重试/错误策略/环路守卫**。**不引入** DAG（但为第 5 步铺好节点执行契约）。

> 合并成一份的理由：ToolRegistry 是降级配置的**挂载点**（默认超时/重试挂在 Tool 上、逐次覆盖挂在动作上），两步在 `runEventAction`/`runActions` 同一层咬合，分开写会反复横跳。

---

## 一、现状与问题

`eventEngine.ts` 的执行核心是一个大 `switch(action.type)`（`runEventAction`，9 个 case）+ 一个 `for` 循环（`runActions`）。问题：

1. **加工具要改三处**：`eventTypes.ts` 的 union、`eventEngine.ts` 的 switch、设计器 `EventsConfigSection` 的编辑块。
2. **降级能力几乎为零**：`runActions` 仅 try/catch + 失败 `break` + toast（`eventEngine.ts:323-333`）。无超时（一个卡死的接口会永久挂起动作链）、无重试、无回退分支。
3. **`emit_event` 零环路守卫**（`eventEngine.ts:298`）：`setTimeout(0)` 异步派发，A→B→A 可无限递归——**真实死循环 bug**。

---

## 二、第 3 步：ToolRegistry

### 2.1 设计原则——保留存储格式，只换执行分发

**不改动存储结构**：事件流里动作仍存为 `{ type:'set_field', field, value_src, when, ... }`。`type` 即工具名，动作对象**其余字段即该工具的 params**。改的只是"执行时从 switch 查表改为从注册表查表"。这样存量事件零迁移、`migrateScannerToEvents` 链路不动。

### 2.2 `runtime/tools/types.ts`（新增）

```typescript
import type { EventContext } from '../eventTypes'
import type { EventEngineDeps } from '../eventEngine'

/** 工具执行上下文：在 deps 基础上补充本次执行的产出表（第 5 步 DAG 用 $node 时填充） */
export interface ToolExecCtx {
  ctx: EventContext            // { scan, form, app, event }
  deps: EventEngineDeps        // pageState / appState / onScanInterface / doPrint / navigate / toast
}

export interface Tool {
  /** 工具名 = 动作 type，全局唯一 */
  name: string
  /** 该工具默认降级配置（可被动作级配置覆盖；见第 4 步）*/
  defaults?: { timeout?: number; retry?: RetryConfig }
  /**
   * 执行。入参 action = 动作对象本身（含其专属字段）。
   * 返回值进 $node.<id>（第 5 步 DAG 用），线性阶段返回 void 即可。
   */
  execute(action: any, x: ToolExecCtx): Promise<Record<string, any> | void>
}

export const toolRegistry = new Map<string, Tool>()
export const registerTool = (t: Tool) => { toolRegistry.set(t.name, t) }
export const getTool = (name: string) => toolRegistry.get(name)
```

### 2.3 9 个工具：逐个搬运（语义逐字不变）

把现有 `runEventAction` 的 9 个 case **原样**搬进各自 Tool.execute。例（set_field，含第 2 步的 scope）：

```typescript
// runtime/tools/setField.ts
registerTool({
  name: 'set_field',
  execute: async (a, { ctx, deps }) => {
    if (!a.field) return
    const val = resolveSrc(a.value_src, ctx)
    if (val !== undefined) scopeOf(deps, a.scope).set(a.field, val)  // 第2步 scope
  },
})
```

call_interface 例（带默认超时——接口调用最该有超时）：

```typescript
// runtime/tools/callInterface.ts
registerTool({
  name: 'call_interface',
  defaults: { timeout: 15000, retry: { maxAttempts: 1, backoff: 'fixed', initialDelay: 0 } },
  execute: async (a, { ctx, deps }) => {
    if (!deps.onScanInterface) return
    const paramValues: Record<string, any> = {}
    for (const p of a.param_map || []) if (p.key) paramValues[p.key] = resolveSrc(p.src, ctx)
    const res = /* ...原 switch 里 internal/third_party/connector 分发，逐字不变... */
    for (const { response_field, form_field } of a.result_map || []) {
      if (!form_field) continue
      const v = resolveNestedField(res, response_field)
      if (v != null) scopeOf(deps, a.scope).set(form_field, v)
    }
    return { result: res }   // 进 $node（第5步）；线性阶段忽略
  },
})
```

清单（全部从现 switch 平移）：`set_field` / `call_interface` / `print` / `navigate` / `toast` / `set_field_prop` / `speak` / `emit_event` / `run_script`。
- `set_field_prop` 的 truthy/visible/style recipe **已在第 1 步下沉到 FormilyPageState.setProp**——这里只调 `scopeOf(deps,a.scope).setProp(...)`。
- `emit_event` / `run_script` 的内部逻辑（setTimeout 派发、AsyncFunction）原样搬；**环路守卫在第 4 步加**（见 4.4）。
- `run_script` 的 `buildScriptApi` 也搬进 `tools/runScript.ts`，ctx API 签名不变（已含第 2 步 appGet/appSet）。

### 2.4 `runEventAction` 退化为查表

```typescript
export async function runEventAction(action, ctx, deps): Promise<Record<string, any> | void> {
  const tool = getTool(action.type)
  if (!tool) { deps.toast?.(`未知工具：${action.type}`); return }
  return tool.execute(action, { ctx, deps })   // 第4步在此包超时/重试
}
```

### 2.5 注册入口

```typescript
// runtime/tools/index.ts —— import 各工具触发 registerTool；在 eventEngine 顶部 import 一次
import './setField'; import './callInterface'; /* ...9 个... */
```

### 2.6 类型与设计器

- `eventTypes.ts`：`EventAction` union **保留**（仍给设计器/存量做强类型），但 `runEventAction` 不再依赖它做穷尽——加工具时，运行时只需 `registerTool`，类型可后补。**渐进式**：核心 9 个保持强类型，扩展工具可先用 `Record<string,any>`。
- 设计器 `EventsConfigSection` 的 ActionsEditor：动作类型下拉**从 `toolRegistry.keys()` 生成**（而非硬编码）；属性面板仍按 type 渲染对应编辑块（这部分第 5 步可进一步用 paramsSchema 自动生成，本步先保留手写块）。

**第 3 步验收**：加工具只需新增一个 `tools/xxx.ts` + 注册，不碰 `runEventAction`。现有 9 工具行为零变化（`tsc` + 回归）。

---

## 三、第 4 步：降级守卫

### 3.1 降级配置：三处来源，逐级覆盖

```typescript
export interface RetryConfig {
  maxAttempts: number                  // 含首次；1=不重试
  backoff: 'fixed' | 'linear' | 'exponential'
  initialDelay: number                 // ms
  maxDelay?: number
}
```

优先级（高→低）：**动作级配置** > **Tool.defaults** > **全局兜底**。

```typescript
const resolveDegrade = (action, tool: Tool) => ({
  timeout: action.timeout ?? tool.defaults?.timeout ?? undefined,        // 默认不超时（兼容现状）
  retry:   action.retry   ?? tool.defaults?.retry   ?? { maxAttempts: 1, backoff:'fixed', initialDelay:0 },
})
```

`ActionBase`（`eventTypes.ts`）加可选字段（默认不填 = 现状行为，存量零变化）：
```typescript
export interface ActionBase {
  when?: ConditionExpr
  timeout?: number          // 新增，可选
  retry?: RetryConfig       // 新增，可选
  onError?: 'abort' | 'continue' | 'fallback'   // 新增，默认 'abort'（= 现状 break）
  fallbackActionIndex?: number                   // onError='fallback' 时回退到链中哪个动作
}
```

### 3.2 超时 + 重试包装

```typescript
// runtime/degrade.ts（新增）
function withTimeout<T>(p: Promise<T>, ms?: number): Promise<T> {
  if (!ms) return p
  return Promise.race([p, new Promise<T>((_, rej) =>
    setTimeout(() => rej(new Error(`工具执行超时(${ms}ms)`)), ms))])
}

async function withRetry<T>(fn: () => Promise<T>, r: RetryConfig): Promise<T> {
  let last: any
  for (let i = 0; i < Math.max(1, r.maxAttempts); i++) {
    try { return await fn() }
    catch (e) {
      last = e
      if (i < r.maxAttempts - 1) {
        const base = r.backoff === 'exponential' ? r.initialDelay * 2 ** i
                   : r.backoff === 'linear'      ? r.initialDelay * (i + 1)
                   : r.initialDelay
        await new Promise(res => setTimeout(res, Math.min(base, r.maxDelay ?? base)))
      }
    }
  }
  throw last
}
```

`runEventAction` 套上：
```typescript
const tool = getTool(action.type); if (!tool) {...}
const { timeout, retry } = resolveDegrade(action, tool)
return withRetry(() => withTimeout(tool.execute(action, { ctx, deps }), timeout), retry)
```

> 注意：`navigate`/`toast`/`emit_event`/`set_field` 这类瞬时同步动作配超时/重试无意义但无害（不填即 noop）。**默认全不填 → 行为与现状完全一致**，降级是 opt-in。

### 3.3 错误策略：runActions 升级

现状 `runActions` 失败即 `break`。升级为按 `onError` 分流：

```typescript
async function runActions(ev, ctx, deps, exec /*第4.4执行上下文*/): Promise<void> {
  const actions = ev.actions || []
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (action.when && !evalCondition(action.when, ctx)) continue   // 现有：单动作条件
    try {
      const out = await runEventAction(action, ctx, deps)
      // 第5步：out 写入 $node 表；线性阶段忽略
    } catch (e: any) {
      const strategy = action.onError ?? 'abort'
      deps.toast?.(`「${ev.name||ev.id}」动作${i+1}失败：${e?.message||e}`)
      if (strategy === 'continue') continue
      if (strategy === 'fallback' && action.fallbackActionIndex != null) {
        try { await runEventAction(actions[action.fallbackActionIndex], ctx, deps) } catch { /* 回退也失败则止 */ }
        continue
      }
      break   // 'abort'（默认，= 现状）
    }
  }
}
```

三种策略：
- `abort`（默认）：现状行为，失败中断后续。
- `continue`：失败跳过该动作、继续链。
- `fallback`：失败转执行 `fallbackActionIndex` 指向的动作（如"调接口失败 → toast 提示 + 走离线分支"），再继续。

> `fallback` 用"链内索引"在线性阶段够用；第 5 步 DAG 化后升级为 `fallbackNodeId`（架构 3.1 已定字段）。

### 3.4 环路守卫（修真实死循环 bug）

`emit_event` → 以该名为 `custom_event` 源的事件流 → 其动作可能再 `emit_event`，形成环。现状零守卫。

引入**执行上下文 `EmitScope`**，贯穿一次"事件触发引发的整条 emit 链"：

```typescript
// runtime/emitScope.ts（新增）
export interface EmitScope {
  depth: number                 // 当前 emit 深度
  chain: string[]               // 已途经的事件名（用于环检测 + 诊断）
  readonly maxDepth: number     // 上限，默认 20
}
export const rootEmitScope = (): EmitScope => ({ depth: 0, chain: [], maxDepth: 20 })
```

`emit_event` 工具改为携带 scope 派发：
```typescript
// tools/emitEvent.ts
execute: async (a, { ctx, deps, emit }) => {   // emit 由引擎注入
  if (!a.event_name) return
  const data = /* ...原序列化逻辑... */
  emit(a.event_name, data)   // 引擎内部带 scope 守卫
}
```

引擎侧的 `emit`（取代裸 `eventManager.emit`）：
```typescript
function makeGuardedEmit(scope: EmitScope, deps) {
  return (name: string, data: string) => {
    if (scope.depth >= scope.maxDepth) {
      deps.toast?.(`事件链过深(${scope.maxDepth})，疑似循环：${[...scope.chain, name].join('→')}`)
      return   // 截断，不再派发
    }
    if (scope.chain.includes(name)) {
      deps.toast?.(`检测到事件环路：${[...scope.chain, name].join('→')}`)
      return   // 直接环：A→B→A 截断
    }
    const childScope: EmitScope = { ...scope, depth: scope.depth + 1, chain: [...scope.chain, name] }
    setTimeout(() => eventManager.emit(name, data, childScope), 0)  // scope 随事件传递
  }
}
```

要点：
- **直接环检测**（`chain.includes`）+ **深度上限**（`maxDepth`）双保险：前者挡 A→B→A，后者挡 A→B→C→…→Z 的长链/扇出爆炸。
- scope 随事件在 `eventManager` 里透传（`emit(name,data,scope?)` 加可选第三参，默认 `rootEmitScope()`）——需要 `EventHandler.ts` 的 `emit`/handler 签名小改（透传 scope；外部触发如扫码用 root scope）。
- 截断时 toast 出**完整链路**，便于配置者定位。

### 3.5 `EventHandler.ts` 改动（最小）

`emit(eventType, eventData)` → `emit(eventType, eventData, scope = rootEmitScope())`；handler 调用时把 scope 透传给 setupPageEvents 注册的 handler，由其建 `makeGuardedEmit(scope)` 注入工具。扫码/键盘楔等**外部源用 root scope**（深度从 0 起）。

---

## 四、改动清单

| 文件 | 改动 |
|---|---|
| `runtime/tools/types.ts` | 新增：`Tool`/`ToolExecCtx`/`toolRegistry`/`registerTool`/`getTool` |
| `runtime/tools/*.ts`（9 个）| 新增：9 工具，从 `runEventAction` 各 case 平移 |
| `runtime/tools/index.ts` | 新增：import 触发注册 |
| `runtime/degrade.ts` | 新增：`withTimeout`/`withRetry`/`resolveDegrade` |
| `runtime/emitScope.ts` | 新增：`EmitScope`/`rootEmitScope`/`makeGuardedEmit` |
| `runtime/eventEngine.ts` | `runEventAction` 退化为查表+降级包装；`runActions` 加 onError 分流；emit 改 guarded；删原 9 case switch（逻辑已搬走）|
| `runtime/eventTypes.ts` | `ActionBase` 加 `timeout`/`retry`/`onError`/`fallbackActionIndex`；union 保留 |
| `runtime/EventHandler.ts` | `emit` 加可选 scope 第三参，透传；外部源用 root scope |
| 设计器 `EventsConfigSection.tsx` | 动作下拉从 `toolRegistry.keys()` 生成；动作编辑块加「降级」折叠区（超时/重试/onError）|

**对外契约**：`ActionBase` 新字段全可选、默认值 = 现状行为 → **存量事件零行为变化**。新增的降级/环路守卫是 opt-in + 后台兜底（环路守卫始终开，但只在真出环时触发）。

---

## 五、验证

1. `npx tsc --noEmit` 通过。
2. **工具收敛**：9 工具行为与重构前逐一比对（set_field/call_interface/print/navigate/toast/set_field_prop/speak/emit_event/run_script）一致。
3. **加工具**：新增一个 demo 工具仅靠 `tools/demo.ts`+注册，`runEventAction` 不动 → 可触发。
4. **超时**：配一个 5s 超时的 call_interface，mock 接口挂起 10s → 5s 时报超时、动作链按 onError 处理，不永久挂起。
5. **重试**：mock 接口前 2 次失败第 3 次成功，retry maxAttempts=3 exponential → 最终成功，间隔递增。
6. **错误策略**：abort（失败中断）/continue（跳过续跑）/fallback（转执行回退动作）三者各验一条。
7. **环路守卫**：配 A emit B、B emit A → 第二跳被截断 + toast 出 `A→B→A`，不死循环、不栈溢出。
8. **深度上限**：配自我 emit 的事件 → depth 到 20 截断。
9. 存量事件（无降级配置）行为与上线前一致。

---

## 六、与后续步骤衔接

- **第 5 步 DAG**：Tool.execute 的返回值（`Record<string,any>`）即 `$node.<id>` 来源；degrade.ts 的 withTimeout/withRetry 直接复用为节点级降级；`fallbackActionIndex` 升级为 `fallbackNodeId`；EmitScope 的环检测思路扩展为图级 DFS 环检测（架构 3.1）。
- **第 7 步跨设备**：跨设备 emit 复用 `makeGuardedEmit` 的 scope 链——跨设备跳数也计入 depth，防跨设备事件风暴。

---

## 七、本步不做

- ❌ 不做 paramsSchema 自动生成属性面板（第 5 步随 DAG 一起，本步设计器仍手写编辑块）。
- ❌ 不做 DAG（无 nodes/edges、无并行/分支）；动作仍线性链，仅加降级与环路守卫。
- ❌ 不做熔断/限流（事件系统是前端瞬时反应，暂无需求；如需另立）。
</content>
