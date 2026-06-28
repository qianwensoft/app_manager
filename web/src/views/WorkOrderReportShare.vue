<template>
  <div class="share-page">
    <div v-if="loading" v-loading="true" style="min-height:400px"></div>

    <div v-else-if="error" class="error-container">
      <el-result icon="error" :title="error">
        <template #extra>
          <el-button type="primary" @click="$router.push('/')">返回首页</el-button>
        </template>
      </el-result>
    </div>

    <div v-else class="share-content">
      <el-card shadow="never">
        <template #header>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h2 style="margin:0">{{ shareInfo.title }}</h2>
              <div style="color:#909399; font-size:13px; margin-top:8px">
                分享时间：{{ new Date(shareInfo.created_at).toLocaleString() }} |
                过期时间：{{ new Date(shareInfo.expires_at).toLocaleString() }}
              </div>
            </div>
            <el-radio-group v-model="viewMode" size="default">
              <el-radio-button value="statistics">统计报告</el-radio-button>
              <el-radio-button value="list">工单列表</el-radio-button>
              <el-radio-button value="board">看板视图</el-radio-button>
            </el-radio-group>
          </div>
        </template>

        <!-- 统计报告视图 -->
        <div v-if="viewMode === 'statistics'" v-loading="statsLoading">
          <div v-if="stats" class="stats-content">
            <el-descriptions :column="3" border>
              <el-descriptions-item label="总计工单">{{ stats.total }}</el-descriptions-item>
              <el-descriptions-item label="平均处理耗时">
                {{ stats.avg_processing_hours ? (stats.avg_processing_hours).toFixed(1) + ' 小时' : '-' }}
              </el-descriptions-item>
              <el-descriptions-item label="查询时间">{{ new Date().toLocaleString() }}</el-descriptions-item>
            </el-descriptions>

            <div class="sections-container">
              <div v-for="section in sections" :key="section.key" class="stats-section">
                <el-divider content-position="left">{{ section.title }}</el-divider>
                <div class="section-content">
                  <div class="table-wrapper">
                    <el-table :data="section.data" border size="small">
                      <el-table-column :prop="section.labelProp" :label="section.labelName" width="150">
                        <template #default="{ row }">
                          <el-tag v-if="section.key === 'status'" :type="statusType(row[section.labelProp])">
                            {{ statusLabel(row[section.labelProp]) }}
                          </el-tag>
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

        <!-- 工单列表视图 -->
        <div v-if="viewMode === 'list'" v-loading="listLoading">
          <el-table :data="workOrders" border>
            <el-table-column prop="code" label="工单编号" width="150" />
            <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="优先级" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.priority === 'high'" type="danger">高</el-tag>
                <el-tag v-else-if="row.priority === 'medium'" type="warning">中</el-tag>
                <el-tag v-else type="info">低</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="处理耗时" width="150">
              <template #default="{ row }">{{ formatDuration(row) }}</template>
            </el-table-column>
            <el-table-column label="创建时间" width="180">
              <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="primary" link @click="showDetail(row)">查看详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @current-change="fetchWorkOrders"
            @size-change="fetchWorkOrders"
            style="margin-top:20px; justify-content:center"
          />
        </div>

        <!-- 看板视图 -->
        <div v-if="viewMode === 'board'" v-loading="listLoading">
          <div class="board-container">
            <div v-for="column in boardColumns" :key="column.status" class="board-column">
              <div class="board-column-header">
                <el-tag :type="statusType(column.status)" effect="plain">{{ statusLabel(column.status) }}</el-tag>
                <span class="board-count">{{ column.items.length }}</span>
              </div>
              <div class="board-cards">
                <div v-for="item in column.items" :key="item.id" class="board-card" @click="showDetail(item)">
                  <div class="board-card-title">{{ item.title }}</div>
                  <div class="board-card-meta">
                    <span>{{ item.code }}</span>
                    <el-tag :type="priorityType(item.priority)" size="small">{{ priorityLabel(item.priority) }}</el-tag>
                  </div>
                  <div class="board-card-sub">{{ item.type_name || '-' }} · 设备{{ item.device_id || '-' }}</div>
                  <div v-if="item.business_no" class="board-card-business">
                    业务单号：{{ item.business_no }}
                  </div>
                  <div v-if="item.other_codes" class="board-card-codes" :title="item.other_codes">
                    编码：{{ item.other_codes }}
                  </div>
                  <div class="board-card-duration">
                    耗时：{{ formatDuration(item) }}
                  </div>
                  <div v-if="item.tags && item.tags.length" class="board-card-tags">
                    <el-tag
                      v-for="tag in item.tags"
                      :key="tag.code"
                      size="small"
                    >{{ tag.name || tag.code }}</el-tag>
                  </div>
                </div>
                <div v-if="!column.items.length" class="board-empty">暂无工单</div>
              </div>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 工单详情对话框 -->
    <el-dialog v-model="detailDialogVisible" :title="`工单详情 - ${currentWorkOrder?.code}`" width="900px">
      <div v-if="currentWorkOrder" v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="工单编号">{{ currentWorkOrder.code }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(currentWorkOrder.status)">{{ statusLabel(currentWorkOrder.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">{{ currentWorkOrder.title }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ currentWorkOrder.type_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="优先级">
            <el-tag v-if="currentWorkOrder.priority === 'high'" type="danger">高</el-tag>
            <el-tag v-else-if="currentWorkOrder.priority === 'medium'" type="warning">中</el-tag>
            <el-tag v-else type="info">低</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="业务单号">
            <template v-if="currentWorkOrder.business_no">
              <span>{{ currentWorkOrder.business_no }}</span>
              <el-popover placement="top" :width="180" trigger="hover" @show="renderCodeQr(currentWorkOrder.business_no)">
                <template #reference>
                  <el-icon style="margin-left:6px; cursor:pointer; color:#409eff"><Grid /></el-icon>
                </template>
                <div class="qr-pop">
                  <img v-if="qrCache[currentWorkOrder.business_no]" :src="qrCache[currentWorkOrder.business_no]" :alt="currentWorkOrder.business_no" class="qr-img" />
                  <div class="qr-text">{{ currentWorkOrder.business_no }}</div>
                </div>
              </el-popover>
            </template>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="其他编码" :span="2">
            <template v-if="currentWorkOrder.other_codes">
              <span v-for="(code, idx) in currentWorkOrder.other_codes.split(',').map(s => s.trim()).filter(Boolean)" :key="idx" class="code-chip">
                <el-tag size="small">{{ code }}</el-tag>
                <el-popover placement="top" :width="180" trigger="hover" @show="renderCodeQr(code)">
                  <template #reference>
                    <el-icon style="margin-left:4px; cursor:pointer; color:#409eff"><Grid /></el-icon>
                  </template>
                  <div class="qr-pop">
                    <img v-if="qrCache[code]" :src="qrCache[code]" :alt="code" class="qr-img" />
                    <div class="qr-text">{{ code }}</div>
                  </div>
                </el-popover>
              </span>
            </template>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ new Date(currentWorkOrder.created_at).toLocaleString() }}
          </el-descriptions-item>
          <el-descriptions-item label="更新时间">
            {{ new Date(currentWorkOrder.updated_at).toLocaleString() }}
          </el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">
            <div style="white-space: pre-wrap">{{ currentWorkOrder.description || '-' }}</div>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="currentWorkOrder.tags && currentWorkOrder.tags.length > 0" style="margin-top:16px">
          <div style="font-weight:600; margin-bottom:8px">标签：</div>
          <el-tag v-for="tag in currentWorkOrder.tags" :key="tag.code" style="margin-right:8px">
            {{ tag.name || tag.code || tag }}
          </el-tag>
        </div>

        <!-- 工单进展 -->
        <div v-if="progressList.length > 0" style="margin-top:24px">
          <el-divider content-position="left"><b>工单进展（{{ progressList.length }}）</b></el-divider>
          <div class="progress-list">
            <div v-for="p in progressList" :key="p.id" class="progress-item">
              <div class="progress-head">
                <span class="progress-creator">{{ p.creator_name || '系统' }}</span>
                <span class="progress-time">{{ new Date(p.created_at).toLocaleString() }}</span>
              </div>
              <div class="progress-content">{{ p.content }}</div>
              <div v-if="p.attachments && p.attachments.length" class="progress-attachments">
                <div v-for="att in p.attachments" :key="att.id" class="progress-att-item">
                  <el-tag size="small" style="margin-right:6px">{{ progressAttKindLabel(att.kind) }}</el-tag>
                  <span class="att-name">{{ att.file_name }}</span>
                  <el-link :href="progressAttDownloadUrl(att.id)" target="_blank" type="primary" size="small">下载</el-link>
                  <img
                    v-if="att.kind === 'photo'"
                    :src="progressAttDownloadUrl(att.id)"
                    class="progress-att-img"
                    @click="openProgressAttachment(att.id)"
                  />
                  <video v-else-if="att.kind === 'video' || att.kind === 'screen_record'" :src="progressAttDownloadUrl(att.id)" controls class="progress-att-video" />
                  <audio v-else-if="att.kind === 'voice' || att.kind === 'audio'" :src="progressAttDownloadUrl(att.id)" controls class="progress-att-audio" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <el-alert type="info" :closable="false" style="margin-top:16px">
          <template #title>
            <div style="display:flex; align-items:center; gap:8px">
              <el-icon><Lock /></el-icon>
              <span>此为只读分享页面，不支持编辑操作</span>
            </div>
          </template>
        </el-alert>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, Grid } from '@element-plus/icons-vue'
import { getWorkOrderReportShare, getSharedWorkOrders, getSharedWorkOrderStatistics, getSharedWorkOrderProgress } from '@/api/workOrder'
import { statusLabel, statusType, priorityLabel, priorityType } from '@/views/work-orders/workOrderConst'
import { createWorkOrdersStomp } from '@/utils/workOrdersStomp'
import QRCode from 'qrcode'
import * as echarts from 'echarts'

const route = useRoute()
const token = route.params.token

const loading = ref(true)
const error = ref('')
const shareInfo = ref(null)
const viewMode = ref('statistics')

const statsLoading = ref(false)
const stats = ref(null)
const chartRefs = ref({})
const chartInstances = ref({})

const listLoading = ref(false)
const workOrders = ref([])
const pagination = ref({
  page: 1,
  pageSize: 20,
  total: 0
})

const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const currentWorkOrder = ref(null)
const progressList = ref([])
const qrCache = ref({})

const sections = ref([
  { key: 'status', title: '按状态统计', data: [], labelProp: 'status', labelName: '状态' },
  { key: 'type', title: '按类型统计', data: [], labelProp: 'type_code', labelName: '类型' },
  { key: 'priority', title: '按优先级统计', data: [], labelProp: 'priority', labelName: '优先级' },
  { key: 'tag', title: '按标签统计', data: [], labelProp: 'tag_name', labelName: '标签' }
])

const boardColumns = computed(() => {
  // 分享看板只显示：待处理(open)、处理中(in_progress)、已解决(resolved)、已关闭(closed)
  const statusList = ['open', 'in_progress', 'resolved', 'closed']
  return statusList.map(status => ({
    status,
    items: workOrders.value.filter(wo => wo.status === status)
  }))
})

const formatDuration = (row) => {
  if (!row.created_at) return '-'
  const endTime = row.status === 'closed' || row.status === 'resolved' ? new Date(row.closed_at || row.updated_at) : new Date()
  const startTime = new Date(row.created_at)
  const diffMs = endTime - startTime
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)
  const remainHours = diffHours % 24

  if (diffDays > 0) {
    return remainHours > 0 ? `${diffDays}天${remainHours}小时` : `${diffDays}天`
  }
  return `${diffHours}小时`
}

const fetchShareInfo = async () => {
  try {
    const res = await getWorkOrderReportShare(token)
    shareInfo.value = res
  } catch (e) {
    error.value = e.message || '分享链接无效或已过期'
    throw e
  }
}

const fetchStatistics = async () => {
  statsLoading.value = true
  try {
    const res = await getSharedWorkOrderStatistics(token)
    stats.value = res
    sections.value[0].data = res.by_status || []
    sections.value[1].data = res.by_type || []
    sections.value[2].data = res.by_priority || []
    sections.value[3].data = res.by_tag || []
    nextTick(() => renderCharts())
  } catch (e) {
    ElMessage.error(e.message || '获取统计数据失败')
  } finally {
    statsLoading.value = false
  }
}

const fetchWorkOrders = async () => {
  listLoading.value = true
  try {
    const res = await getSharedWorkOrders(token, {
      page: pagination.value.page,
      page_size: pagination.value.pageSize
    })
    workOrders.value = res.data || []
    pagination.value.total = res.total || 0
  } catch (e) {
    ElMessage.error(e.message || '获取工单列表失败')
  } finally {
    listLoading.value = false
  }
}

const showDetail = async (workOrder) => {
  currentWorkOrder.value = workOrder
  detailDialogVisible.value = true
  progressList.value = []

  // 加载工单进展
  try {
    detailLoading.value = true
    const res = await getSharedWorkOrderProgress(token, workOrder.id)
    progressList.value = res.data || []
  } catch (e) {
    console.error('加载进展失败:', e)
    ElMessage.error('加载进展失败：' + (e.message || '未知错误'))
  } finally {
    detailLoading.value = false
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

// 监听视图模式切换，重新渲染图表和刷新数据
watch(viewMode, (newMode, oldMode) => {
  if (newMode === 'statistics') {
    // 切换到统计视图时，刷新统计数据
    fetchStatistics()
  } else if (newMode === 'list' || newMode === 'board') {
    // 切换到列表或看板视图时，刷新工单列表
    if (oldMode === 'statistics') {
      // 从统计页切换过来，重置分页并刷新
      pagination.value.page = 1
    }
    fetchWorkOrders()
  }
})

// STOMP实时更新 - 使用分享token而不是用户token
const woStomp = createWorkOrdersStomp(onWorkOrderEvent, () => token, { share: true })

function onWorkOrderEvent(payload) {
  if (!payload || !payload.id) return

  console.log('[WorkOrderReportShare] STOMP event:', payload)

  // 查找工单在列表中的位置
  const index = workOrders.value.findIndex(wo => wo.id === payload.id)

  if (index !== -1) {
    // 更新现有工单
    const updated = {
      ...workOrders.value[index],
      ...payload,
      // 保持tags格式
      tags: payload.tags || workOrders.value[index].tags
    }
    workOrders.value[index] = updated
  } else if (payload.event === 'work_order.created') {
    // 新工单创建，重新获取列表
    fetchWorkOrders()
  }

  // 强制更新以触发响应式
  workOrders.value = [...workOrders.value]
}

// 进展附件下载链接
const progressAttDownloadUrl = (attId) => {
  const token = localStorage.getItem('token') || ''
  return `/api/work-orders/progress/attachments/${attId}/download?token=${encodeURIComponent(token)}`
}

// 进展附件类型标签
const progressAttKindLabel = (kind) => {
  const labels = { photo: '图片', video: '视频', audio: '音频', screen_record: '录屏', voice: '录音', logcat: '日志' }
  return labels[kind] || kind
}

// 打开进展附件（图片）
const openProgressAttachment = (attId) => {
  window.open(progressAttDownloadUrl(attId), '_blank')
}

// 生成二维码（鼠标悬停时按需生成）
const renderCodeQr = async (code) => {
  if (qrCache.value[code]) return
  try {
    qrCache.value = { ...qrCache.value, [code]: await QRCode.toDataURL(code, { width: 160, margin: 1 }) }
  } catch (e) {
    console.error('二维码生成失败:', e)
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await fetchShareInfo()
    await fetchStatistics()
    await fetchWorkOrders()

    // 连接STOMP
    woStomp.connect()
  } catch (e) {
    // error already set
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  // 断开STOMP连接
  woStomp.disconnect()
})
</script>

<style scoped>
.share-page {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 20px;
}

.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.share-content {
  max-width: 1400px;
  margin: 0 auto;
}

.stats-content {
  padding: 20px 0;
}

.sections-container {
  margin-top: 20px;
}

.stats-section {
  margin-bottom: 30px;
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

.board-container {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 16px 0;
  min-height: 400px;
}

.board-column {
  flex: 0 0 300px;
  background: #f5f7fa;
  border-radius: 8px;
  padding: 12px;
}

.board-column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
}

.board-count {
  background: #fff;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  color: #909399;
}

.board-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100px;
}

.board-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.board-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  transform: translateY(-2px);
}

.board-card-title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 8px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
}

.board-card-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
  color: #909399;
}

.board-card-sub {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.board-card-business {
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
  padding: 4px 8px;
  background: #f0f9ff;
  border-radius: 4px;
}

.board-card-codes {
  font-size: 12px;
  color: #606266;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-card-duration {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.board-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.board-empty {
  text-align: center;
  padding: 40px 20px;
  color: #909399;
  font-size: 13px;
}

/* 工单进展样式 */
.progress-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-item {
  padding: 12px;
  background: #f9fafb;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.progress-creator {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
}

.progress-time {
  font-size: 12px;
  color: #909399;
}

.progress-content {
  font-size: 14px;
  color: #606266;
  white-space: pre-wrap;
  margin-bottom: 8px;
}

.progress-attachments {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.progress-att-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
  border: 1px solid #e4e7ed;
}

.att-name {
  font-size: 13px;
  color: #606266;
  flex: 1;
  min-width: 120px;
}

.progress-att-img {
  width: 100%;
  max-width: 320px;
  margin-top: 6px;
  border-radius: 4px;
  cursor: zoom-in;
}

.progress-att-video {
  width: 100%;
  max-width: 400px;
  margin-top: 6px;
  border-radius: 4px;
}

.progress-att-audio {
  width: 100%;
  max-width: 300px;
  margin-top: 6px;
}

/* 编码二维码 */
.code-chip {
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
}

.qr-pop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.qr-img {
  width: 160px;
  height: 160px;
}

.qr-text {
  font-size: 12px;
  color: #606266;
  word-break: break-all;
  text-align: center;
}
</style>
