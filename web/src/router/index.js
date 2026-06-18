import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSetupStatus } from '@/api/setup'

const routes = [
  { path: '/setup', name: 'Setup', meta: { requiresAuth: false }, component: () => import('@/views/Setup.vue') },
  { path: '/login', name: 'Login', meta: { requiresAuth: false }, component: () => import('@/views/Login.vue') },
  { path: '/register', name: 'Register', meta: { requiresAuth: false }, component: () => import('@/views/Register.vue') },
  { path: '/upload/:token', name: 'UploadPage', meta: { requiresAuth: false }, component: () => import('@/views/UploadPage.vue') },
  { path: '/oauth/authorize', name: 'OAuthAuthorize', meta: { requiresAuth: true, title: 'OAuth 授权' }, component: () => import('@/views/OAuthAuthorizePage.vue') },
  {
    path: '/share/screen',
    name: 'ScreenShare',
    meta: { requiresAuth: false, title: '共享屏幕' },
    component: () => import('@/views/Screen.vue')
  },
  {
    path: '/',
    component: () => import('@/components/layout/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', meta: { title: '总览' }, component: () => import('@/views/Dashboard.vue') },
      { path: 'devices', name: 'Devices', meta: { title: '设备管理' }, component: () => import('@/views/Devices.vue') },
      { path: 'devices/:id', name: 'DeviceDetail', meta: { title: '设备详情' }, component: () => import('@/views/DeviceDetail.vue') },
      { path: 'qrcode', name: 'QRCode', meta: { title: '扫码接入' }, component: () => import('@/views/QRCode.vue') },
      { path: 'screen', name: 'Screen', meta: { title: '屏幕查看' }, component: () => import('@/views/Screen.vue') },
      { path: 'shell', name: 'Shell', meta: { title: 'Shell 终端' }, component: () => import('@/views/Shell.vue') },
      { path: 'logcat', name: 'Logcat', meta: { title: 'Logcat' }, component: () => import('@/views/Logcat.vue') },
      { path: 'events', name: 'CustomEvents', meta: { title: '自定义事件' }, component: () => import('@/views/CustomEvents.vue') },
      {
        path: 'event-definitions',
        name: 'CustomEventConfig',
        meta: { title: '事件定义' },
        component: () => import('@/views/CustomEventConfig.vue')
      },
      {
        path: 'outbound/apps',
        name: 'OutboundApps',
        meta: { title: '外部应用' },
        component: () => import('@/views/OutboundApps.vue')
      },
      {
        path: 'outbound/apps/:appId/endpoints/debug',
        name: 'OutboundEndpointDebug',
        meta: { title: '接口调试' },
        component: () => import('@/views/OutboundEndpointDebug.vue')
      },
      {
        path: 'outbound/apps/:appId/webhooks/:webhookId/debug',
        name: 'OutboundWebhookDebug',
        meta: { title: 'Webhook 调试' },
        component: () => import('@/views/OutboundWebhookDebug.vue')
      },
      {
        path: 'outbound/apps/:appId/webhooks/:webhookId/logs',
        name: 'OutboundWebhookLogs',
        meta: { title: 'Webhook 历史记录' },
        component: () => import('@/views/OutboundWebhookLogs.vue')
      },
      {
        path: 'outbound/apps/:id',
        name: 'OutboundAppDetail',
        meta: { title: '外部应用详情' },
        component: () => import('@/views/OutboundAppDetail.vue')
      },
      {
        path: 'outbound/connectors/:id',
        name: 'OutboundConnectorEdit',
        meta: { title: '连接器编辑' },
        component: () => import('@/views/OutboundConnectorEdit.vue')
      },
      {
        path: 'outbound',
        name: 'OutboundIntegrations',
        meta: { title: '连接器' },
        component: () => import('@/views/OutboundIntegrations.vue')
      },
      { path: 'apps', name: 'Apps', meta: { title: 'APK 管理' }, component: () => import('@/views/Apps.vue') },
      { path: 'tasks', name: 'Tasks', meta: { title: '任务队列' }, component: () => import('@/views/Tasks.vue') },
      { path: 'work-orders', name: 'WorkOrders', meta: { title: '工单管理' }, component: () => import('@/views/work-orders/WorkOrders.vue') },
      { path: 'work-orders/types', name: 'WorkOrderTypes', meta: { title: '工单类型' }, component: () => import('@/views/work-orders/WorkOrderTypes.vue') },
      { path: 'work-orders/webhooks', name: 'WorkOrderWebhooks', meta: { title: '工单外发配置' }, component: () => import('@/views/work-orders/WorkOrderWebhooks.vue') },
      { path: 'work-orders/tags', name: 'WorkOrderTags', meta: { title: '工单标签' }, component: () => import('@/views/work-orders/WorkOrderTags.vue') },
      { path: 'work-orders/:id', name: 'WorkOrderDetail', meta: { title: '工单详情' }, component: () => import('@/views/work-orders/WorkOrderDetail.vue') },
      { path: 'apikeys', name: 'ApiKeys', meta: { title: '授权管理' }, component: () => import('@/views/ApiKeys.vue') },
      { path: 'thirdparty', name: 'ThirdParty', meta: { title: '第三方平台' }, component: () => import('@/views/ThirdPartyProviders.vue') },
      { path: 'open-stomp-debug', name: 'OpenStompDebug', meta: { title: 'STOMP 调试' }, component: () => import('@/views/OpenStompDebug.vue') },
      { path: 'users', name: 'Users', meta: { title: '用户管理' }, component: () => import('@/views/Users.vue') },
      { path: 'audit', name: 'AuditLog', meta: { title: '审计日志' }, component: () => import('@/views/AuditLog.vue') },
      { path: 'settings', name: 'Settings', meta: { title: '系统管理' }, component: () => import('@/views/Settings.vue') },
      { path: 'data', name: 'DataStack', meta: { title: '数据源与接口' }, component: () => import('@/views/data/DataStack.vue') },
      { path: 'agent-menus', name: 'AgentMenus', meta: { title: 'Agent 菜单下发' }, component: () => import('@/views/agent-menus/AgentMenus.vue') },
      { path: 'about', name: 'About', meta: { title: '关于' }, component: () => import('@/views/About.vue') },
      { path: 'system-update', name: 'SystemUpdate', meta: { title: '系统更新' }, component: () => import('@/views/SystemUpdate.vue') }
    ]
  }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to, _, next) => {
  // requiresAuth 明确为 false 的路由（登录/注册/安装/分享）直接放行，但安装向导仍需检测
  if (to.meta.requiresAuth === false && to.path !== '/setup') {
    const auth = useAuthStore()
    // 已登录时访问 /login 或 /register，跳转到首页
    if ((to.path === '/login' || to.path === '/register') && auth.token) {
      return next('/')
    }
    return next()
  }

  // 检查安装状态
  if (to.path !== '/setup') {
    try {
      const res = await getSetupStatus()
      if (res.required) {
        sessionStorage.setItem('setupRequired', 'true')
        return next('/setup')
      } else {
        sessionStorage.setItem('setupRequired', 'false')
      }
    } catch (err) {}
  }

  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.token) return next('/login')
  next()
})

export default router
