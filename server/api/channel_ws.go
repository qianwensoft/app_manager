package api

import (
	"app-manager/channel"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ChannelWS upgrades the connection and hands it to the channel hub.
// No auth required — callers authenticate via messages or are internal services.
func ChannelWS(c *gin.Context) {
	conn, err := rawWsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	channel.Hub.ServeWS(conn)
}
