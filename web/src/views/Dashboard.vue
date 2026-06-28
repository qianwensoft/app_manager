<template>
  <div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="5">
        <el-card>
          <div class="stat">
            <div class="stat-num">{{ stats.total }}</div>
            <div class="stat-label">设备总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#67c23a">{{ stats.online }}</div>
            <div class="stat-label">在线设备</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#409eff">{{ stats.apps }}</div>
            <div class="stat-label">APK 数量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="5">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#e6a23c">{{ stats.tasks }}</div>
            <div class="stat-label">今日任务</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="4">
        <el-card class="clickable" @click="$router.push('/work-orders?status=open')">
          <div class="stat">
            <div class="stat-num" style="color:#f56c6c">{{ pendingWorkOrders }}</div>
            <div class="stat-label">待处理工单</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <template #header>
        <div class="online-header">
          <span class="online-title">在线设备</span>
          <el-radio-group v-model="selectedGroup" size="small" class="group-switch">
            <el-radio-button value="">全部 ({{ onlineDevices.length }})</el-radio-button>
            <el-radio-button v-for="g in onlineGroups" :key="g" :value="g">
              {{ g }} ({{ onlineCountByGroup(g) }})
            </el-radio-button>
            <el-radio-button value="未分组">未分组 ({{ onlineCountByGroup('未分组') }})</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="filteredOnlineDevices" border empty-text="当前分组暂无在线设备">
        <el-table-column prop="serial" label="Serial" min-width="160" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="group_name" label="分组" width="120">
          <template #default="{ row }">{{ row.group_name || '未分组' }}</template>
        </el-table-column>
        <el-table-column prop="model" label="型号" min-width="120" show-overflow-tooltip />
        <el-table-column label="网络" width="220">
          <template #default="{ row }">
            <NetworkCell :device="row" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="$router.push(`/devices/${row.id}`)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import * as deviceApi from '@/api/device'
import * as appApi from '@/api/app'
import { getTasks } from '@/api/misc'
import { getWorkOrders } from '@/api/workOrder'
import { useEventListenerStore } from '@/stores/eventListeners'
import NetworkCell from '@/components/NetworkCell.vue'

const devices = ref([])
const apps = ref([])
const tasks = ref([])
const pendingWorkOrders = ref(0)
const loading = ref(false)
const selectedGroup = ref('')

const onlineDevices = computed(() => devices.value.filter((d) => d.status === 'online' || d.agent_connected))

const onlineGroups = computed(() => {
  const g = new Set()
  onlineDevices.value.forEach((d) => {
    if (d.group_name) g.add(d.group_name)
  })
  return Array.from(g).sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

function onlineCountByGroup(groupKey) {
  if (groupKey === '未分组') {
    return onlineDevices.value.filter((d) => !d.group_name).length
  }
  return onlineDevices.value.filter((d) => d.group_name === groupKey).length
}

const filteredOnlineDevices = computed(() => {
  if (!selectedGroup.value) return onlineDevices.value
  if (selectedGroup.value === '未分组') {
    return onlineDevices.value.filter((d) => !d.group_name)
  }
  return onlineDevices.value.filter((d) => d.group_name === selectedGroup.value)
})

const stats = computed(() => ({
  total: devices.value.length,
  online: onlineDevices.value.length,
  apps: apps.value.length,
  tasks: tasks.value.length
}))

const loadData = async () => {
  const [d, a, t] = await Promise.all([deviceApi.getDevices(), appApi.getApps(), getTasks()])
  devices.value = d.data
  apps.value = a.data
  tasks.value = t.data
  loadPendingWorkOrders()
}

// 待处理工单数 = open(待处理) + in_progress(处理中)（仅取 total，limit=1 省带宽）。
const loadPendingWorkOrders = async () => {
  try {
    const [open, inProgress] = await Promise.all([
      getWorkOrders({ status: 'open', limit: 1 }),
      getWorkOrders({ status: 'in_progress', limit: 1 })
    ])
    pendingWorkOrders.value = (open.total || 0) + (inProgress.total || 0)
  } catch {
    pendingWorkOrders.value = 0
  }
}

const refresh = async () => {
  loading.value = true
  try {
    await loadData()
    ElMessage.success('已刷新')
  } catch (e) {
    ElMessage.error(e.message || '刷新失败')
  } finally {
    loading.value = false
  }
}

const eventListeners = useEventListenerStore()
let profileListenerId = null

onMounted(() => {
  loadData()
  profileListenerId = eventListeners.attachProfileListener({
    sourceLabel: '总览',
    deviceScopeId: null,
    onEvent: () => loadData()
  })
})
onUnmounted(() => {
  if (profileListenerId) eventListeners.revoke(profileListenerId)
})
</script>

<style scoped>
.stat { text-align: center; padding: 8px; }
.stat-num { font-size: 36px; font-weight: bold; }
.stat-label { color: #999; margin-top: 4px; }
.clickable { cursor: pointer; transition: box-shadow .2s; }
.clickable:hover { box-shadow: 0 2px 12px rgba(0,0,0,.12); }
.online-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.online-title {
  font-weight: 600;
  flex-shrink: 0;
}
.group-switch {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.group-switch :deep(.el-radio-button__inner) {
  padding: 6px 10px;
}
</style>
