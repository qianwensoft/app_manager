package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"app-manager/config"
)

const anthropicDefaultBaseURL = "https://api.anthropic.com"
const anthropicAPIVersion = "2023-06-01"

// claudeImageSource 图片内容块来源（base64）。
type claudeImageSource struct {
	Type      string `json:"type"`       // 固定 "base64"
	MediaType string `json:"media_type"` // image/png | image/jpeg
	Data      string `json:"data"`       // 原始 base64，无 data: 前缀
}

// claudeStreamContent 一条消息中的内容块（文本或图片）。
type claudeStreamContent struct {
	Type   string             `json:"type"` // "text" | "image"
	Text   string             `json:"text,omitempty"`
	Source *claudeImageSource `json:"source,omitempty"`
}

type claudeStreamMessage struct {
	Role    string                `json:"role"` // "user" | "assistant"
	Content []claudeStreamContent `json:"content"`
}

type claudeStreamRequest struct {
	Model     string                `json:"model"`
	MaxTokens int                   `json:"max_tokens"`
	System    string                `json:"system,omitempty"`
	Stream    bool                  `json:"stream"`
	Messages  []claudeStreamMessage `json:"messages"`
}

// CallClaudeStream 以流式方式调用 Claude，每收到一段文本回调 onDelta，
// 返回累积的完整文本。ctx 取消（如浏览器断开）时会中止上游请求。
func CallClaudeStream(
	ctx context.Context,
	system string,
	messages []claudeStreamMessage,
	onDelta func(text string),
) (string, error) {
	if config.C.Claude.APIKey == "" {
		return "", fmt.Errorf("claude api_key 未配置，请先在「系统管理 - AI 配置」中设置")
	}
	model := config.C.Claude.Model
	if model == "" {
		model = "claude-opus-4-5"
	}

	reqBody := claudeStreamRequest{
		Model:     model,
		MaxTokens: 8192,
		System:    system,
		Stream:    true,
		Messages:  messages,
	}
	body, _ := json.Marshal(reqBody)

	// 代理 API 地址：去掉末尾斜杠，拼接 /v1/messages
	baseURL := strings.TrimRight(config.C.Claude.BaseURL, "/")
	usingProxy := baseURL != "" && baseURL != anthropicDefaultBaseURL
	if baseURL == "" {
		baseURL = anthropicDefaultBaseURL
	}
	endpoint := baseURL + "/v1/messages"

	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("x-api-key", config.C.Claude.APIKey)
	req.Header.Set("anthropic-version", anthropicAPIVersion)
	req.Header.Set("content-type", "application/json")
	// 许多 Claude Code 代理/中转服务用 Bearer 鉴权；官方地址不附加以免冲突。
	if usingProxy {
		req.Header.Set("Authorization", "Bearer "+config.C.Claude.APIKey)
	}

	// 构建 HTTP client：如果配置了请求代理则使用，否则用默认 client。
	httpClient := http.DefaultClient
	if proxyAddr := strings.TrimSpace(config.C.Claude.ProxyURL); proxyAddr != "" {
		proxyURL, err := url.Parse(proxyAddr)
		if err == nil {
			httpClient = &http.Client{
				Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)},
			}
		}
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("claude 请求失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		data, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("claude 返回错误 %d: %s", resp.StatusCode, string(data))
	}

	// 上游为 SSE：逐行读取，只关心 content_block_delta 的文本增量。
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024) // 放大 buffer 防长行截断
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
			Type  string `json:"type"`
			Delta struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"delta"`
		}
		if json.Unmarshal([]byte(payload), &ev) != nil {
			continue
		}
		if ev.Type == "content_block_delta" && ev.Delta.Text != "" {
			sb.WriteString(ev.Delta.Text)
			if onDelta != nil {
				onDelta(ev.Delta.Text)
			}
		}
	}
	if err := sc.Err(); err != nil {
		return sb.String(), err
	}
	return sb.String(), nil
}

// extractJSONArray 从模型输出中抽取第一个完整 JSON 数组（去除 markdown 代码围栏）。
func extractJSONArray(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx >= 0 {
			s = s[idx+1:]
		}
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}
	start := strings.Index(s, "[")
	end := strings.LastIndex(s, "]")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}

// extractJSONObject 从模型输出中抽取第一个完整 JSON 对象（去除 markdown 代码围栏）。
// 返回 "" 表示未找到对象。
func extractJSONObject(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx >= 0 {
			s = s[idx+1:]
		}
		if idx := strings.LastIndex(s, "```"); idx >= 0 {
			s = s[:idx]
		}
		s = strings.TrimSpace(s)
	}
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return ""
}
