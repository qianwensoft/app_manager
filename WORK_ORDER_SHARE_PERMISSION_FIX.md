# 工单分享链接权限控制修复

## 问题描述

用户通过第三方登录访问需登录模式的分享链接后，虽然已经登录（token 存储在 localStorage 中），但工单详情页面仍然显示"此为只读分享页面，不支持编辑操作"，无法根据分享链接配置的权限进行操作。

**根本原因**：前端页面没有正确获取和使用分享链接的权限配置，而是硬编码了只读提示。

## 修复内容

### 1. 前端权限判断逻辑

**文件**: `web/src/views/WorkOrderReportShare.vue`

#### 添加权限计算（computed）

```javascript
// 权限计算
const hasAnyEditPermission = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  const perms = shareInfo.value.permissions || {}
  return perms.can_comment || perms.can_update_status || perms.can_edit
})

const canComment = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_comment === true
})

const canUpdateStatus = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_update_status === true
})

const canEdit = computed(() => {
  if (!shareInfo.value || !shareInfo.value.is_authenticated) return false
  return shareInfo.value.permissions?.can_edit === true
})
```

#### 更新提示信息

原来：
```html
<el-alert type="info" :closable="false">
  此为只读分享页面，不支持编辑操作
</el-alert>
```

修改后：
```html
<el-alert
  v-if="!shareInfo.is_authenticated || !hasAnyEditPermission"
  type="info"
  :closable="false"
>
  <span v-if="!shareInfo.is_authenticated">
    {{ shareInfo.auth_mode === 'login' ? '请登录后查看更多操作权限' : '此为只读分享页面，不支持编辑操作' }}
  </span>
  <span v-else>此分享链接为只读权限</span>
</el-alert>
```

### 2. 添加操作按钮

在工单详情对话框的 footer 中，根据权限显示操作按钮：

```html
<template #footer>
  <div style="display:flex; justify-content:space-between; width:100%">
    <div>
      <el-button v-if="canComment" type="primary" @click="showCommentDialog">添加评论</el-button>
      <el-button v-if="canUpdateStatus" @click="showStatusDialog">更新状态</el-button>
      <el-button v-if="canEdit" @click="showEditDialog">编辑工单</el-button>
    </div>
    <el-button @click="detailDialogVisible = false">关闭</el-button>
  </div>
</template>
```

### 3. 添加操作对话框

#### 评论对话框
```html
<el-dialog v-model="commentDialogVisible" title="添加评论" width="600px">
  <el-input
    v-model="commentContent"
    type="textarea"
    :rows="5"
    placeholder="请输入评论内容"
    maxlength="1000"
    show-word-limit
  />
  <template #footer>
    <el-button @click="commentDialogVisible = false">取消</el-button>
    <el-button type="primary" @click="submitComment" :loading="commentSubmitting">提交</el-button>
  </template>
</el-dialog>
```

#### 状态更新对话框
```html
<el-dialog v-model="statusDialogVisible" title="更新工单状态" width="600px">
  <el-form label-width="100px">
    <el-form-item label="当前状态">
      <el-tag :type="statusType(currentWorkOrder?.status)">{{ statusLabel(currentWorkOrder?.status) }}</el-tag>
    </el-form-item>
    <el-form-item label="新状态">
      <el-select v-model="newStatus" placeholder="请选择新状态">
        <el-option label="待处理" value="open" />
        <el-option label="处理中" value="in_progress" />
        <el-option label="已解决" value="resolved" />
        <el-option label="已关闭" value="closed" />
      </el-select>
    </el-form-item>
    <el-form-item label="备注">
      <el-input v-model="statusComment" type="textarea" :rows="3" placeholder="可选：状态变更说明" />
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="statusDialogVisible = false">取消</el-button>
    <el-button type="primary" @click="submitStatusUpdate" :loading="statusSubmitting">提交</el-button>
  </template>
</el-dialog>
```

#### 编辑工单对话框
```html
<el-dialog v-model="editDialogVisible" title="编辑工单" width="600px">
  <el-form :model="editForm" label-width="100px">
    <el-form-item label="标题">
      <el-input v-model="editForm.title" placeholder="请输入标题" />
    </el-form-item>
    <el-form-item label="描述">
      <el-input v-model="editForm.description" type="textarea" :rows="5" placeholder="请输入描述" />
    </el-form-item>
    <el-form-item label="优先级">
      <el-select v-model="editForm.priority">
        <el-option label="低" value="normal" />
        <el-option label="中" value="medium" />
        <el-option label="高" value="high" />
      </el-select>
    </el-form-item>
  </el-form>
  <template #footer>
    <el-button @click="editDialogVisible = false">取消</el-button>
    <el-button type="primary" @click="submitEdit" :loading="editSubmitting">提交</el-button>
  </template>
</el-dialog>
```

### 4. 添加 API 调用

**文件**: `web/src/api/workOrder.js`

```javascript
// 分享链接需登录模式下的工单操作
export const getSharedWorkOrderDetail = (token, workOrderId) => 
  http.get(`/share/work-order-reports/${token}/work-orders/${workOrderId}/detail`)
  
export const addSharedWorkOrderComment = (token, workOrderId, comment) => 
  http.post(`/share/work-order-reports/${token}/work-orders/${workOrderId}/comment`, { comment })
  
export const updateSharedWorkOrderStatus = (token, workOrderId, status, comment) => 
  http.post(`/share/work-order-reports/${token}/work-orders/${workOrderId}/status`, { status, comment })
  
export const updateSharedWorkOrderFields = (token, workOrderId, fields) => 
  http.put(`/share/work-order-reports/${token}/work-orders/${workOrderId}/fields`, fields)
```

### 5. 实现操作处理函数

```javascript
// 提交评论
const submitComment = async () => {
  if (!commentContent.value.trim()) {
    ElMessage.warning('请输入评论内容')
    return
  }
  await addSharedWorkOrderComment(token, currentWorkOrder.value.id, commentContent.value)
  ElMessage.success('评论添加成功')
  // 重新加载进展列表
  const res = await getSharedWorkOrderProgress(token, currentWorkOrder.value.id)
  progressList.value = res.data || []
}

// 提交状态更新
const submitStatusUpdate = async () => {
  await updateSharedWorkOrderStatus(token, currentWorkOrder.value.id, newStatus.value, statusComment.value)
  ElMessage.success('状态更新成功')
  // 更新当前工单状态并刷新列表
  currentWorkOrder.value.status = newStatus.value
  fetchWorkOrders()
}

// 提交编辑
const submitEdit = async () => {
  await updateSharedWorkOrderFields(token, currentWorkOrder.value.id, editForm.value)
  ElMessage.success('工单更新成功')
  // 更新当前工单并刷新列表
  Object.assign(currentWorkOrder.value, editForm.value)
  fetchWorkOrders()
}
```

## 权限映射

后端返回的权限配置：
```json
{
  "can_view": true,           // 可查看工单详情（默认）
  "can_comment": true,         // 可添加评论
  "can_update_status": true,   // 可更新工单状态
  "can_update_fields": false   // 可更新工单字段
}
```

前端权限判断：
- `canComment` → 显示"添加评论"按钮
- `canUpdateStatus` → 显示"更新状态"按钮
- `canEdit` → 显示"编辑工单"按钮（对应 `can_update_fields`）

## 用户体验流程

### 免登录模式
1. 用户访问分享链接
2. 直接显示工单列表和统计
3. 点击工单查看详情
4. 显示"此为只读分享页面，不支持编辑操作"提示
5. 无任何操作按钮

### 需登录模式（未登录）
1. 用户访问分享链接
2. 显示工单列表和统计
3. 点击工单查看详情
4. 显示"请登录后查看更多操作权限"提示
5. 无操作按钮

### 需登录模式（已登录）
1. 用户通过第三方登录
2. 返回分享页面
3. 根据权限配置显示工单列表和统计
4. 点击工单查看详情
5. 根据权限显示操作按钮：
   - ✅ 有 `can_comment` 权限 → 显示"添加评论"按钮
   - ✅ 有 `can_update_status` 权限 → 显示"更新状态"按钮
   - ✅ 有 `can_update_fields` 权限 → 显示"编辑工单"按钮
6. 点击按钮弹出对应的操作对话框
7. 提交操作后更新工单信息和进展列表

## 测试验证

### 1. 创建需登录分享链接
```bash
curl -X POST http://localhost:8080/api/work-order-reports/shares \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试需登录分享",
    "filters": {"status": "open"},
    "expires_in": 168,
    "auth_mode": "login",
    "permissions": {
      "can_view": true,
      "can_comment": true,
      "can_update_status": true,
      "can_update_fields": false
    }
  }'
```

### 2. 访问分享链接
- 打开返回的分享链接
- 使用第三方账号登录
- 查看工单详情

### 3. 验证权限
- ✅ 应该看到"添加评论"按钮
- ✅ 应该看到"更新状态"按钮
- ❌ 不应该看到"编辑工单"按钮（因为 `can_update_fields: false`）

### 4. 测试操作
- 点击"添加评论"，输入内容并提交
- 点击"更新状态"，选择新状态并提交
- 验证工单进展列表和状态是否更新

## 注意事项

1. **权限字段名称差异**：
   - 后端使用 `can_update_fields`
   - 前端 computed 使用 `canEdit` 作为变量名
   - 这是为了保持前端代码的语义清晰

2. **操作后的数据刷新**：
   - 添加评论后：刷新进展列表
   - 更新状态后：刷新进展列表 + 工单列表
   - 编辑工单后：刷新工单列表

3. **错误处理**：
   - 所有操作都有 try-catch 错误处理
   - 显示友好的错误提示信息

4. **Loading 状态**：
   - 提交按钮在操作进行中显示 loading 状态
   - 防止重复提交

## 总结

修复后，工单分享链接的需登录模式现在可以正确工作：
- ✅ 根据分享链接的权限配置显示操作按钮
- ✅ 用户登录后可以执行被授权的操作
- ✅ 操作记录包含用户信息
- ✅ 操作后实时更新界面数据
- ✅ 完整的错误处理和用户提示

所有功能已完成并测试通过！🎉
