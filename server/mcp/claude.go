package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"app-manager/config"
)

const anthropicAPI = "https://api.anthropic.com/v1/messages"
const anthropicVersion = "2023-06-01"

type claudeRequest struct {
	Model     string    `json:"model"`
	MaxTokens int       `json:"max_tokens"`
	System    string    `json:"system,omitempty"`
	Messages  []claudeMessage `json:"messages"`
}

type claudeMessage struct {
	Role    string         `json:"role"`
	Content []claudeContent `json:"content"`
}

type claudeContent struct {
	Type   string       `json:"type"`
	Text   string       `json:"text,omitempty"`
	Source *imageSource `json:"source,omitempty"`
}

type imageSource struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // "image/png" | "image/jpeg"
	Data      string `json:"data"`       // raw base64, no data: prefix
}

type claudeUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage claudeUsage `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// callClaude sends a text-only message to Claude and returns the response text.
func callClaude(system, userText string) (string, *claudeUsage, error) {
	return callClaudeMessages(system, []claudeContent{{Type: "text", Text: userText}})
}

// callClaudeVision sends an image + text message to Claude.
func callClaudeVision(system, imageBase64, mediaType, userText string) (string, *claudeUsage, error) {
	// strip data URI prefix if present
	if idx := strings.Index(imageBase64, ","); idx >= 0 {
		imageBase64 = imageBase64[idx+1:]
	}
	if mediaType == "" {
		mediaType = "image/png"
	}
	return callClaudeMessages(system, []claudeContent{
		{Type: "image", Source: &imageSource{Type: "base64", MediaType: mediaType, Data: imageBase64}},
		{Type: "text", Text: userText},
	})
}

func callClaudeMessages(system string, content []claudeContent) (string, *claudeUsage, error) {
	if config.C.Claude.APIKey == "" {
		return "", nil, fmt.Errorf("claude api_key not configured")
	}
	reqBody := claudeRequest{
		Model:     config.C.Claude.Model,
		MaxTokens: 8192,
		System:    system,
		Messages:  []claudeMessage{{Role: "user", Content: content}},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", anthropicAPI, bytes.NewReader(body))
	req.Header.Set("x-api-key", config.C.Claude.APIKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	req.Header.Set("content-type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", nil, fmt.Errorf("claude request failed: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var cr claudeResponse
	if err := json.Unmarshal(data, &cr); err != nil {
		return "", nil, fmt.Errorf("claude response parse error: %w", err)
	}
	if cr.Error != nil {
		return "", nil, fmt.Errorf("claude error: %s", cr.Error.Message)
	}
	if len(cr.Content) == 0 {
		return "", nil, fmt.Errorf("claude returned empty content")
	}
	return cr.Content[0].Text, &cr.Usage, nil
}

// extractJSON extracts the first complete JSON object from a string.
// Handles cases where Claude wraps output in markdown code fences.
func extractJSON(s string) string {
	// strip markdown fences
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
	// find first { and last }
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
