<template>
  <el-container class="layout">
    <el-aside width="200px">
      <div class="logo">AppManager</div>
      <el-menu :router="true" :default-active="menuActive" background-color="#1d2935" text-color="#aaa" active-text-color="#fff">
        <el-menu-item index="/">
          <el-icon><Monitor /></el-icon><span>总览</span>
        </el-menu-item>
        <el-menu-item index="/devices">
          <el-icon><Phone /></el-icon><span>设备管理</span>
        </el-menu-item>
        <el-menu-item index="/qrcode">
          <el-icon><Connection /></el-icon><span>扫码接入</span>
        </el-menu-item>
        <el-menu-item index="/screen">
          <el-icon><VideoCamera /></el-icon><span>屏幕查看</span>
        </el-menu-item>
        <el-menu-item index="/shell">
          <el-icon><Cpu /></el-icon><span>Shell 终端</span>
        </el-menu-item>
        <el-menu-item index="/logcat">
          <el-icon><Document /></el-icon><span>Logcat</span>
        </el-menu-item>
        <el-menu-item index="/apps">
          <el-icon><Box /></el-icon><span>APK 管理</span>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><List /></el-icon><span>任务队列</span>
        </el-menu-item>
        <el-menu-item index="/apikeys">
          <el-icon><Key /></el-icon><span>授权令牌</span>
        </el-menu-item>
        <el-menu-item index="/audit">
          <el-icon><Notebook /></el-icon><span>审计日志</span>
        </el-menu-item>
        <el-menu-item index="/event-listeners">
          <el-icon><Bell /></el-icon><span>事件监听</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container class="layout-right">
      <el-header height="56px">
        <span class="route-title">{{ pageTitle }}</span>
        <el-button type="danger" size="small" @click="logout">退出</el-button>
      </el-header>
      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute, useRouter } from 'vue-router'
import { Monitor, Phone, VideoCamera, Document, Box, List, Key, Notebook, Connection, Cpu, Bell } from '@element-plus/icons-vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const pageTitle = computed(() => route.meta?.title || route.name || '')

/** 设备详情等子路径仍高亮「设备管理」 */
const menuActive = computed(() => {
  const p = route.path
  if (p === '/' || p === '') return '/'
  if (p.startsWith('/devices')) return '/devices'
  if (p.startsWith('/event-listeners')) return '/event-listeners'
  return p
})

const logout = () => {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}
.layout-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.logo { color: #fff; font-size: 18px; font-weight: bold; padding: 20px; background: #1d2935; }
.el-aside { background: #1d2935; overflow-x: hidden; }
.el-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; flex-shrink: 0; }
.route-title { font-size: 16px; font-weight: bold; }
.layout-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: #f5f7fa;
}
</style>
