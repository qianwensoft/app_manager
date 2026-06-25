<!--
  数据集动态查询测试页面
  功能：
  - 动态参数输入
  - 分页控制
  - 排序配置
  - 实时查询执行
  - 结果展示
-->
<template>
  <div class="dataset-query-tester">
    <el-card class="query-card">
      <template #header>
        <div class="card-header">
          <span>动态 SQL 查询测试</span>
          <el-button type="primary" @click="executeQuery" :loading="loading">
            <el-icon><Search /></el-icon>
            执行查询
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 参数配置 -->
        <el-tab-pane label="查询参数" name="params">
          <el-alert
            title="提示"
            description="留空的参数将被忽略，对应的查询条件会自动移除"
            type="info"
            :closable="false"
            show-icon
            style="margin-bottom: 16px"
          />

          <el-form :model="queryForm" label-width="120px">
            <el-form-item
              v-for="param in paramSchema"
              :key="param.name"
              :label="param.description || param.name"
            >
              <!-- 字符串类型 -->
              <el-input
                v-if="param.type === 'string' && !param.enum"
                v-model="queryForm.params[param.name]"
                :placeholder="`输入 ${param.name}`"
                clearable
              />

              <!-- 枚举类型 -->
              <el-select
                v-else-if="param.enum"
                v-model="queryForm.params[param.name]"
                :placeholder="`选择 ${param.name}`"
                clearable
              >
                <el-option
                  v-for="item in param.enum"
                  :key="item"
                  :label="item"
                  :value="item"
                />
              </el-select>

              <!-- 数字类型 -->
              <el-input-number
                v-else-if="param.type === 'number' || param.type === 'integer'"
                v-model="queryForm.params[param.name]"
                :placeholder="`输入 ${param.name}`"
                style="width: 100%"
              />

              <!-- 布尔类型 -->
              <el-switch
                v-else-if="param.type === 'boolean'"
                v-model="queryForm.params[param.name]"
              />

              <!-- 日期类型 -->
              <el-date-picker
                v-else-if="param.name.includes('date') || param.name.includes('time')"
                v-model="queryForm.params[param.name]"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />

              <!-- 默认文本输入 -->
              <el-input
                v-else
                v-model="queryForm.params[param.name]"
                :placeholder="`输入 ${param.name}`"
                clearable
              />

              <template #extra>
                <span v-if="param.required" style="color: red">*必填</span>
                <span v-else style="color: #999">可选</span>
              </template>
            </el-form-item>

            <!-- 快速填充示例参数 -->
            <el-form-item>
              <el-button @click="fillMockParams" size="small">
                填充示例参数
              </el-button>
              <el-button @click="clearParams" size="small">
                清空所有参数
              </el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 查询选项 -->
        <el-tab-pane label="查询选项" name="options">
          <el-form :model="queryForm.options" label-width="120px">
            <!-- 分页方式选择 -->
            <el-form-item label="分页方式">
              <el-radio-group v-model="paginationMode">
                <el-radio label="page">页码分页</el-radio>
                <el-radio label="limit">LIMIT/OFFSET</el-radio>
                <el-radio label="none">不分页</el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 页码分页 -->
            <template v-if="paginationMode === 'page'">
              <el-form-item label="页码">
                <el-input-number
                  v-model="queryForm.options.page"
                  :min="1"
                  :max="1000"
                />
              </el-form-item>
              <el-form-item label="每页条数">
                <el-input-number
                  v-model="queryForm.options.page_size"
                  :min="1"
                  :max="5000"
                />
              </el-form-item>
            </template>

            <!-- LIMIT/OFFSET -->
            <template v-if="paginationMode === 'limit'">
              <el-form-item label="LIMIT">
                <el-input-number
                  v-model="queryForm.options.limit"
                  :min="1"
                  :max="5000"
                />
              </el-form-item>
              <el-form-item label="OFFSET">
                <el-input-number
                  v-model="queryForm.options.offset"
                  :min="0"
                />
              </el-form-item>
            </template>

            <!-- 排序方式选择 -->
            <el-form-item label="排序方式">
              <el-radio-group v-model="sortMode">
                <el-radio label="single">单字段排序</el-radio>
                <el-radio label="multi">多字段排序</el-radio>
                <el-radio label="none">不排序</el-radio>
              </el-radio-group>
            </el-form-item>

            <!-- 单字段排序 -->
            <template v-if="sortMode === 'single'">
              <el-form-item label="排序字段">
                <el-select
                  v-model="queryForm.options.order_by"
                  placeholder="选择排序字段"
                  clearable
                  filterable
                >
                  <el-option
                    v-for="field in resultFields"
                    :key="field"
                    :label="field"
                    :value="field"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="排序方向">
                <el-radio-group v-model="queryForm.options.order_dir">
                  <el-radio label="ASC">升序</el-radio>
                  <el-radio label="DESC">降序</el-radio>
                </el-radio-group>
              </el-form-item>
            </template>

            <!-- 多字段排序 -->
            <template v-if="sortMode === 'multi'">
              <el-form-item label="排序规则">
                <div v-for="(order, index) in queryForm.options.multi_order" :key="index" class="multi-order-item">
                  <el-select v-model="order.field" placeholder="字段" style="width: 200px">
                    <el-option
                      v-for="field in resultFields"
                      :key="field"
                      :label="field"
                      :value="field"
                    />
                  </el-select>
                  <el-select v-model="order.dir" style="width: 100px; margin-left: 8px">
                    <el-option label="升序" value="ASC" />
                    <el-option label="降序" value="DESC" />
                  </el-select>
                  <el-button
                    type="danger"
                    :icon="Delete"
                    circle
                    size="small"
                    @click="removeOrder(index)"
                    style="margin-left: 8px"
                  />
                </div>
                <el-button @click="addOrder" size="small" style="margin-top: 8px">
                  <el-icon><Plus /></el-icon>
                  添加排序字段
                </el-button>
              </el-form-item>
            </template>

            <!-- 单条查询 -->
            <el-form-item label="单条查询">
              <el-switch
                v-model="queryForm.options.fetch_one"
                active-text="只返回第一条记录"
              />
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- SQL 预览 -->
        <el-tab-pane label="SQL 预览" name="sql">
          <el-input
            v-model="originalSQL"
            type="textarea"
            :rows="10"
            readonly
            placeholder="原始 SQL"
          />
          <el-divider />
          <el-text type="primary">实际执行的 SQL：</el-text>
          <el-input
            v-model="executedSQL"
            type="textarea"
            :rows="8"
            readonly
            placeholder="执行查询后显示"
          />
          <div v-if="argCount > 0" style="margin-top: 8px">
            <el-tag>参数数量：{{ argCount }}</el-tag>
          </div>
        </el-tab-pane>

        <!-- 查询结果 -->
        <el-tab-pane label="查询结果" name="results">
          <div v-if="results.length > 0">
            <el-table :data="results" border stripe max-height="500">
              <el-table-column
                v-for="field in Object.keys(results[0])"
                :key="field"
                :prop="field"
                :label="field"
                show-overflow-tooltip
                min-width="120"
              />
            </el-table>
            <div style="margin-top: 16px">
              <el-text>共 {{ results.length }} 条记录</el-text>
              <el-text type="info" style="margin-left: 16px">
                耗时：{{ elapsedMs }} ms
              </el-text>
            </div>
          </div>
          <el-empty v-else description="暂无数据" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Delete, Plus } from '@element-plus/icons-vue'
import { debugDataset, getDatasetParamSchema, mockDatasetParams } from '@/api/dataset'

const props = defineProps({
  datasetId: {
    type: [Number, String],
    required: true
  }
})

// 状态
const activeTab = ref('params')
const loading = ref(false)
const paginationMode = ref('page')
const sortMode = ref('single')

// 参数 schema
const paramSchema = ref([])
const resultFields = ref([])

// 查询表单
const queryForm = reactive({
  params: {},
  options: {
    page: 1,
    page_size: 20,
    limit: 100,
    offset: 0,
    order_by: '',
    order_dir: 'DESC',
    multi_order: [],
    fetch_one: false
  }
})

// SQL 和结果
const originalSQL = ref('')
const executedSQL = ref('')
const argCount = ref(0)
const results = ref([])
const elapsedMs = ref(0)

// 监听分页模式切换，清理不用的选项
watch(paginationMode, (newMode) => {
  if (newMode === 'page') {
    delete queryForm.options.limit
    delete queryForm.options.offset
    queryForm.options.page = 1
    queryForm.options.page_size = 20
  } else if (newMode === 'limit') {
    delete queryForm.options.page
    delete queryForm.options.page_size
    queryForm.options.limit = 100
    queryForm.options.offset = 0
  } else {
    delete queryForm.options.page
    delete queryForm.options.page_size
    delete queryForm.options.limit
    delete queryForm.options.offset
  }
})

// 监听排序模式切换
watch(sortMode, (newMode) => {
  if (newMode === 'single') {
    delete queryForm.options.multi_order
    queryForm.options.order_by = ''
    queryForm.options.order_dir = 'DESC'
  } else if (newMode === 'multi') {
    delete queryForm.options.order_by
    delete queryForm.options.order_dir
    queryForm.options.multi_order = []
  } else {
    delete queryForm.options.order_by
    delete queryForm.options.order_dir
    delete queryForm.options.multi_order
  }
})

// 添加排序字段
const addOrder = () => {
  if (!queryForm.options.multi_order) {
    queryForm.options.multi_order = []
  }
  queryForm.options.multi_order.push({ field: '', dir: 'ASC' })
}

// 移除排序字段
const removeOrder = (index) => {
  queryForm.options.multi_order.splice(index, 1)
}

// 加载参数 schema
const loadParamSchema = async () => {
  try {
    const { data } = await getDatasetParamSchema(props.datasetId)
    paramSchema.value = data.params || []
    resultFields.value = data.result_fields || []

    // 初始化参数对象
    paramSchema.value.forEach(param => {
      queryForm.params[param.name] = null
    })
  } catch (error) {
    ElMessage.error('加载参数 schema 失败')
  }
}

// 填充示例参数
const fillMockParams = async () => {
  try {
    const { data } = await mockDatasetParams(props.datasetId)
    queryForm.params = { ...data.param_values }
    ElMessage.success('已填充示例参数')
  } catch (error) {
    ElMessage.error('填充示例参数失败')
  }
}

// 清空参数
const clearParams = () => {
  Object.keys(queryForm.params).forEach(key => {
    queryForm.params[key] = null
  })
  ElMessage.info('已清空所有参数')
}

// 执行查询
const executeQuery = async () => {
  loading.value = true
  try {
    // 过滤掉空值参数
    const params = Object.fromEntries(
      Object.entries(queryForm.params).filter(([k, v]) => {
        return v !== null && v !== undefined && v !== ''
      })
    )

    // 构建查询选项
    const options = { ...queryForm.options }
    if (queryForm.options.fetch_one) {
      // 单条查询时，清除分页选项
      delete options.page
      delete options.page_size
      delete options.limit
      delete options.offset
    }

    const { data } = await debugDataset(props.datasetId, {
      param_values: params,
      query_options: options
    })

    // 解析结果
    results.value = JSON.parse(data.data)
    executedSQL.value = data.sql
    argCount.value = data.arg_count || 0
    elapsedMs.value = data.elapsed_ms || 0

    ElMessage.success(`查询成功，返回 ${results.value.length} 条记录`)
    activeTab.value = 'results'
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '查询失败')
    executedSQL.value = error.response?.data?.sql || ''
  } finally {
    loading.value = false
  }
}

// 初始化
onMounted(() => {
  loadParamSchema()
})
</script>

<style scoped>
.dataset-query-tester {
  padding: 20px;
}

.query-card {
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.multi-order-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
</style>
