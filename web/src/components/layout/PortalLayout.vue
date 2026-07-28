<template>
  <el-container class="portal-layout">
    <el-aside width="240px" class="portal-aside">
      <div class="portal-logo">
        <img src="@/assets/bedrock-icon.svg" alt="磐石" class="logo-mark" />
        <div class="logo-text">
          <span class="logo-cn">资源中心</span>
          <span class="logo-en">RESOURCE</span>
        </div>
      </div>
      <div class="portal-overview-entry" :class="{ active: showOverview }" @click="openOverview">
        <el-icon><Odometer /></el-icon>
        <span>概览</span>
      </div>
      <div class="portal-tree-wrap" v-loading="loading">
        <el-tree
          v-if="tree.length"
          :data="tree"
          node-key="id"
          :props="treeProps"
          :expand-on-click-node="false"
          :default-expand-all="true"
          :highlight-current="true"
          @node-click="onNodeClick"
        >
          <template #default="{ data }">
            <span class="portal-tree-node">
              <el-icon v-if="data.node_type === 'device_mgmt'"><Phone /></el-icon>
              <el-icon v-else-if="data.node_type === 'workorder_mgmt'"><Tickets /></el-icon>
              <el-icon v-else-if="data.node_type === 'scada'"><Histogram /></el-icon>
              <el-icon v-else-if="data.node_type === 'form_app'"><EditPen /></el-icon>
              <el-icon v-else-if="data.node_type === 'link'"><Link /></el-icon>
              <el-icon v-else><Folder /></el-icon>
              <span class="node-label">{{ data.name }}</span>
            </span>
          </template>
        </el-tree>
        <el-empty v-else-if="!loading" description="暂无可访问的资源" :image-size="80" />
      </div>
    </el-aside>
    <el-container class="portal-right">
      <el-header height="56px" class="portal-header">
        <span class="route-title">{{ headerTitle }}</span>
        <div class="header-right">
          <span class="username">
            <el-icon><User /></el-icon>
            {{ auth.user?.username }}
            <el-tag size="small" :type="roleTagType" style="margin-left:6px">{{ roleLabel }}</el-tag>
          </span>
          <el-button size="small" @click="goBackToConsole" v-if="!auth.isViewer">返回控制台</el-button>
          <el-button type="danger" size="small" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="portal-main">
        <ResourceOverview v-if="showOverview" />
        <iframe
          v-else-if="activeNode && ['scada', 'form_app', 'link'].includes(activeNode.node_type) && activeNode.open_mode !== 'blank'"
          :src="buildEmbedURL(activeNode)"
          frameborder="0"
          class="portal-iframe"
        />
        <router-view v-else-if="activeNode && ['device_mgmt', 'workorder_mgmt'].includes(activeNode.node_type)" :key="activeNode.id" />
        <el-empty v-else description="请从左侧选择一个资源节点" />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Phone, Tickets, Folder, User, Histogram, EditPen, Link, Odometer } from '@element-plus/icons-vue'
import { getPortalResourceTree, getPortalPermissions } from '@/api/portal'
import { providePortalContext } from '@/composables/usePortalContext'
import ResourceOverview from '@/views/resource-center/ResourceOverview.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const tree = ref([])
const permissions = ref({ is_admin: false, devices: [], workorders: [] })
const activeNode = ref(null)
const showOverview = ref(true)

const treeProps = { children: 'children', label: 'name' }

const headerTitle = computed(() => {
  if (showOverview.value) return '概览'
  if (!activeNode.value) return '资源中心'
  return activeNode.value.name
})

const openOverview = () => {
  showOverview.value = true
  activeNode.value = null
}

const roleLabel = computed(() => ({ admin: '管理员', operator: '操作员', viewer: '只读' }[auth.user?.role] || ''))
const roleTagType = computed(() => ({ admin: 'danger', operator: 'warning', viewer: '' }[auth.user?.role] || ''))

// 向复用页面注入的上下文。
providePortalContext({
  isAdmin: computed(() => permissions.value.is_admin),
  permissions,
  activeNode
})

const onNodeClick = (data) => {
  if (['device_mgmt', 'workorder_mgmt', 'scada', 'form_app', 'link'].includes(data.node_type)) {
    showOverview.value = false
  }
  if (data.node_type === 'device_mgmt') {
    activeNode.value = data
    router.replace({ name: 'PortalDevices', query: { node: data.id } })
  } else if (data.node_type === 'workorder_mgmt') {
    activeNode.value = data
    router.replace({ name: 'PortalWorkOrders', query: { node: data.id } })
  } else if (data.node_type === 'scada' || data.node_type === 'form_app' || data.node_type === 'link') {
    activeNode.value = data
    if (data.open_mode === 'blank') {
      // 新标签页打开
      const url = buildEmbedURL(data)
      if (url) window.open(url, '_blank')
    } else {
      // 内嵌 iframe，切换 activeNode 触发重渲染
      router.replace({ name: 'PortalDevices', query: { node: data.id } })
    }
  }
  // group 节点仅展开/收起，不切换内容。
}

const loadTree = async () => {
  loading.value = true
  try {
    const [treeRes, permRes] = await Promise.all([
      getPortalResourceTree(),
      getPortalPermissions()
    ])
    tree.value = treeRes.data || []
    permissions.value = permRes || { is_admin: false, devices: [], workorders: [] }
    // 默认展示概览首页，用户可从左侧节点进入具体资源。
  } catch (e) {
    ElMessage.error('加载资源树失败')
  } finally {
    loading.value = false
  }
}

// 构造 scada/form_app/link 节点的嵌入 URL（带 token）
const buildEmbedURL = (node) => {
  const token = localStorage.getItem('token')
  const origin = window.location.origin
  if (node.node_type === 'scada') {
    if (!node.scada_id) return ''
    // 已发布：使用正式免登分享地址；未发布：回退到预览地址（带 token）。
    if (node.publish_status === 1 && node.share_token) {
      return `${origin}/scada-editor/share/${node.share_token}`
    }
    return `${origin}/scada-editor/preview/${node.scada_id}${token ? `?_token=${encodeURIComponent(token)}` : ''}`
  }
  if (node.node_type === 'form_app') {
    if (!node.form_code) return ''
    return `${origin}/form-app/runtime/${node.form_code}${token ? `?_token=${encodeURIComponent(token)}` : ''}`
  }
  if (node.node_type === 'link') {
    return node.url || ''
  }
  return ''
}

const goBackToConsole = () => router.push('/')

const logout = () => {
  auth.logout()
  router.push('/login')
}

onMounted(() => {
  if (auth.token && !auth.user) auth.fetchMe()
  loadTree()
})
</script>

<style scoped>
.portal-layout { height: 100vh; max-height: 100vh; overflow: hidden; }
.portal-aside { background: #1d2935; overflow-x: hidden; display: flex; flex-direction: column; }
.portal-logo { display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: #1d2935; }
.logo-mark { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; }
.logo-text { display: flex; flex-direction: column; line-height: 1.15; }
.logo-cn { color: #fff; font-size: 17px; font-weight: bold; letter-spacing: 2px; }
.logo-en { color: #3BE0C8; font-size: 10px; font-weight: 600; letter-spacing: 3px; }
.portal-overview-entry { display: flex; align-items: center; gap: 6px; margin: 8px; padding: 0 12px; height: 38px; border-radius: 6px; color: #cfd8e3; font-size: 14px; cursor: pointer; transition: background .15s; }
.portal-overview-entry:hover { background: #263445; }
.portal-overview-entry.active { background: #2b74d4; color: #fff; }
.portal-tree-wrap { flex: 1; overflow: auto; padding: 8px; padding-top: 0; }
.portal-tree-wrap :deep(.el-tree) { background: transparent; color: #cfd8e3; }
.portal-tree-wrap :deep(.el-tree-node__content) { height: 38px; }
.portal-tree-wrap :deep(.el-tree-node__content:hover) { background: #263445; }
.portal-tree-wrap :deep(.el-tree-node.is-current > .el-tree-node__content) { background: #2b74d4; color: #fff; }
.portal-tree-node { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.portal-right { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.portal-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; flex-shrink: 0; }
.route-title { font-size: 16px; font-weight: bold; }
.header-right { display: flex; align-items: center; gap: 12px; }
.username { display: flex; align-items: center; gap: 4px; color: #606266; font-size: 14px; }
.portal-main { flex: 1; min-height: 0; overflow: auto; padding: 16px; background: #f5f7fa; }
.portal-iframe { width: 100%; height: 100%; border: none; background: #fff; }
</style>
