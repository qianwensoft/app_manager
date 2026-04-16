<template>
  <el-tabs v-model="tab">
    <el-tab-pane label="数据源" name="src">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openSrc()">新建</el-button>
      </div>
      <el-table :data="sources" border size="small">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="read_only" label="只读" width="70">
          <template #default="{ row }">{{ row.read_only ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="testSrc(row)">测试</el-button>
            <el-button link @click="openSrc(row)">编辑</el-button>
            <el-button link type="danger" @click="delSrc(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
    <el-tab-pane label="数据集" name="ds">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openDs()">新建</el-button>
      </div>
      <el-table :data="datasets" border size="small">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="kind" label="类型" width="100" />
        <el-table-column prop="data_source_id" label="数据源ID" width="100" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link @click="previewDs(row)">预览</el-button>
            <el-button link @click="openDs(row)">编辑</el-button>
            <el-button link type="danger" @click="delDs(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
    <el-tab-pane label="数据接口" name="iface">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openIface()">新建</el-button>
      </div>
      <el-table :data="ifaces" border size="small">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="slug" label="slug" width="160" />
        <el-table-column prop="kind" label="类型" width="100" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link @click="openIface(row)">编辑</el-button>
            <el-button link type="danger" @click="delIface(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
  </el-tabs>

  <el-dialog v-model="dlgSrc" :title="srcForm.id ? '数据源' : '新建数据源'" width="560px">
    <el-form label-width="100px">
      <el-form-item label="名称"><el-input v-model="srcForm.name" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="srcForm.type" style="width: 100%">
          <el-option label="sqlite" value="sqlite" />
          <el-option label="mysql" value="mysql" />
        </el-select>
      </el-form-item>
      <el-form-item label="DSN"><el-input v-model="srcForm.dsn" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="只读"><el-switch v-model="srcForm.read_only" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgSrc = false">取消</el-button>
      <el-button type="primary" @click="saveSrc">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgDs" :title="dsForm.id ? '数据集' : '新建数据集'" width="640px">
    <el-form label-width="100px">
      <el-form-item label="名称"><el-input v-model="dsForm.name" /></el-form-item>
      <el-form-item label="数据源ID"><el-input-number v-model="dsForm.data_source_id" :min="1" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="dsForm.kind" style="width: 100%">
          <el-option label="query" value="query" />
          <el-option label="transaction" value="transaction" />
        </el-select>
      </el-form-item>
      <el-form-item label="定义(SQL)"><el-input v-model="dsForm.definition" type="textarea" :rows="6" /></el-form-item>
      <el-form-item label="事务步骤 JSON" v-if="dsForm.kind === 'transaction'">
        <el-input v-model="dsForm.steps_json" type="textarea" :rows="4" placeholder='["UPDATE ...","INSERT ..."]' />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgDs = false">取消</el-button>
      <el-button type="primary" @click="saveDs">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgIface" :title="ifaceForm.id ? '数据接口' : '新建接口'" width="560px">
    <el-form label-width="100px">
      <el-form-item label="名称"><el-input v-model="ifaceForm.name" /></el-form-item>
      <el-form-item label="slug"><el-input v-model="ifaceForm.slug" /></el-form-item>
      <el-form-item label="分类"><el-input v-model="ifaceForm.category" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="ifaceForm.kind" style="width: 100%">
          <el-option label="query" value="query" />
          <el-option label="transaction" value="transaction" />
        </el-select>
      </el-form-item>
      <el-form-item label="数据集ID"><el-input-number v-model="ifaceForm.dataset_id" :min="1" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgIface = false">取消</el-button>
      <el-button type="primary" @click="saveIface">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/dataStack'

const tab = ref('src')
const sources = ref([])
const datasets = ref([])
const ifaces = ref([])

const dlgSrc = ref(false)
const srcForm = ref({ id: null, name: '', type: 'sqlite', dsn: '', read_only: true })
const dlgDs = ref(false)
const dsForm = ref({ id: null, name: '', data_source_id: null, kind: 'query', definition: 'SELECT 1', steps_json: '[]' })
const dlgIface = ref(false)
const ifaceForm = ref({ id: null, name: '', slug: '', category: 'default', kind: 'query', dataset_id: 1 })

const loadAll = async () => {
  const [a, b, c] = await Promise.all([api.listDataSources(), api.listDatasets(), api.listDataInterfaces()])
  sources.value = a.data || []
  datasets.value = b.data || []
  ifaces.value = c.data || []
}

const openSrc = row => {
  srcForm.value = row
    ? { ...row }
    : { id: null, name: '', type: 'sqlite', dsn: 'file:./data/app-manager.db?mode=ro', read_only: true }
  dlgSrc.value = true
}
const saveSrc = async () => {
  if (srcForm.value.id) await api.updateDataSource(srcForm.value.id, srcForm.value)
  else await api.createDataSource(srcForm.value)
  dlgSrc.value = false
  ElMessage.success('已保存')
  loadAll()
}
const testSrc = async row => {
  try {
    await api.testDataSource(row.id)
    ElMessage.success('连接成功')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '失败')
  }
}
const delSrc = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataSource(row.id)
  loadAll()
}

const openDs = row => {
  dsForm.value = row
    ? { ...row }
    : { id: null, name: '', data_source_id: 1, kind: 'query', definition: 'SELECT 1', steps_json: '[]' }
  dlgDs.value = true
}
const saveDs = async () => {
  if (dsForm.value.id) await api.updateDataset(dsForm.value.id, dsForm.value)
  else await api.createDataset(dsForm.value)
  dlgDs.value = false
  loadAll()
}
const previewDs = async row => {
  const res = await api.previewDataset(row.id, { param_values: '{}', limit: 50 })
  ElMessage.info(String(res.data).slice(0, 200))
}
const delDs = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataset(row.id)
  loadAll()
}

const openIface = row => {
  ifaceForm.value = row
    ? { ...row }
    : { id: null, name: '', slug: 'demo', category: 'default', kind: 'query', dataset_id: 1 }
  dlgIface.value = true
}
const saveIface = async () => {
  if (ifaceForm.value.id) await api.updateDataInterface(ifaceForm.value.id, ifaceForm.value)
  else await api.createDataInterface(ifaceForm.value)
  dlgIface.value = false
  loadAll()
}
const delIface = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataInterface(row.id)
  loadAll()
}

onMounted(loadAll)
</script>

<style scoped>
.tbar {
  margin-bottom: 8px;
}
</style>
