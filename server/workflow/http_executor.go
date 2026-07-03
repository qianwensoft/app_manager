package workflow

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// HTTPStepExecutor executes HTTP request steps
type HTTPStepExecutor struct {
	client *http.Client
}

// NewHTTPStepExecutor creates a new HTTP step executor
func NewHTTPStepExecutor(timeout time.Duration) *HTTPStepExecutor {
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	return &HTTPStepExecutor{
		client: &http.Client{
			Timeout: timeout,
		},
	}
}

// Execute executes an HTTP step
func (e *HTTPStepExecutor) Execute(step *Step, ctx *Context) (*StepResult, error) {
	startTime := time.Now()

	result := &StepResult{
		StepID:    step.ID,
		Type:      step.Type,
		Label:     step.Label,
		StartTime: startTime,
		Output:    make(map[string]interface{}),
	}

	// Parse HTTP config
	httpConfig, ok := step.HTTPConfig.(map[string]interface{})
	if !ok {
		result.Success = false
		result.Error = "invalid http_config"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Extract HTTP parameters
	method := strings.ToUpper(getStringFromMap(httpConfig, "method", "GET"))
	url := getStringFromMap(httpConfig, "url", "")
	if url == "" {
		result.Success = false
		result.Error = "url is required"
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, fmt.Errorf(result.Error)
	}

	// Expand template variables in URL
	url = e.expandTemplate(url, ctx)

	// Prepare request body
	var bodyReader io.Reader
	if method != "GET" && method != "HEAD" {
		bodyData := httpConfig["body"]
		if bodyData != nil {
			bodyJSON, err := json.Marshal(bodyData)
			if err != nil {
				result.Success = false
				result.Error = fmt.Sprintf("failed to marshal body: %v", err)
				result.ElapsedMS = time.Since(startTime).Milliseconds()
				return result, err
			}
			// Expand template variables in body
			bodyStr := e.expandTemplate(string(bodyJSON), ctx)
			bodyReader = bytes.NewBufferString(bodyStr)
		}
	}

	// Create HTTP request
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("failed to create request: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	// Set headers
	if headers, ok := httpConfig["headers"].(map[string]interface{}); ok {
		for key, val := range headers {
			valStr := fmt.Sprintf("%v", val)
			valStr = e.expandTemplate(valStr, ctx)
			req.Header.Set(key, valStr)
		}
	}

	// Set default Content-Type for POST/PUT
	if (method == "POST" || method == "PUT" || method == "PATCH") && req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	// Execute request
	resp, err := e.client.Do(req)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("request failed: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}
	defer resp.Body.Close()

	// Read response body
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		result.Success = false
		result.Error = fmt.Sprintf("failed to read response: %v", err)
		result.ElapsedMS = time.Since(startTime).Milliseconds()
		return result, err
	}

	// Parse response
	result.Output["status_code"] = resp.StatusCode
	result.Output["headers"] = resp.Header
	result.Output["body"] = string(respBody)

	// Try to parse JSON response
	var jsonBody interface{}
	if err := json.Unmarshal(respBody, &jsonBody); err == nil {
		result.Output["json"] = jsonBody
	}

	// Check if request was successful
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		result.Success = true

		// Process output mapping
		if step.Output != nil {
			e.processOutput(step.Output, result, ctx)
		}
	} else {
		result.Success = false
		result.Error = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	result.ElapsedMS = time.Since(startTime).Milliseconds()
	return result, nil
}

// Validate validates HTTP step configuration
func (e *HTTPStepExecutor) Validate(step *Step) error {
	if step.HTTPConfig == nil {
		return fmt.Errorf("http_config is required")
	}

	httpConfig, ok := step.HTTPConfig.(map[string]interface{})
	if !ok {
		return fmt.Errorf("http_config must be an object")
	}

	url := getStringFromMap(httpConfig, "url", "")
	if url == "" {
		return fmt.Errorf("url is required")
	}

	method := strings.ToUpper(getStringFromMap(httpConfig, "method", "GET"))
	validMethods := map[string]bool{
		"GET": true, "POST": true, "PUT": true, "DELETE": true,
		"PATCH": true, "HEAD": true, "OPTIONS": true,
	}
	if !validMethods[method] {
		return fmt.Errorf("invalid method: %s", method)
	}

	return nil
}

// expandTemplate replaces template variables in a string
func (e *HTTPStepExecutor) expandTemplate(template string, ctx *Context) string {
	result := template

	// Replace {{request.field}} patterns
	for key, val := range ctx.Request {
		placeholder := fmt.Sprintf("{{request.%s}}", key)
		valStr := fmt.Sprintf("%v", val)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}

	// Replace {{variables.field}} patterns
	for key, val := range ctx.Variables {
		placeholder := fmt.Sprintf("{{variables.%s}}", key)
		valStr := fmt.Sprintf("%v", val)
		result = strings.ReplaceAll(result, placeholder, valStr)

		// Also support {{vars.field}}
		placeholder = fmt.Sprintf("{{vars.%s}}", key)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}

	// Replace {{env.field}} patterns
	for key, val := range ctx.Env {
		placeholder := fmt.Sprintf("{{env.%s}}", key)
		valStr := fmt.Sprintf("%v", val)
		result = strings.ReplaceAll(result, placeholder, valStr)
	}

	return result
}

// processOutput processes the output mapping
func (e *HTTPStepExecutor) processOutput(outputDef interface{}, result *StepResult, ctx *Context) {
	switch v := outputDef.(type) {
	case map[string]interface{}:
		for key, path := range v {
			if pathStr, ok := path.(string); ok {
				// Extract value from result using path notation
				val := e.extractValue(result.Output, pathStr)
				if val != nil {
					result.Output[key] = val
					ctx.SetVariable(key, val)
				}
			}
		}
	}
}

// extractValue extracts a value from nested map using dot notation
func (e *HTTPStepExecutor) extractValue(data map[string]interface{}, path string) interface{} {
	parts := strings.Split(path, ".")
	current := interface{}(data)

	for _, part := range parts {
		if m, ok := current.(map[string]interface{}); ok {
			current = m[part]
		} else {
			return nil
		}
	}

	return current
}

// getStringFromMap gets a string value from map with default
func getStringFromMap(m map[string]interface{}, key, def string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}
