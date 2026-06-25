# 事件引擎脱 Formily 落地设计

**版本**: v1.0
**日期**: 2026-06-18
**范围**: 仅事件引擎与其依赖的"页面状态层"。**不改** React/antd/Formily 版本，**不引入** Puck。
**目标**: 让 `eventEngine.ts` 不再 `import @formily/*`，把它对 `form` 的依赖收敛到一个最小的 `PageState` 接口；表单页用 Formily 适配器实现该接口，非表单页（列表/详情）用普通 store 实现同一接口，从而事件系统可在任意页面类型复用。

---

## 一、为什么做这件事（结论先行）

事件引擎当前不是"独立模块"，它寄生在 Formily 的响应式内核上。实测它对 Formily 的全部依赖只有两类：

1. **import 层**：`eventEngine.ts:10-11` 硬 import `Form as FormilyForm` 与 `onFieldValueChange`。
2. **运行期调用**（`deps.form.*`，共 6 个 API）：

| Formily API | 出现位置 | 真实语义（与表单无关） |
|---|---|---|
| `form.setValuesIn(path, val)` | set_field / call_interface 回填 / script.set | 按路径写值 |
| `form.setFieldState(path, recipe)` | set_field_prop / script.setProp | 改某字段的展示属性 |
| `form.addEffects` + `onFieldValueChange('*')` | field_change 源 | 订阅字段变化 |
| `form.removeEffects` | field_change cleanup | 取消订阅 |
| `getFormValues()`(=`valuesRef.current`) | 处处 | 读全量值快照 |

注意：`form.values` / `query` / `submit` / `reset` 这些**没有**在事件引擎里用到（它们在 `SchemaFormRenderer` 自己的渲染逻辑里，不属于事件系统）。

**关键判断**：事件引擎需要的不是"表单框架"，而是一个 **按路径读写值 + 改展示属性 + 订阅变化** 的状态容器。Formily 在这里只是顺手被当成了这个容器。把这 5 个能力抽成 `PageState` 接口，事件引擎就彻底独立了。

校验（`FieldValidator.ts`）、联动可见性（`fieldLogic.ts`）、选项联动（`fieldLogic.bindingsTriggeredBy`）**早已是自研、不依赖 Formily**，本设计不触碰。

---

## 二、目标接口：PageState

新增 `runtime/pageState.ts`：

```typescript
/**
 * 页面状态容器抽象。事件引擎只认这个接口，不认 Formily。
 * - 表单页：FormilyPageState 适配 createForm() 的实例
 * - 列表/详情页：PlainPageState 用一个普通 reactive store 实现
 */
export type FieldProp = 'visible' | 'disabled' | 'readOnly' | 'background' | 'color' | 'title'

export interface PageState {
  /** 读全量值快照（只读，不要求引用稳定） */
  getValues(): Record<string, any>
  /** 读单字段（点路径，如 a.b.c） */
  get(path: string): any
  /** 写单字段（点路径） */
  set(path: string, value: any): void
  /** 改字段展示属性；非表单容器可按需空实现 */
  setProp(path: string, prop: FieldProp, value: any): void
  /**
   * 订阅字段变化。回调收到发生变化的字段「短名」(addr.split('.').pop())
   * 与新值，与现有 field_change 匹配逻辑一致。返回取消订阅函数。
   */
  subscribe(cb: (shortName: string, value: any) => void): () => void
}
```

设计要点：
- **`subscribe` 用一个全局回调 + 短名**，直接对应现有 `field_change` 用 `onFieldValueChange('*')` 后 `addr.split('.').pop()` 的语义，迁移零行为差异。
- `setProp` 的 `truthy()` 归一化、`visible→display`、`background/color→style` 这套语义**留在适配器里**（因为只有 Formily 才有 `display`/`componentProps.style` 概念），不上提到接口。非表单容器对不适用的 prop 可空实现。
- 接口**不含** `submit`/`reset`/`query`/`validate`——那些是渲染器的事，不是事件引擎的事。

---

## 三、改造点

### 3.1 `eventEngine.ts`（核心）

**删除**：
```typescript
import type { Form as FormilyForm } from '@formily/core'   // 删
import { onFieldValueChange } from '@formily/core'          // 删
```

**`EventEngineDeps` 改**：
```typescript
import type { PageState } from './pageState'

export interface EventEngineDeps {
  state: PageState                       // 取代 form: FormilyForm
  // getFormValues 删除 —— 统一走 state.getValues()
  onScanInterface?: (...) => Promise<any>
  doPrint?: (...) => Promise<void>
  navigate?: (...) => void
  toast?: (msg: string) => void
}
```

> 取舍：保留 `getFormValues` 还是并入 `state.getValues()`？**并入**。当前 `getFormValues` 指向 `valuesRef.current`（实时快照），`state.getValues()` 由适配器保证返回实时快照即可，少一个并行入口、少一处不一致风险。

**全文替换映射**（机械替换，逐处）：

| 现状 | 改为 |
|---|---|
| `deps.form.setValuesIn(field, val)` | `deps.state.set(field, val)` |
| `deps.form.setFieldState(field, recipe)`（set_field_prop / script.setProp 两处共 ~60 行 recipe 逻辑） | `deps.state.setProp(field, prop, value)`（recipe 逻辑下沉到 FormilyPageState） |
| `deps.getFormValues()` | `deps.state.getValues()` |
| `field_change` 块的 `deps.form.addEffects(...onFieldValueChange...)` + `removeEffects` | `deps.state.subscribe((shortName, value) => {...})` |

**`field_change` 块改造**（`eventEngine.ts:386-403`）：
```typescript
const fieldChangeEvents = events.filter(e => e.source.kind === 'field_change')
if (fieldChangeEvents.length > 0) {
  const unsub = deps.state.subscribe((shortName, value) => {
    for (const ev of fieldChangeEvents) {
      if (ev.source.kind !== 'field_change') continue
      if (ev.source.field !== shortName) continue
      const ctx: EventContext = { scan: undefined, form: deps.state.getValues(), event: value }
      if (!evalCondition(ev.when, ctx)) continue
      void runActions(ev, ctx, deps)
    }
  })
  disposers.push(unsub)
}
```

**`set_field_prop` 动作 + `buildScriptApi.setProp` 简化**：原本两处各 ~30 行的 `setFieldState` recipe（truthy/visible/disabled/style）整体删掉，改为一行 `deps.state.setProp(field, prop, value)`。recipe 逻辑搬进 `FormilyPageState.setProp`（见 3.2），**逐字搬运、不改语义**。

`EventContext.form` 字段名保持不变（仍叫 `form`，是个值快照对象，不是 Formily 实例）——避免改 `resolveSrc('$form.x')` 与所有动作里的 `ctx.form`，把改动面压到最小。

### 3.2 新增 `runtime/formilyPageState.ts`

把现在散在 eventEngine 里的 Formily 细节集中到这里：

```typescript
import type { Form as FormilyForm } from '@formily/core'
import { onFieldValueChange } from '@formily/core'
import type { PageState, FieldProp } from './pageState'

const truthy = (v: any) => {
  if (typeof v === 'boolean') return v
  const s = String(v ?? '').trim().toLowerCase()
  return ['true', '1', 'yes', 'y', '是', 'on'].includes(s)
}

/**
 * @param form           createForm() 实例
 * @param getValuesSnapshot 实时值快照来源（= 现有 valuesRef.current）
 */
export function createFormilyPageState(
  form: FormilyForm,
  getValuesSnapshot: () => Record<string, any>,
): PageState {
  return {
    getValues: () => getValuesSnapshot(),
    get: (path) => form.getValuesIn(path),
    set: (path, value) => { if (path) form.setValuesIn(path, value) },
    setProp: (path, prop, value) => {
      if (!path || !prop) return
      form.setFieldState(path, (state: any) => {
        switch (prop as FieldProp) {
          case 'visible':  state.display = truthy(value) ? 'visible' : 'none'; break
          case 'disabled': state.disabled = truthy(value); break
          case 'readOnly': state.readOnly = truthy(value); break
          case 'title':    state.title = value == null ? '' : String(value); break
          case 'background':
          case 'color': {
            const prev = state.componentProps || {}
            const prevStyle = prev.style || {}
            state.componentProps = { ...prev, style: { ...prevStyle, [prop]: value == null ? '' : String(value) } }
            break
          }
        }
      })
    },
    subscribe: (cb) => {
      const effectId = 'page-events-field-change'
      form.addEffects(effectId, () => {
        onFieldValueChange('*', (field: any) => {
          const addr: string = field?.address?.toString?.() || field?.path?.toString?.() || ''
          const shortName = addr.split('.').pop() || addr
          cb(shortName, field?.value)
        })
      })
      return () => form.removeEffects(effectId)
    },
  }
}
```

> `form.getValuesIn(path)` 是 Formily 标准 API（与 `setValuesIn` 对称）；现有 script.get 用的是 `resolveNestedField(getFormValues(), path)`，两者等价，统一走 `getValuesIn` 更直接。若担心边界差异，可让 `get` 也实现成 `resolveNestedField(getValuesSnapshot(), path)` 保持逐字一致。

### 3.3 新增 `runtime/plainPageState.ts`（非表单页用）

列表/详情页没有 Formily form，用一个最小 store 实现同一接口。**这是让事件系统跑在非表单页的关键，但本期可只搭骨架、随 2 期列表/详情可视化再填充。**

```typescript
import type { PageState, FieldProp } from './pageState'

export function createPlainPageState(initial: Record<string, any> = {}): PageState {
  let values = { ...initial }
  const subs = new Set<(name: string, v: any) => void>()
  const props: Record<string, Partial<Record<FieldProp, any>>> = {}

  const setPath = (path: string, value: any) => {
    // 简化：仅支持点路径写入；如需深层可复用一个 setIn 工具
    const keys = path.split('.')
    let cur: any = values
    for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ??= {})
    cur[keys[keys.length - 1]] = value
  }

  return {
    getValues: () => values,
    get: (path) => path.split('.').reduce((c, k) => (c == null ? c : c[k]), values),
    set: (path, value) => {
      if (!path) return
      setPath(path, value)
      const shortName = path.split('.').pop() || path
      subs.forEach(cb => cb(shortName, value))
    },
    setProp: (path, prop, value) => { (props[path] ??= {})[prop] = value /* 渲染层读取 props 反映外观；详情/列表按需消费 */ },
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb) },
  }
}
```

> `setProp` 在纯容器里只是把意图存下来，由列表/详情渲染层决定怎么消费（或暂时 no-op）。本期不追求完整。

### 3.4 `SchemaFormRenderer.tsx`（接入点，改动极小）

`SchemaFormRenderer.tsx:151-158` 的 `setupPageEvents` 调用：
```typescript
// 旧
const { cleanup, triggerButton, triggerLifecycle } = setupPageEvents(allEvents, {
  form,
  getFormValues: () => valuesRef.current,
  onScanInterface, doPrint, navigate: onNavigate,
  toast: (msg) => message.info(msg),
})

// 新
const state = useMemo(
  () => createFormilyPageState(form, () => valuesRef.current),
  [form],
)
const { cleanup, triggerButton, triggerLifecycle } = setupPageEvents(allEvents, {
  state,
  onScanInterface, doPrint, navigate: onNavigate,
  toast: (msg) => message.info(msg),
})
```
其余（binding effects、草稿、submit）完全不动——它们本就直接用 `form`，与事件系统无关。

---

## 四、迁移影响面（实测清单）

`grep` 结果，需要改的就这些：

| 文件 | 改动 |
|---|---|
| `runtime/eventEngine.ts` | 删 2 个 formily import；`EventEngineDeps` 改 `form→state`、删 `getFormValues`；4 处 `deps.form.*`/`deps.getFormValues()` 替换；`field_change` 块改 `subscribe`；`set_field_prop` 动作 + `buildScriptApi.setProp` 的 recipe 删除（下沉） |
| `runtime/pageState.ts` | 新增（接口） |
| `runtime/formilyPageState.ts` | 新增（Formily 适配器，承接下沉的 recipe + subscribe） |
| `runtime/plainPageState.ts` | 新增（非表单容器，本期搭骨架） |
| `runtime/SchemaFormRenderer.tsx` | 1 处 `setupPageEvents` 调用改造（建 state、传 state） |

事件系统对外契约（`PageEvent`/`EventAction`/`eventTypes.ts`/设计器面板/`run_script` 的 `ctx` API）**全部不变**——设计器、`EventsConfigSection`、`ScriptEditor`、`NodeEventBinder`、AI prompt 都无需改。这是把改动锁在运行时内部的关键。

> 注意：`buildScriptApi` 暴露给用户脚本的 `ctx`（get/set/setProp/callInterface...）签名与行为保持完全一致，只是内部实现从 `deps.form.*` 转调 `deps.state.*`。**ScriptEditor 的补全树不用动。**

---

## 五、验证

1. `cd form-app && npx tsc --noEmit` —— 类型通过（接口替换无遗漏）。
2. `grep -rn "@formily" form-app/src/runtime/eventEngine.ts` —— **应为 0 行命中**（验收硬指标：事件引擎已脱 Formily）。
3. 运行时回归（一个含全部能力的表单页）：
   - 扫码 → set_field 填值 → call_interface → result_map 回填 ✓
   - field_change 源触发动作链 ✓
   - set_field_prop 改 visible/disabled/background ✓
   - run_script 里 ctx.get/set/setProp/callInterface/print/navigate/toast/speak/emit ✓
   - page_enter / page_exit 生命周期 ✓
   - button 源（含 PrintButton triggerButton）✓
   - 旧 scanner 兼容（migrateScannerToEvents）✓
4. Android 菜单打开同一页（`/form-app/runtime/:code`）行为一致。

---

## 六、本设计带来的后续收益（不在本期范围，仅说明价值）

做完这一步后：
- **事件系统真正独立**——PRD 的核心诉求达成，且不需要换框架。
- **Formily 在运行时退化为"渲染表单字段的插件"**——`set_field`/订阅/属性都走 `PageState`，将来换自研受控组件或 Puck FormBlock 时，只需再写一个 `PageState` 适配器，事件引擎一行不改。
- **列表/详情页可接事件**——`PlainPageState` 填充后，`field_change`/`set_field`/`set_field_prop` 在非表单页同样可用，为 2 期列表/详情可视化铺好地基。

换言之：这一步是"上不上 Puck"两条路的**公共前置**，且独立交付即有价值、风险最低（不动版本、对外契约不变、改动面 5 个文件）。
</content>
</invoke>
