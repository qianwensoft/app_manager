<template>
  <div>
    <el-button @click="load" style="margin-bottom:12px">刷新</el-button>
    <el-table :data="tasks" border>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="action" label="操作" width="80" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="output" label="输出" show-overflow-tooltip />
      <el-table-column prop="created_at" label="创建时间" width="180" />
      <el-table-column prop="finished_at" label="完成时间" width="180" />
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" size="small" type="danger" @click="cancel(row.id)">取消</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getTasks, cancelTask } from '@/api/misc'

const tasks = ref([])

const statusType = (s) => ({ pending: 'info', running: 'warning', success: 'success', failed: 'danger', cancelled: '' }[s] || '')

const load = async () => {
  const res = await getTasks()
  tasks.value = res.data
}

const cancel = async (id) => {
  await cancelTask(id)
  ElMessage.success('已取消')
  load()
}

onMounted(load)
</script>
