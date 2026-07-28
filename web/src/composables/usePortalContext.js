import { inject, provide, computed } from 'vue'

// 资源中心前台上下文注入键。
export const PORTAL_CONTEXT_KEY = Symbol('portalContext')

// providePortalContext 在 PortalLayout 中调用，向下注入前台运行上下文。
// ctx 形如 { isAdmin, permissions, activeNode }（均为 ref/computed）。
export function providePortalContext(ctx) {
  provide(PORTAL_CONTEXT_KEY, ctx)
}

// usePortalContext 在被复用页面（Devices/WorkOrders 等）中调用。
// 非 portal 环境（普通后台布局）返回 { portalMode:false }，页面按原行为运行。
export function usePortalContext() {
  const ctx = inject(PORTAL_CONTEXT_KEY, null)
  const portalMode = computed(() => !!ctx)
  return { ctx, portalMode }
}
