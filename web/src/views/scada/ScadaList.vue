<template>
  <div class="scada-list">
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新建组态</el-button>
    </div>
    <el-table :data="rows" v-loading="loading" border>
      <el-table-column prop="scada_name" label="名称" min-width="140" />
      <el-table-column prop="scada_code" label="编码" width="160" />
      <el-table-column label="发布" width="90">
        <template #default="{ row }">
          <el-tag :type="row.publish_status === 1 ? 'success' : 'info'" size="small">
            {{ row.publish_status === 1 ? '已发布' : '未发布' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/scada/editor?code=${encodeURIComponent(row.scada_code)}`)">编辑</el-button>
          <el-button link @click="preview(row)">预览</el-button>
          <el-button link @click="doPublish(row)" v-if="row.publish_status !== 1">发布</el-button>
          <el-button link @click="copyShare(row)" v-if="row.publish_status === 1">复制分享</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" title="新建组态" width="480px">
      <el-form label-width="88px">
        <el-form-item label="名称"><el-input v-model="form.scada_name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.scada_code" placeholder="唯一英文标识" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as api from '@/api/scada'

const router = useRouter()
const loading = ref(false)
const rows = ref([])
const dlg = ref(false)
const form = ref({ scada_name: '', scada_code: '', description: '' })

const load = async () => {
  loading.value = true
  try {
    const res = await api.listScadaInfos()
    rows.value = res.data || []
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.value = { scada_name: '', scada_code: '', description: '' }
  dlg.value = true
}

const submitCreate = async () => {
  if (!form.value.scada_code || !form.value.scada_name) {
    ElMessage.warning('请填写名称与编码')
    return
  }
  await api.createScadaInfo({
    scada_name: form.value.scada_name,
    scada_code: form.value.scada_code,
    description: form.value.description,
    canvas_data: '{}'
  })
  dlg.value = false
  ElMessage.success('已创建')
  load()
}

const preview = row => {
  window.open(`/share/scada?code=${encodeURIComponent(row.scada_code)}`, '_blank')
}

const doPublish = async row => {
  const res = await api.publishScada(row.id)
  ElMessage.success('已发布')
  const share = `${window.location.origin}/share/scada?token=${res.data.share_token}`
  await navigator.clipboard.writeText(share)
  ElMessage.info('分享链接已复制')
  load()
}

const copyShare = async row => {
  const res = await api.getScadaInfo(row.id)
  const t = res.data?.share_token
  if (!t) return
  const share = `${window.location.origin}/share/scada?token=${encodeURIComponent(t)}`
  await navigator.clipboard.writeText(share)
  ElMessage.success('已复制分享链接')
}

onMounted(load)
</script>

<style scoped>
.toolbar {
  margin-bottom: 12px;
}
</style>
