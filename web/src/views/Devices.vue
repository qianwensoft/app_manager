<template>
  <div style="display:flex;gap:16px;height:calc(100vh - 100px)">
    <!-- 左侧分组 -->
    <div style="width:200px;border-right:1px solid #ddd;padding-right:16px">
      <div style="font-weight:bold;margin-bottom:12px">分组筛选</div>
      <el-menu :default-active="selectedGroup" @select="handleGroupSelect">
        <el-menu-item index="">全部设备 ({{ devices.length }})</el-menu-item>
        <el-menu-item v-for="g in groups" :key="g" :index="g">
          {{ g }} ({{ devices.filter(d => d.group_name === g).length }})
        </el-menu-item>
        <el-menu-item index="未分组">未分组 ({{ devices.filter(d => !d.group_name).length }})</el-menu-item>
      </el-menu>
    </div>

    <!-- 右侧内容 -->
    <div style="flex:1;overflow:auto">
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
        <el-button type="primary" @click="scan" :loading="scanning">扫描设备</el-button>
        <el-button @click="showAddDialog = true">手动添加</el-button>
        <AdbBridgeScan @registered="refresh" />
        <el-button :loading="refreshing" @click="refresh" :icon="RefreshIcon">刷新</el-button>
        <div style="flex:1"></div>
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="table">列表</el-radio-button>
          <el-radio-button value="card">卡片</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 表格视图 -->
      <el-table v-if="viewMode === 'table'" :data="filteredDevices" border>
        <el-table-column prop="serial" label="Serial" width="200" />
        <el-table-column prop="name" label="名称" width="150" />
        <el-table-column label="别名" width="150">
          <template #default="{ row }">
            {{ row.server_alias || row.agent_alias || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="group_name" label="分组" width="120">
          <template #default="{ row }">
            {{ row.group_name || '未分组' }}
          </template>
        </el-table-column>
        <el-table-column prop="model" label="型号" />
        <el-table-column label="网络" width="200">
          <template #default="{ row }">
            <NetworkCell :device="row" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.agent_connected ? 'success' : 'info'" size="small">
              {{ row.agent_connected ? 'Agent' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editDevice(row)">编辑</el-button>
            <el-button size="small" @click="$router.push(`/devices/${row.id}`)">详情</el-button>
            <el-button size="small" type="primary" plain @click="$router.push(`/devices/${row.id}?tab=files`)">文件</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 卡片视图 -->
      <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
        <el-card v-for="d in filteredDevices" :key="d.id" shadow="hover">
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:bold">{{ d.name }}</span>
              <el-tag :type="d.agent_connected ? 'success' : 'info'" size="small">
                {{ d.agent_connected ? 'Agent' : d.status }}
              </el-tag>
            </div>
          </template>
          <div style="font-size:13px;line-height:1.8">
            <div><b>Serial:</b> {{ d.serial }}</div>
            <div><b>别名:</b> {{ d.server_alias || d.agent_alias || '-' }}</div>
            <div><b>分组:</b> {{ d.group_name || '未分组' }}</div>
            <div><b>型号:</b> {{ d.model }}</div>
            <div><b>网络:</b> <NetworkCell :device="d" inline /></div>
          </div>
          <template #footer>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
              <el-button size="small" @click="editDevice(d)">编辑</el-button>
              <el-button size="small" @click="$router.push(`/devices/${d.id}`)">详情</el-button>
              <el-button size="small" type="primary" plain @click="$router.push(`/devices/${d.id}?tab=files`)">文件</el-button>
            </div>
          </template>
        </el-card>
      </div>
    </div>
  </div>

  <!-- 添加设备对话框 -->
  <el-dialog v-model="showAddDialog" title="手动添加设备" width="400px">
    <el-form :model="addForm">
      <el-form-item label="IP 地址">
        <el-input v-model="addForm.ip" placeholder="192.168.1.x" />
      </el-form-item>
      <el-form-item label="端口">
        <el-input v-model="addForm.port" placeholder="5555" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddDialog = false">取消</el-button>
      <el-button type="primary" @click="connectTCP">连接</el-button>
    </template>
  </el-dialog>

  <!-- 编辑设备对话框 -->
  <el-dialog v-model="showEditDialog" title="编辑设备" width="400px">
    <el-form :model="editForm" label-width="80px">
      <el-form-item label="名称">
        <el-input v-model="editForm.name" />
      </el-form-item>
      <el-form-item label="设备别名">
        <el-input v-model="editForm.server_alias" placeholder="可选" />
      </el-form-item>
      <el-form-item label="分组">
        <el-select v-model="editForm.group_name" filterable allow-create placeholder="选择或输入新分组">
          <el-option v-for="g in groups" :key="g" :label="g" :value="g" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showEditDialog = false">取消</el-button>
      <el-button type="primary" @click="saveEdit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh as RefreshIcon } from '@element-plus/icons-vue'
import * as deviceApi from '@/api/device'
import { useEventListenerStore } from '@/stores/eventListeners'
import NetworkCell from '@/components/NetworkCell.vue'
import AdbBridgeScan from '@/components/AdbBridgeScan.vue'

const DEVICES_VIEW_MODE_KEY = 'app-manager-devices-view-mode'

function readStoredViewMode() {
  try {
    const v = localStorage.getItem(DEVICES_VIEW_MODE_KEY)
    if (v === 'table' || v === 'card') return v
  } catch {
    /* private mode / quota */
  }
  return 'table'
}

const devices = ref([])
const scanning = ref(false)
const refreshing = ref(false)
const showAddDialog = ref(false)
const showEditDialog = ref(false)
const addForm = ref({ ip: '', port: '5555' })
const editForm = ref({ id: null, name: '', server_alias: '', group_name: '' })
const selectedGroup = ref('')
const viewMode = ref(readStoredViewMode())

watch(viewMode, (v) => {
  try {
    localStorage.setItem(DEVICES_VIEW_MODE_KEY, v)
  } catch {
    /* noop */
  }
})

const groups = computed(() => {
  const g = new Set()
  devices.value.forEach(d => { if (d.group_name) g.add(d.group_name) })
  return Array.from(g)
})

const filteredDevices = computed(() => {
  if (!selectedGroup.value) return devices.value
  if (selectedGroup.value === '未分组') return devices.value.filter(d => !d.group_name)
  return devices.value.filter(d => d.group_name === selectedGroup.value)
})

const load = async () => {
  const res = await deviceApi.getDevices()
  devices.value = res.data
}

const refresh = async () => {
  refreshing.value = true
  try {
    await load()
    ElMessage.success('已刷新')
  } finally {
    refreshing.value = false
  }
}

const scan = async () => {
  scanning.value = true
  try {
    await deviceApi.scanDevices()
    await load()
    ElMessage.success('扫描完成')
  } finally {
    scanning.value = false
  }
}

const connectTCP = async () => {
  await deviceApi.connectDevice(0, { ip: addForm.value.ip, port: parseInt(addForm.value.port) })
  showAddDialog.value = false
  await scan()
}

const editDevice = (device) => {
  editForm.value = {
    id: device.id,
    name: device.name,
    server_alias: device.server_alias || '',
    group_name: device.group_name || ''
  }
  showEditDialog.value = true
}

const saveEdit = async () => {
  await deviceApi.updateDevice(editForm.value.id, {
    name: editForm.value.name,
    server_alias: editForm.value.server_alias,
    group_name: editForm.value.group_name
  })
  showEditDialog.value = false
  await load()
  ElMessage.success('保存成功')
}

const handleGroupSelect = (index) => {
  selectedGroup.value = index
}

const eventListeners = useEventListenerStore()
let profileListenerId = null

onMounted(() => {
  load()
  profileListenerId = eventListeners.attachProfileListener({
    sourceLabel: '设备管理',
    deviceScopeId: null,
    onEvent: () => load()
  })
})
onUnmounted(() => {
  if (profileListenerId) eventListeners.revoke(profileListenerId)
})
</script>
