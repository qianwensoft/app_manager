# 数据集 Schema 保存问题排查指南

## 问题描述
用户报告：数据集编辑时，点击"生成schema"后然后点击"保存"，生成的schema没有保存到后端。

## 排查步骤

### 1. 打开浏览器开发者工具
- 按 F12 打开开发者工具
- 切换到 Console 标签页

### 2. 重现问题
1. 编辑一个数据集（选择"动态 SQL"或"固定表/视图"类型）
2. 在 SQL 中使用参数占位符，例如：`SELECT * FROM users WHERE id = {{user_id}}`
3. 点击"自动生成"按钮生成 param_schema
4. 检查生成的 JSON Schema 是否显示在文本框中
5. 点击底部的"保存"按钮

### 3. 检查控制台输出
查看是否有错误信息

### 4. 检查网络请求
1. 切换到 Network 标签页
2. 筛选 XHR 请求
3. 找到 PUT `/api/data/datasets/:id` 请求
4. 查看 Request Payload 中是否包含 `param_schema` 字段
5. 查看 Response 是否返回成功

### 5. 验证数据库
检查数据库中的 param_schema 字段是否已更新：
```sql
SELECT id, code, name, param_schema FROM dataset WHERE code = 'your_dataset_code';
```

## 可能的原因

### A. 前端未将 schema 包含在请求中
- 检查 Network 面板中的 Request Payload
- 如果 `param_schema` 字段缺失或为空，说明前端有问题

### B. 后端未保存 schema
- 检查 Response 状态码是否为 200
- 检查后端日志是否有错误

### C. 响应式更新问题
- 生成 schema 后，检查文本框中是否显示了生成的内容
- 如果没显示，说明响应式更新有问题

## 当前代码状态
已经移除了调试日志。如果需要调试，可以临时添加：

在 `autoGenerateParamSchema()` 中：
```javascript
console.log('生成的 schema:', schema)
console.log('props.form.param_schema:', props.form.param_schema)
```

在 `onSaveClick()` 中：
```javascript
console.log('保存的 payload:', payload)
console.log('payload.param_schema:', payload.param_schema)
```

## 下一步
请按照上述步骤排查，并提供以下信息：
1. 浏览器控制台是否有错误
2. Network 请求中的 Request Payload 内容
3. Response 状态码和内容
