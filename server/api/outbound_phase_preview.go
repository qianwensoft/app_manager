package api

import (
	"encoding/json"
	"net/http"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

type outboundPhasePreviewIn struct {
	PhaseIndex      int               `json:"phase_index"`
	Phases          []json.RawMessage `json:"phases"`
	Overrides       map[string]string `json:"overrides"`
	ConnectorID     uint              `json:"connector_id"`
	ExecuteLiveHTTP bool              `json:"execute_live_http"`
}

// PostOutboundPhasePreview POST /api/outbound/phase-preview
// 使用 Demo 设备事件与模拟 HTTP 响应，计算「进入指定阶段前」与「该阶段执行后」的占位符表，便于查看执行后写入的 context.* 等。
func PostOutboundPhasePreview(c *gin.Context) {
	var req outboundPhasePreviewIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wires, err := outbound.ParsePhasePreviewWires(req.Phases)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phases 解析失败: " + err.Error()})
		return
	}
	var opts outbound.PhaseContextPreviewOptions
	opts.ExecuteLiveHTTP = req.ExecuteLiveHTTP
	if req.ConnectorID > 0 {
		var c models.OutboundConnector
		if err := database.DB.First(&c, req.ConnectorID).Error; err == nil {
			opts.Connector = &c
		}
	}
	res, err := outbound.RunPhaseContextPreview(database.DB, req.PhaseIndex, wires, req.Overrides, &opts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": res})
}
