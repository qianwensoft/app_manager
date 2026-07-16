<template>
  <div v-loading="loading">
    <el-page-header v-if="!isEmbed" :content="wo.code || '工单详情'" @back="goBack" style="margin-bottom:16px" />
    <div v-else style="margin-bottom:16px;font-size:16px;font-weight:600;color:#303133">{{ wo.code ? `${wo.code} · ${wo.title}` : (wo.title || '工单详情') }}</div>

    <el-row :gutter="16">
      <el-col :xs="24" :sm="24" :md="16" :lg="16" :xl="16">
        <el-card shadow="never" style="margin-bottom:16px">
          <template #header>
            <div class="card-head">
              <b>{{ wo.title }}</b>
              <el-button v-if="!readonly" text type="primary" size="small" @click="openEdit">编辑</el-button>
            </div>
          </template>
          <el-descriptions :column="isMobile ? 1 : 2" border>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType(wo.status)">{{ statusLabel(wo.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="优先级">
              <el-select
                :model-value="wo.priority"
                size="small"
                style="width: 100px"
                :disabled="readonly"
                @change="changePriority"
              >
                <el-option label="普通" value="normal" />
                <el-option label="较高" value="high" />
                <el-option label="紧急" value="urgent" />
              </el-select>
            </el-descriptions-item>
            <el-descriptions-item label="类型">{{ types.find(t => t.code === wo.type_code)?.name || wo.type_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="设备">{{ wo.device_id || '-' }}</el-descriptions-item>
            <el-descriptions-item label="业务单号" :span="isMobile ? 1 : 2">
              <div v-if="!editBusinessNo" class="business-no-view">
                <template v-if="wo.business_no">
                  <span>{{ wo.business_no }}</span>
                  <el-popover placement="top" :width="180" trigger="click" @show="renderCodeQr(wo.business_no)">
                    <template #reference>
                      <el-button text size="small" title="生成二维码" style="padding:2px 4px;margin-left:8px">
                        <el-icon><Grid /></el-icon>
                      </el-button>
                    </template>
                    <div class="qr-pop">
                      <img v-if="qrCache[wo.business_no]" :src="qrCache[wo.business_no]" :alt="wo.business_no" class="qr-img" />
                      <div class="qr-text">{{ wo.business_no }}</div>
                    </div>
                  </el-popover>
                </template>
                <span v-else>-</span>
                <el-button v-if="!readonly" text type="primary" size="small" @click="startEditBusinessNo">编辑</el-button>
              </div>
              <div v-else class="business-no-edit">
                <el-input v-model="businessNoDraft" placeholder="请输入业务单号" style="max-width:300px" />
                <div style="margin-top:6px">
                  <el-button type="primary" size="small" @click="saveBusinessNo">保存</el-button>
                  <el-button size="small" @click="editBusinessNo = false">取消</el-button>
                </div>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="公开">
              <el-switch
                :model-value="wo.visibility === 'public'"
                active-text="公开" inactive-text="私有"
                :disabled="readonly"
                @change="toggleVisibility"
              />
            </el-descriptions-item>
            <el-descriptions-item label="外部单号">{{ wo.external_ref || '-' }}</el-descriptions-item>
            <el-descriptions-item label="其他编码" :span="isMobile ? 1 : 2">
              <div v-if="!editCodes" class="codes-view">
                <template v-if="otherCodesList.length">
                  <span v-for="(c, i) in otherCodesList" :key="i" class="code-chip">
                    <el-tag size="small">{{ c }}</el-tag>
                    <el-popover placement="top" :width="180" trigger="click" @show="renderCodeQr(c)">
                      <template #reference>
                        <el-button text size="small" title="生成二维码" style="padding:2px 4px">
                          <el-icon><Grid /></el-icon>
                        </el-button>
                      </template>
                      <div class="qr-pop">
                        <img v-if="qrCache[c]" :src="qrCache[c]" :alt="c" class="qr-img" />
                        <div class="qr-text">{{ c }}</div>
                      </div>
                    </el-popover>
                  </span>
                </template>
                <span v-else>-</span>
                <el-button v-if="!readonly" text type="primary" size="small" @click="startEditCodes">编辑</el-button>
              </div>
              <div v-else class="codes-edit">
                <el-input v-model="codesDraft" type="textarea" :rows="2" placeholder="多个编码用逗号分隔" />
                <div style="margin-top:6px">
                  <el-button type="primary" size="small" @click="saveCodes">保存</el-button>
                  <el-button size="small" @click="editCodes = false">取消</el-button>
                </div>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="描述" :span="isMobile ? 1 : 2">
              <span style="white-space:pre-wrap">{{ wo.description || '-' }}</span>
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="formAppCode" style="margin-top:16px">
            <div class="section-title">类型化字段</div>
            <iframe :src="formIframeUrl" class="form-frame" />
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><b>附件 / 采集产物（{{ wo.items?.length || 0 }}）</b></template>
          <el-empty v-if="!wo.items?.length" description="无附件" />
          <div class="items">
            <div v-for="it in wo.items" :key="it.id" class="item">
              <div class="item-head">
                <el-tag size="small">{{ kindLabel(it.kind) }}</el-tag>
                <span class="item-name">{{ it.file_name }}</span>
                <span v-if="it.target_pkg" class="item-pkg">{{ it.target_pkg }}</span>
                <el-link :href="dlUrl(it.id)" target="_blank" type="primary" style="margin-left:auto">下载</el-link>
              </div>
              <img
                v-if="it.kind === 'photo'"
                :src="`${dlUrl(it.id)}&t=${imageRefreshKey}`"
                fit="contain"
                class="item-img"
                @click="openImagePreview(it.id)"
              />
              <div v-else-if="it.kind === 'video' || it.kind === 'screen_record'" class="media-block">
                <video :src="dlUrl(it.id)" controls class="item-video" />
                <el-button size="small" text type="primary" @click="openPreview(it)">放大预览</el-button>
              </div>
              <div v-else-if="it.kind === 'voice'" class="media-block">
                <audio :src="dlUrl(it.id)" controls />
              </div>
              <el-link v-else :href="dlUrl(it.id)" target="_blank" type="primary">下载查看</el-link>
            </div>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
        <el-card shadow="never" style="margin-bottom:16px">
          <template #header><b>提交信息</b></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="提交人">{{ wo.submitter || (wo.created_by ? `用户#${wo.created_by}` : '-') }}</el-descriptions-item>
            <el-descriptions-item label="设备">{{ wo.device_name_snap || wo.device_name || wo.device_id || '-' }}</el-descriptions-item>
            <el-descriptions-item label="设备别名(后台)">{{ wo.device_alias_server || '-' }}</el-descriptions-item>
            <el-descriptions-item label="设备别名(端)">{{ wo.device_alias_agent || '-' }}</el-descriptions-item>
            <el-descriptions-item label="设备分组">{{ wo.device_group || '-' }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ wo.created_at || '-' }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ wo.updated_at || '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never" style="margin-bottom:16px">
          <template #header>
            <div class="card-head">
              <b>标签</b>
              <el-button v-if="!readonly" text type="primary" size="small" @click="openTagEdit">编辑</el-button>
            </div>
          </template>
          <div class="tags-box">
            <el-tag
              v-for="code in (wo.tags || [])" :key="code"
              :color="tagColor(code)"
              :style="tagColor(code) ? 'color:#fff;border:none' : ''"
            >{{ tagName(code) }}</el-tag>
            <span v-if="!(wo.tags || []).length" class="tags-empty">暂无标签</span>
          </div>
        </el-card>

        <el-card v-if="!readonly" shadow="never" style="margin-bottom:16px">
          <template #header><b>处理操作</b></template>
          <div class="actions">
            <el-button :disabled="wo.status==='in_progress'" @click="setStatus('in_progress')">开始处理</el-button>
            <el-button type="success" :disabled="wo.status==='resolved'" @click="setStatus('resolved')">标记解决</el-button>
            <el-button type="info" :disabled="wo.status==='closed'" @click="setStatus('closed')">关闭工单</el-button>
            <el-button v-if="wo.status==='closed'" type="warning" @click="setStatus('reopened')">重新打开</el-button>
            <el-button @click="assignDialog = true">转交</el-button>
          </div>
        </el-card>

        <el-card shadow="never" style="margin-bottom:16px">
          <template #header>
            <div class="card-head">
              <b>工单进展（{{ progressList.length }}）</b>
              <el-button v-if="!readonly" text type="primary" size="small" @click="openProgressAdd">新增进展</el-button>
            </div>
          </template>
          <el-empty v-if="!progressList.length" description="暂无进展" />
          <div v-else class="progress-list">
            <div v-for="p in progressList" :key="p.id" class="progress-item">
              <div class="progress-head">
                <span class="progress-creator">{{ p.creator_name }}</span>
                <span class="progress-time">{{ p.created_at }}</span>
              </div>
              <div class="progress-content">{{ p.content }}</div>
              <div v-if="p.attachments?.length" class="progress-attachments">
                <div v-for="att in p.attachments" :key="att.id" class="progress-att-item">
                  <el-tag size="small" style="margin-right:6px">{{ progressAttKindLabel(att.kind) }}</el-tag>
                  <span class="att-name">{{ att.file_name }}</span>
                  <el-link :href="progressAttDownloadUrl(att.id)" target="_blank" type="primary" size="small">下载</el-link>
                  <img
                    v-if="att.kind === 'photo'"
                    :src="progressAttDownloadUrl(att.id)"
                    class="progress-att-img"
                    @click="openProgressImagePreview(att.id)"
                  />
                  <video v-else-if="att.kind === 'video' || att.kind === 'screen_record'" :src="progressAttDownloadUrl(att.id)" controls class="progress-att-video" />
                  <audio v-else-if="att.kind === 'voice' || att.kind === 'audio'" :src="progressAttDownloadUrl(att.id)" controls class="progress-att-audio" />
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <el-card shadow="never">
          <template #header><b>处理时间线</b></template>
          <el-timeline>
            <el-timeline-item
              v-for="a in wo.activities"
              :key="a.id"
              :timestamp="a.created_at"
              placement="top"
            >
              <b>{{ actionLabel(a.action) }}</b>
              <span v-if="a.from_status || a.to_status"> · {{ statusLabel(a.from_status) }} → {{ statusLabel(a.to_status) }}</span>
              <div class="tl-actor">{{ a.actor_label }}</div>
              <div v-if="a.detail" class="tl-detail">{{ a.detail }}</div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>

    <el-dialog v-model="editDialog" title="编辑工单" width="560px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="editForm.title" placeholder="请输入标题" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="editForm.description" type="textarea" :rows="4" placeholder="请输入描述" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="editForm.priority" placeholder="选择优先级">
            <el-option label="普通" value="normal" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="urgent" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" @click="saveEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="tagDialog" title="修改标签" width="460px">
      <el-select
        v-model="tagDraft" multiple filterable clearable
        placeholder="选择标签（可多选）" style="width:100%"
      >
        <el-option v-for="t in tagDict" :key="t.code" :label="t.name" :value="t.code">
          <span :style="t.color ? `display:inline-block;width:8px;height:8px;border-radius:50%;background:${t.color};margin-right:6px` : ''" />
          {{ t.name }}
        </el-option>
      </el-select>
      <template #footer>
        <el-button @click="tagDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTagEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assignDialog" title="转交工单" width="420px">
      <el-form label-width="80px">
        <el-form-item label="处理人ID"><el-input v-model.number="assignTo" type="number" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="assignComment" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignDialog = false">取消</el-button>
        <el-button type="primary" @click="doAssign">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="progressDialog" title="新增工单进展" width="560px">
      <el-form label-width="80px">
        <el-form-item label="进展内容" required>
          <el-input v-model="progressContent" type="textarea" :rows="4" placeholder="填写处理进展或补充说明" />
        </el-form-item>
        <el-form-item label="附件">
          <el-upload
            :file-list="progressFiles"
            :auto-upload="false"
            multiple
            :on-change="(file, fileList) => progressFiles = fileList"
            :on-remove="(file, fileList) => progressFiles = fileList"
          >
            <el-button size="small">选择文件</el-button>
            <template #tip>
              <div style="font-size:12px;color:#909399;margin-top:4px">支持图片、视频、音频</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="progressDialog = false">取消</el-button>
        <el-button type="primary" @click="saveProgress">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewDialog" :title="previewItem?.file_name || '预览'" width="70%" align-center destroy-on-close>
      <video v-if="previewItem && (previewItem.kind === 'video' || previewItem.kind === 'screen_record')"
        :src="dlUrl(previewItem.id)" controls autoplay style="width:100%;max-height:70vh" />
      <audio v-else-if="previewItem && previewItem.kind === 'voice'" :src="dlUrl(previewItem.id)" controls autoplay style="width:100%" />
    </el-dialog>

    <ImagePreviewWithRotate
      v-model="imagePreviewVisible"
      :image-list="imageList"
      :initial-index="imagePreviewIndex"
      @saved="handleImageSaved"
      @set-other-codes="handleSetOtherCodes"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Grid } from '@element-plus/icons-vue'
import QRCode from 'qrcode'
import {
  getWorkOrder, updateWorkOrder, assignWorkOrder, changeWorkOrderStatus,
  getWorkOrderTypes, workOrderItemDownloadUrl,
  getWorkOrderTagDict, setWorkOrderTags,
  getWorkOrderProgress, createWorkOrderProgress, uploadWorkOrderProgressAttachment, workOrderProgressAttachmentDownloadUrl
} from '@/api/workOrder'
import { statusLabel, statusType, priorityType, priorityLabel } from './workOrderConst'
import ImagePreviewWithRotate from '@/components/ImagePreviewWithRotate.vue'
import { createWorkOrdersStomp } from '@/utils/workOrdersStomp'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const isMobile = ref(window.innerWidth < 768)
const onResize = () => { isMobile.value = window.innerWidth < 768 }

const isEmbed = computed(() => !!route.meta.embed)
const readonly = computed(() => isEmbed.value && route.query.readonly === '1')

// 返回列表，如果有 from 参数则返回原页面（保持筛选状态），否则默认返回列表首页
const goBack = () => {
  const from = route.query.from
  if (from) {
    router.push(from)
  } else {
    router.push('/work-orders')
  }
}

const wo = ref({})
const types = ref([])
const loading = ref(false)
const assignDialog = ref(false)
const assignTo = ref(null)
const assignComment = ref('')
const previewDialog = ref(false)
const previewItem = ref(null)

// 编辑对话框
const editDialog = ref(false)
const editForm = ref({ title: '', description: '', priority: 'normal' })
const openEdit = () => {
  editForm.value = {
    title: wo.value.title || '',
    description: wo.value.description || '',
    priority: wo.value.priority || 'normal'
  }
  editDialog.value = true
}
const saveEdit = async () => {
  if (!editForm.value.title?.trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  await updateWorkOrder(id, {
    title: editForm.value.title,
    description: editForm.value.description,
    priority: editForm.value.priority
  })
  editDialog.value = false
  ElMessage.success('工单已更新')
  load()
}

// 其他编码
const editCodes = ref(false)
const codesDraft = ref('')
const otherCodesList = computed(() =>
  (wo.value.other_codes || '').split(',').map(s => s.trim()).filter(Boolean)
)
const startEditCodes = () => { codesDraft.value = wo.value.other_codes || ''; editCodes.value = true }
const saveCodes = async () => {
  await updateWorkOrder(id, { other_codes: codesDraft.value })
  editCodes.value = false
  ElMessage.success('已更新其他编码')
  load()
}

// 业务单号
const editBusinessNo = ref(false)
const businessNoDraft = ref('')
const startEditBusinessNo = () => { businessNoDraft.value = wo.value.business_no || ''; editBusinessNo.value = true }
const saveBusinessNo = async () => {
  await updateWorkOrder(id, { business_no: businessNoDraft.value })
  editBusinessNo.value = false
  ElMessage.success('已更新业务单号')
  load()
}

// 编码 → 二维码 dataURL 缓存（点击按钮时按需生成）
const qrCache = ref({})
const renderCodeQr = async (code) => {
  if (qrCache.value[code]) return
  try {
    qrCache.value = { ...qrCache.value, [code]: await QRCode.toDataURL(code, { width: 160, margin: 1 }) }
  } catch (e) {
    ElMessage.error('二维码生成失败')
  }
}

// 标签字典 + 维护
const tagDict = ref([])
const tagDialog = ref(false)
const tagDraft = ref([])
// 名称优先取字典；字典已删则回退工单关联快照（tag_links.tag_name）。
const tagName = (code) => {
  const dictName = tagDict.value.find(t => t.code === code)?.name
  if (dictName) return dictName
  const snap = (wo.value.tag_links || []).find(l => l.tag_code === code)?.tag_name
  return snap || code
}
const tagColor = (code) => tagDict.value.find(t => t.code === code)?.color || ''
const openTagEdit = () => {
  tagDraft.value = [...(wo.value.tags || [])]
  tagDialog.value = true
}
const saveTagEdit = async () => {
  await setWorkOrderTags(id, tagDraft.value)
  tagDialog.value = false
  ElMessage.success('标签已更新')
  load()
}

const photoItems = computed(() => (wo.value.items || []).filter(it => it.kind === 'photo'))
const imageRefreshKey = ref(0) // 用于强制刷新图片缓存
const imageList = computed(() => photoItems.value.map(it => ({
  id: it.id,
  url: `${dlUrl(it.id)}&t=${imageRefreshKey.value}`, // 使用响应式刷新键
  name: it.file_name,
  workOrderId: id
})))
const imagePreviewVisible = ref(false)
const imagePreviewIndex = ref(0)
const openImagePreview = (itemId) => {
  console.log('openImagePreview called, itemId:', itemId)
  console.log('photoItems:', photoItems.value)
  console.log('imageList:', imageList.value)
  imagePreviewIndex.value = photoItems.value.findIndex(it => it.id === itemId)
  console.log('imagePreviewIndex:', imagePreviewIndex.value)
  if (imagePreviewIndex.value >= 0) {
    imagePreviewVisible.value = true
    console.log('imagePreviewVisible set to true')
  } else {
    console.log('itemId not found in photoItems')
  }
}
const handleImageSaved = async () => {
  // 图片保存后重新加载工单数据，更新显示
  imagePreviewVisible.value = false
  await load()
  // 更新刷新键，强制重新加载所有图片（破坏浏览器缓存）
  imageRefreshKey.value = Date.now()
}
const handleSetOtherCodes = async (codes) => {
  try {
    const currentOtherCodes = wo.value.other_codes || ''
    const newCodes = currentOtherCodes ? `${currentOtherCodes},${codes}` : codes
    await updateWorkOrder(id, { other_codes: newCodes })
    await load()
    ElMessage.success('其他编码已更新')
  } catch (error) {
    console.error('更新其他编码失败:', error)
    ElMessage.error('更新失败：' + (error.response?.data?.error || error.message))
  }
}
const openPreview = (it) => { previewItem.value = it; previewDialog.value = true }

const kindLabels = { text: '文字', photo: '照片', video: '视频', voice: '语音', screen_record: '录屏', logcat: '日志', resource: '资源' }
const kindLabel = (k) => kindLabels[k] || k
const actionLabels = { create: '创建', update: '更新', comment: '备注', assign: '转交', status_change: '状态变更', close: '关闭', reopen: '重新打开', external_update: '第三方更新', tag_change: '标签变更', archive: '归档', unarchive: '取消归档', auto_archive: '系统自动归档' }
const actionLabel = (a) => actionLabels[a] || a

const dlUrl = (itemId) => workOrderItemDownloadUrl(id, itemId)

const formAppCode = computed(() => types.value.find(t => t.code === wo.value.type_code)?.form_app_code || '')
const formIframeUrl = computed(() => {
  const t = types.value.find(t => t.code === wo.value.type_code)
  if (!t?.form_app_code) return ''
  const token = localStorage.getItem('token') || ''
  return `/form-app/runtime/${t.form_app_code}?page=${t.form_page_key || 'form'}&readonly=1&_token=${encodeURIComponent(token)}`
})

const load = async () => {
  loading.value = true
  try {
    const res = await getWorkOrder(id)
    wo.value = res.data
    loadProgress()
  } finally {
    loading.value = false
  }
}

// ── 工单进展 ──────────────────────────────────────────────────
const progressList = ref([])
const progressDialog = ref(false)
const progressContent = ref('')
const progressFiles = ref([])

const loadProgress = async () => {
  try {
    const res = await getWorkOrderProgress(id)
    progressList.value = res.data || []
  } catch (e) {
    console.error('加载进展失败:', e)
  }
}

const openProgressAdd = () => {
  progressContent.value = ''
  progressFiles.value = []
  progressDialog.value = true
}

const handleProgressFileChange = (fileList) => {
  progressFiles.value = fileList
}

const saveProgress = async () => {
  if (!progressContent.value.trim()) {
    ElMessage.warning('请填写进展内容')
    return
  }
  try {
    const res = await createWorkOrderProgress(id, progressContent.value)
    const progressId = res.data.id

    // 上传附件
    if (progressFiles.value.length > 0) {
      for (const file of progressFiles.value) {
        const kind = detectFileKind(file.raw)
        await uploadWorkOrderProgressAttachment(progressId, file.raw, kind, '')
      }
    }

    ElMessage.success('进展已添加')
    progressDialog.value = false
    loadProgress()
  } catch (e) {
    ElMessage.error(e.message || '添加进展失败')
  }
}

const detectFileKind = (file) => {
  const type = file.type || ''
  if (type.startsWith('image/')) return 'photo'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'photo'
}

const progressAttDownloadUrl = (attId) => workOrderProgressAttachmentDownloadUrl(attId)

const progressAttKindLabel = (kind) => {
  const labels = { photo: '图片', video: '视频', audio: '音频', screen_record: '录屏', voice: '录音', logcat: '日志' }
  return labels[kind] || kind
}

const openProgressImagePreview = (attId) => {
  window.open(progressAttDownloadUrl(attId), '_blank')
}

// STOMP实时更新
const woStomp = createWorkOrdersStomp(onWorkOrderEvent, () => localStorage.getItem('token'))

function onWorkOrderEvent(payload) {
  if (!payload || !payload.id) return

  // 只处理当前工单的更新
  if (payload.id !== parseInt(id)) return

  console.log('[WorkOrderDetail] STOMP event:', payload)

  // 实时更新工单字段
  wo.value = {
    ...wo.value,
    ...payload,
    // 保持复杂字段不被覆盖（如 items, activities, tag_links）
    items: wo.value.items,
    activities: wo.value.activities,
    tag_links: wo.value.tag_links,
    tags: payload.tags || wo.value.tags
  }

  // 状态变更或重大更新时重新加载完整数据
  if (payload.event === 'work_order.status_changed' || payload.event === 'work_order.closed') {
    load()
  }
}

const setStatus = async (status) => {
  let comment = ''
  if (status === 'closed' || status === 'resolved' || status === 'reopened') {
    try {
      const r = await ElMessageBox.prompt('处理备注（可选）', actionLabel(status), { inputType: 'textarea', confirmButtonText: '确定', cancelButtonText: '取消' })
      comment = r.value || ''
    } catch { return }
  }
  await changeWorkOrderStatus(id, status, comment)
  ElMessage.success('已更新')
  load()
  loadProgress() // 刷新进展列表，显示新增的状态变更进展
}

const toggleVisibility = async (val) => {
  await updateWorkOrder(id, { visibility: val ? 'public' : 'private' })
  ElMessage.success('已更新可见性')
  load()
}

const changePriority = async (newPriority) => {
  if (newPriority === wo.value.priority) return
  await updateWorkOrder(id, { priority: newPriority })
  ElMessage.success('已更新优先级')
  load()
}

const doAssign = async () => {
  if (!assignTo.value) { ElMessage.warning('请填写处理人ID'); return }
  await assignWorkOrder(id, assignTo.value, assignComment.value)
  assignDialog.value = false
  assignComment.value = ''
  ElMessage.success('已转交')
  load()
}

onMounted(async () => {
  const t = await getWorkOrderTypes()
  types.value = t.data || []
  try { tagDict.value = (await getWorkOrderTagDict()).data || [] } catch { tagDict.value = [] }
  load()

  // 连接STOMP实时推送
  woStomp.connect()

  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  woStomp.disconnect()
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.section-title { font-weight: bold; margin-bottom: 8px; }
.form-frame { width: 100%; height: 360px; border: 1px solid #ebeef5; border-radius: 4px; }
.items { display: flex; flex-direction: column; gap: 16px; }
.item-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.item-name { font-size: 13px; color: #606266; }
.item-pkg { font-size: 12px; color: #909399; }
.item-img { display: block; width: 100%; max-width: 480px; height: auto; border-radius: 4px; cursor: zoom-in; }
.item-img :deep(img) { width: 100%; height: auto; display: block; }
.item-video { max-width: 100%; max-height: 360px; border-radius: 4px; display: block; }
.media-block { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.actions { display: flex; flex-direction: column; gap: 10px; }
.actions .el-button { margin-left: 0; }
.tl-actor { font-size: 12px; color: #909399; }
.tl-detail { font-size: 13px; color: #606266; margin-top: 2px; white-space: pre-wrap; }
.codes-view { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.code-chip { display: inline-flex; align-items: center; }
.qr-pop { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.qr-img { width: 160px; height: 160px; }
.qr-text { font-size: 12px; color: #606266; word-break: break-all; text-align: center; }
.tags-box { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tags-empty { font-size: 13px; color: #c0c4cc; }
.card-head { display: flex; align-items: center; justify-content: space-between; }

/* 工单进展 */
.progress-list { display: flex; flex-direction: column; gap: 16px; }
.progress-item { padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e4e7ed; }
.progress-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.progress-creator { font-weight: 600; font-size: 13px; color: #303133; }
.progress-time { font-size: 12px; color: #909399; }
.progress-content { font-size: 14px; color: #606266; white-space: pre-wrap; margin-bottom: 8px; }
.progress-attachments { display: flex; flex-direction: column; gap: 10px; }
.progress-att-item { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px; background: #fff; border-radius: 4px; border: 1px solid #e4e7ed; }
.att-name { font-size: 13px; color: #606266; flex: 1; min-width: 120px; }
.progress-att-img { width: 100%; max-width: 320px; margin-top: 6px; border-radius: 4px; cursor: zoom-in; }
.progress-att-video { width: 100%; max-width: 400px; margin-top: 6px; border-radius: 4px; }
.progress-att-audio { width: 100%; max-width: 300px; margin-top: 6px; }

/* 手机端适配 */
@media (max-width: 767px) {
  .item-img { max-width: 100%; }
  .item-video { max-height: 240px; }
  .form-frame { height: 280px; }
  .progress-att-img { max-width: 100%; }
  .progress-att-video { max-width: 100%; }
  .progress-att-audio { max-width: 100%; }
  .actions { gap: 8px; }
}
</style>
