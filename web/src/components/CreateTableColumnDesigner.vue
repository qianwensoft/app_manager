<template>
  <div class="create-table-designer">
    <div class="row-head">
      <span class="lbl">新表名</span>
      <el-input
        v-model="tableName"
        placeholder="字母数字下划线，如 orders（与后端表名校验一致）"
        maxlength="64"
        show-word-limit
        style="max-width: 320px"
      />
    </div>
    <el-table :data="columns" border size="small" class="col-table" empty-text="点击下方添加字段" max-height="400">
      <el-table-column label="#" width="48" align="center">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column label="字段名" min-width="120">
        <template #default="{ row }">
          <el-input v-model="row.name" placeholder="name" />
        </template>
      </el-table-column>
      <el-table-column label="类型" min-width="200">
        <template #default="{ row }">
          <el-select
            v-model="row.sqlType"
            filterable
            allow-create
            default-first-option
            style="width: 100%"
            placeholder="选择或输入"
          >
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="非空" width="64" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.notNull" />
        </template>
      </el-table-column>
      <el-table-column label="主键" width="64" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.primaryKey" />
        </template>
      </el-table-column>
      <el-table-column label="自增" width="64" align="center">
        <template #default="{ row }">
          <el-checkbox v-model="row.autoIncrement" :disabled="!row.primaryKey" />
        </template>
      </el-table-column>
      <el-table-column label="默认值" min-width="120">
        <template #default="{ row }">
          <el-input v-model="row.defaultExpr" placeholder="可选，如 0 或 CURRENT_TIMESTAMP" />
        </template>
      </el-table-column>
      <el-table-column label="顺序 / 操作" width="168" fixed="right" align="center">
        <template #default="{ $index }">
          <el-button link :disabled="$index === 0" @click="move($index, -1)">上移</el-button>
          <el-button link :disabled="$index === columns.length - 1" @click="move($index, 1)">下移</el-button>
          <el-button link type="danger" @click="remove($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button size="small" type="primary" plain style="margin-top: 8px" @click="addRow">添加字段</el-button>
    <p class="hint">表格变更会自动生成下方 DDL；也可开启「手动编辑 DDL」直接改语句。</p>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { buildCreateTableDDL, nextColumnUid, suggestedSqlTypes } from '@/utils/createTableDdl.js'

const props = defineProps({
  dialect: { type: String, default: 'sqlite' }
})

const tableName = defineModel('tableName', { type: String, default: '' })
const columns = defineModel('columns', { type: Array, default: () => [] })

const emit = defineEmits(['update:ddl'])

const typeOptions = computed(() => suggestedSqlTypes(props.dialect))

function move (index, delta) {
  const j = index + delta
  const list = columns.value
  if (j < 0 || j >= list.length) return
  const copy = [...list]
  const t = copy[index]
  copy[index] = copy[j]
  copy[j] = t
  columns.value = copy
}

function remove (index) {
  columns.value = columns.value.filter((_, i) => i !== index)
}

function addRow () {
  columns.value = [
    ...columns.value,
    {
      id: nextColumnUid(),
      name: 'col_' + columns.value.length,
      sqlType: 'TEXT',
      notNull: false,
      primaryKey: false,
      autoIncrement: false,
      defaultExpr: ''
    }
  ]
}

watch(
  () => [props.dialect, tableName.value, columns.value],
  () => {
    const sql = buildCreateTableDDL(props.dialect, tableName.value, columns.value)
    emit('update:ddl', sql)
  },
  { deep: true, immediate: true }
)
</script>

<style scoped>
.row-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.lbl {
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}
.col-table {
  width: 100%;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.45;
}
</style>
