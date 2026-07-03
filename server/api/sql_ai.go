package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type sqlAIMessage struct {
	Role    string `json:"role"`    // "user" | "assistant"
	Content string `json:"content"`
}

type sqlAIReq struct {
	Dialect    string                 `json:"dialect"`     // mysql | sqlite | postgresql
	CurrentSQL string                 `json:"current_sql"` // 当前编辑器中的 SQL
	Messages   []sqlAIMessage         `json:"messages"`
	Context    map[string]interface{} `json:"context"` // 数据源、表结构等上下文
}

// SQLAIGenerate 通过 SSE 流式调用 Claude，辅助生成/修改 SQL 语句。
func SQLAIGenerate(c *gin.Context) {
	var req sqlAIReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages 不能为空"})
		return
	}

	// 1) 组装 system prompt
	system := buildSQLSystemPrompt(req.Dialect, req.CurrentSQL, req.Context)

	// 2) 构造 messages
	msgs := make([]claudeStreamMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		if m.Content == "" {
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

	// 3) 设置 SSE 响应头
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

	writeSSE("progress", gin.H{"message": "正在生成 SQL..."})

	// 4) 流式调用
	full, err := CallClaudeStream(c.Request.Context(), system, msgs, func(text string) {
		writeSSE("delta", gin.H{"text": text})
	})
	if err != nil {
		writeSSE("error", gin.H{"message": err.Error()})
		return
	}

	// 5) 提取 SQL
	sql := extractSQL(full)
	if sql == "" {
		writeSSE("error", gin.H{"message": "未能生成有效的 SQL"})
		return
	}

	writeSSE("done", gin.H{"sql": sql})
}

func buildSQLSystemPrompt(dialect, currentSQL string, context map[string]interface{}) string {
	prompt := `你是一个 SQL 专家助手，帮助用户编写和优化 SQL 查询。

## 输出规范
1. 直接输出可执行的 SQL 语句，用 ` + "```sql" + ` 代码块包裹
2. 使用 {{param_name}} 作为参数占位符（参数缺失时所在子句自动剔除）
3. SQL 应格式化良好、易读
4. 如有多条语句，用分号分隔

## 数据库方言
当前方言：` + strings.ToUpper(dialect) + `

## 参数占位符说明
- 使用 {{name}} 格式，例如：WHERE id = {{user_id}}
- 参数缺失时，包含该参数的整个条件会被自动剔除
- 支持可选块：用 /*? ... ?*/ 包裹可选的 WHERE/AND/OR 子句

## 示例
用户："查询最近7天的订单"
输出：
` + "```sql" + `
SELECT * FROM orders
WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
ORDER BY created_at DESC
` + "```" + `
`

	// 添加数据源和表结构上下文
	if context != nil && len(context) > 0 {
		if dsName, ok := context["data_source"].(map[string]interface{}); ok {
			if name, ok := dsName["name"].(string); ok {
				prompt += "\n\n## 数据源\n" + name
			}
		}

		if tableName, ok := context["table_name"].(string); ok && tableName != "" {
			prompt += "\n\n## 当前表：" + tableName
		}

		if cols, ok := context["columns"].([]interface{}); ok && len(cols) > 0 {
			prompt += "\n\n## 表结构\n"
			for _, col := range cols {
				if c, ok := col.(map[string]interface{}); ok {
					name := c["name"]
					dataType := c["data_type"]
					nullable := c["nullable"]
					nullStr := ""
					if n, ok := nullable.(bool); ok && n {
						nullStr = " (可空)"
					}
					prompt += fmt.Sprintf("- %v: %v%s\n", name, dataType, nullStr)
				}
			}
			prompt += "\n根据上述表结构生成 SQL，确保字段名和类型正确。"
		}

		if datasetKind, ok := context["dataset_kind"].(string); ok && datasetKind != "" {
			prompt += "\n\n## 数据集类型：" + datasetKind
			if datasetKind == "transaction" {
				prompt += "\n注意：这是事务写入数据集，需要生成 INSERT/UPDATE/DELETE 等写操作 SQL。"
			}
		}
	}

	if currentSQL != "" {
		prompt += "\n\n## 当前 SQL\n```sql\n" + currentSQL + "\n```\n用户可能基于此进行修改或优化。"
	}

	return prompt
}

func extractSQL(text string) string {
	// 提取 ```sql ... ``` 代码块
	start := strings.Index(text, "```sql")
	if start == -1 {
		start = strings.Index(text, "```SQL")
	}
	if start == -1 {
		// 尝试提取 ``` ... ```
		start = strings.Index(text, "```")
	}
	if start == -1 {
		return strings.TrimSpace(text)
	}

	start = strings.Index(text[start:], "\n")
	if start == -1 {
		return ""
	}
	start += strings.LastIndex(text[:start], "```") + len("```")

	end := strings.Index(text[start:], "```")
	if end == -1 {
		return strings.TrimSpace(text[start:])
	}

	return strings.TrimSpace(text[start : start+end])
}
