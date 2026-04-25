package mcp

import (
	"encoding/json"
	"fmt"
	"strings"

	"app-manager/config"
)

// ── image_to_canvas ───────────────────────────────────────────────────────────

type imageToCanvasParams struct {
	ImageBase64    string `json:"image_base64"`
	NaturalLanguage string `json:"natural_language"`
	CanvasWidth    int    `json:"canvas_width"`
	CanvasHeight   int    `json:"canvas_height"`
	Style          string `json:"style"` // "dark" | "light"
}

func imageToCanvas(raw json.RawMessage) (any, *RPCError) {
	var p imageToCanvasParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.ImageBase64 == "" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "image_base64 is required"}
	}
	if p.CanvasWidth == 0 {
		p.CanvasWidth = 1920
	}
	if p.CanvasHeight == 0 {
		p.CanvasHeight = 1080
	}
	if p.Style == "" {
		p.Style = "dark"
	}

	system := buildCanvasSystemPrompt(p.CanvasWidth, p.CanvasHeight, p.Style)
	userText := "Analyze this SCADA/HMI layout image and generate the CanvasProject JSON."
	if p.NaturalLanguage != "" {
		userText += "\n\nAdditional context: " + p.NaturalLanguage
	}

	// detect media type
	mediaType := "image/png"
	if strings.Contains(p.ImageBase64[:min(30, len(p.ImageBase64))], "jpeg") ||
		strings.Contains(p.ImageBase64[:min(30, len(p.ImageBase64))], "jpg") {
		mediaType = "image/jpeg"
	}

	text, usage, err := callClaudeVision(system, p.ImageBase64, mediaType, userText)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}

	jsonStr := extractJSON(text)
	var canvasProject any
	if err := json.Unmarshal([]byte(jsonStr), &canvasProject); err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: "failed to parse generated canvas: " + err.Error()}
	}

	return map[string]any{
		"canvas_project": canvasProject,
		"usage":          usage,
	}, nil
}

// ── text_to_canvas ────────────────────────────────────────────────────────────

type textToCanvasParams struct {
	Description  string `json:"description"`
	CanvasWidth  int    `json:"canvas_width"`
	CanvasHeight int    `json:"canvas_height"`
	Style        string `json:"style"`
}

func textToCanvas(raw json.RawMessage) (any, *RPCError) {
	var p textToCanvasParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.Description == "" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "description is required"}
	}
	if p.CanvasWidth == 0 {
		p.CanvasWidth = 1920
	}
	if p.CanvasHeight == 0 {
		p.CanvasHeight = 1080
	}
	if p.Style == "" {
		p.Style = "dark"
	}

	system := buildCanvasSystemPrompt(p.CanvasWidth, p.CanvasHeight, p.Style)
	text, usage, err := callClaude(system, "Generate a SCADA canvas layout for: "+p.Description)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}

	jsonStr := extractJSON(text)
	var canvasProject any
	if err := json.Unmarshal([]byte(jsonStr), &canvasProject); err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: "failed to parse generated canvas: " + err.Error()}
	}

	return map[string]any{
		"canvas_project": canvasProject,
		"usage":          usage,
	}, nil
}

// ── refine_canvas ─────────────────────────────────────────────────────────────

type refineCanvasParams struct {
	ScadaID     uint   `json:"scada_id"`
	Instruction string `json:"instruction"`
}

func refineCanvas(raw json.RawMessage) (any, *RPCError) {
	var p refineCanvasParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.Instruction == "" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "instruction is required"}
	}

	// load existing canvas
	result, rpcErr := getCanvas(mustMarshal(map[string]any{"scada_id": p.ScadaID}))
	if rpcErr != nil {
		return nil, rpcErr
	}
	existing, _ := json.Marshal(result)

	system := `You are a SCADA canvas editor. The user will provide an existing CanvasProject JSON and an instruction.
Apply the instruction and return the COMPLETE updated CanvasProject JSON.
Return ONLY the JSON object, no markdown, no explanation.`

	userText := fmt.Sprintf("Existing canvas:\n%s\n\nInstruction: %s", string(existing), p.Instruction)
	text, usage, err := callClaude(system, userText)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}

	jsonStr := extractJSON(text)
	var canvasProject any
	if err := json.Unmarshal([]byte(jsonStr), &canvasProject); err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: "failed to parse refined canvas: " + err.Error()}
	}

	return map[string]any{
		"canvas_project": canvasProject,
		"usage":          usage,
	}, nil
}

// ── system prompt builder ─────────────────────────────────────────────────────

func buildCanvasSystemPrompt(w, h int, style string) string {
	compJSON, _ := json.MarshalIndent(ComponentRegistry, "", "  ")
	bgColor := "#1a1a2e"
	if style == "light" {
		bgColor = "#f5f5f5"
	}

	return fmt.Sprintf(`You are a SCADA layout generator for an industrial HMI system.
Analyze the input and return a valid CanvasProject JSON object.

Canvas size: %dx%d pixels. Background style: %s (default bg: %s).

Available component types (use ONLY these):
%s

Layout rules:
- Every element MUST have a unique "id" in format "el_1", "el_2", etc.
- x, y, width, height must be integers within canvas bounds (0 to %d, 0 to %d).
- zIndex starts at 1, increment for overlapping elements.
- Set "visible": true, "locked": false, "rotation": 0 unless clearly otherwise.
- Use dynamic-valve/pump/tank/pipe for industrial components.
- Use echarts-gauge for circular meters, echarts-bar/line for trend charts.
- For data-bound elements, add "pointBinding": {"pointKey": "...", "deviceCode": "...", "dataMode": "stomp"}.
  dataMode can be "stomp" (backend push, for published screens) or "http" (frontend poll, for design/preview).
- Text labels use type "text" with appropriate fontSize (12-24).
- Match background color to the image or use the default for the style.

Return ONLY this JSON structure, no markdown, no explanation:
{
  "version": 1,
  "activeCanvasId": 1,
  "canvasGroups": [{"id": 1, "name": "Main", "type": "panel"}],
  "canvases": {
    "1": {
      "id": 1, "name": "Main", "width": %d, "height": %d,
      "background": "solid", "backgroundColor": "%s",
      "showGrid": false, "snapToGrid": false, "gridSize": 10,
      "gridColor": "#333", "showRuler": false, "zoom": 1,
      "viewport": {"x": 0, "y": 0, "width": %d, "height": %d},
      "elements": []
    }
  }
}

Server: %s (used for STOMP WebSocket endpoint ws://{server}/ws/stomp)`,
		w, h, style, bgColor,
		string(compJSON),
		w, h,
		w, h, bgColor, w, h,
		config.C.Server.PublicBaseURL,
	)
}

func mustMarshal(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
