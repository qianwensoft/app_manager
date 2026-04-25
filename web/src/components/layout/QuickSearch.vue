<template>
  <div class="qs-wrap" @mouseenter="onEnter" @mouseleave="onLeave">
    <!-- 触发按钮 -->
    <div class="qs-trigger" @click="open">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <span>搜索</span>
      <span class="qs-shortcut">⌘K</span>
    </div>

    <!-- 悬停预览面板（无搜索词时） -->
    <Teleport to="body">
      <div
        v-if="hoverVisible && !dialogVisible"
        class="qs-hover-panel"
        :style="hoverStyle"
        @mouseenter="keepHover"
        @mouseleave="onLeave"
      >
        <div v-if="recentItems.length" class="qs-section">
          <div class="qs-section-title">最近访问</div>
          <div
            v-for="item in recentItems"
            :key="item.path"
            class="qs-item"
            @click="navigate(item)"
          >
            <span class="qs-item-icon">🕐</span>
            <span class="qs-item-label">{{ item.title }}</span>
            <span class="qs-item-path">{{ item.path }}</span>
          </div>
        </div>
        <div v-if="frequentItems.length" class="qs-section">
          <div class="qs-section-title">常用菜单</div>
          <div
            v-for="item in frequentItems"
            :key="item.path"
            class="qs-item"
            @click="navigate(item)"
          >
            <span class="qs-item-icon">⭐</span>
            <span class="qs-item-label">{{ item.title }}</span>
            <span class="qs-item-path">{{ item.path }}</span>
          </div>
        </div>
        <div v-if="!recentItems.length && !frequentItems.length" class="qs-empty">暂无记录</div>
      </div>
    </Teleport>

    <!-- 搜索弹窗 -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="qs-overlay" @click.self="close">
        <div class="qs-dialog">
          <div class="qs-input-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              ref="inputRef"
              v-model="query"
              class="qs-input"
              placeholder="搜索菜单名称、路径关键字…"
              @keydown.esc="close"
              @keydown.enter="enterResult"
              @keydown.up.prevent="moveActive(-1)"
              @keydown.down.prevent="moveActive(1)"
            />
            <span v-if="query" class="qs-clear" @click="query = ''">✕</span>
          </div>

          <div class="qs-results" ref="resultsRef">
            <template v-if="query.trim()">
              <div v-if="!results.length" class="qs-no-result">未找到匹配项</div>
              <div
                v-for="(item, i) in results"
                :key="item.path"
                class="qs-result-item"
                :class="{ active: i === activeIndex }"
                @click="navigate(item)"
                @mouseenter="activeIndex = i"
              >
                <span class="qs-result-label" v-html="highlight(item.title)"></span>
                <span class="qs-result-path" v-html="highlight(item.path)"></span>
              </div>
            </template>
            <template v-else>
              <div v-if="recentItems.length" class="qs-section">
                <div class="qs-section-title">最近访问</div>
                <div
                  v-for="item in recentItems"
                  :key="item.path + '_r'"
                  class="qs-result-item"
                  @click="navigate(item)"
                >
                  <span class="qs-result-label">{{ item.title }}</span>
                  <span class="qs-result-path">{{ item.path }}</span>
                </div>
              </div>
              <div v-if="frequentItems.length" class="qs-section">
                <div class="qs-section-title">常用菜单</div>
                <div
                  v-for="item in frequentItems"
                  :key="item.path + '_f'"
                  class="qs-result-item"
                  @click="navigate(item)"
                >
                  <span class="qs-result-label">{{ item.title }}</span>
                  <span class="qs-result-path">{{ item.path }}</span>
                </div>
              </div>
              <div v-if="!recentItems.length && !frequentItems.length" class="qs-empty">开始输入以搜索</div>
            </template>
          </div>
          <div class="qs-footer">
            <span>↑↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

// ---- 菜单条目定义（与 Layout.vue 保持一致）----
const ALL_MENUS = [
  { title: '总览', path: '/', keywords: 'dashboard home' },
  { title: '设备管理', path: '/devices', keywords: 'device phone' },
  { title: '扫码接入', path: '/qrcode', keywords: 'qrcode scan' },
  { title: '屏幕查看', path: '/screen', keywords: 'screen video' },
  { title: 'Shell 终端', path: '/shell', keywords: 'shell terminal cpu' },
  { title: 'Logcat', path: '/logcat', keywords: 'logcat log' },
  { title: '自定义事件', path: '/events', keywords: 'events bell' },
  { title: '事件定义', path: '/event-definitions', keywords: 'event config setting' },
  { title: '外部应用', path: '/outbound/apps', keywords: 'outbound app link' },
  { title: '数据源与接口', path: '/data', keywords: 'data source interface datasource' },
  { title: '连接器', path: '/outbound', keywords: 'outbound connector share integration' },
  { title: '组态编辑器', path: '__scada_editor__', keywords: 'scada editor 组态' },
  { title: 'Agent 菜单', path: '/agent-menus', keywords: 'agent menu' },
  { title: 'APK 管理', path: '/apps', keywords: 'apk app box' },
  { title: '任务队列', path: '/tasks', keywords: 'task queue list' },
  { title: '授权令牌', path: '/apikeys', keywords: 'apikey token key' },
  { title: 'OAuth 客户端', path: '/oauth-clients', keywords: 'oauth client key' },
  { title: '用户管理', path: '/users', keywords: 'user admin' },
  { title: '审计日志', path: '/audit', keywords: 'audit log notebook' },
  { title: '系统管理', path: '/settings', keywords: 'settings system tools' },
]

// ---- 状态 ----
const dialogVisible = ref(false)
const hoverVisible = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const resultsRef = ref(null)
const triggerRef = ref(null)
const hoverStyle = ref({})
let leaveTimer = null
let hoverPanelHovered = false

// ---- 历史记录（按用户隔离）----
function storageKey() {
  return `qs_history_${auth.user?.username || 'guest'}`
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '[]') } catch { return [] }
}

function saveHistory(list) {
  localStorage.setItem(storageKey(), JSON.stringify(list))
}

function recordVisit(item) {
  if (item.path === '__scada_editor__') return
  const list = loadHistory()
  const now = Date.now()
  const existing = list.find(h => h.path === item.path)
  if (existing) {
    existing.count = (existing.count || 1) + 1
    existing.lastAt = now
  } else {
    list.push({ path: item.path, title: item.title, count: 1, lastAt: now })
  }
  saveHistory(list)
}

// 最近3次（按 lastAt 降序）
const recentItems = computed(() => {
  const list = loadHistory()
  return [...list].sort((a, b) => b.lastAt - a.lastAt).slice(0, 3)
})

// 最常用3个（按 count 降序，排除已在最近中的）
const frequentItems = computed(() => {
  const list = loadHistory()
  const recentPaths = new Set(recentItems.value.map(i => i.path))
  return [...list]
    .filter(i => !recentPaths.has(i.path))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
})

// ---- 搜索 ----
const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return ALL_MENUS.filter(m =>
    m.title.toLowerCase().includes(q) ||
    m.path.toLowerCase().includes(q) ||
    (m.keywords || '').toLowerCase().includes(q)
  ).slice(0, 12)
})

watch(results, () => { activeIndex.value = 0 })

function highlight(text) {
  const q = query.value.trim()
  if (!q) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>')
}

function moveActive(dir) {
  const len = results.value.length || 0
  if (!len) return
  activeIndex.value = (activeIndex.value + dir + len) % len
}

function enterResult() {
  const list = results.value
  if (list.length) navigate(list[activeIndex.value])
  else close()
}

// ---- 导航 ----
function navigate(item) {
  close()
  hoverVisible.value = false
  recordVisit(item)
  if (item.path === '__scada_editor__') {
    const token = localStorage.getItem('token')
    const base = `${window.location.origin}/scada-editor/`
    const url = `${base}${token ? `?_token=${encodeURIComponent(token)}` : ''}`
    window.open(url, '_blank')
  } else {
    router.push(item.path)
  }
}

// ---- 弹窗开关 ----
function open() {
  hoverVisible.value = false
  dialogVisible.value = true
  query.value = ''
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}

function close() {
  dialogVisible.value = false
  query.value = ''
}

// ---- 悬停面板 ----
function computeHoverStyle() {
  const el = document.querySelector('.qs-trigger')
  if (!el) return {}
  const rect = el.getBoundingClientRect()
  return {
    top: rect.bottom + 8 + 'px',
    right: window.innerWidth - rect.right + 'px',
  }
}

function onEnter() {
  clearTimeout(leaveTimer)
  hoverStyle.value = computeHoverStyle()
  hoverVisible.value = true
}

function keepHover() {
  clearTimeout(leaveTimer)
  hoverPanelHovered = true
}

function onLeave() {
  leaveTimer = setTimeout(() => {
    hoverVisible.value = false
    hoverPanelHovered = false
  }, 180)
}

// ---- 全局快捷键 ----
function onKeydown(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    dialogVisible.value ? close() : open()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.qs-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.qs-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  color: #909399;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  user-select: none;
  white-space: nowrap;
}
.qs-trigger:hover {
  border-color: #409eff;
  background: #fff;
  color: #606266;
}
.qs-shortcut {
  font-size: 11px;
  color: #c0c4cc;
  margin-left: 4px;
  font-family: monospace;
}
</style>

<style>
/* 悬停面板 */
.qs-hover-panel {
  position: fixed;
  z-index: 9000;
  min-width: 240px;
  max-width: 320px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 8px 0;
}

/* 搜索弹窗遮罩 */
.qs-overlay {
  position: fixed;
  inset: 0;
  z-index: 9100;
  background: rgba(0,0,0,0.35);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 100px;
}

.qs-dialog {
  width: 520px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 480px;
}

.qs-input-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}
.qs-input-wrap svg { color: #909399; flex-shrink: 0; }

.qs-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  color: #303133;
  background: transparent;
}
.qs-input::placeholder { color: #c0c4cc; }

.qs-clear {
  color: #c0c4cc;
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
}
.qs-clear:hover { color: #909399; background: #f5f7fa; }

.qs-results {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.qs-section { padding: 4px 0; }

.qs-section-title {
  font-size: 11px;
  color: #909399;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 6px 16px 4px;
}

.qs-result-item, .qs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.12s;
}
.qs-result-item:hover, .qs-result-item.active,
.qs-item:hover {
  background: #f0f7ff;
}

.qs-result-label, .qs-item-label {
  flex: 1;
  font-size: 13px;
  color: #303133;
}
.qs-result-path, .qs-item-path {
  font-size: 11px;
  color: #c0c4cc;
  font-family: monospace;
}
.qs-item-icon { font-size: 13px; }

.qs-result-label mark, .qs-result-path mark {
  background: #fff0c0;
  color: #b8860b;
  border-radius: 2px;
  padding: 0 1px;
}

.qs-no-result, .qs-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  padding: 24px 0;
}

.qs-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid #f0f0f0;
  font-size: 11px;
  color: #c0c4cc;
  flex-shrink: 0;
}
</style>
