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
          <div class="card-header">
            <div class="card-header-title">
              <h2 style="margin:0">{{ shareInfo.title }}</h2>
              <div style="color:#909399; font-size:13px; margin-top:8px">
                分享时间：{{ new Date(shareInfo.created_at).toLocaleString() }} |
                过期时间：{{ new Date(shareInfo.expires_at).toLocaleString() }}
              </div>
            </div>
            <div class="card-header-actions">
              <div v-if="currentUser" class="current-user">
                <el-icon><User /></el-icon>
                <span>{{ currentUser.username }}</span>
                <el-tag v-if="currentUser.role" size="small" type="info">{{ roleLabel(currentUser.role) }}</el-tag>
              </div>
              <el-radio-group v-model="viewMode" size="default" class="view-mode-group">
                <el-radio-button value="statistics">统计</el-radio-button>
                <el-radio-button value="list">列表</el-radio-button>
                <el-radio-button value="board">看板</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </template>

        <!-- 统计报告视图 -->
        <div v-if="viewMode === 'statistics'" v-loading="statsLoading">
          <div v-if="stats" class="stats-content">
            <el-descriptions :column="isMobile ? 1 : 3" border>
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
                          <span v-else-if="section.key === 'item_kind'">{{ itemKindLabel(row[section.labelProp]) }}</span>
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
          <div style="display:flex; justify-content:flex-end; margin-bottom:12px">
            <el-button type="success" @click="exportSharedWorkOrders(token)">导出 Excel</el-button>
          </div>
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
    <el-dialog v-model="detailDialogVisible" :title="`工单详情 - ${currentWorkOrder?.code}`" :width="isMobile ? '95%' : '900px'">
      <div v-if="currentWorkOrder" v-loading="detailLoading">
        <el-descriptions :column="isMobile ? 1 : 2" border>
          <el-descriptions-item label="工单编号">{{ currentWorkOrder.code }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(currentWorkOrder.status)">{{ statusLabel(currentWorkOrder.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="标题" :span="isMobile ? 1 : 2">{{ currentWorkOrder.title }}</el-descriptions-item>
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
          <el-descriptions-item label="其他编码" :span="isMobile ? 1 : 2">
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
          <el-descriptions-item label="描述" :span="isMobile ? 1 : 2">
            <div style="white-space: pre-wrap">{{ currentWorkOrder.description || '-' }}</div>
          </el-descriptions-item>
        </el-descriptions>

        <div v-if="currentWorkOrder.tags && currentWorkOrder.tags.length > 0" style="margin-top:16px">
          <div style="font-weight:600; margin-bottom:8px">标签：</div>
          <el-tag v-for="tag in currentWorkOrder.tags" :key="tag.code" style="margin-right:8px">
            {{ tag.name || tag.code || tag }}
          </el-tag>
        </div>

        <!-- 工单附件 -->
        <div v-if="currentWorkOrder.items && currentWorkOrder.items.length > 0" style="margin-top:24px">
          <el-divider content-position="left"><b>附件 / 采集产物（{{ currentWorkOrder.items.length }}）</b></el-divider>
          <div class="items-list">
            <div v-for="item in currentWorkOrder.items" :key="item.id" class="item-card">
              <div class="item-header">
                <el-tag size="small">{{ itemKindLabel(item.kind) }}</el-tag>
                <span class="item-name">{{ item.file_name }}</span>
                <el-link :href="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" target="_blank" type="primary" size="small">下载</el-link>
              </div>
              <img
                v-if="item.kind === 'photo'"
                :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)"
                class="item-img"
                @click="openItemImage(currentWorkOrder.id, item.id)"
              />
              <video v-else-if="item.kind === 'video' || item.kind === 'screen_record'" :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" controls class="item-video" />
              <audio v-else-if="item.kind === 'voice'" :src="workOrderItemDownloadUrl(currentWorkOrder.id, item.id)" controls class="item-audio" />
            </div>
          </div>
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

        <el-alert
          v-if="!shareInfo.is_authenticated || !hasAnyEditPermission"
          type="info"
          :closable="false"
          style="margin-top:16px"
        >
          <template #title>
            <div style="display:flex; align-items:center; gap:8px">
              <el-icon><Lock /></el-icon>
              <span v-if="!shareInfo.is_authenticated">{{ shareInfo.auth_mode === 'login' ? '请登录后查看更多操作权限' : '此为只读分享页面，不支持编辑操作' }}</span>
              <span v-else>此分享链接为只读权限</span>
            </div>
          </template>
        </el-alert>
      </div>
      <template #footer>
        <div style="display:flex; justify-content:space-between; width:100%">
          <div>
            <el-button v-if="canComment" type="primary" @click="showCommentDialog">添加评论</el-button>
            <el-button v-if="canUpdateStatus" @click="showStatusDialog">更新状态</el-button>
            <el-button v-if="canEdit" @click="showEditDialog">编辑工单</el-button>
          </div>
          <el-button @click="detailDialogVisible = false">关闭</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 添加评论对话框 -->
    <el-dialog v-model="commentDialogVisible" title="添加评论" width="600px">
      <el-input
        v-model="commentContent"
        type="textarea"
        :rows="5"
        placeholder="请输入评论内容"
        maxlength="1000"
        show-word-limit
      />
      <template #footer>
        <el-button @click="commentDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitComment" :loading="commentSubmitting">提交</el-button>
      </template>
    </el-dialog>

    <!-- 更新状态对话框 -->
    <el-dialog v-model="statusDialogVisible" title="更新工单状态" width="600px">
      <el-form label-width="100px">
        <el-form-item label="当前状态">
          <el-tag :type="statusType(currentWorkOrder?.status)">{{ statusLabel(currentWorkOrder?.status) }}</el-tag>
        </el-form-item>
        <el-form-item label="新状态">
          <el-select v-model="newStatus" placeholder="请选择新状态">
            <el-option label="待处理" value="open" />
            <el-option label="处理中" value="in_progress" />
            <el-option label="已解决" value="resolved" />
            <el-option label="已关闭" value="closed" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签">
          <el-select v-model="selectedTags" multiple placeholder="请选择标签" style="width:100%">
            <el-option
              v-for="tag in availableTags"
              :key="tag.code"
              :label="tag.name"
              :value="tag.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="statusComment"
            type="textarea"
            :rows="3"
            placeholder="可选：状态变更说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="statusDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitStatusUpdate" :loading="statusSubmitting">提交</el-button>
      </template>
    </el-dialog>

    <!-- 编辑工单对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑工单" width="600px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="5" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="editForm.priority">
            <el-option label="低" value="normal" />
            <el-option label="中" value="medium" />
            <el-option label="高" value="high" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEdit" :loading="editSubmitting">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, Grid, User } from '@element-plus/icons-vue'
import { getWorkOrderReportShare, getSharedWorkOrders, getSharedWorkOrderStatistics, getSharedWorkOrderProgress, addSharedWorkOrderComment, updateSharedWorkOrderStatus, updateSharedWorkOrderFields, exportSharedWorkOrders, getWorkOrderTagDict } from '@/api/workOrder'
import { statusLabel, statusType, priorityLabel, priorityType } from '@/views/work-orders/workOrderConst'
import { createWorkOrdersStomp } from '@/utils/workOrdersStomp'
import { useAuthStore } from '@/stores/auth'
import QRCode from 'qrcode'
import * as echarts from 'echarts'

const route = useRoute()
const router = useRouter()
const token = route.params.token
const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)

const isMobile = ref(window.innerWidth < 768)
const onResize = () => { isMobile.value = window.innerWidth < 768 }

const loading = ref(true)
const error = ref('')
const shareInfo = ref(null)
// 从 URL 参数初始化视图模式，默认为 statistics
const viewMode = ref(route.query.view || 'statistics')

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

// 评论对话框
const commentDialogVisible = ref(false)
const commentContent = ref('')
const commentSubmitting = ref(false)

// 状态更新对话框
const statusDialogVisible = ref(false)
const newStatus = ref('')
const statusComment = ref('')
const statusSubmitting = ref(false)
const selectedTags = ref([])
const availableTags = ref([])

// 编辑对话框
const editDialogVisible = ref(false)
const editForm = ref({
  title: '',
  description: '',
  priority: 'normal'
})
const editSubmitting = ref(false)

const sections = ref([
  { key: 'status', title: '按状态统计', data: [], labelProp: 'status', labelName: '状态' },
  { key: 'type', title: '按类型统计', data: [], labelProp: 'type_code', labelName: '类型' },
  { key: 'priority', title: '按优先级统计', data: [], labelProp: 'priority', labelName: '优先级' },
  { key: 'tag', title: '按标签统计', data: [], labelProp: 'tag_name', labelName: '标签' },
  { key: 'item_kind', title: '按附件类型统计', data: [], labelProp: 'kind', labelName: '附件类型' }
])

const boardColumns = computed(() => {
  // 分享看板只显示：待处理(open)、处理中(in_progress)、已解决(resolved)、已关闭(closed)
  const statusList = ['open', 'in_progress', 'resolved', 'closed']
  return statusList.map(status => ({
    status,
    items: workOrders.value.filter(wo => wo.status === status)
  }))
})

// 权限计算
const hasAnyEditPermission = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  const perms = shareInfo.value.permissions || {}
  return perms.can_comment || perms.can_update_status || perms.can_edit
})

const canComment = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_comment === true
})

const canUpdateStatus = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_update_status === true
})

const canEdit = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_edit === true
})


const formatDuration = (row) => {
  if (!row.created_at) return '-'
  const settled = row.settled_at || row.closed_at
  const endTime = settled ? new Date(settled) : new Date()
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
    shareInfo.value = res.data || res  // 提取 data 字段，如果没有则使用整个响应
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
    sections.value[4].data = res.by_item_kind || []
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

// 显示评论对话框
const showCommentDialog = () => {
  commentContent.value = ''
  commentDialogVisible.value = true
}

// 提交评论
const submitComment = async () => {
  if (!commentContent.value.trim()) {
    ElMessage.warning('请输入评论内容')
    return
  }

  commentSubmitting.value = true
  try {
    await addSharedWorkOrderComment(token, currentWorkOrder.value.id, commentContent.value)
    ElMessage.success('评论添加成功')
    commentDialogVisible.value = false
    // 重新加载进展列表
    const res = await getSharedWorkOrderProgress(token, currentWorkOrder.value.id)
    progressList.value = res.data || []
  } catch (e) {
    ElMessage.error('添加评论失败：' + (e.message || '未知错误'))
  } finally {
    commentSubmitting.value = false
  }
}

// 显示状态更新对话框
const showStatusDialog = () => {
  newStatus.value = currentWorkOrder.value.status
  statusComment.value = ''
  // 初始化标签为当前工单的标签
  selectedTags.value = (currentWorkOrder.value.tags || []).map(t => t.code || t)
  statusDialogVisible.value = true
}

// 提交状态更新
const submitStatusUpdate = async () => {
  if (!newStatus.value) {
    ElMessage.warning('请选择新状态')
    return
  }

  if (newStatus.value === currentWorkOrder.value.status) {
    ElMessage.warning('新状态与当前状态相同')
    return
  }

  statusSubmitting.value = true
  try {
    await updateSharedWorkOrderStatus(token, currentWorkOrder.value.id, newStatus.value, statusComment.value, selectedTags.value)
    ElMessage.success('状态更新成功')
    statusDialogVisible.value = false
    // 更新当前工单状态和标签
    currentWorkOrder.value.status = newStatus.value
    currentWorkOrder.value.tags = selectedTags.value.map(code => {
      const tag = availableTags.value.find(t => t.code === code)
      return tag ? { code: tag.code, name: tag.name } : { code }
    })
    // 重新加载进展列表
    const res = await getSharedWorkOrderProgress(token, currentWorkOrder.value.id)
    progressList.value = res.data || []
    // 刷新工单列表
    if (viewMode.value === 'list' || viewMode.value === 'board') {
      fetchWorkOrders()
    }
  } catch (e) {
    ElMessage.error('更新状态失败：' + (e.message || '未知错误'))
  } finally {
    statusSubmitting.value = false
  }
}

// 显示编辑对话框
const showEditDialog = () => {
  editForm.value = {
    title: currentWorkOrder.value.title,
    description: currentWorkOrder.value.description || '',
    priority: currentWorkOrder.value.priority
  }
  editDialogVisible.value = true
}

// 提交编辑
const submitEdit = async () => {
  if (!editForm.value.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }

  editSubmitting.value = true
  try {
    await updateSharedWorkOrderFields(token, currentWorkOrder.value.id, editForm.value)
    ElMessage.success('工单更新成功')
    editDialogVisible.value = false
    // 更新当前工单
    Object.assign(currentWorkOrder.value, editForm.value)
    // 刷新工单列表
    if (viewMode.value === 'list' || viewMode.value === 'board') {
      fetchWorkOrders()
    }
  } catch (e) {
    ElMessage.error('更新工单失败：' + (e.message || '未知错误'))
  } finally {
    editSubmitting.value = false
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
        } else if (section.key === 'item_kind') {
          name = itemKindLabel(name)
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

// 监听视图模式切换，重新渲染图表和刷新数据，并同步 URL 参数
watch(viewMode, (newMode, oldMode) => {
  // 同步 URL 参数
  router.replace({
    query: {
      ...route.query,
      view: newMode
    }
  })

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

// 角色标签
const roleLabel = (role) => {
  const labels = { admin: '管理员', operator: '操作员', viewer: '查看者' }
  return labels[role] || role
}

// 工单附件类型标签
const itemKindLabel = (kind) => {
  const labels = { text: '文字', photo: '照片', video: '视频', voice: '语音', screen_record: '录屏', logcat: '日志', resource: '资源' }
  return labels[kind] || kind
}

// 工单附件下载链接
const workOrderItemDownloadUrl = (workOrderId, itemId) => {
  const token = localStorage.getItem('token') || ''
  return `/api/work-orders/${workOrderId}/items/${itemId}/download?token=${encodeURIComponent(token)}`
}

// 打开工单附件图片
const openItemImage = (workOrderId, itemId) => {
  window.open(workOrderItemDownloadUrl(workOrderId, itemId), '_blank')
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
    // 加载标签字典
    try {
      const tagsRes = await getWorkOrderTagDict()
      availableTags.value = tagsRes.data || []
    } catch (e) {
      console.error('加载标签字典失败:', e)
    }
    await fetchStatistics()
    await fetchWorkOrders()

    // 连接STOMP
    woStomp.connect()
  } catch (e) {
    // error already set
  } finally {
    loading.value = false
  }

  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  woStomp.disconnect()
  window.removeEventListener('resize', onResize)
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

/* 工单附件样式 */
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.item-card {
  padding: 12px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.item-name {
  font-size: 13px;
  color: #606266;
  flex: 1;
}

.item-img {
  width: 100%;
  max-width: 480px;
  border-radius: 4px;
  cursor: zoom-in;
}

.item-video {
  width: 100%;
  max-width: 480px;
  border-radius: 4px;
}

.item-audio {
  width: 100%;
  max-width: 300px;
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

/* 卡片头部布局 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.card-header-title {
  flex: 1;
  min-width: 0;
}

.card-header-title h2 {
  font-size: 18px;
  word-break: break-word;
}

.card-header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.current-user {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  padding: 6px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.current-user .el-icon {
  font-size: 16px;
  color: #909399;
}

.current-user span {
  font-weight: 500;
}

/* 手机端适配 */
@media (max-width: 767px) {
  .share-page {
    padding: 8px;
  }

  .card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .card-header-title h2 {
    font-size: 15px;
  }

  .card-header-title div {
    font-size: 11px !important;
  }

  .card-header-actions {
    align-items: stretch;
  }

  .current-user {
    justify-content: center;
  }

  .view-mode-group {
    align-self: flex-start;
  }

  .stats-content {
    padding: 12px 0;
  }

  .section-content {
    flex-direction: column;
  }

  .table-wrapper {
    min-width: 0;
    width: 100%;
    overflow-x: auto;
  }

  .chart-wrapper {
    min-width: 0;
    width: 100%;
  }

  .pie-chart {
    height: 240px;
  }

  .board-column {
    flex: 0 0 85vw;
  }

  .progress-att-img {
    max-width: 100%;
  }

  .progress-att-video {
    max-width: 100%;
  }

  .progress-att-audio {
    max-width: 100%;
  }

  .item-img {
    max-width: 100%;
  }

  .item-video {
    max-width: 100%;
  }

  .item-audio {
    max-width: 100%;
  }
}
</style>
