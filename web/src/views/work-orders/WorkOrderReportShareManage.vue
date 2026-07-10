<template>
  <div class="share-manage">
    <div class="toolbar">
      <el-alert type="info" :closable="false" style="margin-bottom:16px">
        管理通过统计报告生成的分享链接，查看浏览次数和访问记录。
      </el-alert>
    </div>

    <el-table v-loading="loading" :data="shareList" border>
      <el-table-column prop="title" label="分享标题" min-width="200" show-overflow-tooltip />
      <el-table-column label="认证模式" width="120">
        <template #default="{ row }">
          <el-tag :type="row.auth_mode === 'public' ? 'success' : 'warning'">
            {{ row.auth_mode === 'public' ? '免登录' : '需登录' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="权限配置" width="180" v-if="shareList.some(s => s.auth_mode === 'login')">
        <template #default="{ row }">
          <div v-if="row.auth_mode === 'login' && row.permissions">
            <el-tag v-if="parsePermissions(row).can_view" size="small" style="margin:2px">查看</el-tag>
            <el-tag v-if="parsePermissions(row).can_comment" size="small" style="margin:2px">评论</el-tag>
            <el-tag v-if="parsePermissions(row).can_update_status" size="small" style="margin:2px">改状态</el-tag>
            <el-tag v-if="parsePermissions(row).can_update_fields" size="small" style="margin:2px">改字段</el-tag>
          </div>
          <span v-else style="color:#909399">-</span>
        </template>
      </el-table-column>
      <el-table-column label="浏览次数" width="120">
        <template #default="{ row }">
          <el-button link type="primary" @click="showViews(row)">
            {{ row.view_count || 0 }} 次
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="过期时间" width="180">
        <template #default="{ row }">{{ new Date(row.expires_at).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="new Date(row.expires_at) > new Date() ? 'success' : 'danger'">
            {{ new Date(row.expires_at) > new Date() ? '有效' : '已过期' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="copyLink(row)">复制链接</el-button>
          <el-popconfirm title="确定删除此分享？" @confirm="deleteShare(row.id)">
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 浏览记录对话框 -->
    <el-dialog v-model="viewsDialogVisible" :title="`浏览记录 - ${currentShare?.title}`" width="900px">
      <el-table v-loading="viewsLoading" :data="viewsList" border>
        <el-table-column label="访问时间" width="180">
          <template #default="{ row }">{{ new Date(row.viewed_at).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="ip_address" label="IP地址" width="150" />
        <el-table-column prop="user_agent" label="浏览器/设备" min-width="300" show-overflow-tooltip />
      </el-table>
      <div v-if="viewsList.length === 0" style="text-align:center; padding:40px; color:#909399">
        暂无浏览记录
      </div>
      <template #footer>
        <el-button @click="viewsDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { listWorkOrderReportShares, getWorkOrderReportShareViews, deleteWorkOrderReportShare } from '@/api/workOrder'

const loading = ref(false)
const shareList = ref([])

const viewsDialogVisible = ref(false)
const viewsLoading = ref(false)
const viewsList = ref([])
const currentShare = ref(null)

const fetchShares = async () => {
  loading.value = true
  try {
    const res = await listWorkOrderReportShares()
    shareList.value = res.data || []
  } catch (e) {
    ElMessage.error(e.message || '获取分享列表失败')
  } finally {
    loading.value = false
  }
}

const showViews = async (share) => {
  currentShare.value = share
  viewsDialogVisible.value = true
  viewsLoading.value = true
  try {
    const res = await getWorkOrderReportShareViews(share.id)
    viewsList.value = res.data || []
  } catch (e) {
    ElMessage.error(e.message || '获取浏览记录失败')
  } finally {
    viewsLoading.value = false
  }
}

const copyLink = async (row) => {
  const link = `${window.location.origin}/work-order-report-share/${row.token}`

  try {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link)
      ElMessage.success('链接已复制到剪贴板')
      return
    }
  } catch (e) {
    console.warn('Clipboard API failed, fallback to execCommand', e)
  }

  // 回退方案：使用传统的 execCommand
  try {
    const textarea = document.createElement('textarea')
    textarea.value = link
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.width = '1px'
    textarea.style.height = '1px'
    textarea.style.padding = '0'
    textarea.style.border = 'none'
    textarea.style.outline = 'none'
    textarea.style.boxShadow = 'none'
    textarea.style.background = 'transparent'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (successful) {
      ElMessage.success('链接已复制到剪贴板')
    } else {
      throw new Error('execCommand failed')
    }
  } catch (e) {
    console.error('All copy methods failed', e)
    ElMessage.error('复制失败，请手动复制：' + link)
  }
}

const deleteShare = async (id) => {
  try {
    await deleteWorkOrderReportShare(id)
    ElMessage.success('删除成功')
    fetchShares()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

const parsePermissions = (row) => {
  if (!row.permissions) return {}
  try {
    return typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions
  } catch (e) {
    return {}
  }
}

onMounted(() => {
  fetchShares()
})
</script>

<style scoped>
.share-manage {
  padding: 16px;
}

.toolbar {
  margin-bottom: 16px;
}
</style>
