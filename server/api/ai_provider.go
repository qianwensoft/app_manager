package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"app-manager/config"
)

// ============================================================================
// AI 助手可切换 provider 抽象。
//   - claudeProvider：包装现有 CallClaudeStream（Anthropic / 兼容代理）。
//   - qwenProvider：DashScope OpenAI 兼容模式 /compatible-mode/v1/chat/completions（SSE）。
// 文档 AI 场景统一通过 StreamAI 调用，按 config.ai.provider 选择实现。
// ============================================================================

// AIProvider 统一的流式对话 provider 接口。
type AIProvider interface {
	// Stream 以流式方式生成回复，每段文本回调 onDelta，返回累积完整文本。
	Stream(ctx context.Context, system string, messages []claudeStreamMessage, onDelta func(text string)) (string, error)
	// Name 返回 provider 标识（用于诊断）。
	Name() string
}

// ResolveAIProvider 按配置返回当前启用的 provider（默认 claude）。
func ResolveAIProvider() AIProvider {
	switch strings.ToLower(strings.TrimSpace(config.C.AI.Provider)) {
	case "qwen", "dashscope":
		return qwenProvider{}
	default:
		return claudeProvider{}
	}
}

// StreamAI 便捷入口：用当前配置的 provider 进行流式生成。
func StreamAI(ctx context.Context, system string, messages []claudeStreamMessage, onDelta func(text string)) (string, error) {
	return ResolveAIProvider().Stream(ctx, system, messages, onDelta)
}

// ---------------------------------------------------------------------------
// Claude provider
// ---------------------------------------------------------------------------

type claudeProvider struct{}

func (claudeProvider) Name() string { return "claude" }

func (claudeProvider) Stream(ctx context.Context, system string, messages []claudeStreamMessage, onDelta func(text string)) (string, error) {
	return CallClaudeStream(ctx, system, messages, onDelta)
}

// ---------------------------------------------------------------------------
// Qwen / DashScope provider（OpenAI 兼容模式）
// ---------------------------------------------------------------------------

const dashScopeDefaultBaseURL = "https://dashscope.aliyuncs.com"

type qwenProvider struct{}

func (qwenProvider) Name() string { return "qwen" }

// openAIChatMessage OpenAI 兼容请求的消息体（qwen 兼容模式仅传文本）。
type openAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatRequest struct {
	Model    string              `json:"model"`
	Stream   bool                `json:"stream"`
	Messages []openAIChatMessage `json:"messages"`
}

func (qwenProvider) Stream(ctx context.Context, system string, messages []claudeStreamMessage, onDelta func(text string)) (string, error) {
	apiKey := strings.TrimSpace(config.C.AI.QwenAPIKey)
	if apiKey == "" {
		return "", fmt.Errorf("qwen api_key 未配置，请在配置文件 ai.qwen_api_key 或环境变量 QWEN_API_KEY 中设置")
	}
	model := strings.TrimSpace(config.C.AI.QwenModel)
	if model == "" {
		model = "qwen-plus"
	}
	baseURL := strings.TrimRight(strings.TrimSpace(config.C.AI.QwenBaseURL), "/")
	if baseURL == "" {
		baseURL = dashScopeDefaultBaseURL
	}
	endpoint := baseURL + "/compatible-mode/v1/chat/completions"

	// 将 Anthropic 风格消息展平为 OpenAI 文本消息（仅取文本块）。
	msgs := make([]openAIChatMessage, 0, len(messages)+1)
	if strings.TrimSpace(system) != "" {
		msgs = append(msgs, openAIChatMessage{Role: "system", Content: system})
	}
	for _, m := range messages {
		var sb strings.Builder
		for _, blk := range m.Content {
			if blk.Type == "text" {
				sb.WriteString(blk.Text)
			}
		}
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, openAIChatMessage{Role: role, Content: sb.String()})
	}

	reqBody := openAIChatRequest{Model: model, Stream: true, Messages: msgs}
	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("qwen 请求失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("qwen 返回错误 %d: %s", resp.StatusCode, string(data))
	}

	// OpenAI 兼容 SSE：data: {choices:[{delta:{content}}]}，以 data: [DONE] 结束。
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	var sb strings.Builder
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(line[5:])
		if payload == "" || payload == "[DONE]" {
			continue
		}
		var ev struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(payload), &ev) != nil {
			continue
		}
		for _, ch := range ev.Choices {
			if ch.Delta.Content != "" {
				sb.WriteString(ch.Delta.Content)
				if onDelta != nil {
					onDelta(ch.Delta.Content)
				}
			}
		}
	}
	if err := sc.Err(); err != nil {
		return sb.String(), err
	}
	return sb.String(), nil
}
