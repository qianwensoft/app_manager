package api

import (
	"net/http"
	"time"

	"app-manager/agent"

	"github.com/gin-gonic/gin"
)

// printDebugReq 远程打印调试请求：把已渲染的打印 payload 下发到指定在线设备实打印。
type printDebugReq struct {
	DeviceID   string      `json:"device_id" binding:"required"`
	Protocol   string      `json:"protocol"`    // escpos | cpcl | tspl（缺省由 Agent 默认）
	GenSide    string      `json:"gen_side"`    // agent | frontend
	LayoutMode string      `json:"layout_mode"` // flow | canvas | raw
	Content    interface{} `json:"content"`     // PrintOp[]（flow）
	Elements   interface{} `json:"elements"`    // PrintElement[]（canvas）
	RawBase64  string      `json:"raw_base64"`  // raw 时的原始字节
	Paper      interface{} `json:"paper"`       // 纸张规格（可选）
	Mac        string      `json:"mac"`         // 指定打印机（缺省用 Agent 默认）
	Transport  string      `json:"transport"`   // spp | ble
}

// FormAppPrintDebug 远程打印调试：将 payload 通过 print 命令下发到设备 Agent，等待打印结果。
func FormAppPrintDebug(c *gin.Context) {
	var req printDebugReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	routeKey, err := agent.AgentConnectionKey(req.DeviceID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "目标设备 Agent 未在线"})
		return
	}

	// 组装下发给 Agent 的打印 payload（与 ProtocolBuilder.build 约定一致）
	data := map[string]interface{}{}
	if req.Protocol != "" {
		data["protocol"] = req.Protocol
	}
	if req.GenSide != "" {
		data["gen_side"] = req.GenSide
	}
	if req.LayoutMode != "" {
		data["layout_mode"] = req.LayoutMode
	}
	if req.Content != nil {
		data["content"] = req.Content
	}
	if req.Elements != nil {
		data["elements"] = req.Elements
	}
	if req.RawBase64 != "" {
		data["raw_base64"] = req.RawBase64
	}
	if req.Paper != nil {
		data["paper"] = req.Paper
	}
	if req.Mac != "" {
		data["mac"] = req.Mac
	}
	if req.Transport != "" {
		data["transport"] = req.Transport
	}

	commandID := randomAgentRequestID()
	ch := agent.RegisterCommandResultWait(commandID)
	_ = agent.AgentHub.Send(routeKey, map[string]interface{}{
		"type":      "command",
		"action":    "print",
		"commandId": commandID,
		"data":      data,
	})

	select {
	case rep := <-ch:
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"success": rep.Success, "output": rep.Output}})
	case <-time.After(30 * time.Second):
		agent.ForgetCommandResultWait(commandID)
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "打印超时，设备无响应"})
	}
}
