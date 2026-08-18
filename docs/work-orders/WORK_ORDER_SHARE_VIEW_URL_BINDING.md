# 工单分享页面 - 视图模式 URL 参数绑定

## 需求描述
在工单报告分享页面中，当用户切换"统计"、"列表"、"看板"三个视图模式时，URL 参数应同步更新。这样可以：
- 用户通过 URL 直接访问特定视图模式
- 支持浏览器的前进/后退功能
- 分享链接时可以指定默认视图

## 实现方案

### 修改文件
- `web/src/views/WorkOrderReportShare.vue`

### 实现细节

#### 1. 导入 useRouter
```javascript
import { useRoute, useRouter } from 'vue-router'
```

#### 2. 初始化 router 和从 URL 读取视图模式
```javascript
const route = useRoute()
const router = useRouter()
const token = route.params.token

// 从 URL 参数初始化视图模式，默认为 statistics
const viewMode = ref(route.query.view || 'statistics')
```

#### 3. 监听视图模式变化并同步 URL
```javascript
watch(viewMode, (newMode, oldMode) => {
  // 同步 URL 参数（使用 replace 避免产生历史记录）
  router.replace({
    query: {
      ...route.query,
      view: newMode
    }
  })

  if (newMode === 'statistics') {
    fetchStatistics()
  } else if (newMode === 'list' || newMode === 'board') {
    if (oldMode === 'statistics') {
      pagination.value.page = 1
    }
    fetchWorkOrders()
  }
})
```

## URL 格式

### 基础格式
```
/work-order-report-share/:token?view={statistics|list|board}
```

### 示例 URL

#### 统计视图（默认）
```
/work-order-report-share/abc123
/work-order-report-share/abc123?view=statistics
```

#### 列表视图
```
/work-order-report-share/abc123?view=list
```

#### 看板视图
```
/work-order-report-share/abc123?view=board
```

## 功能特性

### 1. URL 参数初始化
- 页面加载时从 URL 的 `view` 参数读取视图模式
- 如果 URL 没有 `view` 参数，默认显示"统计"视图
- 支持三个值：`statistics`、`list`、`board`

### 2. 视图切换同步
- 用户点击视图切换按钮时，URL 自动更新
- 使用 `router.replace()` 而非 `router.push()`，避免产生冗余的浏览器历史记录
- 保留 URL 中的其他查询参数（如未来可能添加的筛选条件）

### 3. 浏览器导航支持
- 用户可以使用浏览器的前进/后退按钮切换视图
- URL 变化会触发相应的数据加载

### 4. 分享友好
- 可以生成带特定视图的分享链接
- 接收者打开链接时直接看到指定的视图

## 技术细节

### router.replace vs router.push
使用 `router.replace()` 的原因：
- 避免每次切换视图都创建新的历史记录
- 用户点击浏览器后退按钮时，会返回上一个页面，而不是上一个视图
- 更符合视图切换的语义（状态变更而非页面跳转）

### 查询参数合并
```javascript
router.replace({
  query: {
    ...route.query,  // 保留现有的其他查询参数
    view: newMode     // 更新 view 参数
  }
})
```

## 测试场景

### 1. 初始加载
- ✅ 访问 `/work-order-report-share/abc123` → 显示统计视图
- ✅ 访问 `/work-order-report-share/abc123?view=list` → 显示列表视图
- ✅ 访问 `/work-order-report-share/abc123?view=board` → 显示看板视图
- ✅ 访问 `/work-order-report-share/abc123?view=invalid` → 显示统计视图（降级处理）

### 2. 视图切换
- ✅ 点击"列表"按钮 → URL 变为 `?view=list`
- ✅ 点击"看板"按钮 → URL 变为 `?view=board`
- ✅ 点击"统计"按钮 → URL 变为 `?view=statistics`

### 3. 浏览器导航
- ✅ 在列表视图时点击浏览器后退 → 返回上一个页面（而非统计视图）
- ✅ 刷新页面 → 保持当前视图模式

### 4. URL 分享
- ✅ 复制带 `?view=list` 的 URL 分享给他人
- ✅ 他人打开链接时直接进入列表视图

## 与现有功能的兼容性

### 分页参数
列表视图的分页状态（`page`、`page_size`）仍由组件内部状态管理，未绑定到 URL。
如需绑定分页参数，可以类似地添加：
```javascript
watch([() => pagination.value.page, () => pagination.value.pageSize], ([page, pageSize]) => {
  router.replace({
    query: {
      ...route.query,
      view: viewMode.value,
      page,
      page_size: pageSize
    }
  })
})
```

### STOMP 实时更新
URL 参数绑定不影响 STOMP 实时更新功能，两者可以正常协作。

## 未来扩展

### 筛选条件绑定
可以进一步将筛选条件（状态、类型、标签等）也绑定到 URL：
```
?view=list&status=open&type=bug&tag=urgent
```

### 排序条件绑定
```
?view=list&sort=created_at&order=desc
```

### 看板列筛选
```
?view=board&columns=open,in_progress,resolved
```

## 构建验证
✅ Web 项目构建成功，无语法错误

## 相关文件
- `web/src/views/WorkOrderReportShare.vue` - 工单报告分享页面
- Vue Router 文档：https://router.vuejs.org/guide/essentials/navigation.html
