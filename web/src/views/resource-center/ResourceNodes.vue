<template>
  <div class="rc-nodes">
    <div class="rc-left">
      <div class="rc-toolbar">
        <b>资源节点树</b>
        <div>
          <el-button size="small" type="primary" @click="openCreate(null)">新建根节点</el-button>
          <el-button size="small" @click="load">刷新</el-button>
          <el-button size="small" @click="openPortal">前台预览 ↗</el-button>
        </div>
      </div>
      <el-tree
        ref="treeRef"
        :data="tree"
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        default-expand-all
        highlight-current
        @node-click="onNodeClick"
      >
        <template #default="{ data }">
          <span class="rc-tree-node">
            <span>
              <el-tag size="small" :type="nodeTagType(data.node_type)" disable-transitions>
                {{ nodeTypeLabel(data.node_type) }}
              </el-tag>
              <span class="rc-tree-name">{{ data.name }}</span>
            </span>
            <span class="rc-tree-ops">
              <el-button link size="small" type="primary" @click.stop="openCreate(data)">加子节点</el-button>
              <el-button link size="small" @click.stop="openEdit(data)">编辑</el-button>
              <el-button link size="small" type="danger" @click.stop="remove(data)">删</el-button>
            </span>
          </span>
        </template>
      </el-tree>
    </div>

    <div class="rc-right">
      <el-empty v-if="!editing" description="从左侧选择或新建一个节点进行配置" />
      <el-form v-else :model="form" label-width="96px" class="rc-form">
        <div class="rc-form-title">{{ form.id ? '编辑节点' : '新建节点' }}</div>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="节点名称" />
        </el-form-item>
        <el-form-item label="上级节点">
          <el-tree-select
            v-model="form.parent_id"
            :data="treeSelectData"
            :props="{ label: 'name', children: 'children', value: 'id' }"
            check-strictly
            clearable
            placeholder="（根节点）"
            node-key="id"
            style="width:100%"
          />
        </el-form-item>
        <el-form-item label="节点类型" required>
          <el-radio-group v-model="form.node_type">
            <el-radio-button label="group">分组</el-radio-button>
            <el-radio-button label="device_mgmt">设备管理</el-radio-button>
            <el-radio-button label="workorder_mgmt">工单管理</el-radio-button>
            <el-radio-button label="scada">组态预览</el-radio-button>
            <el-radio-button label="form_app">表单应用</el-radio-button>
            <el-radio-button label="link">自定义链接</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="图标">
          <el-select
            v-model="form.icon"
            filterable
            allow-create
            clearable
            default-first-option
            placeholder="选择或输入 Element Plus 图标名，如 Monitor"
            style="width:100%"
          >
            <template v-if="form.icon" #prefix>
              <el-icon v-if="iconComp(form.icon)"><component :is="iconComp(form.icon)" /></el-icon>
            </template>
            <el-option v-for="name in iconOptions" :key="name" :label="name" :value="name">
              <span class="rc-icon-opt">
                <el-icon><component :is="iconComp(name)" /></el-icon>
                <span>{{ name }}</span>
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>

        <!-- 设备管理配置 -->
        <template v-if="form.node_type === 'device_mgmt'">
          <el-divider content-position="left">设备范围</el-divider>
          <el-form-item label="设备分组">
            <el-tree-select
              v-model="form.cfg.group_ids"
              :data="deviceGroupTree"
              :props="{ label: 'name', children: 'children', value: 'id' }"
              multiple
              check-strictly
              clearable
              placeholder="选择一个或多个设备分组"
              node-key="id"
              style="width:100%"
            />
          </el-form-item>
          <el-form-item label="指定设备">
            <el-select
              v-model="form.cfg.device_ids"
              multiple
              filterable
              clearable
              placeholder="可另外指定具体设备"
              style="width:100%"
            >
              <el-option
                v-for="d in devices"
                :key="d.id"
                :label="`${d.name || d.serial || ('#' + d.id)} (#${d.id})`"
                :value="d.id"
              />
            </el-select>
          </el-form-item>
          <el-divider content-position="left">设备详情操作权限</el-divider>
          <el-form-item label="可执行操作">
            <el-checkbox-group v-model="form.cfg.detail_perms">
              <el-checkbox
                v-for="p in devicePerms"
                :key="p"
                :label="p"
                border
                style="margin:4px 8px 4px 0"
              >{{ permLabel(p) }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </template>

        <!-- 工单管理配置 -->
        <template v-else-if="form.node_type === 'workorder_mgmt'">
          <el-divider content-position="left">工单类型范围</el-divider>
          <el-form-item label="工单类型">
            <el-select
              v-model="form.cfg.type_codes"
              multiple
              filterable
              clearable
              placeholder="留空表示全部类型"
              style="width:100%"
            >
              <el-option
                v-for="t in woTypes"
                :key="t.code"
                :label="`${t.name} (${t.code})`"
                :value="t.code"
              />
            </el-select>
          </el-form-item>
          <el-divider content-position="left">工单详情操作权限</el-divider>
          <el-form-item label="可执行操作">
            <el-checkbox-group v-model="form.cfg.detail_perms">
              <el-checkbox
                v-for="p in workorderPerms"
                :key="p"
                :label="p"
                border
                style="margin:4px 8px 4px 0"
              >{{ permLabel(p) }}</el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </template>

        <!-- 组态预览配置 -->
        <template v-else-if="form.node_type === 'scada'">
          <el-divider content-position="left">组态选择</el-divider>
          <el-form-item label="组态项目">
            <el-select
              v-model="form.cfg.scada_id"
              filterable
              clearable
              placeholder="选择一个组态项目"
              style="width:100%"
              @change="onScadaChange"
            >
              <el-option
                v-for="s in scadaInfos"
                :key="s.id"
                :label="`${s.scada_name} (${s.scada_code})`"
                :value="s.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="打开方式">
            <el-radio-group v-model="form.cfg.open_mode">
              <el-radio label="iframe">内嵌（默认）</el-radio>
              <el-radio label="blank">新标签页</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <!-- 表单应用配置 -->
        <template v-else-if="form.node_type === 'form_app'">
          <el-divider content-position="left">表单选择</el-divider>
          <el-form-item label="表单应用">
            <el-select
              v-model="form.cfg.form_code"
              filterable
              clearable
              placeholder="选择一个表单应用"
              style="width:100%"
            >
              <el-option
                v-for="f in formApps"
                :key="f.code"
                :label="`${f.name} (${f.code})`"
                :value="f.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="打开方式">
            <el-radio-group v-model="form.cfg.open_mode">
              <el-radio label="iframe">内嵌（默认）</el-radio>
              <el-radio label="blank">新标签页</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <!-- 自定义链接配置 -->
        <template v-else-if="form.node_type === 'link'">
          <el-divider content-position="left">链接地址</el-divider>
          <el-form-item label="URL">
            <el-input v-model="form.cfg.url" placeholder="https://example.com" />
          </el-form-item>
          <el-form-item label="打开方式">
            <el-radio-group v-model="form.cfg.open_mode">
              <el-radio label="iframe">内嵌（默认）</el-radio>
              <el-radio label="blank">新标签页</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          <el-button @click="editing = false">取消</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as ElIcons from '@element-plus/icons-vue'
import {
  getResourceNodes, createResourceNode, updateResourceNode, deleteResourceNode,
  getResourcePermCatalog, getDeviceGroupsTree, getAllDevices, getWorkOrderTypesForConfig,
  getScadaInfosForConfig, getFormAppsForConfig
} from '@/api/resourceCenter'

// 常用图标（下拉候选）；用户也可直接手动录入任意 Element Plus 图标名。
const iconOptions = [
  'Folder', 'FolderOpened', 'Menu', 'Grid', 'Monitor', 'Phone', 'Cellphone', 'Iphone',
  'Tickets', 'Document', 'Files', 'Notebook', 'List', 'Histogram', 'DataLine', 'DataAnalysis',
  'PieChart', 'TrendCharts', 'Odometer', 'Cpu', 'Platform', 'EditPen', 'Edit', 'Link',
  'Connection', 'Share', 'Setting', 'Tools', 'Box', 'Goods', 'Location', 'MapLocation',
  'Bell', 'Warning', 'InfoFilled', 'Star', 'Compass', 'View', 'Camera', 'VideoCamera',
  'Key', 'Lock', 'User', 'UserFilled', 'OfficeBuilding', 'HomeFilled'
]
// 将图标名解析为组件（供预览 / 下拉展示）；无效名返回 null。
const iconComp = (name) => (name && ElIcons[name]) || null

const tree = ref([])
const treeRef = ref(null)
const editing = ref(false)
const saving = ref(false)

const devicePerms = ref([])
const workorderPerms = ref([])
const deviceGroupTree = ref([])
const devices = ref([])
const woTypes = ref([])
const scadaInfos = ref([])
const formApps = ref([])

// 权限键中文标签（前端展示用；键与后端 auth.ResourceDevicePerms/ResourceWorkOrderPerms 对应）。
const PERM_LABELS = {
  adb: 'ADB 操作', install_apk: 'APK 拉取/导出', wireless_adb: '无线 ADB',
  trigger_menu: '触发菜单', push_update: '推送更新', speed_test: '测速',
  record: '音频录制', file: '文件浏览/下载',
  edit_fields: '编辑字段', change_status: '变更状态', assign: '指派', delete: '删除'
}
const permLabel = (p) => PERM_LABELS[p] || p

const NODE_TYPE_LABELS = { group: '分组', device_mgmt: '设备管理', workorder_mgmt: '工单管理', scada: '组态预览', form_app: '表单应用', link: '自定义链接' }
const nodeTypeLabel = (t) => NODE_TYPE_LABELS[t] || t
const nodeTagType = (t) => ({ group: 'info', device_mgmt: 'primary', workorder_mgmt: 'success', scada: 'warning', form_app: '', link: 'danger' }[t] || '')

const emptyForm = () => ({
  id: null, parent_id: null, name: '', node_type: 'group', icon: '', sort_order: 0,
  cfg: {
    group_ids: [], device_ids: [], type_codes: [], detail_perms: [],
    scada_id: null, scada_code: '', form_code: '', url: '', open_mode: 'iframe'
  }
})
const form = ref(emptyForm())

// 上级节点选择：编辑时禁止选择本节点及其所有子孙（避免形成环 / 自挂子树）。
const treeSelectData = computed(() => {
  const selfId = form.value.id
  const cloneMark = (nodes, disabledBranch) => nodes.map((n) => {
    const disabled = disabledBranch || n.id === selfId
    return {
      ...n,
      disabled,
      children: n.children ? cloneMark(n.children, disabled) : []
    }
  })
  return cloneMark(tree.value, false)
})

const load = async () => {
  const res = await getResourceNodes()
  tree.value = res.data || []
}

const loadAux = async () => {
  try {
    const cat = await getResourcePermCatalog()
    devicePerms.value = cat.device_perms || []
    workorderPerms.value = cat.workorder_perms || []
  } catch { /* ignore */ }
  try { deviceGroupTree.value = (await getDeviceGroupsTree()).data || [] } catch { deviceGroupTree.value = [] }
  try { devices.value = (await getAllDevices()).data || [] } catch { devices.value = [] }
  try { woTypes.value = (await getWorkOrderTypesForConfig()).data || [] } catch { woTypes.value = [] }
  try { scadaInfos.value = (await getScadaInfosForConfig()).data || [] } catch { scadaInfos.value = [] }
  try { formApps.value = (await getFormAppsForConfig()).data || [] } catch { formApps.value = [] }
}

const onNodeClick = (data) => openEdit(data)

// 打开前台资源中心（新标签页），便于配置后就地验收效果。
const openPortal = () => {
  window.open(`${window.location.origin}/portal`, '_blank')
}

// scada 选择变更时同步 scada_code（用于 Agent 菜单目录兼容）
const onScadaChange = (id) => {
  const scada = scadaInfos.value.find(s => s.id === id)
  form.value.cfg.scada_code = scada ? scada.scada_code : ''
}

const openCreate = (parent) => {
  form.value = emptyForm()
  form.value.parent_id = parent ? parent.id : null
  editing.value = true
}

// 把节点的 config_json 解析进 form.cfg。
const parseConfig = (node) => {
  const cfg = {
    group_ids: [], device_ids: [], type_codes: [], detail_perms: [],
    scada_id: null, scada_code: '', form_code: '', url: '', open_mode: 'iframe'
  }
  if (node.config_json) {
    try {
      const c = JSON.parse(node.config_json)
      cfg.group_ids = c.group_ids || []
      cfg.device_ids = c.device_ids || []
      cfg.type_codes = c.type_codes || []
      cfg.detail_perms = c.detail_perms || []
      cfg.scada_id = c.scada_id || null
      cfg.scada_code = c.scada_code || ''
      cfg.form_code = c.form_code || ''
      cfg.url = c.url || ''
      cfg.open_mode = c.open_mode || 'iframe'
    } catch { /* ignore malformed */ }
  }
  return cfg
}

const openEdit = (node) => {
  form.value = {
    id: node.id,
    parent_id: node.parent_id ?? null,
    name: node.name,
    node_type: node.node_type || 'group',
    icon: node.icon || '',
    sort_order: node.sort_order || 0,
    cfg: parseConfig(node)
  }
  editing.value = true
}

// 根据节点类型构造 config_json（只保留该类型相关字段）。
const buildConfigJSON = () => {
  const t = form.value.node_type
  if (t === 'device_mgmt') {
    return JSON.stringify({
      group_ids: form.value.cfg.group_ids || [],
      device_ids: form.value.cfg.device_ids || [],
      detail_perms: form.value.cfg.detail_perms || []
    })
  }
  if (t === 'workorder_mgmt') {
    return JSON.stringify({
      type_codes: form.value.cfg.type_codes || [],
      detail_perms: form.value.cfg.detail_perms || []
    })
  }
  if (t === 'scada') {
    return JSON.stringify({
      scada_id: form.value.cfg.scada_id || null,
      scada_code: form.value.cfg.scada_code || '',
      open_mode: form.value.cfg.open_mode || 'iframe'
    })
  }
  if (t === 'form_app') {
    return JSON.stringify({
      form_code: form.value.cfg.form_code || '',
      open_mode: form.value.cfg.open_mode || 'iframe'
    })
  }
  if (t === 'link') {
    return JSON.stringify({
      url: form.value.cfg.url || '',
      open_mode: form.value.cfg.open_mode || 'iframe'
    })
  }
  return ''
}

const save = async () => {
  if (!form.value.name?.trim()) { ElMessage.warning('请填写节点名称'); return }
  saving.value = true
  try {
    const payload = {
      parent_id: form.value.parent_id ?? null,
      name: form.value.name.trim(),
      node_type: form.value.node_type,
      icon: form.value.icon,
      sort_order: form.value.sort_order,
      config_json: buildConfigJSON()
    }
    if (form.value.id) {
      await updateResourceNode(form.value.id, payload)
      ElMessage.success('已更新')
    } else {
      await createResourceNode(payload)
      ElMessage.success('已创建')
    }
    editing.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  } finally {
    saving.value = false
  }
}

const remove = async (node) => {
  try {
    await ElMessageBox.confirm(`确认删除节点「${node.name}」及其所有子节点？`, '删除确认', { type: 'warning' })
  } catch { return }
  try {
    await deleteResourceNode(node.id)
    ElMessage.success('已删除')
    if (form.value.id === node.id) editing.value = false
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '删除失败')
  }
}

onMounted(async () => {
  await Promise.all([load(), loadAux()])
})
</script>

<style scoped>
.rc-nodes { display: flex; gap: 16px; align-items: flex-start; }
.rc-left { width: 46%; min-width: 380px; border-right: 1px solid #ebeef5; padding-right: 16px; }
.rc-right { flex: 1; min-width: 0; }
.rc-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rc-tree-node { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 8px; }
.rc-tree-name { margin-left: 6px; }
.rc-tree-ops { opacity: 0; transition: opacity .15s; }
.rc-tree-node:hover .rc-tree-ops { opacity: 1; }
.rc-form { max-width: 640px; }
.rc-form-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #303133; }
.rc-icon-opt { display: inline-flex; align-items: center; gap: 8px; }
</style>
