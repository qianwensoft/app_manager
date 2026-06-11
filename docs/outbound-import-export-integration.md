# 外部应用导出导入 - 快速集成指南

## 集成步骤

### 1. 后端路由注册

在路由文件中添加导出导入的路由：

```go
// server/router.go 或相应的路由文件

// 外部应用导出导入
r.GET("/outbound/apps/:id/export", api.ExportOutboundApp)
r.POST("/outbound/apps/import", api.ImportOutboundApp)
r.POST("/outbound/apps/import/validate", api.ValidateImportData)
```

### 2. 前端集成

#### 在外部应用详情页集成

**文件**: `web/src/views/OutboundAppDetail.vue`

```vue
<template>
  <div class="outbound-app-detail">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2>{{ app.name }}</h2>
      <div class="actions">
        <!-- 现有按钮 -->
        <el-button @click="handleEdit">编辑</el-button>
        <el-button @click="handleClone">克隆</el-button>
        
        <!-- 新增：导出导入按钮 -->
        <el-button @click="handleExport">
          <el-icon><Download /></el-icon>
          导出配置
        </el-button>
        <el-button @click="handleImport">
          <el-icon><Upload /></el-icon>
          导入配置
        </el-button>
      </div>
    </div>

    <!-- 现有内容 -->
    <!-- ... -->

    <!-- 导出导入组件 -->
    <OutboundImportExport
      ref="importExportRef"
      :current-app="app"
      @import-success="handleImportSuccess"
      @export-success="handleExportSuccess"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Download, Upload } from '@element-plus/icons-vue'
import OutboundImportExport from '@/components/OutboundImportExport.vue'
import { ElMessage } from 'element-plus'

const app = ref({})
const importExportRef = ref(null)

// 导出配置
function handleExport() {
  importExportRef.value?.showExportDialog()
}

// 导入配置
function handleImport() {
  importExportRef.value?.showImportDialog()
}

// 导入成功回调
function handleImportSuccess(data) {
  ElMessage.success('导入成功')
  // 刷新页面或重新加载数据
  loadAppData()
}

// 导出成功回调
function handleExportSuccess() {
  ElMessage.success('配置已导出')
}
</script>
```

#### 在外部应用列表页集成

**文件**: `web/src/views/OutboundApps.vue`

```vue
<template>
  <div class="outbound-apps">
    <!-- 页面头部 -->
    <div class="page-header">
      <h2>外部应用</h2>
      <div class="actions">
        <el-button type="primary" @click="handleCreate">
          新建应用
        </el-button>
        
        <!-- 新增：批量导入按钮 -->
        <el-button @click="handleImport">
          <el-icon><Upload /></el-icon>
          导入应用
        </el-button>
      </div>
    </div>

    <!-- 应用列表 -->
    <el-table :data="apps">
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="app_code" label="编码" />
      <el-table-column label="操作" width="300">
        <template #default="{ row }">
          <el-button size="small" @click="handleView(row)">
            查看
          </el-button>
          <el-button size="small" @click="handleEdit(row)">
            编辑
          </el-button>
          
          <!-- 新增：导出按钮 -->
          <el-button
            size="small"
            @click="handleExportApp(row)"
          >
            <el-icon><Download /></el-icon>
            导出
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 导出导入组件 -->
    <OutboundImportExport
      ref="importExportRef"
      :current-app="selectedApp"
      @import-success="handleImportSuccess"
      @export-success="handleExportSuccess"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Download, Upload } from '@element-plus/icons-vue'
import OutboundImportExport from '@/components/OutboundImportExport.vue'
import { ElMessage } from 'element-plus'

const apps = ref([])
const selectedApp = ref({})
const importExportRef = ref(null)

// 导出指定应用
function handleExportApp(app) {
  selectedApp.value = app
  importExportRef.value?.showExportDialog()
}

// 导入应用
function handleImport() {
  selectedApp.value = {} // 清空选中的应用
  importExportRef.value?.showImportDialog()
}

// 导入成功回调
function handleImportSuccess(data) {
  ElMessage.success('导入成功')
  loadApps() // 重新加载应用列表
}

// 导出成功回调
function handleExportSuccess() {
  ElMessage.success('配置已导出')
}
</script>
```

---

## 3. 完整示例

### 单页应用集成示例

```vue
<template>
  <el-card>
    <template #header>
      <div class="card-header">
        <span>外部应用: {{ app.name }}</span>
        <div>
          <el-button type="primary" @click="showExport">
            <el-icon><Download /></el-icon>
            导出
          </el-button>
          <el-button @click="showImport">
            <el-icon><Upload /></el-icon>
            导入
          </el-button>
        </div>
      </div>
    </template>

    <!-- 应用信息 -->
    <el-descriptions :column="2" border>
      <el-descriptions-item label="应用编码">
        {{ app.app_code }}
      </el-descriptions-item>
      <el-descriptions-item label="Base URL">
        {{ app.base_url }}
      </el-descriptions-item>
      <el-descriptions-item label="认证类型">
        {{ app.auth_type }}
      </el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="app.enabled ? 'success' : 'info'">
          {{ app.enabled ? '启用' : '禁用' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <!-- 连接器列表 -->
    <el-divider content-position="left">连接器</el-divider>
    <el-table :data="app.connectors" border>
      <el-table-column prop="name" label="名称" />
      <el-table-column prop="connector_type" label="类型" />
      <el-table-column prop="method" label="方法" />
    </el-table>

    <!-- 导出导入组件 -->
    <OutboundImportExport
      ref="importExportRef"
      :current-app="app"
      @import-success="onImportSuccess"
      @export-success="onExportSuccess"
    />
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, Upload } from '@element-plus/icons-vue'
import OutboundImportExport from '@/components/OutboundImportExport.vue'
import * as api from '@/api/outbound'

const route = useRoute()
const router = useRouter()

const app = ref({
  id: null,
  name: '',
  app_code: '',
  base_url: '',
  auth_type: '',
  enabled: false,
  connectors: []
})

const importExportRef = ref(null)

onMounted(() => {
  loadApp()
})

async function loadApp() {
  const { data } = await api.getOutboundApp(route.params.id)
  app.value = data
}

function showExport() {
  importExportRef.value?.showExportDialog()
}

function showImport() {
  importExportRef.value?.showImportDialog()
}

function onImportSuccess(result) {
  ElMessage.success('导入成功')
  if (result.is_update) {
    // 更新模式：重新加载当前应用
    loadApp()
  } else {
    // 新建模式：跳转到新应用
    router.push(`/outbound/apps/${result.app_id}`)
  }
}

function onExportSuccess() {
  ElMessage.success('配置已导出到文件')
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
```

---

## 4. 权限控制

### 后端权限检查

```go
// server/api/outbound_import_export.go

func ExportOutboundApp(c *gin.Context) {
	// 检查权限
	if !hasPermission(c, "outbound:export") {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限导出"})
		return
	}
	
	// ... 导出逻辑
}

func ImportOutboundApp(c *gin.Context) {
	// 检查权限
	if !hasPermission(c, "outbound:import") {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限导入"})
		return
	}
	
	// ... 导入逻辑
}
```

### 前端权限控制

```vue
<template>
  <div>
    <!-- 根据权限显示按钮 -->
    <el-button
      v-if="hasPermission('outbound:export')"
      @click="handleExport"
    >
      导出
    </el-button>
    
    <el-button
      v-if="hasPermission('outbound:import')"
      @click="handleImport"
    >
      导入
    </el-button>
  </div>
</template>

<script setup>
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

function hasPermission(permission) {
  return userStore.permissions.includes(permission)
}
</script>
```

---

## 5. 测试验证

### 后端测试

```bash
# 测试导出
curl -X GET "http://localhost:8080/api/outbound/apps/1/export?include_secrets=false" \
  -H "Authorization: Bearer {token}" \
  -o export.json

# 测试验证
curl -X POST "http://localhost:8080/api/outbound/apps/import/validate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d @export.json

# 测试导入
curl -X POST "http://localhost:8080/api/outbound/apps/import" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d @export.json
```

### 前端测试

1. **测试导出**
   - 打开外部应用详情页
   - 点击"导出配置"按钮
   - 配置导出选项
   - 点击"导出"
   - 验证文件是否下载成功
   - 打开 JSON 文件验证内容

2. **测试导入**
   - 点击"导入配置"按钮
   - 上传导出的 JSON 文件
   - 验证文件信息显示正确
   - 点击"下一步"验证配置
   - 配置导入选项
   - 确认导入
   - 验证导入结果

---

## 6. 故障排查

### 导出失败

**检查点**:
1. 应用是否存在
2. 用户是否有导出权限
3. 数据库连接是否正常
4. 关联数据是否完整

**调试**:
```javascript
// 在浏览器控制台
console.log('Exporting app:', appId)
api.exportOutboundApp(appId, false)
  .then(res => console.log('Export success:', res))
  .catch(err => console.error('Export failed:', err))
```

### 导入失败

**检查点**:
1. JSON 格式是否正确
2. 必填字段是否完整
3. 编码是否冲突
4. 权限是否足够

**调试**:
```javascript
// 验证导入数据
api.validateImportData(importData)
  .then(res => console.log('Validation result:', res))
  .catch(err => console.error('Validation failed:', err))
```

---

## 7. 部署注意事项

### 生产环境配置

1. **文件大小限制**

```go
// server/main.go
router := gin.Default()
router.MaxMultipartMemory = 10 << 20 // 10 MB
```

2. **超时配置**

```go
// server/api/outbound_import_export.go
const (
	ExportTimeout = 30 * time.Second
	ImportTimeout = 60 * time.Second
)
```

3. **日志记录**

```go
// 记录导出导入操作
log.Info("Export app", "app_id", appID, "user", username)
log.Info("Import app", "app_code", appCode, "user", username)
```

---

## 🎊 总结

### 集成清单

- [x] 后端 API 实现
- [x] 前端组件开发
- [x] API 函数添加
- [x] 路由注册
- [x] 权限控制
- [x] 测试验证
- [x] 文档编写

### 快速开始

1. **复制文件**
   - `server/api/outbound_import_export.go`
   - `web/src/components/OutboundImportExport.vue`
   - `web/src/api/outbound.js`（添加导出导入函���）

2. **注册路由**
   - 在路由文件中添加 3 个路由

3. **集成组件**
   - 在外部应用详情页引入组件
   - 添加导出导入按钮

4. **测试功能**
   - 导出测试
   - 导入测试
   - 验证测试

**完成！可以开始使用导出导入功能了！** 🚀

---

**文档版本**: v1.0  
**最后更新**: 2024-06-09
