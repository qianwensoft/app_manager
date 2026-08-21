package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// 文档 AI 助手（SSE）。支持传入当前文档文本 / 选区，做摘要、润色、生成测试用例、问答。
// provider 由 config.ai.provider 决定（claude / qwen），统一走 StreamAI。
// 事件格式：event: delta|done|error。
// ============================================================================

type documentAIChatReq struct {
	Messages []aiChatMessage `json:"messages"`
	// DocText 当前文档全文（可选，作为上下文注入 system）。
	DocText string `json:"doc_text"`
	// Selection 当前选区文本（可选，优先级更高）。
	Selection string `json:"selection"`
	// DocTitle 文档标题（可选）。
	DocTitle string `json:"doc_title"`
}

// buildDocumentAISystemPrompt 组装文档助手 system 提示，注入文档标题 / 全文 / 选区。
func buildDocumentAISystemPrompt(req documentAIChatReq) string {
	var sb strings.Builder
	sb.WriteString("你是一个文档助手，帮助用户对文档进行摘要、润色、续写、生成测试用例、答疑与改写。\n")
	sb.WriteString("请用简体中文回复，回答简洁、结构清晰；涉及代码或表格时用 Markdown 呈现。\n")
	if t := strings.TrimSpace(req.DocTitle); t != "" {
		sb.WriteString("\n## 当前文档标题\n" + t + "\n")
	}
	if s := strings.TrimSpace(req.Selection); s != "" {
		sb.WriteString("\n## 用户选中的文本（请优先针对此部分处理）\n" + truncateForPrompt(s, 8000) + "\n")
	}
	if d := strings.TrimSpace(req.DocText); d != "" {
		sb.WriteString("\n## 当前文档全文（供参考）\n" + truncateForPrompt(d, 16000) + "\n")
	}
	return sb.String()
}

// truncateForPrompt 截断过长文本，控制 token 体积。
func truncateForPrompt(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "\n…（内容过长已截断）"
}

// DocumentAIChat 文档 AI 对话（SSE 流式）。
func DocumentAIChat(c *gin.Context) {
	var req documentAIChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages 不能为空"})
		return
	}

	system := buildDocumentAISystemPrompt(req)

	// 构造消息（文档场景仅文本；沿用 claudeStreamMessage 以复用 provider 抽象）。
	msgs := make([]claudeStreamMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		if strings.TrimSpace(m.Content) == "" {
			continue
		}
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, claudeStreamMessage{
			Role:    role,
			Content: []claudeStreamContent{{Type: "text", Text: m.Content}},
		})
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

	_, err := StreamAI(c.Request.Context(), system, msgs, func(text string) {
		writeSSE("delta", gin.H{"text": text})
	})
	if err != nil {
		writeSSE("error", gin.H{"message": err.Error()})
		return
	}
	writeSSE("done", gin.H{"provider": ResolveAIProvider().Name()})
}

type documentAITransformReq struct {
	Action string `json:"action"` // rewrite / improve / expand / shorter
	Text   string `json:"text"`
	Prompt string `json:"prompt"` // 前端传递的指令模板
}

// DocumentAITransform 快速 AI 转换（重写、润色、扩写、精简）。
// 非流式，直接返回完整结果。
func DocumentAITransform(c *gin.Context) {
	var req documentAITransformReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.Text) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "text 不能为空"})
		return
	}

	system := "你是一个文档编辑助手。请根据用户的指令对文本进行转换，直接返回转换后的结果，不要添加任何解释或额外内容。"
	userPrompt := req.Prompt + "\n\n" + req.Text

	msgs := []claudeStreamMessage{
		{
			Role:    "user",
			Content: []claudeStreamContent{{Type: "text", Text: userPrompt}},
		},
	}

	var result strings.Builder
	_, err := StreamAI(c.Request.Context(), system, msgs, func(text string) {
		result.WriteString(text)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"result": strings.TrimSpace(result.String())})
}
