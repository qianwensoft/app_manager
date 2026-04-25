package api

import (
	"net/http"

	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

// GetOutboundTemplateDemo GET /api/outbound/template-demo
// 占位符与上下文的固定 Demo 全文（与接口调试默认变量及 http 链式键一致），供连接器编辑页展示。
func GetOutboundTemplateDemo(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": outbound.TemplateDemoPayload()})
}

type outboundTemplateExpandIn struct {
	Strings   []string          `json:"strings"`
	Overrides map[string]string `json:"overrides"`
}

// PostOutboundTemplateExpand POST /api/outbound/template-expand
// 使用与 Demo 相同的占位符表（可 overrides 覆盖）对若干字符串做展开预览。
func PostOutboundTemplateExpand(c *gin.Context) {
	var req outboundTemplateExpandIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	vars := outbound.DefaultDebugTemplateVars(req.Overrides)
	outbound.MergeHTTPResponseContext(vars, 42, 200, []byte(`{"ok":true,"message":"上一步 HTTP 响应示例（步骤 id=42）"}`))
	expanded := make([]string, 0, len(req.Strings))
	for _, s := range req.Strings {
		expanded = append(expanded, outbound.ExpandTemplate(s, vars))
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"execution_template": vars,
			"expanded":           expanded,
		},
	})
}
