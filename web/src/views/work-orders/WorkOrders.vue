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
        <el-select v-model="filters.status" placeholder="状态" clearable style="width:130px" @change="load">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
        <el-input v-model="filters.device_id" placeholder="设备ID" clearable style="width:120px" @keyup.enter="load" />
        <el-button @click="load">查询</el-button>
        <el-radio-group v-model="view" style="margin-left:8px">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="board">看板</el-radio-button>
        </el-radio-group>
        <div class="spacer" />
        <el-button @click="$router.push('/work-orders/types')">工单类型</el-button>
        <el-button @click="$router.push('/work-orders/tags')">工单标签</el-button>
        <el-button @click="$router.push('/work-orders/webhooks')">外发配置</el-button>
      </div>

      <!-- 列表视图 -->
      <template v-if="view === 'list'">
        <el-table :data="rows" border v-loading="loading">
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
              <el-tag :type="priorityType(row.priority)" size="small">{{ row.priority }}</el-tag>
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
          <el-table-column label="其他编码" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.other_codes || '-' }}</template>
          </el-table-column>
          <el-table-column label="标签" min-width="140">
            <template #default="{ row }">
              <el-tag
                v-for="code in (row.tags || [])" :key="code"
                size="small" :color="tagColor(code)"
                :style="tagColor(code) ? 'color:#fff;border:none;margin:2px' : 'margin:2px'"
              >{{ tagName(code) }}</el-tag>
              <span v-if="!(row.tags || []).length">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="提交时间" width="180" />
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="$router.push(`/work-orders/${row.id}`)">详情</el-button>
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
      <div v-else class="board" v-loading="loading">
        <div v-for="col in boardColumns" :key="col.key" class="board-col">
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
              <div class="board-card" @click="$router.push(`/work-orders/${element.id}`)">
                <div class="board-card-title">{{ element.title }}</div>
                <div class="board-card-meta">
                  <span>{{ element.code }}</span>
                  <el-tag :type="priorityType(element.priority)" size="small">{{ element.priority }}</el-tag>
                </div>
                <div class="board-card-sub">{{ typeName(element.type_code) }} · 设备{{ element.device_id || '-' }}</div>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import draggable from 'vuedraggable'
import { getWorkOrders, getWorkOrderTypes, changeWorkOrderStatus, getWorkOrderTagDict } from '@/api/workOrder'
import { statusOptions, statusLabel, statusType, priorityType } from './workOrderConst'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
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
const filters = ref({ status: '', type_code: '', device_id: '' })

// 看板四列
const boardColumns = [
  { key: 'pending', label: '待处理', tag: 'info', statuses: ['open', 'reopened'], target: 'open' },
  { key: 'in_progress', label: '进行中', tag: 'warning', statuses: ['in_progress'], target: 'in_progress' },
  { key: 'resolved', label: '已解决', tag: 'success', statuses: ['resolved'], target: 'resolved' },
  { key: 'closed', label: '已关闭', tag: 'info', statuses: ['closed'], target: 'closed' }
]
const boardData = ref({ pending: [], in_progress: [], resolved: [], closed: [] })

const typeName = (code) => types.value.find(t => t.code === code)?.name || code || '-'
const typeCount = (code) => typeCounts.value[code || ''] || 0

const onTypeSelect = (index) => {
  filters.value.type_code = index === '__none__' ? '' : index
  // “未分类”用特殊标记，避免与“全部”混淆
  noneOnly.value = index === '__none__'
  page.value = 1
  load()
}
const noneOnly = ref(false)

const onPage = (p) => { page.value = p; load() }

const load = async () => {
  loading.value = true
  try {
    if (view.value === 'board') {
      await loadBoard()
    } else {
      const params = { status: filters.value.status, device_id: filters.value.device_id, page: page.value, limit: limit.value }
      if (filters.value.type_code) params.type_code = filters.value.type_code
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
    await changeWorkOrderStatus(wo.id, col.target, '')
    wo.status = col.target
    ElMessage.success(`已移至「${col.label}」`)
  } catch (e) {
    ElMessage.error(e.message || '状态更新失败')
    loadBoard() // 回滚到服务端真实状态
  }
}

watch(view, () => { load() })

onMounted(async () => {
  // 支持总览首页直达：/work-orders?status=open
  if (route.query.status) filters.value.status = route.query.status
  if (route.query.view === 'board') view.value = 'board'
  const t = await getWorkOrderTypes()
  types.value = t.data || []
  try { tagDict.value = (await getWorkOrderTagDict()).data || [] } catch { tagDict.value = [] }
  load()
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
.board { display: flex; gap: 12px; align-items: flex-start; }
.board-col { flex: 1; min-width: 0; background: #f5f7fa; border-radius: 6px; padding: 8px; }
.board-col-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 0 4px; }
.board-count { font-size: 12px; color: #909399; }
.board-list { min-height: 120px; display: flex; flex-direction: column; gap: 8px; }
.board-card { background: #fff; border: 1px solid #ebeef5; border-radius: 4px; padding: 10px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.board-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }
.board-card-title { font-size: 14px; color: #303133; margin-bottom: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.board-card-meta span { font-size: 12px; color: #909399; }
.board-card-sub { font-size: 12px; color: #c0c4cc; margin-top: 4px; }
</style>
