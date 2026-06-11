<template>
  <div class="param-schema-editor">
    <div class="param-list">
      <div v-for="(param, index) in params" :key="index" class="param-row">
        <el-input
          v-model="param.name"
          placeholder="参数名（如：employee_id）"
          size="small"
          style="width: 180px"
          @input="emitChange"
        />
        <el-select
          v-model="param.type"
          placeholder="类型"
          size="small"
          style="width: 120px"
          @change="emitChange"
        >
          <el-option label="字符串 (string)" value="string" />
          <el-option label="数字 (number)" value="number" />
          <el-option label="整数 (integer)" value="integer" />
          <el-option label="布尔 (boolean)" value="boolean" />
          <el-option label="对象 (object)" value="object" />
          <el-option label="数组 (array)" value="array" />
        </el-select>
        <el-input
          v-model="param.description"
          placeholder="说明"
          size="small"
          style="flex: 1"
          @input="emitChange"
        />
        <el-checkbox
          v-model="param.required"
          size="small"
          @change="emitChange"
        >
          必填
        </el-checkbox>
        <el-button
          type="danger"
          size="small"
          :icon="Delete"
          circle
          @click="removeParam(index)"
        />
      </div>
    </div>

    <el-button
      type="primary"
      size="small"
      :icon="Plus"
      @click="addParam"
      style="margin-top: 8px"
    >
      添加参数
    </el-button>

    <div v-if="params.length > 0" class="schema-preview">
      <div class="preview-title">生成的 JSON Schema：</div>
      <pre class="preview-code">{{ generatedSchema }}</pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

// 参数列表
const params = ref([])

// 初始化：从 JSON Schema 解析
watch(() => props.modelValue, (newVal) => {
  if (!newVal) {
    params.value = []
    return
  }
  try {
    const schema = JSON.parse(newVal)
    if (schema.type === 'object' && schema.properties) {
      params.value = Object.keys(schema.properties).map(key => {
        const prop = schema.properties[key]
        return {
          name: key,
          type: prop.type || 'string',
          description: prop.description || '',
          required: schema.required?.includes(key) || false
        }
      })
    }
  } catch {
    // 解析失败，保持空列表
    params.value = []
  }
}, { immediate: true })

// 生成 JSON Schema
const generatedSchema = computed(() => {
  if (params.value.length === 0) {
    return ''
  }

  const properties = {}
  const required = []

  params.value.forEach(param => {
    if (!param.name) return

    properties[param.name] = {
      type: param.type,
      description: param.description || undefined
    }

    if (param.required) {
      required.push(param.name)
    }
  })

  const schema = {
    type: 'object',
    properties
  }

  if (required.length > 0) {
    schema.required = required
  }

  return JSON.stringify(schema, null, 2)
})

function addParam() {
  params.value.push({
    name: '',
    type: 'string',
    description: '',
    required: false
  })
}

function removeParam(index) {
  params.value.splice(index, 1)
  emitChange()
}

function emitChange() {
  emit('update:modelValue', generatedSchema.value)
}
</script>

<style scoped>
.param-schema-editor {
  width: 100%;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
}

.schema-preview {
  margin-top: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.preview-title {
  font-size: 12px;
  color: #606266;
  margin-bottom: 8px;
  font-weight: 600;
}

.preview-code {
  margin: 0;
  padding: 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  overflow: auto;
  max-height: 200px;
}
</style>
