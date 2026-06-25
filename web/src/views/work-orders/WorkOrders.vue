<template>
  <div class="wo-layout">
    <!-- 左侧类型聚合筛选 -->
    <div class="side">
      <div class="side-title">工单类型</div>
      <el-menu :default-active="filters.type_code" @select="onTypeSelect">
        <el-menu-item index="">全部 ({{ total }})</el-menu-item>
        <el-menu-item v-for="t in types" :key="t.code" :index="t.code">
          {{ t.name }} ({{ typeCount(t.code) }})
        </el-menu-item>
        <el-menu-item index="__none__">未分类 ({{ typeCount('') }})</el-menu-item>
      </el-menu>
    </div>

    <!-- 右侧主区 -->
    <div class="main">
      <div class="toolbar">
        <el-input v-model="filters.search_key" placeholder="搜索工单号/业务单号/标题/其他编码" clearable style="width:280px" @keyup.enter="reload" @clear="reload" />
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:130px" @change="reload">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-input v-model="filters.device_id" placeholder="设备ID" clearable style="width:120px" @keyup.enter="reload" />
        <el-input v-model="filters.business_no" placeholder="业务单号" clearable style="width:150px" @keyup.enter="reload" />
        <el-select
          v-model="filters.tags"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          clearable
          placeholder="标签"
          style="width:200px"
          @change="onTagFilter"
        >
          <el-option
            v-for="t in tagDict"
            :key="t.code"
            :label="t.name"
            :value="t.code"
          >
            <span :style="t.color ? `display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color};margin-right:6px` : ''" />
            {{ t.name }}
          </el-option>
        </el-select>
        <el-button @click="reload">查询</el-button>
        <el-radio-group v-model="view" style="margin-left:8px">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="board">看板</el-radio-button>
        </el-radio-group>
        <div class="spacer" />
        <el-button
          v-if="view === 'board'"
          @click="enterBoardFullscreen"
        >全屏看板</el-button>
        <el-button
          v-if="view === 'list'"
          type="warning"
          :disabled="!canArchiveSelection"
          @click="doBatchArchive"
        >批量归档{{ selection.length ? ` (${selection.length})` : '' }}</el-button>
        <el-button @click="$router.push('/work-orders/archived')">已归档</el-button>
        <el-button @click="$router.push('/work-orders/settings')">工单设置</el-button>
      </div>

      <!-- 列表视图 -->
      <template v-if="view === 'list'">
        <el-table :data="rows" border v-loading="loading" @selection-change="onSelectionChange">
          <el-table-column type="selection" width="44" :selectable="() => true" />
          <el-table-column prop="code" label="工单号" width="170" />
          <el-table-column prop="title" label="标题" show-overflow-tooltip />
          <el-table-column prop="type_code" label="类型" width="110">
            <template #default="{ row }">{{ typeName(row.type_code) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="90">
            <template #default="{ row }">
              <el-tag :type="priorityType(row.priority)" size="small">{{ priorityLabel(row.priority) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="visibility" label="公开" width="80">
            <template #default="{ row }">
              <el-tag :type="row.visibility === 'public' ? 'success' : 'info'" size="small">
                {{ row.visibility === 'public' ? '公开' : '私有' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="设备" width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.device_name_snap || row.device_name || row.device_id || '-' }}</template>
          </el-table-column>
          <el-table-column label="业务单号" width="140" show-overflow-tooltip>
            <template #default="{ row }">
              <QRCodePopover v-if="row.business_no" :text="row.business_no">
                <span class="qr-trigger">{{ row.business_no }}</span>
              </QRCodePopover>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="其他编码" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.other_codes || '-' }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="140">
            <template #default="{ row }">
              <el-tag
                v-for="code in (row.tags || [])" :key="code"
                size="small" :color="tagColor(code)"
                class="wo-tag-clickable"
                :style="tagColor(code) ? 'color:#fff;border:none' : ''"
                @click="quickFilterTag(code)"
              >{{ tagName(code) }}</el-tag>
              <span v-if="!(row.tags || []).length">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="提交时间" width="180" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="goToDetail(row.id)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          class="pager"
          layout="total, prev, pager, next"
          :total="total"
          :page-size="limit"
          :current-page="page"
          @current-change="onPage"
        />
      </template>

      <!-- 看板视图 -->
      <div
        v-else
        ref="boardEl"
        class="board"
        :class="{ 'board-fullscreen': boardFullscreen }"
        v-loading="loading"
      >
        <div v-if="boardFullscreen" class="board-fs-bar">
          <span class="board-fs-title">工单看板</span>
          <div class="spacer" />
          <el-button size="small" @click="exitBoardFullscreen">退出全屏</el-button>
        </div>
        <div class="board-cols">
          <div v-for="col in displayBoardColumns" :key="col.key" class="board-col">
            <div class="board-col-head">
              <el-tag :type="col.tag" effect="plain">{{ col.label }}</el-tag>
              <span class="board-count">{{ boardData[col.key].length }}</span>
            </div>
            <draggable
              :list="boardData[col.key]"
              group="work-orders"
              item-key="id"
              class="board-list"
              :disabled="!canDrag"
              @change="(e) => onDragChange(e, col)"
            >
              <template #item="{ element }">
                <div
                  class="board-card"
                  role="button"
                  tabindex="0"
                  :aria-label="`工单 ${element.code || ''} ${element.title || ''}`"
                  @click="onCardClick(element.id)"
                  @keydown.enter.prevent="onCardClick(element.id)"
                  @keydown.space.prevent="onCardClick(element.id)"
                  @contextmenu.prevent="onCardContextMenu($event, element)"
                >
                  <!-- 类型配置了卡片模板则按模板渲染，否则用默认布局 -->
                  <template v-if="cardTemplate(element.type_code)">
                    <div
                      v-for="(line, i) in renderCardTemplate(element, cardTemplate(element.type_code))"
                      :key="i"
                      class="board-card-line"
                      :class="{ 'board-card-title': i === 0 }"
                    >{{ line }}</div>
                  </template>
                  <template v-else>
                    <div class="board-card-title">{{ element.title }}</div>
                    <div class="board-card-meta">
                      <span>{{ element.code }}</span>
                      <el-tag :type="priorityType(element.priority)" size="small">{{ priorityLabel(element.priority) }}</el-tag>
                    </div>
                    <div class="board-card-sub">{{ typeName(element.type_code) }} · 设备{{ element.device_id || '-' }}</div>
                    <div v-if="element.business_no" class="board-card-business">
                      <span>业务单号：{{ element.business_no }}</span>
                      <QRCodePopover :text="element.business_no" placement="right">
                        <el-icon class="qr-icon" :size="16"><Grid /></el-icon>
                      </QRCodePopover>
                    </div>
                    <div v-if="element.other_codes" class="board-card-codes" :title="element.other_codes">
                      编码：{{ element.other_codes }}
                    </div>
                    <div v-if="(element.tags || []).length" class="board-card-tags">
                      <el-tag
                        v-for="code in element.tags" :key="code"
                        size="small" :color="tagColor(code)"
                        :style="tagColor(code) ? 'color:#fff;border:none' : ''"
                      >{{ tagName(code) }}</el-tag>
                    </div>
                  </template>
                </div>
              </template>
              <!-- 空状态提示作为默认插槽，确保拖放区域始终可用 -->
              <template #footer>
                <div v-if="!boardData[col.key].length" class="board-empty">暂无工单</div>
              </template>
            </draggable>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单快捷编辑 Dialog -->
    <el-dialog
      v-model="contextMenuDialog.visible"
      :title="`快捷编辑 - ${contextMenuDialog.wo?.code || ''}`"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form v-if="contextMenuDialog.wo" label-width="90px">
        <el-form-item label="优先级">
          <el-select v-model="contextMenuDialog.priority" style="width:100%">
            <el-option label="普通" value="normal" />
            <el-option label="较高" value="high" />
            <el-option label="紧急" value="urgent" />
          </el-select>
        </el-form-item>
        <el-form-item label="业务单号">
          <el-input v-model="contextMenuDialog.businessNo" placeholder="请输入业务单号" clearable />
        </el-form-item>
        <el-form-item label="其他编码">
          <el-input
            v-model="contextMenuDialog.otherCodes"
            type="textarea"
            :rows="2"
            placeholder="多个编码用逗号或换行分隔"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-select
            v-model="contextMenuDialog.tags"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择标签"
            style="width:100%"
          >
            <el-option
              v-for="t in tagDict"
              :key="t.code"
              :label="t.name"
              :value="t.code"
            >
              <span :style="t.color ? `display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color};margin-right:6px` : ''" />
              {{ t.name }}
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contextMenuDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveContextMenuChanges">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { Grid } from '@element-plus/icons-vue'
import draggable from 'vuedraggable'
import { getWorkOrders, getWorkOrderTypes, changeWorkOrderStatus, getWorkOrderTagDict, batchArchiveWorkOrders, updateWorkOrder, setWorkOrderTags } from '@/api/workOrder'
import { statusOptions, statusLabel, statusType, priorityType, priorityLabel } from './workOrderConst'
import { useAuthStore } from '@/stores/auth'
import { createWorkOrdersStomp } from '@/utils/workOrdersStomp'
import QRCodePopover from '@/components/QRCodePopover.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canDrag = computed(() => auth.isOperator)

const rows = ref([])
const types = ref([])
const tagDict = ref([])
const tagName = (code) => tagDict.value.find(t => t.code === code)?.name || code
const tagColor = (code) => tagDict.value.find(t => t.code === code)?.color || ''
const typeCounts = ref({})
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const view = ref('list')
const filters = ref({ status: '', type_code: '', device_id: '', business_no: '', tags: [], search_key: '' })

const onTagFilter = () => { page.value = 1; syncQuery(); load() }

// 多选 + 批量归档：仅当选中项全部为「已关闭/已解决」时可归档
const selection = ref([])
const onSelectionChange = (rows) => { selection.value = rows }
const canArchiveSelection = computed(() =>
  selection.value.length > 0 &&
  selection.value.every(r => r.status === 'closed' || r.status === 'resolved')
)
const doBatchArchive = async () => {
  if (!canArchiveSelection.value) return
  try {
    await ElMessageBox.confirm(`确认归档选中的 ${selection.value.length} 个工单？归档后默认列表不再显示。`, '批量归档', { type: 'warning' })
  } catch { return }
  try {
    const res = await batchArchiveWorkOrders(selection.value.map(r => r.id))
    ElMessage.success(`已归档 ${res.archived || 0} 个工单`)
    selection.value = []
    load()
  } catch (e) {
    ElMessage.error(e.message || '归档失败')
  }
}

// 点击列表中的标签 → 加入筛选条件（已选则忽略）
const quickFilterTag = (code) => {
  if (!filters.value.tags.includes(code)) {
    filters.value.tags.push(code)
    onTagFilter()
  }
}

// 看板四列
const boardColumns = [
  { key: 'pending', label: '待处理', tag: 'info', statuses: ['open', 'reopened'], target: 'open' },
  { key: 'in_progress', label: '进行中', tag: 'warning', statuses: ['in_progress'], target: 'in_progress' },
  { key: 'resolved', label: '已解决', tag: 'success', statuses: ['resolved'], target: 'resolved' },
  { key: 'closed', label: '已关闭', tag: 'info', statuses: ['closed'], target: 'closed' }
]
const boardData = ref({ pending: [], in_progress: [], resolved: [], closed: [] })

// 全屏看板：仅展示「待处理/进行中/已解决」三列（不含已关闭）。
const boardEl = ref(null)
const boardFullscreen = ref(false)
const displayBoardColumns = computed(() =>
  boardFullscreen.value ? boardColumns.filter(c => c.key !== 'closed') : boardColumns
)
const enterBoardFullscreen = async () => {
  const el = boardEl.value
  boardFullscreen.value = true
  try {
    if (el?.requestFullscreen) await el.requestFullscreen()
  } catch { /* 浏览器拒绝时仍用 CSS 伪全屏兜底 */ }
}
const exitBoardFullscreen = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
  } catch { /* noop */ }
  boardFullscreen.value = false
}
// 用户按 Esc 退出原生全屏时同步状态。
const onFsChange = () => { if (!document.fullscreenElement) boardFullscreen.value = false }
// 全屏下点击卡片改用新标签打开详情（避免离开全屏；伪全屏时正常跳转）。
const onCardClick = (id) => {
  if (boardFullscreen.value && document.fullscreenElement) {
    window.open(router.resolve(`/work-orders/${id}`).href, '_blank')
  } else {
    goToDetail(id)
  }
}

// 跳转工单详情，携带返回地址
const goToDetail = (id) => {
  const returnUrl = route.fullPath
  router.push({ path: `/work-orders/${id}`, query: { from: returnUrl } })
}

const typeName = (code) => types.value.find(t => t.code === code)?.name || code || '-'
const typeCount = (code) => typeCounts.value[code || ''] || 0

// 看板卡片模板：取该类型的 board_card_template（空则回退默认布局）。
const cardTemplate = (code) => types.value.find(t => t.code === code)?.board_card_template || ''
// 模板渲染：按行替换 {{key}} → 工单字段值，缺失留空；过滤全空行。
const renderCardTemplate = (wo, tpl) => {
  const val = (key) => {
    const k = key.trim()
    if (k === 'type_name') return typeName(wo.type_code)
    if (k === 'status_label') return statusLabel(wo.status)
    if (k === 'tags') return (wo.tags || []).map(c => tagName(c)).join('、')
    const v = wo[k]
    return v === undefined || v === null ? '' : String(v)
  }
  return tpl.split('\n')
    .map(line => line.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => val(k)))
    .filter(line => line.trim() !== '')
}

const onTypeSelect = (index) => {
  filters.value.type_code = index === '__none__' ? '' : index
  // “未分类”用特殊标记，避免与“全部”混淆
  noneOnly.value = index === '__none__'
  page.value = 1
  syncQuery()
  load()
}
const noneOnly = ref(false)

// ── URL ↔ 查询条件双向绑定 ──────────────────────────────────────────────
// 把当前视图/筛选/分页写进地址栏 query（replace 不污染历史），空值不写保持链接干净。
const buildQuery = () => {
  const q = {}
  if (view.value !== 'list') q.view = view.value
  if (filters.value.status) q.status = filters.value.status
  if (filters.value.device_id) q.device_id = filters.value.device_id
  if (filters.value.business_no) q.business_no = filters.value.business_no
  if (filters.value.search_key) q.search_key = filters.value.search_key
  if (filters.value.tags.length) q.tags = filters.value.tags.join(',')
  if (noneOnly.value) q.type_code = '__none__'
  else if (filters.value.type_code) q.type_code = filters.value.type_code
  if (page.value > 1) q.page = String(page.value)
  return q
}
const syncQuery = () => {
  router.replace({ query: buildQuery() }).catch(() => {})
}
// 从地址栏还原（首次进入 / 后退前进）。
const restoreFromQuery = () => {
  const q = route.query
  view.value = q.view === 'board' ? 'board' : 'list'
  filters.value.status = q.status || ''
  filters.value.device_id = q.device_id || ''
  filters.value.business_no = q.business_no || ''
  filters.value.search_key = q.search_key || ''
  filters.value.tags = q.tags ? String(q.tags).split(',').filter(Boolean) : []
  if (q.type_code === '__none__') {
    noneOnly.value = true
    filters.value.type_code = ''
  } else {
    noneOnly.value = false
    filters.value.type_code = q.type_code || ''
  }
  page.value = q.page ? Math.max(1, parseInt(q.page, 10) || 1) : 1
}

const onPage = (p) => { page.value = p; syncQuery(); load() }

const load = async () => {
  loading.value = true
  try {
    if (view.value === 'board') {
      await loadBoard()
    } else {
      const params = { status: filters.value.status, device_id: filters.value.device_id, business_no: filters.value.business_no, page: page.value, limit: limit.value }
      if (filters.value.type_code) params.type_code = filters.value.type_code
      if (filters.value.tags.length) params.tags = filters.value.tags.join(',')
      if (filters.value.search_key) params.search_key = filters.value.search_key
      const res = await getWorkOrders(params)
      rows.value = filterNone(res.data || [])
      total.value = res.total || 0
    }
    loadTypeCounts()
  } finally {
    loading.value = false
  }
}

// “未分类”只能客户端过滤（后端无空 type_code 查询语义）
const filterNone = (list) => noneOnly.value ? list.filter(r => !r.type_code) : list

const loadBoard = async () => {
  // 看板一次性拉取较多（最多 200），按状态分列
  const params = { limit: 200, page: 1 }
  if (filters.value.type_code) params.type_code = filters.value.type_code
  if (filters.value.device_id) params.device_id = filters.value.device_id
  if (filters.value.tags.length) params.tags = filters.value.tags.join(',')
  if (filters.value.search_key) params.search_key = filters.value.search_key
  const res = await getWorkOrders(params)
  let data = filterNone(res.data || [])
  const next = { pending: [], in_progress: [], resolved: [], closed: [] }
  for (const wo of data) {
    const col = boardColumns.find(c => c.statuses.includes(wo.status))
    if (col) next[col.key].push(wo)
  }
  boardData.value = next
}

const loadTypeCounts = async () => {
  // 各类型计数 + 未分类计数（用 total，limit=1）
  const counts = {}
  await Promise.all([
    ...types.value.map(async t => {
      const r = await getWorkOrders({ type_code: t.code, limit: 1 })
      counts[t.code] = r.total || 0
    })
  ])
  typeCounts.value = counts
}

const onDragChange = async (evt, col) => {
  // 仅处理「移入」事件：把卡片状态改为该列目标状态
  const added = evt.added
  if (!added) return
  const wo = added.element
  if (col.statuses.includes(wo.status)) return // 同状态列内移动不改库
  try {
    markLocalOp(wo.id, col.target) // 标记本地操作，忽略服务端回推
    await changeWorkOrderStatus(wo.id, col.target, '')
    wo.status = col.target
    ElMessage.success(`已移至「${col.label}」`)
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
    loadBoard() // 回滚到服务端真实状态
  }
}

// reload：回到第 1 页 + 同步 URL + 重新加载（状态/设备/查询按钮用）
const reload = () => { page.value = 1; syncQuery(); load() }

// 切视图：同步 URL 后加载
watch(view, () => { syncQuery(); load() })

// ── STOMP 实时更新 + 轻提醒 ─────────────────────────────────────────────
const woStomp = createWorkOrdersStomp(onWorkOrderEvent, () => localStorage.getItem('token'))
// 自身拖拽/操作触发的状态变更会被服务端回推，用最近本地操作去重避免重复移动/提醒。
const recentLocalOps = new Map() // woId -> { status, ts }
const markLocalOp = (woId, status) => recentLocalOps.set(Number(woId), { status, ts: Date.now() })
const isOwnEcho = (woId, status) => {
  const op = recentLocalOps.get(Number(woId))
  if (op && op.status === status && Date.now() - op.ts < 8000) return true
  return false
}

// 事件是否匹配当前筛选条件（类型/标签/设备/未分类）。
const matchesFilter = (p) => {
  if (noneOnly.value) { if (p.type_code) return false }
  else if (filters.value.type_code && p.type_code !== filters.value.type_code) return false
  if (filters.value.device_id && String(p.device_id) !== String(filters.value.device_id)) return false
  if (filters.value.tags.length) {
    const evtTags = (p.tags ? String(p.tags).split(',') : []).filter(Boolean)
    if (!filters.value.tags.some(t => evtTags.includes(t))) return false
  }
  return true
}

function onWorkOrderEvent(p) {
  if (!p || !p.id) return
  const own = isOwnEcho(p.id, p.status)
  if (!own) notifyEvent(p)
  if (!matchesFilter(p)) return
  if (view.value === 'board') applyEventToBoard(p)
  else applyEventToList(p)
  loadTypeCounts()
}

const notifyEvent = (p) => {
  const isNew = p.event === 'work_order.created'
  ElNotification({
    title: isNew ? '新工单' : '工单状态变更',
    message: isNew
      ? `${p.code || ''} ${p.title || ''}`.trim()
      : `${p.code || ''}：${statusLabel(p.status)}`,
    type: isNew ? 'success' : 'info',
    duration: 4500,
    onClick: () => { if (p.id) router.push(`/work-orders/${p.id}`) }
  })
}

// 把事件 payload 转成卡片/行可用对象（补 tags 数组）。
const eventToRow = (p, existing) => ({
  ...(existing || {}),
  id: p.id, code: p.code, type_code: p.type_code, title: p.title,
  status: p.status, priority: p.priority, device_id: p.device_id,
  device_name_snap: p.device_name || existing?.device_name_snap,
  other_codes: p.other_codes, created_at: p.created_at || existing?.created_at,
  tags: p.tags ? String(p.tags).split(',').filter(Boolean) : (existing?.tags || [])
})

const applyEventToBoard = (p) => {
  // 先从所有列移除旧卡片
  let existing = null
  for (const key of Object.keys(boardData.value)) {
    const arr = boardData.value[key]
    const idx = arr.findIndex(w => w.id === p.id)
    if (idx >= 0) { existing = arr[idx]; arr.splice(idx, 1) }
  }
  const col = boardColumns.find(c => c.statuses.includes(p.status))
  if (!col) return // 该状态不在看板列内（如归档/未知）
  boardData.value[col.key].unshift(eventToRow(p, existing))
}

const applyEventToList = (p) => {
  const idx = rows.value.findIndex(w => w.id === p.id)
  if (idx >= 0) {
    rows.value[idx] = eventToRow(p, rows.value[idx])
  } else if (p.event === 'work_order.created' && page.value === 1) {
    rows.value.unshift(eventToRow(p, null))
    total.value += 1
  }
}

// ── 看板卡片右键菜单 ────────────────────────────────────────────────────
const contextMenuDialog = ref({
  visible: false,
  wo: null,
  priority: '',
  businessNo: '',
  otherCodes: '',
  tags: []
})

const onCardContextMenu = (event, wo) => {
  if (!auth.isOperator) return // 只有管理员和操作员可以快捷编辑

  contextMenuDialog.value = {
    visible: true,
    wo: wo,
    priority: wo.priority || 'normal',
    businessNo: wo.business_no || '',
    otherCodes: wo.other_codes || '',
    tags: wo.tags ? [...wo.tags] : []
  }
}

const saveContextMenuChanges = async () => {
  const wo = contextMenuDialog.value.wo
  if (!wo) return

  try {
    // 构建更新数据
    const updates = {}
    let changed = false

    if (contextMenuDialog.value.priority !== wo.priority) {
      updates.priority = contextMenuDialog.value.priority
      changed = true
    }

    if (contextMenuDialog.value.businessNo !== (wo.business_no || '')) {
      updates.business_no = contextMenuDialog.value.businessNo
      changed = true
    }

    if (contextMenuDialog.value.otherCodes !== (wo.other_codes || '')) {
      updates.other_codes = contextMenuDialog.value.otherCodes
      changed = true
    }

    // 更新基本字段
    if (changed) {
      await updateWorkOrder(wo.id, updates)
    }

    // 更新标签（单独接口）
    const oldTags = wo.tags || []
    const newTags = contextMenuDialog.value.tags
    if (JSON.stringify(oldTags.sort()) !== JSON.stringify(newTags.sort())) {
      await setWorkOrderTags(wo.id, newTags)
    }

    ElMessage.success('更新成功')
    contextMenuDialog.value.visible = false

    // 刷新看板数据
    if (view.value === 'board') {
      loadBoard()
    } else {
      load()
    }
  } catch (e) {
    ElMessage.error(e.message || '更新失败')
  }
}

onMounted(async () => {
  restoreFromQuery()
  const t = await getWorkOrderTypes()
  types.value = t.data || []
  try { tagDict.value = (await getWorkOrderTagDict()).data || [] } catch { tagDict.value = [] }
  load()
  woStomp.connect()
  document.addEventListener('fullscreenchange', onFsChange)
})

onUnmounted(() => {
  woStomp.disconnect()
  document.removeEventListener('fullscreenchange', onFsChange)
})
</script>

<style scoped>
.wo-layout { display: flex; gap: 16px; align-items: flex-start; }
.side { width: 200px; flex-shrink: 0; border-right: 1px solid #ebeef5; padding-right: 8px; }
.side-title { font-weight: bold; margin-bottom: 12px; padding-left: 8px; }
.side :deep(.el-menu) { border-right: none; }
.main { flex: 1; min-width: 0; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.pager { margin-top: 12px; justify-content: flex-end; }
.board { display: flex; flex-direction: column; gap: 12px; }
.board-cols { display: flex; gap: 12px; align-items: flex-start; flex: 1; min-height: 0; }
.board-col { flex: 1; min-width: 0; background: #f5f7fa; border-radius: 6px; padding: 8px; }
.board-col-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 4px; }
.board-count { font-size: 12px; color: #909399; }
.board-list { min-height: 200px; display: flex; flex-direction: column; gap: 8px; }
.board-card { background: #fff; border: 1px solid #ebeef5; border-radius: 4px; padding: 10px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04); transition: box-shadow .2s ease, border-color .2s ease; }
.board-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); border-color: #c6e2ff; }
.board-card:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }
.board-card-title { font-size: 14px; color: #303133; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.board-card-meta span { font-size: 12px; color: #909399; }
.board-card-sub { font-size: 12px; color: #c0c4cc; margin-top: 4px; }
.board-card-business { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #909399; margin-top: 4px; }
.board-card-codes { font-size: 12px; color: #909399; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.board-empty { text-align: center; color: #c0c4cc; font-size: 13px; padding: 16px 0; }
.qr-trigger { cursor: pointer; text-decoration: underline; text-decoration-style: dotted; text-underline-offset: 2px; }
.qr-trigger:hover { color: var(--el-color-primary); }
.qr-icon { cursor: pointer; color: #909399; transition: color .2s ease; }
.qr-icon:hover { color: var(--el-color-primary); }
/* 可点击标签：统一指针 + 间距，hover 提供反馈 */
.wo-tag-clickable { cursor: pointer; margin: 2px; transition: opacity .2s ease; }
.wo-tag-clickable:hover { opacity: .82; }
/* 全屏看板：占满屏幕、三列等高滚动 */
.board-fullscreen { position: fixed; inset: 0; z-index: 2000; background: #fff; padding: 16px; box-sizing: border-box; height: 100%; }
.board-fullscreen .board-cols { align-items: stretch; height: 100%; }
.board-fullscreen .board-col { display: flex; flex-direction: column; overflow: hidden; }
.board-fullscreen .board-list { flex: 1; overflow-y: auto; }
/* 全屏（看板上墙）放大字号，远距离可读 */
.board-fullscreen .board-card { padding: 14px; }
.board-fullscreen .board-card-title { font-size: 17px; }
.board-fullscreen .board-card-meta span { font-size: 14px; }
.board-fullscreen .board-card-sub { font-size: 14px; }
.board-fullscreen .board-card-line { font-size: 15px; }
.board-fullscreen .board-card-line.board-card-title { font-size: 18px; }
.board-fullscreen .board-count { font-size: 14px; }
.board-fullscreen .board-col-head { margin-bottom: 12px; }
.board-fs-bar { display: flex; align-items: center; gap: 10px; padding-bottom: 4px; }
.board-fs-title { font-size: 18px; font-weight: 600; color: #303133; }
.board-card-line { font-size: 12px; color: #606266; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-card-line.board-card-title { font-size: 14px; color: #303133; margin-top: 0; }
@media (prefers-reduced-motion: reduce) {
  .board-card, .wo-tag-clickable { transition: none; }
}
</style>
