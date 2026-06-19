<template>
  <div class="wo-settings">
    <div class="toolbar">
      <el-page-header content="工单设置" @back="$router.push('/work-orders')" />
    </div>

    <el-tabs v-model="activeTab" class="settings-tabs" @tab-change="onTabChange">
      <el-tab-pane label="工单类型" name="types">
        <WorkOrderTypes v-if="loaded.types" embedded />
      </el-tab-pane>
      <el-tab-pane label="工单标签" name="tags">
        <WorkOrderTags v-if="loaded.tags" embedded />
      </el-tab-pane>
      <el-tab-pane label="外发配置" name="webhooks">
        <WorkOrderWebhooks v-if="loaded.webhooks" embedded />
      </el-tab-pane>
      <el-tab-pane label="工作流" name="workflows">
        <div v-if="loaded.workflows" style="padding:16px">
          <el-alert type="info" :closable="false" style="margin-bottom:16px">
            工作流可监听工单创建/更新/关闭等事件，自动执行调用接口、执行 JS、更新/创建工单等动作。
          </el-alert>
          <el-button type="primary" @click="$router.push('/work-orders/workflows')">
            管理工作流
          </el-button>
          <el-button @click="$router.push('/work-orders/workflow-logs')">
            查看执行日志
          </el-button>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import WorkOrderTypes from './WorkOrderTypes.vue'
import WorkOrderTags from './WorkOrderTags.vue'
import WorkOrderWebhooks from './WorkOrderWebhooks.vue'

const route = useRoute()
const router = useRouter()

const validTabs = ['types', 'tags', 'webhooks', 'workflows']
const activeTab = ref('types')
// 懒加载各面板：切到哪个才挂载哪个，避免一次性发起三套请求。
const loaded = reactive({ types: false, tags: false, webhooks: false, workflows: false })

const onTabChange = (name) => {
  loaded[name] = true
  router.replace({ query: { ...route.query, tab: name } }).catch(() => {})
}

onMounted(() => {
  const tab = String(route.query.tab || '')
  activeTab.value = validTabs.includes(tab) ? tab : 'types'
  loaded[activeTab.value] = true
})
</script>

<style scoped>
.wo-settings { padding: 4px; }
.toolbar { display: flex; align-items: center; margin-bottom: 12px; }
.settings-tabs :deep(.el-tabs__content) { overflow: visible; }
</style>
