<template>
  <div>
    <div class="toolbar">
      <el-page-header v-if="!embedded" content="工单类型" @back="$router.push('/work-orders')" />
      <div class="spacer" />
      <el-button type="primary" @click="openCreate">新增类型</el-button>
    </div>

    <el-table :data="rows" border v-loading="loading">
      <el-table-column prop="code" label="编码" width="160" />
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="default_title" label="默认标题" show-overflow-tooltip>
        <template #default="{ row }">{{ row.default_title || '-' }}</template>
      </el-table-column>
      <el-table-column prop="description" label="说明" show-overflow-tooltip />
      <el-table-column prop="form_app_code" label="绑定表单(form-app)" width="200">
        <template #default="{ row }">{{ row.form_app_code || '-' }}</template>
      </el-table-column>
      <el-table-column label="自动归档" width="220">
        <template #default="{ row }">
          <template v-if="row.auto_archive_enabled">
            <el-tag type="warning" size="small">{{ autoArchiveSummary(row) }}</el-tag>
            <div class="last-run">
              上次执行：{{ row.last_auto_archive_at ? formatTime(row.last_auto_archive_at) : '尚未执行' }}
              <span v-if="row.last_auto_archive_at">（归档 {{ row.last_auto_archive_count || 0 }} 个）</span>
            </div>
          </template>
          <span v-else style="color: #c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="enabled" label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="290">
        <template #default="{ row }">
          <el-button
            v-if="row.auto_archive_enabled"
            size="small"
            type="warning"
            plain
            :loading="runningId === row.id"
            @click="runAutoArchive(row)"
          >立即归档</el-button>
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" @click="copyType(row)">复制</el-button>
          <el-button size="small" type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="editing.id ? '编辑类型' : '新增类型'" width="520px">
      <el-form :model="editing" label-width="130px">
        <el-form-item label="编码" required>
          <el-input v-model="editing.code" :disabled="!!editing.id" placeholder="如 repair" />
        </el-form-item>
        <el-form-item label="名称" required><el-input v-model="editing.name" /></el-form-item>
        <el-form-item label="默认标题">
          <el-input v-model="editing.default_title" placeholder="提交端标题为空时自动带出，可空" />
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="editing.description" type="textarea" /></el-form-item>
        <el-form-item label="绑定表单 code">
          <el-input v-model="editing.form_app_code" placeholder="form-app 应用编码，可空" />
        </el-form-item>
        <el-form-item label="表单页面 key">
          <el-input v-model="editing.form_page_key" placeholder="默认 form" />
        </el-form-item>
        <el-form-item label="看板卡片模板">
          <el-input
            v-model="editing.board_card_template"
            type="textarea"
            :rows="4"
            placeholder="每行一段，留空用默认卡片。占位符：{{title}} {{code}} {{priority}} {{status_label}} {{type_name}} {{device_name}} {{device_id}} {{tags}} {{other_codes}} {{created_at}}"
          />
        </el-form-item>
        <el-divider content-position="left">自动归档</el-divider>
        <el-form-item label="启用自动归档">
          <el-switch v-model="editing.auto_archive_enabled" />
          <span class="hint">到达约定状态并超过约定时长后，系统自动归档并在进展中记录标识</span>
        </el-form-item>
        <template v-if="editing.auto_archive_enabled">
          <el-form-item label="触发状态">
            <el-select v-model="autoArchiveStatusList" multiple placeholder="默认「已解决」和「已关闭」">
              <el-option label="已解决" value="resolved" />
              <el-option label="已关闭" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item label="等待时长">
            <el-select v-model="autoArchiveDelayPreset" style="width: 160px" @change="onDelayPreset">
              <el-option v-for="p in delayPresets" :key="p.value" :label="p.label" :value="p.value" />
            </el-select>
            <el-input-number
              v-if="autoArchiveDelayPreset === -1"
              v-model="editing.auto_archive_delay_minutes"
              :min="0"
              :step="60"
              style="margin-left: 8px"
            />
            <span v-if="autoArchiveDelayPreset === -1" class="hint">分钟</span>
          </el-form-item>
        </template>
        <el-divider />
        <el-form-item label="排序"><el-input-number v-model="editing.sort_order" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="editing.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getWorkOrderTypes, createWorkOrderType, updateWorkOrderType, deleteWorkOrderType, runWorkOrderTypeAutoArchive } from '@/api/workOrder'

defineProps({ embedded: { type: Boolean, default: false } })

const rows = ref([])
const loading = ref(false)
const dialog = ref(false)
const editing = ref({})
const runningId = ref(null)

const formatTime = (t) => {
  if (!t) return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return t
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const runAutoArchive = async (row) => {
  runningId.value = row.id
  try {
    const res = await runWorkOrderTypeAutoArchive(row.id)
    const n = res.archived || 0
    ElMessage.success(n > 0 ? `已归档 ${n} 个工单` : '没有符合条件的工单需要归档')
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '执行失败')
  } finally {
    runningId.value = null
  }
}

// 等待时长预设（分钟）；-1 表示自定义。
const delayPresets = [
  { label: '立即（到达即归档）', value: 0 },
  { label: '1 小时', value: 60 },
  { label: '6 小时', value: 360 },
  { label: '24 小时', value: 1440 },
  { label: '3 天', value: 4320 },
  { label: '7 天', value: 10080 },
  { label: '30 天', value: 43200 },
  { label: '自定义…', value: -1 }
]
const autoArchiveDelayPreset = ref(1440)

// 触发状态：string(逗号) <-> array 双向绑定。
const autoArchiveStatusList = computed({
  get: () => {
    const raw = (editing.value.auto_archive_statuses || '').trim()
    return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
  },
  set: (arr) => { editing.value.auto_archive_statuses = (arr || []).join(',') }
})

const onDelayPreset = (v) => {
  if (v !== -1) editing.value.auto_archive_delay_minutes = v
}

// 列表自动归档摘要：如「已解决/已关闭·24小时」。
const autoArchiveSummary = (row) => {
  const mins = row.auto_archive_delay_minutes || 0
  let dur
  if (mins <= 0) dur = '即时'
  else if (mins % 1440 === 0) dur = `${mins / 1440}天`
  else if (mins % 60 === 0) dur = `${mins / 60}小时`
  else dur = `${mins}分`
  return dur
}

// 打开弹窗时把已存分钟数对齐到预设（命中则选预设，否则自定义）。
const syncDelayPreset = () => {
  const mins = editing.value.auto_archive_delay_minutes || 0
  autoArchiveDelayPreset.value = delayPresets.some(p => p.value === mins && p.value !== -1) ? mins : -1
}

const load = async () => {
  loading.value = true
  try {
    const res = await getWorkOrderTypes()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  editing.value = {
    code: '', name: '', description: '', default_title: '', form_app_code: '', form_page_key: 'form',
    board_card_template: '', sort_order: 0, enabled: true,
    auto_archive_enabled: false, auto_archive_statuses: '', auto_archive_delay_minutes: 1440
  }
  syncDelayPreset()
  dialog.value = true
}
const openEdit = (row) => { editing.value = { ...row }; syncDelayPreset(); dialog.value = true }

const copyType = (row) => {
  editing.value = {
    ...row,
    id: undefined,
    code: row.code + '_copy',
    name: row.name + ' (复制)'
  }
  syncDelayPreset()
  dialog.value = true
}

const save = async () => {
  const e = editing.value
  if (!e.code || !e.name) { ElMessage.warning('编码和名称必填'); return }
  if (e.id) await updateWorkOrderType(e.id, e)
  else await createWorkOrderType(e)
  dialog.value = false
  ElMessage.success('已保存')
  load()
}

const remove = async (row) => {
  await ElMessageBox.confirm(`删除类型「${row.name}」？`, '确认', { type: 'warning' })
  await deleteWorkOrderType(row.id)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; align-items: center; margin-bottom: 12px; }
.spacer { flex: 1; }
.hint { margin-left: 10px; color: #909399; font-size: 12px; }
.last-run { margin-top: 4px; color: #909399; font-size: 12px; line-height: 1.4; }
</style>
