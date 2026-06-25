# 工单优先级快速修改功能 - 实现总结

## 概述

实现了在 Web 端和 Android App 端都可以直接修改工单的紧急程度（优先级），并且所有修改都会在时间线历史记录中显示详细的变更内容（使用中文名称）。

## 改动内容

### 1. Web 端 (Vue)

**文件：`web/src/views/work-orders/WorkOrderDetail.vue`**

#### 改动点：
- ✅ **优先级显示改为下拉框**：从只读标签改为可交互的下拉选择框，支持即时修改
- ✅ **添加 `changePriority` 函数**：处理优先级变更的 API 调用和页面刷新

#### 实现效果：
```vue
<!-- 优先级从只读标签 -->
<el-tag :type="priorityType(wo.priority)">{{ priorityLabel(wo.priority) }}</el-tag>

<!-- 改为可编辑下拉框 -->
<el-select
  :model-value="wo.priority"
  size="small"
  @change="changePriority"
>
  <el-option label="普通" value="normal" />
  <el-option label="较高" value="high" />
  <el-option label="紧急" value="urgent" />
</el-select>
```

### 2. Android App 端 (Kotlin)

**文件：`agent/app/src/main/java/com/appmanager/agent/ui/FeedbackDetailActivity.kt`**

#### 改动点：
- ✅ **添加 `currentPriority` 字段**：记录当前工单的优先级
- ✅ **优先级显示改为可点击**：从普通文本改为可点击的 TextView
- ✅ **添加 `priorityLabel` 函数**：将优先级编码转换为中文名称显示
- ✅ **添加 `changePriority` 函数**：弹出单选对话框选择新优先级，提交更新

#### 实现效果：
```kotlin
// 优先级（可点击修改）
val priorityText = "优先级：${priorityLabel(currentPriority)}"
addText(priorityText, 13f, 0xFF888888.toInt())?.apply {
    setOnClickListener { changePriority() }  // 点击弹出选择对话框
    setPadding(0, 0, 0, dp(8))
}

// 修改优先级对话框
private fun changePriority() {
    val priorities = arrayOf("normal", "high", "urgent")
    val labels = arrayOf("普通", "较高", "紧急")
    // 单选对话框，选中后自动提交更新
    AlertDialog.Builder(this)
        .setTitle("修改优先级")
        .setSingleChoiceItems(labels, currentIndex) { dialog, which ->
            // 提交更新 API
        }
        .show()
}
```

### 3. 后端 (Go)

**文件：`server/api/work_order.go`**

#### 改动点：
- ✅ **优先级变更记录显示中文名称**：时间线中记录从 `normal → urgent` 改为 `普通 → 紧急`

#### 实现效果：
```go
// 优先级变更
if req.Priority != nil {
    if *req.Priority != wo.Priority {
        updates["priority"] = *req.Priority
        priorityLabels := map[string]string{
            "normal": "普通", 
            "high": "较高", 
            "urgent": "紧急"
        }
        oldLabel := priorityLabels[wo.Priority]
        newLabel := priorityLabels[*req.Priority]
        addWorkOrderActivity(
            wo.ID, "update", wo.Status, wo.Status, uid, actor,
            fmt.Sprintf("优先级：%s → %s", oldLabel, newLabel)
        )
    }
}
```

## 用户体验提升

### Web 端
1. **一键修改**：在工单详情页直接点击优先级下拉框即可修改，无需打开编辑对话框
2. **即时反馈**：修改后立即显示成功提示，并刷新页面显示新状态
3. **视觉清晰**：下拉框样式与其他字段保持一致，用户一眼就知道可以修改

### Android App 端
1. **点击修改**：优先级文本可点击，点击后弹出选择对话框
2. **单选操作**：对话框使用单选列表，选中即确认，操作简单
3. **实时更新**：修改后自动刷新页面，新优先级立即显示

### 时间线历史
1. **中文显示**：所有优先级变更记录都使用中文名称，如 `普通 → 紧急`
2. **清晰易读**：用户一眼就能看懂历史记录，不需要记忆编码含义
3. **完整追溯**：所有修改都有记录，包括修改人和修改时间

## 测试验证

### Web 端测试
```bash
# 1. 启动开发服务器
cd web && npm run dev

# 2. 打开工单详情页
# 3. 点击优先级下拉框
# 4. 选择新的优先级（如从"普通"改为"紧急"）
# 5. 查看时间线，应该显示："优先级：普通 → 紧急"
```

### Android App 端测试
```bash
# 1. 编译并安装 APK
make install-agent

# 2. 打开工单详情页
# 3. 点击"优先级：普通"文本
# 4. 在弹出的对话框中选择"紧急"
# 5. 查看页面刷新后显示"优先级：紧急"
# 6. 查看时间线，应该显示："优先级：普通 → 紧急"
```

### API 测试
```bash
# 更新工单优先级
curl -X PUT http://localhost:8080/api/work-orders/mine/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"priority": "urgent"}'

# 查看工单时间线
curl http://localhost:8080/api/work-orders/mine/1 \
  -H "Authorization: Bearer <token>" \
  | jq '.data.activities[] | select(.action == "update")'
```

## 优先级映射表

| 编码 | Web 端显示 | App 端显示 | 时间线显示 |
|------|-----------|-----------|-----------|
| normal | 普通 | 普通 | 普通 |
| high | 较高 | 较高 | 较高 |
| urgent | 紧急 | 紧急 | 紧急 |

## 相关文件清单

### 前端
- `web/src/views/work-orders/WorkOrderDetail.vue` - Web 端工单详情页
- `web/src/views/work-orders/workOrderConst.js` - 优先级常量定义

### 后端
- `server/api/work_order.go` - 工单更新 API
- `server/api/work_order_webhook.go` - 优先级标签映射（用于外发）

### Android
- `agent/app/src/main/java/com/appmanager/agent/ui/FeedbackDetailActivity.kt` - App 端工单详情页

## 后续可能的改进

1. **批量修改**：在工单列表页支持批量修改多个工单的优先级
2. **权限控制**：根据用户角色限制谁可以修改优先级
3. **优先级规则**：设置优先级自动升级规则（如超过24小时未处理自动升级）
4. **提醒通知**：优先级变更后通过 STOMP 实时通知相关人员

## 注意事项

1. **权限验证**：当前 Web 端和 App 端都可以修改自己提交的工单优先级，后端需要确保权限控制正确
2. **并发处理**：如果多人同时修改同一工单优先级，以最后提交的为准
3. **历史记录**：所有优先级变更都会记录到 `work_order_activities` 表，可用于审计追溯

## 完成状态

- ✅ Web 端优先级下拉框修改
- ✅ Android App 端点击对话框修改
- ✅ 后端时间线记录中文名称
- ✅ 前端编译通过
- ✅ 后端编译通过
- ✅ Android 编译通过
- ⏳ 功能测试（待部署后验证）
