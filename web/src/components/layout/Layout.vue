<template>
  <el-container class="layout">
    <el-aside width="200px">
      <div class="logo">
        <img src="@/assets/bedrock-icon.svg" alt="磐石" class="logo-mark" />
        <div class="logo-text">
          <span class="logo-cn">磐石</span>
          <span class="logo-en">BEDROCK</span>
        </div>
      </div>
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
        <el-menu-item index="/events">
          <el-icon><Bell /></el-icon><span>自定义事件</span>
        </el-menu-item>
        <el-menu-item index="/event-definitions">
          <el-icon><Setting /></el-icon><span>事件定义</span>
        </el-menu-item>
        <el-menu-item index="/outbound/apps">
          <el-icon><Link /></el-icon><span>外部应用</span>
        </el-menu-item>
        <el-menu-item index="/data">
          <el-icon><Histogram /></el-icon><span>数据源与接口</span>
        </el-menu-item>
        <el-menu-item index="/outbound">
          <el-icon><Share /></el-icon><span>连接器</span>
        </el-menu-item>
        <div class="menu-item-external menu-item-flat" @click="openScadaEditor">
          <el-icon><Histogram /></el-icon><span>组态编辑器 ↗</span>
        </div>
        <div class="menu-item-external menu-item-flat" @click="openFormApp">
          <el-icon><EditPen /></el-icon><span>表单设计器 ↗</span>
        </div>
        <el-menu-item index="/agent-menus">
          <el-icon><Menu /></el-icon><span>Agent 菜单</span>
        </el-menu-item>
        <el-menu-item index="/apps">
          <el-icon><Box /></el-icon><span>APK 管理</span>
        </el-menu-item>
        <el-menu-item index="/tasks">
          <el-icon><List /></el-icon><span>任务队列</span>
        </el-menu-item>
        <el-menu-item index="/apikeys">
          <el-icon><Key /></el-icon><span>授权管理</span>
        </el-menu-item>
        <el-menu-item index="/thirdparty">
          <el-icon><Connection /></el-icon><span>第三方平台</span>
        </el-menu-item>
        <!-- admin 专属 -->
        <template v-if="auth.isAdmin">
          <el-menu-item index="/users">
            <el-icon><UserFilled /></el-icon><span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/audit">
            <el-icon><Notebook /></el-icon><span>审计日志</span>
          </el-menu-item>
          <el-menu-item index="/settings">
            <el-icon><Tools /></el-icon><span>系统管理</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>
    <el-container class="layout-right">
      <el-header height="56px">
        <span class="route-title">{{ pageTitle }}</span>
        <div class="header-right">
          <QuickSearch />
          <span class="username">
            <el-icon><User /></el-icon>
            {{ auth.user?.username }}
            <el-tag size="small" :type="roleTagType" style="margin-left: 6px">{{ roleLabel }}</el-tag>
          </span>
          <el-button type="danger" size="small" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="layout-main" :class="{ 'layout-main--bleed': route.meta.fullBleed }">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute, useRouter } from 'vue-router'
import { Monitor, Phone, VideoCamera, Document, Box, List, Key, Notebook, Connection, Cpu, Bell, Setting, Share, Link, Tools, UserFilled, User, Histogram, Menu, EditPen } from '@element-plus/icons-vue'
import QuickSearch from './QuickSearch.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const openScadaEditor = () => {
  const token = localStorage.getItem('token')
  const base = `${window.location.origin}/scada-editor/`
  const url = `${base}${token ? `?_token=${encodeURIComponent(token)}` : ''}`
  window.open(url, '_blank')
}

const openFormApp = () => {
  const token = localStorage.getItem('token')
  const base = `${window.location.origin}/form-app/forms`
  const url = `${base}${token ? `?_token=${encodeURIComponent(token)}` : ''}`
  window.open(url, '_blank')
}

const pageTitle = computed(() => route.meta?.title || route.name || '')

const menuActive = computed(() => {
  const p = route.path
  if (p === '/' || p === '') return '/'
  if (p.startsWith('/devices')) return '/devices'
  if (p.startsWith('/event-definitions')) return '/event-definitions'
  if (p.startsWith('/outbound/apps')) return '/outbound/apps'
  if (p.startsWith('/outbound')) return '/outbound'
  if (p.startsWith('/data')) return '/data'
  if (p.startsWith('/agent-menus')) return '/agent-menus'
  return p
})

const roleLabel = computed(() => ({ admin: '管理员', operator: '操作员', viewer: '只读' }[auth.user?.role] || ''))
const roleTagType = computed(() => ({ admin: 'danger', operator: 'warning', viewer: '' }[auth.user?.role] || ''))

const logout = () => {
  auth.logout()
  router.push('/login')
}

onMounted(() => {
  if (auth.token && !auth.user) auth.fetchMe()
})
</script>

<style scoped>
.menu-item-external {
  height: 56px;
  line-height: 56px;
  padding: 0 20px 0 20px;
  font-size: 14px;
  color: #aaa;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}
.menu-item-external:hover {
  background-color: #263445;
  color: #fff;
}
.menu-item-flat {
  padding-left: 20px;
}
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
.logo { display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: #1d2935; }
.logo-mark { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; }
.logo-text { display: flex; flex-direction: column; line-height: 1.15; }
.logo-cn { color: #fff; font-size: 17px; font-weight: bold; letter-spacing: 2px; }
.logo-en { color: #3BE0C8; font-size: 10px; font-weight: 600; letter-spacing: 3px; }
.el-aside { background: #1d2935; overflow-x: hidden; }
.el-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; flex-shrink: 0; }
.route-title { font-size: 16px; font-weight: bold; }
.header-right { display: flex; align-items: center; gap: 12px; }
.username { display: flex; align-items: center; gap: 4px; color: #606266; font-size: 14px; }
.layout-main {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  background: #f5f7fa;
}
.layout-main--bleed {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.layout-main--bleed > * {
  flex: 1;
  min-height: 0;
}
</style>
