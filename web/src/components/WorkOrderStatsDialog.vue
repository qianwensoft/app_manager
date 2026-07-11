<template>
  <el-dialog v-model="visible" title="统计分析报告" width="1200px" :close-on-click-modal="false" @close="onClose">
    <div v-loading="loading" style="min-height:300px">
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

              <div class="chart-wrapper">
                <div :ref="el => chartRefs[section.key] = el" class="pie-chart"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="showShareDialog">生成分享链接</el-button>
      <el-button @click="exportAsImage">导出为图片</el-button>
      <el-button type="primary" @click="exportAsPDF">导出为PDF</el-button>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 分享对话框 -->
  <el-dialog v-model="shareDialogVisible" title="生成分享链接" width="600px">
    <el-form :model="shareForm" label-width="120px">
      <el-form-item label="分享标题">
        <el-input v-model="shareForm.title" placeholder="例如：Q1工单统计报告" />
      </el-form-item>
      <el-form-item label="有效期">
        <el-input-number
          v-model="shareForm.days"
          :min="1"
          :max="365"
          placeholder="天数"
          style="width:100%"
        />
        <div style="font-size:12px; color:#909399; margin-top:4px">
          自定义有效期（1-365天）
        </div>
      </el-form-item>
      <el-form-item label="认证模式">
        <el-radio-group v-model="shareForm.authMode">
          <el-radio value="public">免登录</el-radio>
          <el-radio value="login">需登录</el-radio>
        </el-radio-group>
        <div style="font-size:12px; color:#909399; margin-top:5px">
          <div v-if="shareForm.authMode === 'public'">任何人通过链接都可以查看，无需登录</div>
          <div v-else>需要登录后才能查看和操作工单，支持权限控制</div>
        </div>
      </el-form-item>
      <el-form-item v-if="shareForm.authMode === 'login'" label="访问权限">
        <el-checkbox-group v-model="shareForm.permissions">
          <el-checkbox label="can_view" disabled checked>查看工单详情</el-checkbox>
          <el-checkbox label="can_comment">添加评论</el-checkbox>
          <el-checkbox label="can_update_status">更新工单状态</el-checkbox>
          <el-checkbox label="can_update_fields">更新工单字段</el-checkbox>
        </el-checkbox-group>
        <div style="font-size:12px; color:#909399; margin-top:5px">
          登录用户可以执行哪些操作
        </div>
      </el-form-item>
    </el-form>

    <div v-if="shareLink" style="margin-top:20px">
      <el-alert title="分享链接已生成" type="success" :closable="false">
        <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
          <el-input v-model="shareLink" readonly style="flex:1" />
          <el-button @click="copyShareLink" style="flex-shrink:0">复制</el-button>
        </div>
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="shareDialogVisible = false">关闭</el-button>
      <el-button v-if="!shareLink" type="primary" @click="generateShare" :loading="shareLoading">生成链接</el-button>
      <el-button v-else type="primary" @click="manageShares">管理分享</el-button>
    </template>
  </el-dialog>

  <!-- 管理分享对话框 -->
  <el-dialog v-model="manageDialogVisible" title="管理分享链接" width="900px">
    <el-table v-loading="manageLoading" :data="shareList" border>
      <el-table-column prop="title" label="标题" />
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="过期时间" width="180">
        <template #default="{ row }">{{ new Date(row.expires_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="new Date(row.expires_at) > new Date() ? 'success' : 'danger'">
            {{ new Date(row.expires_at) > new Date() ? '有效' : '已过期' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="copyShareLinkById(row)">复制链接</el-button>
          <el-popconfirm title="确定删除此分享？" @confirm="deleteShare(row.id)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="manageDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DCaret, Rank, RefreshLeft } from '@element-plus/icons-vue'
import { getWorkOrderStatistics, getWorkOrderTypes, createWorkOrderReportShare, listWorkOrderReportShares, deleteWorkOrderReportShare } from '@/api/workOrder'
import { statusLabel, statusType } from '@/views/work-orders/workOrderConst'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import * as echarts from 'echarts'

const props = defineProps({
  filters: { type: Object, default: () => ({}) }
})

const visible = ref(false)
const loading = ref(false)
const stats = ref(null)
const types = ref([])
const chartRefs = ref({})
const chartInstances = ref({})
const sectionsContainer = ref(null)

// 分享相关
const shareDialogVisible = ref(false)
const shareLoading = ref(false)
const shareLink = ref('')
const shareForm = ref({
  title: '',
  days: 7
})
const manageDialogVisible = ref(false)
const manageLoading = ref(false)
const shareList = ref([])

const typeName = (code) => types.value.find(t => t.code === code)?.name || code || '-'

let draggedElement = null
const SECTION_ORDER_KEY = 'work_order_stats_section_order'

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
      const orderedSections = []
      orderKeys.forEach(key => {
        const section = defaultSections.find(s => s.key === key)
        if (section) orderedSections.push(section)
      })
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
    saveSectionOrder()
    ElMessage.success('排序已保存')
  }
}

const resetSectionOrder = () => {
  try {
    localStorage.removeItem(SECTION_ORDER_KEY)
    sections.value = initSections()
    ElMessage.success('已恢复默认顺序')
    if (stats.value) {
      nextTick(() => renderCharts())
    }
  } catch (e) {
    ElMessage.error('恢复默认顺序失败')
  }
}

const renderCharts = () => {
  nextTick(() => {
    sections.value.forEach(section => {
      const chartDom = chartRefs.value[section.key]
      if (!chartDom || !section.data || section.data.length === 0) return

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

watch(() => sections.value.map(s => s.key).join(','), () => {
  if (stats.value) {
    nextTick(() => renderCharts())
  }
}, { deep: true })

const show = async () => {
  visible.value = true
  loading.value = true
  stats.value = null

  try {
    const t = await getWorkOrderTypes()
    types.value = t.data || []

    const params = { ...props.filters }
    const res = await getWorkOrderStatistics(params)
    stats.value = res

    sections.value[0].data = res.by_status || []
    sections.value[1].data = res.by_type || []
    sections.value[2].data = res.by_priority || []
    sections.value[3].data = res.by_tag || []

    renderCharts()
  } catch (e) {
    ElMessage.error(e.message || '获取统计数据失败')
  } finally {
    loading.value = false
  }
}

const onClose = () => {
  Object.values(chartInstances.value).forEach(chart => chart?.dispose())
  chartInstances.value = {}
}

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

const showShareDialog = () => {
  shareDialogVisible.value = true
  shareLink.value = ''
  shareForm.value = {
    title: `工单统计报告_${new Date().toLocaleDateString()}`,
    days: 7,
    authMode: 'public',
    permissions: ['can_comment']
  }
}

const generateShare = async () => {
  if (!shareForm.value.title.trim()) {
    ElMessage.warning('请输入分享标题')
    return
  }

  shareLoading.value = true
  try {
    const payload = {
      title: shareForm.value.title,
      filters: props.filters,
      expires_in_days: shareForm.value.days,  // 直接使用天数
      auth_mode: shareForm.value.authMode
    }

    // 需登录模式下添加权限配置
    if (shareForm.value.authMode === 'login') {
      const permissions = {
        can_view: true,  // 查看权限默认开启
        can_comment: shareForm.value.permissions.includes('can_comment'),
        can_update_status: shareForm.value.permissions.includes('can_update_status'),
        can_update_fields: shareForm.value.permissions.includes('can_update_fields')
      }
      payload.permissions = permissions
    }

    const res = await createWorkOrderReportShare(payload)

    const token = res.data.token
    shareLink.value = `${window.location.origin}/work-order-report-share/${token}`
    ElMessage.success('分享链接已生成')
  } catch (e) {
    ElMessage.error(e.message || '生成分享链接失败')
  } finally {
    shareLoading.value = false
  }
}

const copyShareLink = async () => {
  const link = shareLink.value

  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link)
      ElMessage.success('链接已复制到剪贴板')
      return
    }
  } catch (e) {
    console.warn('Clipboard API failed, fallback to execCommand', e)
  }

  // 回退方案：使用传统的 execCommand
  try {
    const textarea = document.createElement('textarea')
    textarea.value = link
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.padding = '0'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.boxShadow = 'none'
    textarea.style.background = 'transparent'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (successful) {
      ElMessage.success('链接已复制到剪贴板')
    } else {
      throw new Error('execCommand failed')
    }
  } catch (e) {
    console.error('All copy methods failed', e)
    ElMessage.error('复制失败，请手动复制：' + link)
  }
}

const manageShares = async () => {
  shareDialogVisible.value = false
  manageDialogVisible.value = true
  manageLoading.value = true

  try {
    const res = await listWorkOrderReportShares()
    shareList.value = res.data || []
  } catch (e) {
    ElMessage.error(e.message || '获取分享列表失败')
  } finally {
    manageLoading.value = false
  }
}

const copyShareLinkById = async (row) => {
  const link = `${window.location.origin}/work-order-report-share/${row.token}`

  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link)
      ElMessage.success('链接已复制到剪贴板')
      return
    }
  } catch (e) {
    console.warn('Clipboard API failed, fallback to execCommand', e)
  }

  // 回退方案：使用传统的 execCommand
  try {
    const textarea = document.createElement('textarea')
    textarea.value = link
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.padding = '0'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.boxShadow = 'none'
    textarea.style.background = 'transparent'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (successful) {
      ElMessage.success('链接已复制到剪贴板')
    } else {
      throw new Error('execCommand failed')
    }
  } catch (e) {
    console.error('All copy methods failed', e)
    ElMessage.error('复制失败，请手动复制：' + link)
  }
}

const deleteShare = async (id) => {
  try {
    await deleteWorkOrderReportShare(id)
    ElMessage.success('删除成功')
    manageShares()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

defineExpose({ show })
</script>

<style scoped>
.stats-content { padding: 20px 0; }
.sections-container { margin-top: 20px; }
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
