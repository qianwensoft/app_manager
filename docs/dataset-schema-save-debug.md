# 数据集 Schema 保存问题诊断指南

## 问题现象
编辑数据集时，点击"生成 schema"按钮后再点击"保存"，生成的 schema 没有保存到后端。

## 已添加的调试功能
在最新的构建中，已经添加了调试日志，可以在浏览器控制台中查看：

1. **生成 Schema 时**：会输出
   - `[DatasetForm] 已生成 Schema，参数数量: N`
   - `[DatasetForm] Schema 已设置到 props.form.param_schema: true`

## 排查步骤

### 第一步：确认 Schema 是否正确生成

1. 打开浏览器开发者工具（F12）
2. 切换到 **Console** 标签页
3. 编辑一个数据集，在 SQL 中添加参数，例如：
   ```sql
   SELECT * FROM users WHERE id = {{user_id}} AND status = {{status}}
   ```
4. 点击"自动生成"按钮
5. **检查**：
   - 是否看到提示"已生成 N 个参数的 Schema"
   - 控制台是否输出调试信息
   - Schema 文本框中是否显示了 JSON Schema

**如果这一步失败**：说明 Schema 生成逻辑有问题，需要检查 SQL 中的参数格式。

### 第二步：确认保存请求是否包含 Schema

1. 切换到 **Network** 标签页
2. 点击底部的"保存"按钮
3. 在 Network 面板中找到 `PUT /api/data/datasets/:id` 请求
4. 点击该请求，查看 **Payload** 标签页
5. **检查**：
   - `param_schema` 字段是否存在
   - `param_schema` 的值是否是刚才生成的 JSON Schema

**如果 param_schema 为空或不存在**：说明前端没有正确将 Schema 包含在保存请求中，这是前端问题。

**如果 param_schema 正确包含**：继续下一步。

### 第三步：确认后端是否成功保存

1. 查看保存请求的 **Response** 标签页
2. **检查**：
   - HTTP 状态码是否为 200
   - Response body 是否包含 `{"ok": true}`

**如果返回错误**：查看错误信息，可能是后端验证失败或数据库写入失败。

### 第四步：验证数据库中的数据

连接数据库，执行查询：

```sql
-- SQLite
SELECT id, code, name, 
       CASE 
         WHEN param_schema IS NULL OR param_schema = '' THEN '(空)'
         ELSE substr(param_schema, 1, 50) || '...'
       END as param_schema_preview
FROM dataset 
WHERE code = 'your_dataset_code';

-- MySQL
SELECT id, code, name, 
       CASE 
         WHEN param_schema IS NULL OR param_schema = '' THEN '(空)'
         ELSE CONCAT(SUBSTRING(param_schema, 1, 50), '...')
       END as param_schema_preview
FROM dataset 
WHERE code = 'your_dataset_code';
```

**如果数据库中没有 Schema**：说明后端虽然返回成功，但实际没有写入数据库。

## 可能的原因和解决方案

### 原因 1：响应式更新问题
**现象**：点击"生成"后文本框中没有显示 Schema

**解决方案**：
- 检查浏览器控制台是否有 Vue 警告
- 尝试刷新页面后重新操作
- 检查是否在编辑模式（而不是新建模式）

### 原因 2：前端未正确传递数据
**现象**：Network 请求中 param_schema 为空

**解决方案**：
这可能是代码逻辑问题。已在代码中确认：
- `autoGenerateParamSchema()` 设置 `props.form.param_schema`
- `onSaveClick()` 读取 `props.form.param_schema` 并放入 payload

如果仍有问题，请提供控制台输出。

### 原因 3：后端未正确保存
**现象**：请求成功但数据库未更新

**解决方案**：
检查后端代码 `server/api/data_stack.go` 中的 `UpdateDataset` 函数：
```go
Updates(map[string]interface{}{
    ...
    "param_schema": body.ParamSchema,  // 确认这行存在
    ...
})
```

### 原因 4：GORM 零值更新问题
**现象**：param_schema 更新为空字符串时失败

**解决方案**：
GORM 的 `Updates` 方法会忽略零值。如果要将 param_schema 更新为空字符串，需要特殊处理。
但生成 Schema 后的值不是空字符串，所以这不应该是问题。

## 临时解决方案

如果主保存按钮有问题，可以尝试：

1. 点击"自动生成"按钮
2. 点击"保存 Schema"按钮（这个按钮会单独保存 param_schema）
3. 然后再点击主"保存"按钮

"保存 Schema"按钮的逻辑（`saveParamSchemaOnly` 函数）会直接调用 API 更新 param_schema。

## 需要提供的调试信息

如果问题仍然存在，请提供：

1. **控制台输出**：
   - 生成 Schema 时的日志
   - 是否有任何错误或警告

2. **Network 请求详情**：
   - Request URL
   - Request Payload（特别是 param_schema 字段）
   - Response 状态码和 body

3. **数据库查询结果**：
   - 保存前后 param_schema 字段的值

4. **操作步骤**：
   - 是新建还是编辑数据集
   - 数据集的 kind（query/buffer/transaction/static）
   - 使用的是"动态 SQL"还是"固定表/视图"模式
