# 修复：出站连接器 param_mappings 参数未替换问题

## 问题描述

线上连接器配置（如连接器 27）在步骤的 `config_json` 中配置了 `param_mappings`，但执行时参数占位符未被替换，导致发送的请求体中仍包含原始占位符如 `{{msgGroup}}`、`{{msgContent}}` 等。

### 问题示例

**配置**：
```json
{
  "context_merge": "event_data_json",
  "param_mappings": [
    {"param": "msgGroup", "source": "fixed", "value": "1782659884265900048"},
    {"param": "msgContent", "source": "context", "value": "context.payload"},
    {"param": "msgId", "source": "fixed", "value": "111111111"},
    {"param": "msgName", "source": "fixed", "value": "dddd"},
    {"param": "send_uri", "source": "fixed", "value": "/"}
  ]
}
```

**实际发送的请求体**（修复前）：
```json
{
  "groups": ["{{msgGroup}}"],
  "msgContent": "{{msgContent}}",
  "msgEntity": {
    "id": "{{msgId}}",
    "nm": "{{msgName}}",
    "pu": "{{send_uri}}",
    "hu": "{{send_uri}}"
  }
}
```

## 根本原因

1. **前后端不一致**：前端 UI 支持在 HTTP 步骤中配置 `param_mappings`，但后端执行逻辑只在 `data_interface` 步骤类型中处理了这个字段
2. **HTTP 步骤未处理**：`MergeStepTemplateParamsFromConfigJSON` 函数只处理 `template_params` 对象，不处理 `param_mappings` 数组

## 修复内容

### 文件：`server/outbound/template_params.go`

**修改前**：
- `MergeStepTemplateParamsFromConfigJSON` 只处理 `template_params` 对象
- HTTP 步骤的 `param_mappings` 配置被完全忽略

**修改后**：
1. 移除重复的 `ParamMapping` 类型定义（复用 `data_interface_step.go` 中的定义）
2. 在 `MergeStepTemplateParamsFromConfigJSON` 中同时处理：
   - `template_params` 对象（旧版配置，低优先级）
   - `param_mappings` 数组（新版 UI 配置，高优先级）

3. 支持三种参数来源（`source` 字段）：
   - `"fixed"`: 固定值，直接赋值
   - `"context"`: 从 `{{context.*}}` 占位符中取值
   - `"var"`: 从其他占位符中取值或展开模板

### 优先级

当同时配置 `template_params` 和 `param_mappings` 时：
- `template_params` 先处理（低优先级）
- `param_mappings` 后处理（高优先级，会覆盖同名参数）

### 自动包装占位符

参数名会自动添加 `{{` 和 `}}` 包装：
- 配置：`"param": "msgGroup"`
- 实际注入：`vars["{{msgGroup}}"] = "1782659884265900048"`

## 测试用例

新增测试：`TestMergeStepParamMappingsFromConfigJSON`

```go
func TestMergeStepParamMappingsFromConfigJSON(t *testing.T) {
	v := map[string]string{
		"{{context.payload}}": "test_payload_value",
		"{{context.event_type}}": "新增",
	}

	cfg := `{
		"context_merge": "event_data_json",
		"param_mappings": [
			{"param": "msgGroup", "source": "fixed", "value": "1782659884265900048"},
			{"param": "msgContent", "source": "context", "value": "context.payload"},
			{"param": "msgId", "source": "fixed", "value": "111111111"},
			{"param": "send_uri", "source": "fixed", "value": "/"}
		]
	}`

	MergeStepTemplateParamsFromConfigJSON(v, cfg)

	// 验证所有参数正确注入
	assert.Equal(t, "1782659884265900048", v["{{msgGroup}}"])
	assert.Equal(t, "test_payload_value", v["{{msgContent}}"])
	assert.Equal(t, "111111111", v["{{msgId}}"])
	assert.Equal(t, "/", v["{{send_uri}}"])
}
```

## 部署验证

### 1. 编译

```bash
cd /Volumes/data/workspace/qianwen/app-manager
make server
```

### 2. 停止旧服务

登录到 `192.168.102.40` 服务器：

```bash
ssh user@192.168.102.40
sudo systemctl stop app-manager
# 或者
pkill -f app-manager
```

### 3. 备份并替换二进制

```bash
# 备份旧版本
sudo cp /path/to/app-manager /path/to/app-manager.backup-20260912

# 上传新版本
scp bin/app-manager user@192.168.102.40:/path/to/app-manager
```

### 4. 启动服务

```bash
sudo systemctl start app-manager
# 或者
nohup /path/to/app-manager /path/to/config.yaml &
```

### 5. 验证修复

执行测试脚本：

```bash
bash /tmp/test_param_mappings.sh
```

或手动测试：

```bash
# 触发 webhook
curl -X POST 'http://192.168.102.40:88/api/outbound/webhooks/5/trigger' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "event_type": "新增",
    "payload": "测试消息内容"
  }'

# 查看投递详情，检查 request.body 中参数是否被正确替换
```

## 预期结果

修复后，发送的请求体应正确替换所有占位符：

```json
{
  "accessToken": "6a95ddde737aedce2c452cd7b64222c9",
  "employeeId": "1231022478422269968",
  "tenantKey": "tgcxtpf788",
  "groups": ["1782659884265900048"],
  "title": "12312311111",
  "msgContent": "测试消息内容",
  "targetType": "2",
  "msgtype": "4",
  "type": "8",
  "msgEntity": {
    "id": "111111111",
    "me": "im",
    "etype": "磐石-工单",
    "nm": "dddd",
    "lt": "2",
    "ht": "1",
    "pu": "/",
    "hu": "/"
  }
}
```

## 影响范围

- ✅ 所有使用 `param_mappings` 配置的 HTTP 步骤（包括连接器 27）
- ✅ 向后兼容：旧的 `template_params` 配置继续有效
- ✅ 不影响 `data_interface` 步骤（原有逻辑保持不变）
- ✅ 支持 `context`、`fixed`、`var` 三种参数来源

## 相关文件

- `server/outbound/template_params.go` — 参数合并逻辑
- `server/outbound/phased_runner.go` — 调用 `MergeStepTemplateParamsFromConfigJSON`
- `server/outbound/template_params_test.go` — 测试用例
- `server/outbound/data_interface_step.go` — `ParamMapping` 类型定义

## 版本信息

- 修复时间：2026-09-12
- 修复分支：dev
- 相关 Issue：线上连接器 27 参数未替换
