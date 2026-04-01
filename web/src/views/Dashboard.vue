<template>
  <div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6">
        <el-card>
          <div class="stat">
            <div class="stat-num">{{ stats.total }}</div>
            <div class="stat-label">设备总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#67c23a">{{ stats.online }}</div>
            <div class="stat-label">在线设备</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#409eff">{{ stats.apps }}</div>
            <div class="stat-label">APK 数量</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card>
          <div class="stat">
            <div class="stat-num" style="color:#e6a23c">{{ stats.tasks }}</div>
            <div class="stat-label">今日任务</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <template #header>在线设备</template>
      <el-table :data="onlineDevices" border>
        <el-table-column prop="serial" label="Serial" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="model" label="型号" />
        <el-table-column label="网络" width="220">
          <template #default="{ row }">
            <NetworkCell :device="row" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
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
import { useEventListenerStore } from '@/stores/eventListeners'
import NetworkCell from '@/components/NetworkCell.vue'

const devices = ref([])
const apps = ref([])
const tasks = ref([])
const loading = ref(false)

const onlineDevices = computed(() => devices.value.filter(d => d.status === 'online' || d.agent_connected))
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
</style>
