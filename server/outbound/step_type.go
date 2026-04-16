package outbound

import "strings"

// NormalizeOutboundStepType 统一步骤类型字符串，供校验、入库与执行分支匹配。
// 避免 JSON/客户端传入的 Message、不可见 BOM 等与库内小写枚举不一致。
func NormalizeOutboundStepType(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "\ufeff")
	return strings.ToLower(s)
}
