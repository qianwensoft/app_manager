import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSetupStatus } from '@/api/setup'

const routes = [
  { path: '/setup', name: 'Setup', meta: { requiresAuth: false }, component: () => import('@/views/Setup.vue') },
  { path: '/login', component: () => import('@/views/Login.vue') },
  { path: '/upload/:token', name: 'UploadPage', meta: { requiresAuth: false }, component: () => import('@/views/UploadPage.vue') },
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
      { path: 'apps', name: 'Apps', meta: { title: 'APK 管理' }, component: () => import('@/views/Apps.vue') },
      { path: 'tasks', name: 'Tasks', meta: { title: '任务队列' }, component: () => import('@/views/Tasks.vue') },
      { path: 'apikeys', name: 'ApiKeys', meta: { title: '授权令牌' }, component: () => import('@/views/ApiKeys.vue') },
      { path: 'users', name: 'Users', meta: { title: '用户管理' }, component: () => import('@/views/Users.vue') },
      { path: 'audit', name: 'AuditLog', meta: { title: '审计日志' }, component: () => import('@/views/AuditLog.vue') },
      { path: 'settings', name: 'Settings', meta: { title: '系统管理' }, component: () => import('@/views/Settings.vue') },
    ]
  }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to, _, next) => {
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
