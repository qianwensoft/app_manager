<template>
  <el-container class="portal-layout" :class="{ 'mobile-menu-open': mobileMenuOpen }">
    <div v-if="mobileMenuOpen" class="portal-aside-mask" @click="mobileMenuOpen = false" />
    <el-aside :width="collapsed ? '64px' : '240px'" class="portal-aside" :class="{ collapsed }">
      <div class="portal-logo" @click="collapsed = !collapsed">
        <img src="@/assets/bedrock-icon.svg" alt="磐石" class="logo-mark" />
        <div class="logo-text" v-show="!collapsed">
          <span class="logo-cn">资源中心</span>
          <span class="logo-en">RESOURCE</span>
        </div>
        <el-icon class="collapse-icon" v-show="!collapsed"><Fold /></el-icon>
      </div>
      <div 
        class="portal-overview-entry" 
        :class="{ active: showOverview }" 
        @click="openOverview"
        :title="collapsed ? '概览' : ''"
      >
        <el-icon><Odometer /></el-icon>
        <span v-show="!collapsed">概览</span>
      </div>
      <div class="portal-tree-wrap" v-loading="loading">
        <el-tree
          v-if="tree.length && !collapsed"
          ref="treeRef"
          :data="tree"
          node-key="id"
          :props="treeProps"
          :expand-on-click-node="false"
          :default-expand-all="true"
          :highlight-current="true"
          :current-node-key="currentNodeKey"
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
        <div v-else-if="collapsed && tree.length" class="collapsed-tree">
          <div 
            v-for="node in flatLeafNodes" 
            :key="node.id"
            class="collapsed-node"
            :class="{ active: currentNodeKey === node.id }"
            :title="node.name"
            @click="onNodeClick(node)"
          >
            <el-icon v-if="node.node_type === 'device_mgmt'"><Phone /></el-icon>
            <el-icon v-else-if="node.node_type === 'workorder_mgmt'"><Tickets /></el-icon>
            <el-icon v-else-if="node.node_type === 'scada'"><Histogram /></el-icon>
            <el-icon v-else-if="node.node_type === 'form_app'"><EditPen /></el-icon>
            <el-icon v-else-if="node.node_type === 'link'"><Link /></el-icon>
          </div>
        </div>
        <el-empty v-else-if="!loading" description="暂无可访问的资源" :image-size="80" />
      </div>
    </el-aside>
    <el-container class="portal-right">
      <el-header height="56px" class="portal-header">
        <div class="header-left">
          <el-icon class="mobile-menu-btn" @click="mobileMenuOpen = !mobileMenuOpen"><Expand /></el-icon>
          <span class="route-title">{{ headerTitle }}</span>
        </div>
        <div class="header-right">
          <el-button 
            v-if="canFullscreen"
            size="small" 
            :icon="isFullscreen ? 'el-icon-copy-document' : 'el-icon-full-screen'"
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全屏' : '全屏显示'"
          >
            {{ isFullscreen ? '退出全屏' : '全屏' }}
          </el-button>
          <el-button 
            v-if="canOpenInNewTab"
            size="small"
            @click="openInNewTab"
          >
            新标签页打开
          </el-button>
          <span class="username">
            <el-icon><User /></el-icon>
            {{ auth.user?.username }}
            <el-tag size="small" :type="roleTagType" style="margin-left:6px">{{ roleLabel }}</el-tag>
          </span>
          <el-button size="small" @click="goBackToConsole" v-if="!auth.isViewer">返回控制台</el-button>
          <el-button type="danger" size="small" @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="portal-main" :class="{ 'fullscreen-content': isFullscreen }">
        <el-button
          v-if="isFullscreen"
          class="fullscreen-exit-btn"
          size="small"
          :icon="'el-icon-copy-document'"
          @click="toggleFullscreen"
        >退出全屏</el-button>
        <router-view v-if="isDetailRoute" />
        <ResourceOverview v-else-if="showOverview" />
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
import { ref, computed, onMounted, watch, nextTick, provide } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Phone, Tickets, Folder, User, Histogram, EditPen, Link, Odometer, Fold, Expand } from '@element-plus/icons-vue'
import { getPortalResourceTree, getPortalPermissions } from '@/api/portal'
import { providePortalContext } from '@/composables/usePortalContext'
import ResourceOverview from '@/views/resource-center/ResourceOverview.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const tree = ref([])
const treeRef = ref(null)
const permissions = ref({ is_admin: false, devices: [], workorders: [] })
const activeNode = ref(null)
const showOverview = ref(true)
const collapsed = ref(false)
const currentNodeKey = ref(null)
const isFullscreen = ref(false)
// 移动端侧栏抽屉开关（桌面端不生效，由 CSS 媒体查询控制显示）
const mobileMenuOpen = ref(false)

const treeProps = { children: 'children', label: 'name' }

// 详情子路由（设备/工单详情）：内容区直接渲染 router-view，不受节点选中态影响。
const isDetailRoute = computed(() =>
  route.name === 'PortalWorkOrderDetail' || route.name === 'PortalDeviceDetail'
)

const headerTitle = computed(() => {
  if (isDetailRoute.value) return '详情'
  if (showOverview.value) return '概览'
  if (!activeNode.value) return '资源中心'
  return activeNode.value.name
})

// 扁平化所有叶子节点（收起状态显示）
const flatLeafNodes = computed(() => {
  const result = []
  const traverse = (nodes) => {
    for (const node of nodes) {
      if (['device_mgmt', 'workorder_mgmt', 'scada', 'form_app', 'link'].includes(node.node_type)) {
        result.push(node)
      }
      if (node.children?.length) {
        traverse(node.children)
      }
    }
  }
  traverse(tree.value)
  return result
})

const canFullscreen = computed(() => {
  return activeNode.value && ['scada', 'form_app', 'link', 'device_mgmt', 'workorder_mgmt'].includes(activeNode.value.node_type)
})

const canOpenInNewTab = computed(() => {
  return activeNode.value && ['scada', 'form_app', 'link'].includes(activeNode.value.node_type)
})

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

const openInNewTab = () => {
  if (!activeNode.value) return
  const url = buildEmbedURL(activeNode.value)
  if (url) window.open(url, '_blank')
}

const openOverview = () => {
  showOverview.value = true
  activeNode.value = null
  currentNodeKey.value = null
  isFullscreen.value = false
  mobileMenuOpen.value = false
  // 概览独立地址 /portal/home，避免与设备管理 /portal/devices 冲突。
  if (route.name !== 'PortalHome') router.replace({ name: 'PortalHome' })
  nextTick(() => {
    if (treeRef.value) {
      treeRef.value.setCurrentKey(null)
    }
  })
}

const roleLabel = computed(() => ({ admin: '管理员', operator: '操作员', viewer: '只读' }[auth.user?.role] || ''))
const roleTagType = computed(() => ({ admin: 'danger', operator: 'warning', viewer: '' }[auth.user?.role] || ''))

// 向复用页面注入的上下文。
providePortalContext({
  isAdmin: computed(() => permissions.value.is_admin),
  permissions,
  activeNode
})

// 提供节点导航方法给概览页使用（点击卡片跳转）。
provide('navigateToNode', (node) => {
  onNodeClick(node)
})

// 聚合 ID，用于合成聚合节点的稳定 node_key（避免与真实节点 ID 冲突）。
const AGG_DEVICE_NODE_ID = -1001
const AGG_WORKORDER_NODE_ID = -1002

// 依据已解析的多角色权限，合成一个覆盖全部授权范围的虚拟节点。
// 设备：并集 resolved_device_ids；工单：并集 type_codes（任一节点为全部则不限制）。
const buildAggregateNode = (nodeType) => {
  const p = permissions.value || {}
  if (nodeType === 'device_mgmt') {
    if (p.is_admin) {
      // 管理员：展示全部设备，不做 ID 过滤。
      return {
        id: AGG_DEVICE_NODE_ID,
        node_type: 'device_mgmt',
        name: '全部设备',
        aggregate: true,
        resolved_device_ids: null,
      }
    }
    const idSet = new Set()
    const permSet = new Set()
    for (const d of p.devices || []) {
      for (const id of d.resolved_device_ids || []) idSet.add(id)
      for (const perm of d.perms || []) permSet.add(perm)
    }
    return {
      id: AGG_DEVICE_NODE_ID,
      node_type: 'device_mgmt',
      name: '全部授权设备',
      aggregate: true,
      resolved_device_ids: Array.from(idSet),
      detail_perms: Array.from(permSet),
    }
  }
  if (nodeType === 'workorder_mgmt') {
    if (p.is_admin) {
      return {
        id: AGG_WORKORDER_NODE_ID,
        node_type: 'workorder_mgmt',
        name: '全部工单',
        aggregate: true,
        type_codes: [],
      }
    }
    const typeSet = new Set()
    const permSet = new Set()
    let allTypes = false
    for (const w of p.workorders || []) {
      if (!Array.isArray(w.type_codes) || w.type_codes.length === 0) {
        // 任一工单节点未限制类型即代表覆盖全部类型。
        allTypes = true
      } else {
        for (const tc of w.type_codes) typeSet.add(tc)
      }
      for (const perm of w.perms || []) permSet.add(perm)
    }
    return {
      id: AGG_WORKORDER_NODE_ID,
      node_type: 'workorder_mgmt',
      name: '全部授权工单',
      aggregate: true,
      type_codes: allTypes ? [] : Array.from(typeSet),
      detail_perms: Array.from(permSet),
    }
  }
  return null
}

// 概览卡片点击：聚合多角色授权范围后进入对应管理页。
provide('navigateToAggregate', (nodeType) => {
  const node = buildAggregateNode(nodeType)
  if (!node) return
  showOverview.value = false
  isFullscreen.value = false
  currentNodeKey.value = null
  activeNode.value = node
  nextTick(() => {
    // 聚合节点不属于资源树，清除树选中态。
    if (treeRef.value) treeRef.value.setCurrentKey(null)
  })
  if (nodeType === 'device_mgmt') {
    router.replace({ name: 'PortalDevices', query: { agg: 'device' } })
  } else if (nodeType === 'workorder_mgmt') {
    router.replace({ name: 'PortalWorkOrders', query: { agg: 'workorder' } })
  }
})

const onNodeClick = (data) => {
  // 分组节点不处理
  if (data.node_type === 'group') return

  // 移动端：选中叶子节点后关闭抽屉，露出内容区
  if (data.node_type !== 'group') mobileMenuOpen.value = false

  if (['device_mgmt', 'workorder_mgmt', 'scada', 'form_app', 'link'].includes(data.node_type)) {
    showOverview.value = false // 关闭概览状态
    currentNodeKey.value = data.id
    isFullscreen.value = false
    
    nextTick(() => {
      if (treeRef.value) {
        treeRef.value.setCurrentKey(data.id)
      }
    })
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
      // 保持当前节点高亮但不改变内容
    } else {
      // 内嵌 iframe
      router.replace({ path: '/portal', query: { node: data.id } })
    }
  }
}

// 监听路由变化，恢复选中状态
watch(() => [route.query.node, route.query.agg, route.name], ([nodeId, agg]) => {
  // 详情子路由：内容区由 router-view 渲染，保持既有节点选中态，不做任何重置。
  if (isDetailRoute.value) return
  // 聚合视图（概览卡片进入）：合成覆盖全部授权范围的虚拟节点。
  if (agg) {
    const nodeType = agg === 'device' ? 'device_mgmt' : agg === 'workorder' ? 'workorder_mgmt' : null
    const node = nodeType ? buildAggregateNode(nodeType) : null
    if (node) {
      showOverview.value = false
      currentNodeKey.value = null
      activeNode.value = node
      nextTick(() => {
        if (treeRef.value) treeRef.value.setCurrentKey(null)
      })
      return
    }
  }
  if (nodeId) {
    const id = parseInt(nodeId)
    const findNode = (nodes) => {
      for (const node of nodes) {
        if (node.id === id) return node
        if (node.children?.length) {
          const found = findNode(node.children)
          if (found) return found
        }
      }
      return null
    }
    const node = findNode(tree.value)
    if (node) {
      showOverview.value = false // 确保关闭概览状态
      currentNodeKey.value = node.id
      activeNode.value = node
      nextTick(() => {
        if (treeRef.value) {
          treeRef.value.setCurrentKey(node.id)
        }
      })
    }
  } else {
    // 没有 node / agg 参数时，显示概览
    showOverview.value = true
    currentNodeKey.value = null
    activeNode.value = null
  }
}, { immediate: true })

const loadTree = async () => {
  loading.value = true
  try {
    const [treeRes, permRes] = await Promise.all([
      getPortalResourceTree(),
      getPortalPermissions()
    ])
    tree.value = treeRes.data || []
    permissions.value = permRes || { is_admin: false, devices: [], workorders: [] }
    // 直链 / 刷新进入聚合视图时，权限异步加载完成后重建聚合节点。
    if (route.query.agg) {
      const nodeType = route.query.agg === 'device' ? 'device_mgmt' : route.query.agg === 'workorder' ? 'workorder_mgmt' : null
      const node = nodeType ? buildAggregateNode(nodeType) : null
      if (node) {
        showOverview.value = false
        currentNodeKey.value = null
        activeNode.value = node
      }
    }
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

const goBackToConsole = () => router.push('/dashboard')

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
.portal-aside { background: #1d2935; overflow-x: hidden; display: flex; flex-direction: column; transition: width 0.3s; }
.portal-aside.collapsed { width: 64px !important; }
.portal-logo { display: flex; align-items: center; gap: 10px; padding: 16px 20px; background: #1d2935; cursor: pointer; position: relative; transition: all 0.3s; }
.portal-logo:hover { background: #263445; }
.collapsed .portal-logo { justify-content: center; padding: 16px 8px; }
.logo-mark { width: 34px; height: 34px; border-radius: 8px; flex-shrink: 0; }
.logo-text { display: flex; flex-direction: column; line-height: 1.15; transition: opacity 0.2s; }
.logo-cn { color: #fff; font-size: 17px; font-weight: bold; letter-spacing: 2px; }
.logo-en { color: #3BE0C8; font-size: 10px; font-weight: 600; letter-spacing: 3px; }
.collapse-icon { position: absolute; right: 8px; color: #8a919e; font-size: 16px; }
.portal-overview-entry { display: flex; align-items: center; gap: 6px; margin: 8px; padding: 0 12px; height: 38px; border-radius: 6px; color: #cfd8e3; font-size: 14px; cursor: pointer; transition: background .15s; }
.portal-overview-entry:hover { background: #263445; }
.portal-overview-entry.active { background: #2b74d4; color: #fff; }
.collapsed .portal-overview-entry { justify-content: center; padding: 0; }
.portal-tree-wrap { flex: 1; overflow: auto; padding: 8px; padding-top: 0; }
.portal-tree-wrap :deep(.el-tree) { background: transparent; color: #cfd8e3; }
.portal-tree-wrap :deep(.el-tree-node__content) { height: 38px; }
.portal-tree-wrap :deep(.el-tree-node__content:hover) { background: #263445; }
.portal-tree-wrap :deep(.el-tree-node.is-current > .el-tree-node__content) { background: #2b74d4; color: #fff; }
.portal-tree-node { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.collapsed-tree { display: flex; flex-direction: column; gap: 4px; }
.collapsed-node { display: flex; align-items: center; justify-content: center; height: 38px; border-radius: 6px; color: #cfd8e3; font-size: 18px; cursor: pointer; transition: background .15s; }
.collapsed-node:hover { background: #263445; }
.collapsed-node.active { background: #2b74d4; color: #fff; }
.portal-right { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.portal-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eee; flex-shrink: 0; }
.route-title { font-size: 16px; font-weight: bold; }
.header-right { display: flex; align-items: center; gap: 12px; }
.username { display: flex; align-items: center; gap: 4px; color: #606266; font-size: 14px; }
.portal-main { flex: 1; min-height: 0; overflow: auto; padding: 16px; background: #f5f7fa; transition: padding 0.3s; }
/* 全屏：直接占满整个屏幕（含顶栏/侧栏），与工单看板全屏一致 */
.portal-main.fullscreen-content { position: fixed; inset: 0; z-index: 2000; padding: 0; background: #fff; }
.fullscreen-exit-btn { position: fixed; top: 12px; right: 16px; z-index: 2010; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.portal-iframe { width: 100%; height: 100%; border: none; background: #fff; }

.header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mobile-menu-btn { display: none; font-size: 22px; cursor: pointer; color: #303133; flex-shrink: 0; }

/* ── 移动端适配 ─────────────────────────────────────────────── */
.portal-aside-mask { display: none; }
@media (max-width: 768px) {
  .portal-layout { position: relative; }
  .mobile-menu-btn { display: inline-flex; }
  /* 侧栏改为抽屉式覆盖，默认移出屏幕，点击汉堡按钮滑入 */
  .portal-aside {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 240px !important;
    z-index: 1500;
    transform: translateX(-100%);
    transition: transform 0.28s ease;
    box-shadow: 2px 0 12px rgba(0,0,0,.25);
  }
  .portal-aside.collapsed { width: 240px !important; }
  .mobile-menu-open .portal-aside { transform: translateX(0); }
  .portal-aside-mask {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    z-index: 1400;
  }
  .portal-right { width: 100%; }
  .portal-header { padding: 0 10px; }
  .route-title { font-size: 15px; }
  .header-right { gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .header-right .username { display: none; }
  .portal-main { padding: 10px; }
}
</style>
