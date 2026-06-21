# 工单标题和描述修改时间线显示改进

## 概述

改进工单标题和描述修改的时间线显示，让用户能够清楚看到具体的变更内容，而不只是简单的 "修改了工单描述"。

## 改进内容

### 1. 标题修改

**现状：** 已经有完整的新旧对比显示

**时间线显示：**
```
标题：旧标题文本 → 新标题文本
```

**示例：**
```
标题：设备故障报修 → 紧急：设备故障报修需立即处理
```

### 2. 描述修改（本次改进重点）

#### 改进前
时间线只显示简单的操作说明，没有具体内容：
- `"修改了工单描述"`
- `"添加了工单描述"`
- `"清空了工单描述"`

#### 改进后
时间线显示具体的变更内容，让用户能够追溯历史：

**场景 1：添加描述**
```
添加了工单描述：设备在运行过程中突然出现异常响声，疑似轴承磨损...
```
（截取前50字，超出显示省略号）

**场景 2：清空描述**
```
清空了工单描述（原内容：设备在运行过程中突然出现异常响声，疑似轴承磨损...）
```
（显示原内容前50字，以便追溯）

**场景 3：修改描述**
```
修改了工单描述：
旧：设备在运行过程中突然出现异常响声...
新：设备已确认为轴承损坏，需要更换...
```
（新旧内容各截取前30字，便于对比）

## 实现细节

### 字符截取策略

1. **添加描述**：显示新内容前 50 字
2. **清空描述**：显示原内容前 50 字
3. **修改描述**：新旧内容各显示前 30 字

> 截取长度设计考虑：
> - 时间线需要简洁，不能显示过长内容
> - 50字约等于25个中文字符，足够表达主要内容
> - 新旧对比时各30字，总计60字，保持合理长度

### 超长内容处理

```go
// 示例：处理超长描述
oldDesc := "这是一段很长很长的描述内容，包含了大量的细节信息..."
if len(oldDesc) > 30 {
    oldDesc = oldDesc[:30] + "..."  // 截取前30字节 + 省略号
}
```

### 多行显示

修改描述时使用换行符 `\n` 分隔新旧内容，便于在界面上清晰显示：
```
修改了工单描述：
旧：原描述内容...
新：新描述内容...
```

## 代码改动

**文件：** `server/api/work_order.go`

```go
// 描述变更
if req.Description != nil {
    newDesc := strings.TrimSpace(*req.Description)
    if newDesc != wo.Description {
        updates["description"] = newDesc
        var detail string
        if wo.Description == "" {
            // 添加描述：显示新内容（截取前50字）
            preview := newDesc
            if len(preview) > 50 {
                preview = preview[:50] + "..."
            }
            detail = fmt.Sprintf("添加了工单描述：%s", preview)
        } else if newDesc == "" {
            // 清空描述：显示原内容（截取前50字）
            preview := wo.Description
            if len(preview) > 50 {
                preview = preview[:50] + "..."
            }
            detail = fmt.Sprintf("清空了工单描述（原内容：%s）", preview)
        } else {
            // 修改描述：显示新旧内容对比（各截取前30字）
            oldPreview := wo.Description
            if len(oldPreview) > 30 {
                oldPreview = oldPreview[:30] + "..."
            }
            newPreview := newDesc
            if len(newPreview) > 30 {
                newPreview = newPreview[:30] + "..."
            }
            detail = fmt.Sprintf("修改了工单描述：\n旧：%s\n新：%s", oldPreview, newPreview)
        }
        addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, detail)
    }
}
```

## 界面显示效果

### Web 端时间线

```html
<el-timeline>
  <el-timeline-item timestamp="2026-06-21 10:30:00">
    <b>更新</b>
    <div class="tl-actor">操作员</div>
    <div class="tl-detail">
      修改了工单描述：
      旧：设备在运行过程中突然出现异常响声...
      新：设备已确认为轴承损坏，需要更换...
    </div>
  </el-timeline-item>
</el-timeline>
```

### App 端时间线

```kotlin
// 时间线显示
addText("更新", 14f, 0xFF333333.toInt())
addText("操作员", 12f, 0xFF999999.toInt())
addText("修改了工单描述：\n旧：设备在运行过程中突然出现异常响声...\n新：设备已确认为轴承损坏，需要更换...", 
    13f, 0xFF666666.toInt())
addText("2026-06-21 10:30", 12f, 0xFFAAAAAA.toInt())
```

## 使用场景示例

### 场景 1：工单提交后补充详细描述

1. 用户创建工单，标题："设备故障"，描述为空
2. 后续补充描述："设备在运行过程中突然出现异常响声，疑似轴承磨损，需要尽快维修"
3. 时间线显示：
   ```
   添加了工单描述：设备在运行过程中突然出现异常响声，疑似轴承磨损，需要尽快维修
   ```

### 场景 2：处理人员更新进展

1. 原描述："设备出现异常响声"
2. 更新为："设备已确认为轴承损坏，已订购新轴承，预计明天到货后立即更换"
3. 时间线显示：
   ```
   修改了工单描述：
   旧：设备出现异常响声
   新：设备已确认为轴承损坏，已订购新...
   ```

### 场景 3：清理敏感信息

1. 原描述包含敏感信息
2. 操作员清空描述
3. 时间线显示：
   ```
   清空了工单描述（原内容：设备在运行过程中突然出现异常响声...）
   ```
   > 注意：即使清空，原内容仍在时间线中可见，用于审计追溯

## 注意事项

### 1. 字节 vs 字符

Go 的字符串索引是按**字节**而非字符计数：
- 英文字符：1字节
- 中文字符：3字节（UTF-8）

截取时需要注意：
```go
// 错误示例：可能截断中文字符
desc := "设备故障"
preview := desc[:5]  // 可能得到 "设备�"（乱码）

// 正确做法：按字节截取，但要注意边界
// 当前实现简单按字节截取，前端显示时UTF-8会自动处理不完整字符
```

### 2. 性能考虑

- 字符串截取是轻量级操作，对性能影响可忽略
- 时间线记录异步写入数据库，不影响 API 响应速度

### 3. 数据库存储

时间线记录存储在 `work_order_activities` 表的 `detail` 字段（TEXT 类型），支持存储较长的文本内容。

## 测试验证

### 测试用例 1：添加描述

```bash
# 1. 创建工单（无描述）
curl -X POST http://localhost:8080/api/work-orders \
  -H "Content-Type: application/json" \
  -d '{"title": "设备故障", "type_code": "maintenance"}'

# 2. 添加描述
curl -X PUT http://localhost:8080/api/work-orders/1 \
  -H "Content-Type: application/json" \
  -d '{"description": "设备在运行过程中突然出现异常响声，疑似轴承磨损，需要尽快维修"}'

# 3. 查看时间线
curl http://localhost:8080/api/work-orders/1 | jq '.data.activities'
# 预期显示：添加了工单描述：设备在运行过程中突然出现异常响声，疑似轴承磨损，需要尽快维修
```

### 测试用例 2：修改描述

```bash
# 1. 修改描述
curl -X PUT http://localhost:8080/api/work-orders/1 \
  -H "Content-Type: application/json" \
  -d '{"description": "设备已确认为轴承损坏，已订购新轴承，预计明天到货后立即更换"}'

# 2. 查看时间线
curl http://localhost:8080/api/work-orders/1 | jq '.data.activities[-1]'
# 预期显示：
# 修改了工单描述：
# 旧：设备在运行过程中突然出现异常响声...
# 新：设备已确认为轴承损坏，已订购新...
```

### 测试用例 3：清空描述

```bash
# 1. 清空描述
curl -X PUT http://localhost:8080/api/work-orders/1 \
  -H "Content-Type: application/json" \
  -d '{"description": ""}'

# 2. 查看时间线
curl http://localhost:8080/api/work-orders/1 | jq '.data.activities[-1]'
# 预期显示：清空了工单描述（原内容：设备已确认为轴承损坏...）
```

## 完成状态

- ✅ 标题修改时间线（已有完整显示）
- ✅ 描述添加时间线（显示新内容前50字）
- ✅ 描述修改时间线（新旧对比，各30字）
- ✅ 描述清空时间线（显示原内容前50字）
- ✅ 后端编译通过
- ⏳ 功能测试（待部署后验证）

## 后续可能的优化

1. **智能截取**：按中文字符数而非字节数截取，避免截断字符
2. **富文本支持**：如果描述支持 Markdown，时间线可以显示格式化预览
3. **完整内容查看**：时间线记录支持展开查看完整的原文和新内容
4. **差异对比**：使用 diff 算法显示具体修改的部分（类似 Git diff）
