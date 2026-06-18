package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// outboundScriptAIReq 单条扩展脚本 AI 助手的请求体。
type outboundScriptAIReq struct {
	Phase       string          `json:"phase"`        // "before" | "after"
	CurrentCode string          `json:"current_code"` // 这条脚本现有代码（供增删改）
	Messages    []aiChatMessage `json:"messages"`     // 多轮对话（复用 ai_chat.go 的 aiChatMessage）
}

// OutboundScriptAIChat 为「外部应用扩展脚本」的每条脚本提供独立 AI 助手：
// 按阶段（before_request / after_response）给出可用 ctx API，结合当前代码与多轮对话，
// 流式生成一段 goja(ES5) 扩展脚本代码（function main(ctx){...}）。SSE 输出，done 事件带纯代码。
func OutboundScriptAIChat(c *gin.Context) {
	var req outboundScriptAIReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages 不能为空"})
		return
	}

	phase := "before"
	if strings.TrimSpace(strings.ToLower(req.Phase)) == "after" {
		phase = "after"
	}

	// 1) 组装 system：基础契约 + 阶段化 ctx API + 当前代码 + 可选应用上下文
	system := buildExtScriptSystemPrompt(phase)
	if code := strings.TrimSpace(req.CurrentCode); code != "" {
		system += "\n\n## 当前脚本代码（用户可能要求在此基础上增删改，请输出完整新代码，而非增量）\n```js\n" + code + "\n```"
	}
	// 应用上下文（可选）：注入应用名/基础信息，帮助 AI 理解占位符语义
	if idStr := c.Param("id"); idStr != "" {
		if id, err := strconv.ParseUint(idStr, 10, 64); err == nil {
			var app models.OutboundApp
			if database.DB.Select("id", "name", "app_code", "base_url").First(&app, uint(id)).Error == nil {
				system += fmt.Sprintf("\n\n## 所属外部应用（供参考，不要照搬）\n- 名称：%s\n- app_code：%s\n- base_url：%s\n",
					app.Name, app.AppCode, app.BaseURL)
			}
		}
	}

	// 2) 构造 Anthropic messages（纯文本，无图片）
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

	// 3) SSE 响应头
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

	// 4) 流式调用，逐 delta 转发
	full, err := CallClaudeStream(c.Request.Context(), system, msgs, func(text string) {
		writeSSE("delta", gin.H{"text": text})
	})
	if err != nil {
		writeSSE("error", gin.H{"message": err.Error()})
		return
	}

	// 5) 结束：提取纯代码
	writeSSE("done", gin.H{"code": extractScriptCode(full)})
}

// extractScriptCode 从模型输出里提取纯 JS 代码：剥掉 ```js ... ``` 围栏与首尾空白。
func extractScriptCode(full string) string {
	s := strings.TrimSpace(full)
	if !strings.Contains(s, "```") {
		return s
	}
	// 取第一个 ``` 之后、下一个 ``` 之前的内容
	start := strings.Index(s, "```")
	if start < 0 {
		return s
	}
	rest := s[start+3:]
	// 跳过语言标识行（如 js / javascript）
	if nl := strings.IndexByte(rest, '\n'); nl >= 0 {
		firstLine := strings.TrimSpace(rest[:nl])
		if firstLine == "" || isLangTag(firstLine) {
			rest = rest[nl+1:]
		}
	}
	if end := strings.Index(rest, "```"); end >= 0 {
		rest = rest[:end]
	}
	return strings.TrimSpace(rest)
}

func isLangTag(s string) bool {
	switch strings.ToLower(s) {
	case "js", "javascript", "ecmascript", "es5":
		return true
	}
	return false
}

// buildExtScriptSystemPrompt 生成阶段化的扩展脚本编写系统提示。
// ctx API 清单严格对齐 server/outbound/extension_script.go 的真实绑定，避免幻觉出不存在的方法。
func buildExtScriptSystemPrompt(phase string) string {
	var b strings.Builder
	b.WriteString(`你是「外部应用扩展脚本」的编写助手。扩展脚本在服务端的 goja 引擎（ECMAScript 5）中运行，用于在 HTTP 出站请求前/响应后修改数据。

你必须只输出一段 JavaScript 代码本身，不要输出 markdown 代码块围栏（不要 ` + "```" + `），不要任何解释文字。代码必须定义入口函数：
function main(ctx) { /* ... */ }

## 运行环境硬约束（违反会导致脚本无法运行）
- 仅支持 ECMAScript 5 语法：不要用 let/const、箭头函数、模板字符串、解构、for...of、Promise、async/await。请用 var、function、普通字符串拼接、for(;;) 循环。
- 没有 Node.js / 浏览器环境：不存在 require、module、fetch、XMLHttpRequest、setTimeout、window、process。
- 必须同步执行并同步返回；默认超时 800ms，逻辑要短小。
- 可用全局：console.log/info/warn/error/debug（仅记日志，不影响数据流）；JSON.parse/JSON.stringify。

## ctx 通用 API（任何阶段都可用）
- ctx.getVar(key) -> string：读取占位符变量。key 是「完整占位符」，例如 ctx.getVar('{{token}}')。
- ctx.setVar(key, value)：写入占位符变量，例如 ctx.setVar('{{sign}}', s)。
- ctx.getContext(field) -> string：读取 {{context.field}} 变量（等价于 getVar('{{context.'+field+'}}')）。
- ctx.setContext(field, value)：写入 {{context.field}} 变量，常用于把响应数据回传给后续步骤。
- ctx.context：当前所有 {{context.*}} 字段的快照对象，可直接读 ctx.context.xxx；对其赋值也会同步回写。
`)

	if phase == "after" {
		b.WriteString(`
## 当前阶段：响应后（after_response）
- 线上仅当 HTTP 状态码为 2xx 时执行本阶段脚本。
- 额外可用 API：
  - ctx.getResponseStatus() -> number：HTTP 状态码。
  - ctx.getResponseBody() -> string：响应体原始字符串（可能被截断）。
  - ctx.setResponseStatus(code)：改写返回给调用方的状态码。
  - ctx.setResponseBody(s)：改写返回给调用方的响应体字符串。
- 本阶段不可使用 getBodyTemplate / setBodyTemplate（那是请求前阶段的 API）。

## 典型范例：解析响应 JSON 的 data，把一级键写入 {{context.*}}
function main(ctx) {
  var raw = ctx.getResponseBody();
  if (!raw) { return; }
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { console.warn('响应非 JSON: ' + e); return; }
  var data = obj && obj.data;
  if (!data || typeof data !== 'object') { return; }
  for (var k in data) {
    if (!data.hasOwnProperty(k)) { continue; }
    var v = data[k];
    if (v !== null && typeof v === 'object') {
      ctx.setContext(k, JSON.stringify(v));
    } else {
      ctx.setContext(k, String(v));
    }
  }
}
`)
	} else {
		b.WriteString(`
## 当前阶段：请求前（before_request）
- 在向第三方发起 HTTP 请求之前执行，可改写请求体模板与占位符变量。
- 额外可用 API：
  - ctx.getBodyTemplate() -> string：当前请求 Body 模板（可能含 {{占位符}}）。
  - ctx.setBodyTemplate(s)：替换请求 Body 模板。
- 本阶段不可使用 getResponseStatus / getResponseBody / setResponseStatus / setResponseBody（那是响应后阶段的 API）。

## 典型范例：读取变量并写入一个签名占位符
function main(ctx) {
  var ts = String(new Date().getTime());
  ctx.setVar('{{ts}}', ts);
  // 也可读取/改写 body 模板
  var body = ctx.getBodyTemplate();
  if (body && body.indexOf('{{ts}}') < 0) {
    console.info('body 模板中未引用 {{ts}}');
  }
}
`)
	}

	b.WriteString("\n请严格只返回 main 函数所在的这段 JS 代码本身。")
	return b.String()
}
