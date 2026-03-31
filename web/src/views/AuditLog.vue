<template>
  <div>
    <el-table :data="logs" border>
      <el-table-column prop="user_id" label="用户" width="80" />
      <el-table-column prop="action" label="操作" width="150" />
      <el-table-column prop="resource" label="资源" width="120" />
      <el-table-column prop="detail" label="详情" show-overflow-tooltip />
      <el-table-column prop="ip" label="IP" width="140" />
      <el-table-column prop="created_at" label="时间" width="180" />
    </el-table>
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
</script>
