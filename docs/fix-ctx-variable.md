# 修复 ctx 变量未定义错误

## 问题
工作流 JavaScript 执行时报错："ReferenceError: ctx is not defined"

## 原因
虽然前端文档和类型定义中提到了 `ctx` 对象（上下文变量），但后端 JavaScript 执行环境中只注入了 `variables`，没有注入 `ctx` 对象。

## 修复
在 `server/workflow/engine.go` 的 `executeJS` 函数中：

1. 创建 `ctx` 对象并注入到 JavaScript 环境
2. 将 `ctx.Variables` 中的所有变量复制到 `ctx` 对象
3. 在 `setVariable` 函数中同步更新 `ctx` 对象

## 使用说明

现在用户可以在工作流 JavaScript 中使用两种方式访问上下文变量：

### 方式 1：使用 ctx 对象（推荐）
```javascript
// 读取上下文变量
console.log(ctx.user_id)
console.log(ctx.api_response)

// 设置上下文变量（使用 setVariable）
setVariable('result', 'success')
```

### 方式 2：使用 variables 对象
```javascript
// 读取
console.log(variables.user_id)

// 设置
setVariable('result', 'success')
```

## 可用变量和函数

### 全局变量
- `workOrder` - 当前工单对象
- `event` - 触发事件名称
- `actor` - 操作者
- `ctx` - 上下文变量对象
- `variables` - 上下文变量对象（与 ctx 相同）

### 全局函数
- `console.log(...)` - 输出日志
- `console.info(...)` - 输出信息日志
- `console.warn(...)` - 输出警告日志
- `console.error(...)` - 输出错误日志
- `log(msg)` - 输出日志（简化版）
- `setVariable(key, value)` - 设置上下文变量
- `getVariable(key)` - 获取上下文变量

## 示例

```javascript
// 输出工单信息
console.log('工单编号:', workOrder.code)
console.log('工单标题:', workOrder.title)

// 使用上下文变量
if (ctx.user_role === 'admin') {
  console.log('管理员操作')
}

// 设置新的上下文变量
setVariable('processed', true)
setVariable('timestamp', new Date().toISOString())
```

## 修改文件
- `server/workflow/engine.go`
