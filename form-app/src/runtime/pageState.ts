/**
 * 页面状态容器抽象（StateScope / PageState）。
 *
 * 事件引擎只认这个接口，不认 Formily。
 * - 表单页：FormilyPageState 适配 createForm() 的实例（formilyPageState.ts）
 * - 列表/详情页：PlainPageState 用一个普通 reactive store 实现（plainPageState.ts）
 *
 * 设计说明见 docs/事件引擎脱Formily落地设计.md。
 */

/** 可被事件动作修改的字段展示属性 */
export type FieldProp =
  | 'visible' | 'disabled' | 'readOnly'
  | 'background' | 'color' | 'title'

/**
 * 页面状态容器。事件引擎对“表单”的全部依赖收敛到这五个方法上。
 * 注意：不含 submit/reset/query/validate —— 那些是渲染器的职责，不属于事件系统。
 */
export interface StateScope {
  /** 读全量值快照（要求返回实时快照；不要求引用稳定） */
  getValues(): Record<string, any>
  /** 读单字段（点路径，如 a.b.c） */
  get(path: string): any
  /** 写单字段（点路径） */
  set(path: string, value: any): void
  /**
   * 改字段展示属性。非表单容器（无 UI 字段）可空实现。
   * truthy 归一化、visible→display、background/color→style 等语义由各适配器内部处理。
   */
  setProp(path: string, prop: FieldProp, value: any): void
  /**
   * 订阅字段变化。回调收到发生变化的字段「短名」(addr.split('.').pop())
   * 与新值，与现有 field_change 匹配逻辑一致。返回取消订阅函数。
   */
  subscribe(cb: (shortName: string, value: any) => void): () => void
}

/** PageState 即页面作用域的 StateScope（语义别名，便于阅读）。 */
export type PageState = StateScope
