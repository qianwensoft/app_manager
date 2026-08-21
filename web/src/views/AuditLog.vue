<template>
  <div>
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold;">审计日志</span>
          <el-tag>最近 200 条记录</el-tag>
        </div>
      </template>
      <el-table :data="logs" border stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="用户" width="120">
          <template #default="{ row }">
            <div>{{ row.username }}</div>
            <el-tag size="small" type="info" v-if="row.user_id > 0">ID: {{ row.user_id }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" width="160">
          <template #default="{ row }">
            <el-tag v-if="row.action === 'login'" type="success">登录成功</el-tag>
            <el-tag v-else-if="row.action === 'login_failed'" type="danger">登录失败</el-tag>
            <el-tag v-else-if="row.action === 'refresh_token'" type="primary">刷新Token</el-tag>
            <el-tag v-else-if="row.action === 'refresh_token_failed'" type="warning">刷新失败</el-tag>
            <el-tag v-else type="info">{{ row.action }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="命令/详情" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.command }}
          </template>
        </el-table-column>
        <el-table-column label="结果" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.result === 'success'" type="success" size="small">成功</el-tag>
            <el-tag v-else-if="row.result === 'user not found'" type="danger" size="small">用户不存在</el-tag>
            <el-tag v-else-if="row.result === 'invalid password'" type="danger" size="small">密码错误</el-tag>
            <el-tag v-else-if="row.result === 'unauthorized'" type="warning" size="small">未授权</el-tag>
            <el-tag v-else type="info" size="small">{{ row.result }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="设备" width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.device_name">{{ row.device_name }}</span>
            <span v-else-if="row.device_id">设备 #{{ row.device_id }}</span>
            <span v-else style="color: #999;">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="ip_address" label="IP 地址" width="150" />
        <el-table-column label="User-Agent" width="300" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.user_agent" :title="row.user_agent">{{ formatUserAgent(row.user_agent) }}</span>
            <span v-else style="color: #999;">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getAuditLogs } from '@/api/misc'

const logs = ref([])

onMounted(async () => {
  const res = await getAuditLogs()
  logs.value = res.data
})

function formatTime(time) {
  if (!time) return '-'
  const d = new Date(time)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function formatUserAgent(ua) {
  if (!ua) return '-'
  
  // 简化 User-Agent 显示
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/([\d.]+)/)
    return `Chrome ${match ? match[1] : ''}`
  } else if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/([\d.]+)/)
    return `Firefox ${match ? match[1] : ''}`
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/([\d.]+)/)
    return `Safari ${match ? match[1] : ''}`
  } else if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/([\d.]+)/)
    return `Edge ${match ? match[1] : ''}`
  }
  
  // 截取前 50 个字符
  return ua.length > 50 ? ua.substring(0, 50) + '...' : ua
}
</script>

<style scoped>
.el-tag + .el-tag {
  margin-left: 5px;
}
</style>
