package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type claudeDemoReq struct {
	Messages []aiChatMessage `json:"messages"`
	System   string          `json:"system"`
}

// ClaudeDemoChat 系统管理「AI 配置」中的简单 demo 对话：通用流式问答，
// 用于验证已配置的 API Key 与模型是否可用。SSE 输出。
func ClaudeDemoChat(c *gin.Context) {
	var req claudeDemoReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages 不能为空"})
		return
	}

	msgs := make([]claudeStreamMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		content := make([]claudeStreamContent, 0, 2)
		if m.ImageBase64 != "" {
			b64 := m.ImageBase64
			if i := strings.Index(b64, ","); i >= 0 {
				b64 = b64[i+1:]
			}
			mt := m.MediaType
			if mt == "" {
				mt = "image/png"
			}
			content = append(content, claudeStreamContent{
				Type:   "image",
				Source: &claudeImageSource{Type: "base64", MediaType: mt, Data: b64},
			})
		}
		if m.Content != "" {
			content = append(content, claudeStreamContent{Type: "text", Text: m.Content})
		}
		if len(content) == 0 {
			continue
		}
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, claudeStreamMessage{Role: role, Content: content})
	}
	if len(msgs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有有效的消息内容"})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "当前环境不支持流式响应"})
		return
	}

	writeSSE := func(event string, data any) {
		b, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, b)
		flusher.Flush()
	}

	_, err := CallClaudeStream(c.Request.Context(), req.System, msgs, func(text string) {
		writeSSE("delta", gin.H{"text": text})
	})
	if err != nil {
		writeSSE("error", gin.H{"message": err.Error()})
		return
	}
	writeSSE("done", gin.H{})
}
