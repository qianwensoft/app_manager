package api

import (
	"app-manager/workflow"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源（生产环境应该限制）
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// WorkflowExecutionWS 工作流执行 WebSocket
func WorkflowExecutionWS(c *gin.Context) {
	execID := c.Param("exec_id")

	id, err := strconv.ParseUint(execID, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	// 升级到 WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to upgrade to websocket"})
		return
	}
	defer conn.Close()

	executionID := uint(id)

	// 注册连接
	workflow.WSHubInstance.Register(executionID, conn)
	defer workflow.WSHubInstance.Unregister(executionID, conn)

	// 发送初始状态
	execCtx, err := workflow.LowCodeEngineInstance.GetExecutionStatus(executionID)
	if err == nil {
		// 执行中，发送当前状态
		execCtx.Mu.RLock()
		conn.WriteJSON(map[string]interface{}{
			"type": "initial_state",
			"data": map[string]interface{}{
				"status":        execCtx.Status,
				"started_at":    execCtx.StartedAt,
				"current_node":  execCtx.CurrentNodeID,
				"node_statuses": execCtx.NodeStatuses,
				"logs":          execCtx.Logs,
			},
		})
		execCtx.Mu.RUnlock()
	}

	// 保持连接，监听客户端消息（心跳）
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// WorkflowExecutionEventsSSE 工作流执行事件 SSE（备选方案）
func WorkflowExecutionEventsSSE(c *gin.Context) {
	execID := c.Param("exec_id")

	id, err := strconv.ParseUint(execID, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid execution id"})
		return
	}

	executionID := uint(id)

	// 设置 SSE 头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Access-Control-Allow-Origin", "*")

	// 创建事件通道
	eventChan := make(chan string, 10)
	defer close(eventChan)

	// 定期发送状态更新
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// 监听客户端断开
	clientGone := c.Writer.CloseNotify()

	for {
		select {
		case <-clientGone:
			return
		case <-ticker.C:
			// 获取执行状态
			execCtx, err := workflow.LowCodeEngineInstance.GetExecutionStatus(executionID)
			if err != nil {
				// 执行已完成或不存在
				c.SSEvent("done", "execution completed or not found")
				c.Writer.Flush()
				return
			}

			execCtx.Mu.RLock()
			status := execCtx.Status
			currentNode := execCtx.CurrentNodeID
			execCtx.Mu.RUnlock()

			c.SSEvent("status", map[string]interface{}{
				"status":       status,
				"current_node": currentNode,
			})
			c.Writer.Flush()

			if status == "completed" || status == "failed" || status == "timeout" || status == "cancelled" {
				return
			}
		}
	}
}
