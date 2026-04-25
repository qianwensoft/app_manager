package api

import (
	"net/http"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

func GetOutboundAppTokenStatus(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	st, err := outbound.TokenStatusForAPI(&a)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": st})
}

// codeContextToVars 将前端传入的 code_context map（key→value）转为 {{code_resp.key}}→value 占位符表。
func codeContextToVars(ctx map[string]string) map[string]string {
	if len(ctx) == 0 {
		return nil
	}
	vars := make(map[string]string, len(ctx))
	for k, v := range ctx {
		vars["{{code_resp."+k+"}}"] = v
	}
	return vars
}

func PostOutboundAppTokenCode(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	tr, err := outbound.ExecCodeStepWithTrace(&a)
	if err != nil {
		h := gin.H{"error": err.Error()}
		if tr != nil {
			h["token_exchange"] = outbound.MaskFetchResult(tr, &a)
		}
		c.JSON(http.StatusBadRequest, h)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "token_exchange": outbound.MaskFetchResult(tr, &a)})
}

func PostOutboundAppTokenFetch(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	tr, err := outbound.FetchAppTokenWithTrace(database.DB, &a)
	if err != nil {
		h := gin.H{"error": err.Error()}
		if tr != nil {
			h["token_exchange"] = outbound.MaskFetchResult(tr, &a)
		}
		c.JSON(http.StatusBadRequest, h)
		return
	}
	_ = database.DB.First(&a, a.ID).Error
	st, _ := outbound.TokenStatusForAPI(&a)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": outboundAppToJSON(a), "token_status": st, "token_exchange": outbound.MaskFetchResult(tr, &a)})
}

func PostOutboundAppTokenRefresh(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	tr, err := outbound.RefreshAppTokenWithTrace(database.DB, &a)
	if err != nil {
		h := gin.H{"error": err.Error()}
		if tr != nil {
			h["token_exchange"] = outbound.MaskFetchResult(tr, &a)
		}
		c.JSON(http.StatusBadRequest, h)
		return
	}
	_ = database.DB.First(&a, a.ID).Error
	st, _ := outbound.TokenStatusForAPI(&a)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": outboundAppToJSON(a), "token_status": st, "token_exchange": outbound.MaskFetchResult(tr, &a)})
}
