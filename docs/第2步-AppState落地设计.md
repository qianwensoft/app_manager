# 第 2 步：AppState 应用级状态层 落地设计

**版本**: v1.0
**日期**: 2026-06-18
**前置**: [事件引擎脱Formily落地设计.md]（第 1 步，必须先完成——本步依赖 `StateScope` 抽象）
**对应**: [事件系统演进架构设计-DAG版.md] 第 5 步之前的 3.2 节 + 待决 A3
**范围**: 引入应用级共享状态 `AppState` + `state_change` 事件源 + app 级常驻事件流。**不动** React/antd 版本，**不引入** DAG。

---

## 一、目标与 A3 的回答

**产品诉求**：事件系统"作用于整个 form-app 层"、"状态字段监听"、"跨页面交互"。

**第 1 步给了什么**：`StateScope` 接口（get/set/setProp/subscribe/getValues）+ 表单页的 `FormilyPageState` 适配器。**页面级**状态已抽象、事件引擎已脱 Formily。

**本步要补的、即 A3 三个硬前置的答案**：

| A3 待答 | 本设计的决定 |
|---|---|
| 初始化时机 | `MultiPageRuntime` 挂载（进入某 form-app）时为该 `formAppCode` 创建 AppState |
| 重置时机 | `MultiPageRuntime` 卸载时销毁；另提供显式 `reset()`（退出登录/手动清）|
| 作用域隔离 | **每个 `formAppCode` 一个 AppState 实例**，经 React Context 下发；**绝不做模块单例**（避开 `eventManager`/`navigationManager` 的多 app 串扰隐患）|
| 常驻事件 current≠target 时动作语义 | 见第四节：分动作定义，set_field/set_field_prop 对未挂载页 no-op+warn，navigate 永远有效，写 AppState 永远有效 |

---

## 二、为什么不能用模块单例（关键约束）

现状 `eventManager`（`EventHandler.ts:35`）、`navigationManager`（`NavigationManager.ts:61`）都是 `export const xxx = new XxxManager()` 模块单例。在**同一 SPA 实例里先后/并存打开多个 form-app** 时，它们的状态是串的——这是已存在的潜在 bug。

AppState 若也做成模块单例，会把"跨页面"误扩成"跨 form-app 串状态"，与隔离要求直接冲突。**因此 AppState 必须按 `formAppCode` 实例化，经 Context 下发**。这样：
- 单 form-app（agent WebView 主场景）：一个实例，行为符合直觉。
- 多 form-app（浏览器内切换/嵌套预览）：各自隔离，互不污染。
- 真正的跨 form-app 通信（架构第 7 步）走**显式传输层**（STOMP/Bridge），而非共享内存——语义清晰、可加权限校验。

---

## 三、模块设计

### 3.1 `runtime/appState.ts`（新增）

复用第 1 步的 `StateScope` 接口，AppState 是它的一个 plain 实现 + 少量应用级能力：

```typescript
import type { StateScope, FieldProp } from './pageState'

export interface AppState extends StateScope {
  /** 显式重置（退出登录/手动清空），清值 + 通知订阅者 */
  reset(): void
  /** 销毁：清订阅者，释放（MultiPageRuntime 卸载时调用） */
  dispose(): void
}

export function createAppState(formAppCode: string, initial: Record<string, any> = {}): AppState {
  let values: Record<string, any> = { ...initial }
  const subs = new Set<(name: string, v: any) => void>()

  const notify = (name: string, v: any) => {
    // 异步派发，避免在 set 的同步栈内重入（与 emit_event setTimeout(0) 一致的防重入约定）
    setTimeout(() => subs.forEach(cb => { try { cb(name, v) } catch { /* 隔离单个订阅者错误 */ } }), 0)
  }

  return {
    getValues: () => values,
    get: (path) => path.split('.').reduce((c, k) => (c == null ? c : c[k]), values),
    set: (path, value) => {
      if (!path) return
      const keys = path.split('.')
      let cur: any = values
      for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ??= {})
      cur[keys[keys.length - 1]] = value
      notify(keys[keys.length - 1], value)   // 短名通知，与 PageState.subscribe 语义一致
    },
    setProp: () => { /* AppState 无 UI 字段，setProp 不适用 → no-op */ },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
    reset: () => { values = {}; notify('*', undefined) },
    dispose: () => { subs.clear(); values = {} },
  }
}
```

要点：
- `subscribe` 的回调签名 `(shortName, value)` **与第 1 步 `StateScope` 完全一致**——`state_change` 源对 PageState / AppState 用同一套订阅代码，无分叉。
- `setProp` no-op：AppState 是纯数据，没有"字段显示属性"。`set_field_prop` 动作指向 app 作用域时直接忽略（属正常，不报错）。
- 通知用 `setTimeout(0)` 防重入，沿用项目既有约定（`eventEngine.ts:298` emit、第 1 步 PlainPageState 同此）。

### 3.2 React Context 下发

```typescript
// runtime/AppStateContext.tsx（新增）
const AppStateCtx = React.createContext<AppState | null>(null)
export const useAppState = () => useContext(AppStateCtx)

// MultiPageRuntime.tsx：按 formAppCode 建实例，挂载即建、卸载即销毁
const appState = useMemo(() => createAppState(formAppCode), [formAppCode])
useEffect(() => () => appState.dispose(), [appState])   // 卸载销毁
// 包裹：<AppStateCtx.Provider value={appState}> ... </Provider>
```

`useMemo([formAppCode])`：切换 form-app（code 变）会**重建** AppState，旧实例随之 dispose——天然隔离。

### 3.3 `state_change` 事件源

`eventTypes.ts` 的 `EventSource` 扩一项（保持其余不变）：

```typescript
export type EventSource =
  | { kind: 'scan'; scan_type?: ... }
  | { kind: 'custom_event'; event_name: string }
  | { kind: 'button'; button_id: string }
  | { kind: 'field_change'; field: string }              // 现有：页面表单字段
  | { kind: 'state_change'; scope: 'app' | 'page'; field: string }  // 新增
  | { kind: 'page_enter' } | { kind: 'page_exit' }
```

`field_change` 与 `state_change(scope:'page')` 的关系：前者是后者在 page 作用域的特例。**保留 `field_change` 不动**（存量兼容），`state_change(scope:'page')` 内部复用同一 PageState.subscribe，只是显式带 scope；新事件优先用 `state_change`。

### 3.4 引擎接入：双 scope 的 deps

第 1 步的 `EventEngineDeps.state: StateScope` 升级为双作用域：

```typescript
export interface EventEngineDeps {
  pageState: StateScope        // 页面级（表单页=FormilyPageState）
  appState: StateScope         // 应用级（来自 Context）
  // ... onScanInterface / doPrint / navigate / toast 不变
}

// 按 scope 取 scope 实例
const scopeOf = (deps, scope?: 'app'|'page'): StateScope =>
  scope === 'app' ? deps.appState : deps.pageState
```

- `setupPageEvents` 里 `state_change` 源：`scopeOf(deps, ev.source.scope).subscribe(...)`。
- 动作 `set_field`/`set_field_prop` 增可选 `scope?: 'app'|'page'`（默认 `page`，存量零变化）：写哪个 scope 由它决定。
- 取值 `resolveSrc` 增 `$app.x` 前缀（读 AppState），`$form.x` 仍读 pageState。**保持向后兼容**：旧表达式全部走 pageState。

```typescript
// resolveSrc 扩展（eventEngine.ts）
if (s.startsWith('$app.')) return resolveNestedField(ctx.app, s.slice(5))   // 新增
if (s.startsWith('$form.')) return resolveNestedField(ctx.form, s.slice(6)) // 现有
```

`EventContext` 加一个 `app` 快照字段（与现有 `form` 并列），`buildScriptApi` 的 ctx 增 `ctx.appGet/appSet`（脚本里读写 AppState）。

---

## 四、A3 焦点：app 级常驻事件 + current≠target 动作语义

### 4.1 常驻注册（区别于页面级）

- **页面级事件**：在 `SchemaFormRenderer` 挂载期注册、卸载清理（现状）。
- **app 级事件**（`scope:'app'` 的 EventFlow）：在 `MultiPageRuntime` 挂载时注册一次，**跨页面存活**，卸载（离开 form-app）时清理。

新增 `runtime/setupAppEvents.ts`：MultiPageRuntime 挂载时调用，注册所有 `scope:'app'` 事件流，deps 的 pageState 用一个**指向"当前活动页"的间接引用**（见 4.2）。

### 4.2 当前页与目标页不一致时——逐动作定义

app 级事件常驻，触发时"当前活动页"可能不是动作想操作的页。这是 A3 最棘手处，逐动作给出确定语义：

| 动作 | current≠target 时的行为 | 理由 |
|---|---|---|
| 写 `$app`（set_field scope=app）| **永远生效** | AppState 与页面无关 |
| `toast` / `speak` / `emit_event` | **永远生效** | 与当前页 DOM 无关 |
| `navigate` | **永远生效**（就是用来切页的）| 切页是其本职 |
| `call_interface`（不回填）| **永远生效** | 纯副作用 |
| `set_field` / `set_field_prop`（scope=page）| **仅当目标页 = 当前活动页时生效；否则 no-op + 开发期 warn** | 未挂载的页没有 PageState/DOM 可写 |
| `call_interface` 的 `result_map` 回填到 page 字段 | 同上：当前页才回填，否则结果丢弃（或转写 $app）| 同上 |
| `print`（取 page 值）| 取**当前活动页** pageState 快照 | 打印用当前上下文 |

**"当前活动页 pageState"的获得**：MultiPageRuntime 维护一个 `activePageStateRef`，当前页的 `SchemaFormRenderer` 挂载时把自己的 pageState 注册进去、卸载时注销。app 级事件 deps 的 pageState 解引用这个 ref。**列表/详情页（无 FormilyPageState）时 ref 为 null**，所有 page 作用域动作走 no-op 分支。

> 取舍：是否对"目标页未挂载的 set_field"做**缓冲**（待该页挂载时补写）？**本期不做**——语义复杂（缓冲多久？多次写如何合并？）、易制造幽灵状态。需要跨页传值就**显式写 $app**，由目标页 page_enter 事件从 $app 读取回填。这条规则要写进设计器提示。

### 4.3 跨页传值的推荐范式（替代缓冲）

A 页 → B 页传值的标准做法，纳入设计器引导：
1. A 页动作：`set_field scope=app` 写 `$app.xxx`。
2. B 页配 `page_enter` 事件：`set_field`（page）value_src=`$app.xxx`，把应用态读进本页表单。

这样跨页传值**完全可视化、无隐藏缓冲、时序确定**。

---

## 五、改动清单

| 文件 | 改动 |
|---|---|
| `runtime/appState.ts` | 新增：`createAppState` + `AppState` 接口 |
| `runtime/AppStateContext.tsx` | 新增：Context + `useAppState` |
| `runtime/pageState.ts` | （第 1 步已建）无改动，AppState 复用其 `StateScope` |
| `runtime/eventTypes.ts` | `EventSource` 加 `state_change`；`SetFieldAction`/`SetFieldPropAction` 加可选 `scope` |
| `runtime/eventEngine.ts` | `EventEngineDeps` 改双 scope（pageState+appState）；`resolveSrc` 加 `$app.`；`EventContext` 加 `app`；`state_change` 源注册；动作按 scope 取 state + current≠target 守卫；`buildScriptApi` 加 appGet/appSet |
| `runtime/setupAppEvents.ts` | 新增：app 级常驻事件注册（MultiPageRuntime 调用）|
| `runtime/MultiPageRuntime.tsx` | 建 AppState（useMemo[formAppCode]）+ Provider 包裹 + 卸载 dispose；维护 `activePageStateRef`；挂载时 setupAppEvents |
| `runtime/SchemaFormRenderer.tsx` | 挂载时把自身 pageState 注册进 `activePageStateRef`，卸载注销；事件 deps 增 appState（从 useAppState）|

**对外契约影响**：
- `set_field`/`set_field_prop` 的 `scope` 是**可选、默认 page** → 存量事件零变化。
- `$app.` 是新前缀 → 旧表达式不受影响。
- 设计器（EventsConfigSection）需加：source 下拉增"状态变更(state_change)"+ scope 选择；set_field/set_field_prop 编辑块加 scope 切换；值来源 AutoComplete 加 `$app.` 建议。ScriptEditor 补全树加 `ctx.appGet/appSet`。

---

## 六、验证

1. `npx tsc --noEmit` 通过。
2. **隔离**：浏览器内打开 form-app A 写 `$app.x`，切到 form-app B，B 的 `$app.x` 为空（实例隔离生效）。
3. **常驻 + 跨页**：A 页写 `$app.token`；navigate 到 B 页；B 页 page_enter 读 `$app.token` 回填字段 → 成功。
4. **state_change(app)**：配一条 app 级事件监听 `$app.status` 变化 → toast；在任意页改 status → 任意页都收到 toast。
5. **current≠target 守卫**：app 级事件里 set_field 目标为非当前页字段 → no-op + 控制台 warn，不报错、不写脏数据。
6. **reset/dispose**：退出登录调 reset → 订阅者收到 `*` 通知、值清空；离开 form-app → AppState dispose、无内存泄漏（订阅者清空）。
7. Android 菜单（`/form-app/runtime/:code`）同一 SPA 行为一致。

---

## 七、与后续步骤的衔接

- **第 3 步 ToolRegistry**：set_field/set_field_prop 收敛为 Tool 时，`scope` 作为 Tool param 自然延续。
- **第 5 步 DAG**：节点 params 的值来源已支持 `$app.`，DAG 节点天然能读写 AppState。
- **第 7 步跨设备**：AppState 是"跨设备事件载荷"的落点之一——跨设备事件只允许写 $app/toast/speak/navigate（见架构 A2 载荷契约），不允许写未挂载页的 page 字段，本步的 current≠target 守卫已为此铺好语义。

---

## 八、本步不做（划清边界）

- ❌ 不做 AppState 的服务端持久化（跨会话留存）——若需要，另立设计。
- ❌ 不做目标页未挂载时的 set_field 缓冲（用 $app + page_enter 范式替代）。
- ❌ 不做跨 form-app 共享 AppState（隔离是刻意的；跨 app 走第 7 步显式传输）。
- ❌ 不引入 DAG、不动 React/antd 版本。
</content>
