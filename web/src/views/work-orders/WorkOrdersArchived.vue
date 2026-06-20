<template>
  <div class="archived-page">
    <div class="toolbar">
      <el-page-header @back="$router.push('/work-orders')" content="已归档工单" />
      <div class="spacer" />
      <el-select v-model="filters.status" placeholder="状态" clearable style="width:130px" @change="onSearch">
        <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
      </el-select>
      <el-input v-model="filters.device_id" placeholder="设备ID" clearable style="width:120px" @keyup.enter="onSearch" />
      <el-select
        v-model="filters.tags" multiple filterable collapse-tags collapse-tags-tooltip clearable
        placeholder="标签" style="width:200px" @change="onSearch"
      >
        <el-option v-for="t in tagDict" :key="t.code" :label="t.name" :value="t.code" />
      </el-select>
      <el-button @click="onSearch">查询</el-button>
      <el-button
        type="primary"
        :disabled="!selection.length"
        @click="doBatchUnarchive"
      >取消归档{{ selection.length ? ` (${selection.length})` : '' }}</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading" @selection-change="onSelectionChange">
      <el-table-column type="selection" width="44" />
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
      <el-table-column label="设备" width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.device_name_snap || row.device_name || row.device_id || '-' }}</template>
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
      <el-table-column prop="archived_at" label="归档时间" width="180" />
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getWorkOrders, getWorkOrderTypes, getWorkOrderTagDict, batchUnarchiveWorkOrders } from '@/api/workOrder'
import { statusOptions, statusLabel, statusType } from './workOrderConst'

const rows = ref([])
const types = ref([])
const tagDict = ref([])
const tagName = (code) => tagDict.value.find(t => t.code === code)?.name || code
const tagColor = (code) => tagDict.value.find(t => t.code === code)?.color || ''
const typeName = (code) => types.value.find(t => t.code === code)?.name || code || '-'

const total = ref(0)
const page = ref(1)
const limit = ref(20)
const loading = ref(false)
const filters = ref({ status: '', device_id: '', tags: [] })
const selection = ref([])

const onSelectionChange = (r) => { selection.value = r }

const load = async () => {
  loading.value = true
  try {
    const params = { archived: 1, page: page.value, limit: limit.value }
    if (filters.value.status) params.status = filters.value.status
    if (filters.value.device_id) params.device_id = filters.value.device_id
    if (filters.value.tags.length) params.tags = filters.value.tags.join(',')
    const res = await getWorkOrders(params)
    rows.value = res.data || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const onSearch = () => { page.value = 1; load() }
const onPage = (p) => { page.value = p; load() }

const doBatchUnarchive = async () => {
  if (!selection.value.length) return
  try {
    await ElMessageBox.confirm(`确认取消归档选中的 ${selection.value.length} 个工单？取消后将回到工单列表。`, '取消归档', { type: 'warning' })
  } catch { return }
  try {
    const res = await batchUnarchiveWorkOrders(selection.value.map(r => r.id))
    ElMessage.success(`已取消归档 ${res.unarchived || 0} 个工单`)
    selection.value = []
    load()
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

onMounted(async () => {
  const t = await getWorkOrderTypes()
  types.value = t.data || []
  try { tagDict.value = (await getWorkOrderTagDict()).data || [] } catch { tagDict.value = [] }
  load()
})
</script>

<style scoped>
.archived-page { padding: 4px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
