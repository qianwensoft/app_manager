package api

import (
	"app-manager/cluster"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ClusterStatus returns horizontal-scaling mode (admin diagnostics).
func ClusterStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled": cluster.Enabled(),
		"node_id": cluster.NodeID(),
	})
}
