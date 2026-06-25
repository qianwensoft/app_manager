package api

import (
	"app-manager/agent"
	"app-manager/cluster"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ClusterAgentRoute returns which cluster node holds the agent WebSocket for a device.
// Used by load balancers (e.g. Nginx) to route sticky sessions for screen/shell/logcat.
func ClusterAgentRoute(c *gin.Context) {
	param := c.Param("deviceKey")
	routeKey, err := agent.AgentConnectionKey(param)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !cluster.Enabled() {
		c.JSON(http.StatusOK, gin.H{
			"enabled":   false,
			"device_id": routeKey,
			"node_id":   cluster.NodeID(),
			"local":     agent.AgentHub.HasLocal(routeKey),
		})
		return
	}
	nodeID, err := cluster.LookupAgentNode(routeKey)
	if err != nil || nodeID == "" {
		c.JSON(http.StatusOK, gin.H{
			"enabled":   true,
			"device_id": routeKey,
			"node_id":   "",
			"local":     agent.AgentHub.HasLocal(routeKey),
			"online":    false,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled":   true,
		"device_id": routeKey,
		"node_id":   nodeID,
		"local":     nodeID == cluster.NodeID(),
		"online":    true,
	})
}
