package api

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// InvokeScadaShareInterface permits a share token to invoke only an interface
// explicitly referenced by that published SCADA document.
func InvokeScadaShareInterface(c *gin.Context) {
	var body struct {
		ShareToken  string          `json:"share_token"`
		ParamValues json.RawMessage `json:"param_values"`
		Limit       int             `json:"limit"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var scada models.ScadaInfo
	if err := database.DB.Where("share_token = ? AND publish_status = ?", body.ShareToken, 1).First(&scada).Error; err != nil || (scada.ShareExpireTime != nil && time.Now().After(*scada.ShareExpireTime)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid share token"})
		return
	}
	ifaceID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || !shareCanvasReferencesInterface(scada.CanvasData, uint(ifaceID)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "interface is not allowed for this share"})
		return
	}
	// 仅允许调用已启用接口：按 id 路由键解析（open key 仅匹配 code/slug，无法命中数字 id）。
	iface, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "interface is not allowed for this share"})
		return
	}
	if !iface.Enabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "interface is disabled"})
		return
	}
	params, err := parseFlexibleParamValues(body.ParamValues)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	res, err := Execute(InvokeRequest{Code: c.Param("id"), ParamValues: params, LimitOverride: body.Limit, EnabledOnly: false})
	if err != nil || res.Kind == InvokeKindStaticCrud {
		message := "interface execution failed"
		if err != nil { message = err.Error() }
		c.JSON(http.StatusBadRequest, gin.H{"error": message})
		return
	}
	if res.Kind == InvokeKindQueryOne {
		c.JSON(http.StatusOK, gin.H{"ok": true, "kind": res.Kind, "data": res.Row, "row": res.Row})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "kind": res.Kind, "data": res.Rows, "rows": res.Rows})
}

func shareCanvasReferencesInterface(canvasData string, interfaceID uint) bool {
	var project struct {
		Canvases map[string]struct {
			Elements []struct {
				PointBinding struct { IfaceID uint `json:"ifaceId"` } `json:"pointBinding"`
				TableDataBinding struct { InterfaceID uint `json:"interfaceId"` } `json:"tableDataBinding"`
			} `json:"elements"`
		} `json:"canvases"`
	}
	if interfaceID == 0 { return false }
	if json.Unmarshal([]byte(canvasData), &project) != nil { return false }
	for _, canvas := range project.Canvases {
		for _, element := range canvas.Elements {
			if (element.PointBinding.IfaceID != 0 && element.PointBinding.IfaceID == interfaceID) ||
				(element.TableDataBinding.InterfaceID != 0 && element.TableDataBinding.InterfaceID == interfaceID) {
				return true
			}
		}
	}
	return false
}
