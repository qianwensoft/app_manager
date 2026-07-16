<template>
  <div class="archived-page">
    <div class="toolbar">
      <el-page-header @back="$router.push('/work-orders')" content="已归档工单" />
      <div class="spacer" />
      <el-select v-model="filters.type_code" placeholder="类型" clearable style="width:130px" @change="onSearch">
        <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
      </el-select>
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
      <el-date-picker
        v-model="filters.createdRange"
        type="datetimerange"
        range-separator="-"
        start-placeholder="创建开始"
        end-placeholder="创建结束"
        style="width:360px"
        @change="onSearch"
        clearable
      />
      <el-date-picker
        v-model="filters.archivedRange"
        type="datetimerange"
        range-separator="-"
        start-placeholder="归档开始"
        end-placeholder="归档结束"
        style="width:360px"
        @change="onSearch"
        clearable
      />
      <el-button @click="onSearch">查询</el-button>
      <el-button type="success" @click="showStatistics">生成统计报告</el-button>
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
      <el-table-column label="处理耗时" width="110">
        <template #default="{ row }">{{ formatDuration(row) }}</template>
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
      layout="total, sizes, prev, pager, next"
      :total="total"
      :page-size="limit"
      :page-sizes="[10, 20, 50, 100]"
      :current-page="page"
      @current-change="onPage"
      @size-change="onSizeChange"
    />

    <!-- 统计报告弹窗 -->
    <el-dialog v-model="statsVisible" title="统计分析报告" width="1200px" :close-on-click-modal="false">
      <div v-loading="statsLoading" style="min-height:300px">
        <div v-if="stats" class="stats-content">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="总计工单">{{ stats.total }}</el-descriptions-item>
            <el-descriptions-item label="平均处理耗时">
              {{ stats.avg_processing_hours ? (stats.avg_processing_hours).toFixed(1) + ' 小时' : '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="查询时间">{{ new Date().toLocaleString() }}</el-descriptions-item>
          </el-descriptions>

          <div style="margin-top:20px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <div style="color:#666; font-size:13px">
              <el-icon><Rank /></el-icon> 拖拽下方板块标题可调整显示顺序
            </div>
            <el-button size="small" text @click="resetSectionOrder">
              <el-icon><RefreshLeft /></el-icon> 恢复默认顺序
            </el-button>
          </div>

          <div ref="sectionsContainer" class="sections-container">
            <div
              v-for="section in sections"
              :key="section.key"
              :data-key="section.key"
              class="stats-section"
              draggable="true"
              @dragstart="onDragStart"
              @dragover.prevent
              @drop="onDrop"
            >
              <el-divider content-position="left" class="section-header">
                <el-icon class="drag-handle"><DCaret /></el-icon>
                {{ section.title }}
              </el-divider>

              <div class="section-content">
                <!-- 表格 -->
                <div class="table-wrapper">
                  <el-table :data="section.data" border size="small">
                    <el-table-column :prop="section.labelProp" :label="section.labelName" width="150">
                      <template #default="{ row }">
                        <el-tag v-if="section.key === 'status'" :type="statusType(row[section.labelProp])">
                          {{ statusLabel(row[section.labelProp]) }}
                        </el-tag>
                        <span v-else-if="section.key === 'type'">{{ typeName(row[section.labelProp]) }}</span>
                        <span v-else>{{ row[section.labelProp] }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="count" label="数量" width="100" />
                    <el-table-column label="占比" width="100">
                      <template #default="{ row }">{{ ((row.count / stats.total) * 100).toFixed(1) }}%</template>
                    </el-table-column>
                  </el-table>
                </div>

                <!-- 饼状图 -->
                <div class="chart-wrapper">
                  <div :ref="el => chartRefs[section.key] = el" class="pie-chart"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="exportAsImage">导出为图片</el-button>
        <el-button type="primary" @click="exportAsPDF">导出为PDF</el-button>
        <el-button @click="statsVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { DCaret, Rank, RefreshLeft } from '@element-plus/icons-vue'
import { getWorkOrders, getWorkOrderTypes, getWorkOrderTagDict, batchUnarchiveWorkOrders, getWorkOrderStatistics } from '@/api/workOrder'
import { statusOptions, statusLabel, statusType } from './workOrderConst'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import * as echarts from 'echarts'

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
const filters = ref({
  status: '',
  type_code: '',
  device_id: '',
  tags: [],
  createdRange: null,
  archivedRange: null
})
const selection = ref([])

const statsVisible = ref(false)
const statsLoading = ref(false)
const stats = ref(null)
const chartRefs = ref({})
const chartInstances = ref({})
const sectionsContainer = ref(null)

// 拖拽排序相关
let draggedElement = null

const SECTION_ORDER_KEY = 'work_order_stats_section_order'

// 初始化sections顺序（从localStorage读取）
const initSections = () => {
  const defaultSections = [
    { key: 'status', title: '按状态统计', data: [], labelProp: 'status', labelName: '状态' },
    { key: 'type', title: '按类型统计', data: [], labelProp: 'type_code', labelName: '类型' },
    { key: 'priority', title: '按优先级统计', data: [], labelProp: 'priority', labelName: '优先级' },
    { key: 'tag', title: '按标签统计', data: [], labelProp: 'tag_name', labelName: '标签' }
  ]

  try {
    const savedOrder = localStorage.getItem(SECTION_ORDER_KEY)
    if (savedOrder) {
      const orderKeys = JSON.parse(savedOrder)
      // 按保存的顺序重新排列
      const orderedSections = []
      orderKeys.forEach(key => {
        const section = defaultSections.find(s => s.key === key)
        if (section) orderedSections.push(section)
      })
      // 添加任何新增的section（以防配置更新）
      defaultSections.forEach(section => {
        if (!orderedSections.find(s => s.key === section.key)) {
          orderedSections.push(section)
        }
      })
      return orderedSections
    }
  } catch (e) {
    console.warn('Failed to load section order from localStorage:', e)
  }

  return defaultSections
}

const sections = ref(initSections())

// 保存排序到localStorage
const saveSectionOrder = () => {
  try {
    const orderKeys = sections.value.map(s => s.key)
    localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(orderKeys))
  } catch (e) {
    console.warn('Failed to save section order to localStorage:', e)
  }
}

const onDragStart = (e) => {
  draggedElement = e.target.closest('.stats-section')
  e.dataTransfer.effectAllowed = 'move'
}

const onDrop = (e) => {
  e.preventDefault()
  const targetElement = e.target.closest('.stats-section')
  if (!targetElement || !draggedElement || targetElement === draggedElement) return

  const draggedKey = draggedElement.getAttribute('data-key')
  const targetKey = targetElement.getAttribute('data-key')

  const draggedIndex = sections.value.findIndex(s => s.key === draggedKey)
  const targetIndex = sections.value.findIndex(s => s.key === targetKey)

  if (draggedIndex !== -1 && targetIndex !== -1) {
    const temp = sections.value[draggedIndex]
    sections.value.splice(draggedIndex, 1)
    sections.value.splice(targetIndex, 0, temp)

    // 保存新的顺序
    saveSectionOrder()
    ElMessage.success('排序已保存')
  }
}

// 重置板块顺序为默认
const resetSectionOrder = () => {
  try {
    localStorage.removeItem(SECTION_ORDER_KEY)
    sections.value = initSections()
    ElMessage.success('已恢复默认顺序')
    // 重新渲染图表
    if (stats.value) {
      nextTick(() => renderCharts())
    }
  } catch (e) {
    ElMessage.error('恢复默认顺序失败')
  }
}

const onSelectionChange = (r) => { selection.value = r }

const formatDuration = (row) => {
  if (!row.created_at) return '-'
  const endTime = row.settled_at || row.closed_at || row.archived_at
  if (!endTime) return '-'

  const start = new Date(row.created_at)
  const end = new Date(endTime)
  const diffMs = end - start
  if (diffMs < 0) return '-'

  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainHours = hours % 24

  if (days > 0) {
    return remainHours > 0 ? `${days}天${remainHours}小时` : `${days}天`
  }
  if (hours > 0) {
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`
  }
  const mins = Math.floor(diffMs / (1000 * 60))
  return `${mins}分钟`
}

const load = async () => {
  loading.value = true
  try {
    const params = { archived: 1, page: page.value, limit: limit.value }
    if (filters.value.status) params.status = filters.value.status
    if (filters.value.type_code) params.type_code = filters.value.type_code
    if (filters.value.device_id) params.device_id = filters.value.device_id
    if (filters.value.tags.length) params.tags = filters.value.tags.join(',')

    // 创建时间范围
    if (filters.value.createdRange && filters.value.createdRange.length === 2) {
      params.created_start = filters.value.createdRange[0].toISOString()
      params.created_end = filters.value.createdRange[1].toISOString()
    }

    // 归档时间范围
    if (filters.value.archivedRange && filters.value.archivedRange.length === 2) {
      params.archived_start = filters.value.archivedRange[0].toISOString()
      params.archived_end = filters.value.archivedRange[1].toISOString()
    }

    const res = await getWorkOrders(params)
    rows.value = res.data || []
    total.value = res.total || 0
  } finally {
    loading.value = false
  }
}

const onSearch = () => { page.value = 1; load() }
const onPage = (p) => { page.value = p; load() }
const onSizeChange = (size) => { limit.value = size; page.value = 1; load() }

const renderCharts = () => {
  nextTick(() => {
    sections.value.forEach(section => {
      const chartDom = chartRefs.value[section.key]
      if (!chartDom || !section.data || section.data.length === 0) return

      // 销毁旧实例
      if (chartInstances.value[section.key]) {
        chartInstances.value[section.key].dispose()
      }

      const chart = echarts.init(chartDom)
      chartInstances.value[section.key] = chart

      const data = section.data.map(item => {
        let name = item[section.labelProp]
        if (section.key === 'status') {
          name = statusLabel(name)
        } else if (section.key === 'type') {
          name = typeName(name)
        }
        return { value: item.count, name }
      })

      const option = {
        tooltip: {
          trigger: 'item',
          formatter: '{b}: {c} ({d}%)'
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          type: 'scroll'
        },
        series: [
          {
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: true,
            itemStyle: {
              borderRadius: 8,
              borderColor: '#fff',
              borderWidth: 2
            },
            label: {
              show: false
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 14,
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: false
            },
            data
          }
        ]
      }

      chart.setOption(option)
    })
  })
}

const showStatistics = async () => {
  statsVisible.value = true
  statsLoading.value = true
  stats.value = null
  try {
    const params = { archived: 1 }
    if (filters.value.status) params.status = filters.value.status
    if (filters.value.type_code) params.type_code = filters.value.type_code
    if (filters.value.device_id) params.device_id = filters.value.device_id
    if (filters.value.tags.length) params.tags = filters.value.tags.join(',')

    // 创建时间范围
    if (filters.value.createdRange && filters.value.createdRange.length === 2) {
      params.created_start = filters.value.createdRange[0].toISOString()
      params.created_end = filters.value.createdRange[1].toISOString()
    }

    // 归档时间范围
    if (filters.value.archivedRange && filters.value.archivedRange.length === 2) {
      params.archived_start = filters.value.archivedRange[0].toISOString()
      params.archived_end = filters.value.archivedRange[1].toISOString()
    }

    const res = await getWorkOrderStatistics(params)
    stats.value = res

    // 更新各板块数据
    sections.value[0].data = res.by_status || []
    sections.value[1].data = res.by_type || []
    sections.value[2].data = res.by_priority || []
    sections.value[3].data = res.by_tag || []

    renderCharts()
  } catch (e) {
    ElMessage.error(e.message || '获取统计数据失败')
  } finally {
    statsLoading.value = false
  }
}

// 监听sections变化重新渲染图表
watch(() => sections.value.map(s => s.key).join(','), () => {
  if (stats.value) {
    nextTick(() => renderCharts())
  }
}, { deep: true })

const exportAsImage = async () => {
  try {
    const dialogContent = document.querySelector('.el-dialog .stats-content')
    if (!dialogContent) {
      ElMessage.warning('无法找到报告内容')
      return
    }

    ElMessage.info('正在生成图片...')
    const canvas = await html2canvas(dialogContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    })

    const link = document.createElement('a')
    link.download = `工单统计报告_${new Date().toLocaleDateString()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    ElMessage.success('图片已下载')
  } catch (e) {
    ElMessage.error('导出图片失败：' + e.message)
  }
}

const exportAsPDF = async () => {
  try {
    const dialogContent = document.querySelector('.el-dialog .stats-content')
    if (!dialogContent) {
      ElMessage.warning('无法找到报告内容')
      return
    }

    ElMessage.info('正在生成PDF...')
    const canvas = await html2canvas(dialogContent, {
      backgroundColor: '#ffffff',
      scale: 2,
      logging: false,
      useCORS: true
    })

    const imgWidth = 190
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const pdf = new jsPDF('p', 'mm', 'a4')

    const pageHeight = 280
    let heightLeft = imgHeight
    let position = 10

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 10
      pdf.addPage()
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    pdf.save(`工单统计报告_${new Date().toLocaleDateString()}.pdf`)
    ElMessage.success('PDF已下载')
  } catch (e) {
    ElMessage.error('导出PDF失败：' + e.message)
  }
}

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
.stats-content { padding: 20px 0; }

.sections-container {
  margin-top: 20px;
}

.stats-section {
  margin-bottom: 30px;
  border: 2px dashed transparent;
  padding: 10px;
  border-radius: 8px;
  transition: all 0.3s;
  cursor: move;
}

.stats-section:hover {
  border-color: #409EFF;
  background-color: #f5f7fa;
}

.section-header {
  cursor: move;
  user-select: none;
}

.drag-handle {
  margin-right: 8px;
  color: #909399;
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.section-content {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.table-wrapper {
  flex: 1;
  min-width: 400px;
}

.chart-wrapper {
  flex: 1;
  min-width: 350px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.pie-chart {
  width: 100%;
  height: 300px;
}
</style>
