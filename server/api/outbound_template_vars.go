package api

import "github.com/gin-gonic/gin"

// GetOutboundTemplateVars GET /api/outbound/template-vars
// Returns the static list of built-in placeholder variables and template functions.
func GetOutboundTemplateVars(c *gin.Context) {
	c.JSON(200, gin.H{
		"variables": []gin.H{
			// device_event
			{"key": "device_event.id", "desc": "事件 ID"},
			{"key": "device_event.event_type", "desc": "事件类型"},
			{"key": "device_event.event_data", "desc": "事件原始数据（JSON 字符串）"},
			{"key": "device_event.created_at", "desc": "事件时间（RFC3339）"},
			// device
			{"key": "device.id", "desc": "设备 ID"},
			{"key": "device.name", "desc": "设备名称"},
			{"key": "device.serial", "desc": "设备序列号"},
			{"key": "device.agent_alias", "desc": "Agent 别名"},
			{"key": "device.server_alias", "desc": "服务端别名"},
			// http chain
			{"key": "http.last.status", "desc": "上一步 HTTP 响应状态码"},
			{"key": "http.last.body", "desc": "上一步 HTTP 响应体（JSON 字符串）"},
			{"key": "http.step.<id>.status", "desc": "指定步骤 HTTP 响应状态码"},
			{"key": "http.step.<id>.body", "desc": "指定步骤 HTTP 响应体"},
			// context
			{"key": "context.<field>", "desc": "上游步骤写入的上下文字段（event_data→context 或 HTTP 响应→context）"},
		},
		"functions": []gin.H{
			{"label": "$now()", "desc": "当前 Unix 时间戳（秒）", "apply": "$now()"},
			{"label": "$now_ms()", "desc": "当前 Unix 时间戳（毫秒）", "apply": "$now_ms()"},
			{"label": "$date()", "desc": "当前日期字符串 YYYY-MM-DD", "apply": "$date()"},
			{"label": "$datetime()", "desc": "当前日期时间字符串", "apply": "$datetime()"},
			{"label": "$format_date(fmt)", "desc": "格式化当前日期，fmt 如 2006-01-02", "apply": "$format_date(\"2006-01-02\")"},
			{"label": "$format_datetime(fmt)", "desc": "格式化当前日期时间", "apply": "$format_datetime(\"2006-01-02 15:04:05\")"},
			{"label": "$random_str(n)", "desc": "随机 n 位字母数字字符串", "apply": "$random_str(16)"},
			{"label": "$random_int(min,max)", "desc": "随机整数 [min, max)", "apply": "$random_int(0, 1000000)"},
			{"label": "$random_hex(n)", "desc": "随机 n 位十六进制字符串", "apply": "$random_hex(32)"},
			{"label": "$uuid()", "desc": "随机 UUID v4", "apply": "$uuid()"},
			{"label": "$nonce()", "desc": "随机 32 位随机串（alias uuid hex）", "apply": "$nonce()"},
		},
	})
}
