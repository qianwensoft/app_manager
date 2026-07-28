<template>
  <div class="rc-overview" v-loading="loading">
    <div class="rc-ov-header">
      <div>
        <div class="rc-ov-title">资源中心概览</div>
        <div class="rc-ov-sub">{{ isAdmin ? '当前显示全部资源统计' : '当前显示您被授权范围内的资源统计' }}</div>
      </div>
      <el-button size="small" :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
    </div>

    <div class="rc-ov-grid">
      <div class="rc-stat-card rc-stat-device">
        <div class="rc-stat-icon"><el-icon><Cpu /></el-icon></div>
        <div class="rc-stat-body">
          <div class="rc-stat-label">授权设备数</div>
          <div class="rc-stat-value">{{ stats.device.total }}</div>
          <div class="rc-stat-extra">
            <span class="dot online" /> 在线 {{ stats.device.online }}
            <span class="dot offline" /> 离线 {{ stats.device.offline }}
          </div>
        </div>
      </div>

      <div class="rc-stat-card rc-stat-wo">
        <div class="rc-stat-icon"><el-icon><Tickets /></el-icon></div>
        <div class="rc-stat-body">
          <div class="rc-stat-label">相关工单数</div>
          <div class="rc-stat-value">{{ stats.workorder.total }}</div>
          <div class="rc-stat-extra">
            <span class="tag-open">待处理 {{ stats.workorder.open }}</span>
            <span class="tag-progress">处理中 {{ stats.workorder.in_progress }}</span>
            <span class="tag-closed">已完结 {{ stats.workorder.closed }}</span>
          </div>
        </div>
      </div>

      <div class="rc-stat-card rc-stat-node">
        <div class="rc-stat-icon"><el-icon><Grid /></el-icon></div>
        <div class="rc-stat-body">
          <div class="rc-stat-label">资源节点数</div>
          <div class="rc-stat-value">{{ totalNodes }}</div>
          <div class="rc-stat-extra rc-node-breakdown">
            <span v-for="item in nodeBreakdown" :key="item.key">{{ item.label }} {{ item.count }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="rc-ov-detail">
      <div class="rc-detail-title">工单状态分布</div>
      <div class="rc-wo-bars">
        <div v-for="b in woBars" :key="b.key" class="rc-wo-bar-row">
          <span class="rc-wo-bar-label">{{ b.label }}</span>
          <div class="rc-wo-bar-track">
            <div class="rc-wo-bar-fill" :class="b.key" :style="{ width: barWidth(b.count) }" />
          </div>
          <span class="rc-wo-bar-count">{{ b.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Cpu, Tickets, Grid } from '@element-plus/icons-vue'
import { getPortalStats } from '@/api/portal'

const loading = ref(false)
const isAdmin = ref(false)
const stats = ref({
  device: { total: 0, online: 0, offline: 0 },
  workorder: { total: 0, open: 0, in_progress: 0, closed: 0 },
  node_counts: {}
})

const NODE_LABELS = {
  group: '分组', device_mgmt: '设备管理', workorder_mgmt: '工单管理',
  scada: '组态', form_app: '表单', link: '链接'
}

const nodeBreakdown = computed(() => Object.entries(NODE_LABELS)
  .map(([key, label]) => ({ key, label, count: stats.value.node_counts?.[key] || 0 }))
  .filter(i => i.count > 0))

const totalNodes = computed(() => Object.values(stats.value.node_counts || {}).reduce((a, b) => a + (b || 0), 0))

const woBars = computed(() => [
  { key: 'open', label: '待处理', count: stats.value.workorder.open },
  { key: 'in_progress', label: '处理中', count: stats.value.workorder.in_progress },
  { key: 'closed', label: '已完结', count: stats.value.workorder.closed }
])

const barWidth = (count) => {
  const max = Math.max(1, ...woBars.value.map(b => b.count))
  return `${Math.round((count / max) * 100)}%`
}

const load = async () => {
  loading.value = true
  try {
    const res = await getPortalStats()
    isAdmin.value = !!res.is_admin
    stats.value = {
      device: res.device || { total: 0, online: 0, offline: 0 },
      workorder: res.workorder || { total: 0, open: 0, in_progress: 0, closed: 0 },
      node_counts: res.node_counts || {}
    }
  } catch (e) {
    ElMessage.error('加载概览统计失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.rc-overview { min-height: 100%; }
.rc-ov-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.rc-ov-title { font-size: 20px; font-weight: 700; color: #1d2935; }
.rc-ov-sub { font-size: 13px; color: #909399; margin-top: 4px; }
.rc-ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.rc-stat-card { display: flex; gap: 16px; padding: 20px; background: #fff; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.rc-stat-icon { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; flex-shrink: 0; }
.rc-stat-device .rc-stat-icon { background: linear-gradient(135deg, #409eff, #2b74d4); }
.rc-stat-wo .rc-stat-icon { background: linear-gradient(135deg, #67c23a, #4c9c2e); }
.rc-stat-node .rc-stat-icon { background: linear-gradient(135deg, #e6a23c, #c8842a); }
.rc-stat-body { flex: 1; min-width: 0; }
.rc-stat-label { font-size: 13px; color: #909399; }
.rc-stat-value { font-size: 32px; font-weight: 700; color: #1d2935; line-height: 1.2; margin: 2px 0 6px; }
.rc-stat-extra { font-size: 12px; color: #606266; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.rc-node-breakdown span { background: #f0f2f5; padding: 2px 8px; border-radius: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 2px; }
.dot.online { background: #67c23a; }
.dot.offline { background: #c0c4cc; }
.tag-open { color: #e6a23c; }
.tag-progress { color: #409eff; }
.tag-closed { color: #67c23a; }
.rc-ov-detail { margin-top: 20px; background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
.rc-detail-title { font-size: 15px; font-weight: 600; color: #1d2935; margin-bottom: 16px; }
.rc-wo-bars { display: flex; flex-direction: column; gap: 12px; }
.rc-wo-bar-row { display: flex; align-items: center; gap: 12px; }
.rc-wo-bar-label { width: 56px; font-size: 13px; color: #606266; flex-shrink: 0; }
.rc-wo-bar-track { flex: 1; height: 14px; background: #f0f2f5; border-radius: 7px; overflow: hidden; }
.rc-wo-bar-fill { height: 100%; border-radius: 7px; transition: width .4s; }
.rc-wo-bar-fill.open { background: #e6a23c; }
.rc-wo-bar-fill.in_progress { background: #409eff; }
.rc-wo-bar-fill.closed { background: #67c23a; }
.rc-wo-bar-count { width: 40px; text-align: right; font-size: 13px; font-weight: 600; color: #1d2935; flex-shrink: 0; }
</style>
