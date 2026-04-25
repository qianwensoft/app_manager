<template>
  <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f7fa">
    <el-card style="width:480px;max-width:96vw" shadow="always">
      <!-- Loading -->
      <div v-if="loading" style="text-align:center;padding:40px 0">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <div style="margin-top:12px;color:#606266">正在加载授权信息…</div>
      </div>

      <!-- Error -->
      <div v-else-if="error" style="text-align:center;padding:32px 0">
        <el-icon :size="40" color="#F56C6C"><CircleClose /></el-icon>
        <div style="margin-top:12px;font-size:15px;color:#303133">{{ error }}</div>
        <el-button style="margin-top:20px" @click="deny">关闭</el-button>
      </div>

      <!-- Authorize form -->
      <div v-else>
        <div style="text-align:center;margin-bottom:24px">
          <el-icon :size="40" color="#409EFF"><Connection /></el-icon>
          <div style="font-size:18px;font-weight:600;margin-top:10px">{{ info.client_name }}</div>
          <div style="font-size:13px;color:#606266;margin-top:4px">{{ info.description }}</div>
        </div>

        <el-divider />

        <div style="font-size:13px;color:#303133;margin-bottom:12px">
          该应用请求以下权限：
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
          <div
            v-for="scope in info.scopes"
            :key="scope"
            style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f5f7fa;border-radius:6px"
          >
            <el-icon color="#67C23A"><Check /></el-icon>
            <div>
              <div style="font-size:13px;font-weight:500">{{ scopeLabel(scope) }}</div>
              <div style="font-size:11px;color:#909399">{{ scope }}</div>
            </div>
          </div>
          <div v-if="!info.scopes || info.scopes.length === 0" style="color:#909399;font-size:13px">
            无特定权限请求
          </div>
        </div>

        <div style="font-size:12px;color:#909399;margin-bottom:20px">
          授权后，该应用将能以您的身份访问上述资源。您可以随时在授权管理页面撤销。
        </div>

        <div style="display:flex;gap:12px">
          <el-button style="flex:1" @click="deny" :loading="submitting">拒绝</el-button>
          <el-button type="primary" style="flex:1" @click="approve" :loading="submitting">授权</el-button>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loading, CircleClose, Connection, Check } from '@element-plus/icons-vue'
import { getOAuthAuthorizeInfo, postOAuthAuthorizeConsent } from '@/api/oauth'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const submitting = ref(false)
const info = ref({ client_name: '', description: '', scopes: [], state: '', redirect_uri: '' })

const scopeLabels = {
  'open:devices:list': '设备列表',
  'open:devices:info': '设备详情/信息',
  'open:devices:apps': '设备已安装应用',
  'open:apps:upload': '上传 APK',
  'open:apps:install': '安装 APK 到设备',
  'open:tasks:get': '查询安装任务',
  'open:events:list': '设备自定义事件列表',
  'open:dataiface:query': '数据接口查询',
  'open:dataiface:write': '数据接口事务（写操作）'
}
const scopeLabel = (s) => scopeLabels[s] || s

const { client_id, redirect_uri, scope, state, response_type } = route.query

onMounted(async () => {
  try {
    const res = await getOAuthAuthorizeInfo({ client_id, redirect_uri, scope, state, response_type: response_type || 'code' })
    info.value = res
  } catch (e) {
    error.value = e?.response?.data?.error_description || e?.response?.data?.error || '无效的授权请求'
  } finally {
    loading.value = false
  }
})

const approve = async () => {
  submitting.value = true
  try {
    const res = await postOAuthAuthorizeConsent({
      client_id,
      redirect_uri,
      scopes: info.value.scopes,
      state: info.value.state,
      deny: false
    })
    window.location.href = res.redirect_uri
  } catch (e) {
    error.value = e?.response?.data?.error_description || '授权失败'
  } finally {
    submitting.value = false
  }
}

const deny = async () => {
  submitting.value = true
  try {
    const res = await postOAuthAuthorizeConsent({
      client_id,
      redirect_uri,
      scopes: [],
      state: info.value.state || state,
      deny: true
    })
    window.location.href = res.redirect_uri
  } catch {
    window.history.back()
  } finally {
    submitting.value = false
  }
}
</script>
