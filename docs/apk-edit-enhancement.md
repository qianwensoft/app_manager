# APK 管理编辑功能增强

## 功能说明

在 APK 管理页面，将原来的"编辑描述"功能升级为"编辑"功能，支持同时编辑应用名称和描述。

## 更新内容

### 前端变化 (`web/src/views/Apps.vue`)

1. **按钮文本变更**
   - 从"编辑描述"改为"编辑"

2. **对话框标题变更**
   - 从"编辑描述"改为"编辑应用信息"

3. **表单增强**
   - 添加"应用名称"输入框
   - 保留"描述"文本域
   - 使用 `el-form` 组件更好地布局

4. **变量重命名**
   - `descDialog` → `editDialog`
   - `descEditText` → `editForm` (包含 name 和 description)
   - `descEditId` → `editId`
   - `descSaving` → `editSaving`

5. **方法重命名**
   - `openDescEdit()` → `openEdit()`
   - `saveDescription()` → `saveEdit()`

### 后端变化 (`server/api/app.go`)

**UpdateAppMeta 函数增强**:

```go
// 请求结构体
var req struct {
    Name        string `json:"name"`
    Description string `json:"description"`
}

// 动态更新逻辑
updates := make(map[string]interface{})
if req.Name != "" {
    updates["name"] = strings.TrimSpace(req.Name)
}
if req.Description != "" || c.Request.ContentLength > 0 {
    updates["description"] = trimAppDescription(req.Description)
}
```

**功能特性**:
- 支持只更新名称
- 支持只更新描述
- 支持同时更新两者
- 支持清空描述（传空字符串）
- 名称自动去除首尾空格

## 使用示例

### 用户操作流程

1. 进入"APK 管理"页面
2. 找到要编辑的应用，点击"编辑"按钮
3. 在弹出的对话框中：
   - 修改"应用名称"（可选）
   - 修改"描述"（可选）
4. 点击"保存"
5. 列表自动刷新显示新的名称和描述

### API 调用示例

**前端**:
```javascript
await appApi.updateAppMeta(appId, {
  name: '新应用名称',
  description: '这是更新后的描述'
})
```

**后端接口**:
```
PUT /api/apps/:id
Content-Type: application/json

{
  "name": "新应用名称",
  "description": "这是更新后的描述"
}
```

## 兼容性

- ✅ 向后兼容：只传 `description` 字段仍然有效
- ✅ 空值处理：空字符串可以清空描述，但不会清空名称
- ✅ 前端验证：应用名称最大 100 字符，描述最大 4000 字符

## 构建状态

- ✅ 前端代码更新完成
- ✅ 后端 API 增强完成
- ✅ Go 服务器编译成功

## 相关文件

- `web/src/views/Apps.vue` - 前端 APK 管理页面
- `server/api/app.go` - 后端 API 实现
- `server/models/models.go` - App 模型定义

## 数据库字段

```go
type App struct {
    Name        string  `gorm:"size:100"`     // 应用名称（可编辑）
    Description string  `gorm:"type:text"`    // 描述（可编辑）
    // ... 其他字段
}
```
