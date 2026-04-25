package mcp

// ComponentDef describes a single SCADA element type for AI consumption.
type ComponentDef struct {
	Type     string         `json:"type"`
	Label    string         `json:"label"`
	Category string         `json:"category"` // basic | text | chart | dynamic | custom
	Defaults map[string]any `json:"defaults"`
}

// ComponentRegistry is the authoritative list of all supported element types.
// Every new component added to the frontend MUST have a corresponding entry here.
var ComponentRegistry = []ComponentDef{
	// ── basic shapes ──────────────────────────────────────────────────────────
	{Type: "rect", Label: "Rectangle", Category: "basic",
		Defaults: map[string]any{"width": 100, "height": 60, "fill": "#4a90d9", "stroke": "#2c5f8a", "strokeWidth": 1, "opacity": 1}},
	{Type: "circle", Label: "Circle", Category: "basic",
		Defaults: map[string]any{"width": 60, "height": 60, "fill": "#4a90d9", "stroke": "#2c5f8a", "strokeWidth": 1, "opacity": 1}},
	{Type: "ellipse", Label: "Ellipse", Category: "basic",
		Defaults: map[string]any{"width": 80, "height": 50, "fill": "#4a90d9", "stroke": "#2c5f8a", "strokeWidth": 1, "opacity": 1}},
	{Type: "line", Label: "Line", Category: "basic",
		Defaults: map[string]any{"width": 100, "height": 2, "stroke": "#ffffff", "strokeWidth": 2, "opacity": 1}},
	{Type: "polyline", Label: "Polyline", Category: "basic",
		Defaults: map[string]any{"stroke": "#ffffff", "strokeWidth": 2, "opacity": 1}},
	{Type: "polygon", Label: "Polygon", Category: "basic",
		Defaults: map[string]any{"width": 80, "height": 80, "fill": "#4a90d9", "stroke": "#2c5f8a", "strokeWidth": 1, "opacity": 1}},
	{Type: "image", Label: "Image", Category: "basic",
		Defaults: map[string]any{"width": 100, "height": 100, "opacity": 1}},

	// ── text / ui ─────────────────────────────────────────────────────────────
	{Type: "text", Label: "Text", Category: "text",
		Defaults: map[string]any{"width": 120, "height": 30, "fontSize": 14, "fontColor": "#ffffff", "text": "Label", "opacity": 1}},
	{Type: "button", Label: "Button", Category: "text",
		Defaults: map[string]any{"width": 100, "height": 36, "fill": "#2d6a9f", "text": "Button", "fontSize": 14, "fontColor": "#ffffff", "opacity": 1}},
	{Type: "table", Label: "Table", Category: "text",
		Defaults: map[string]any{"width": 300, "height": 200, "opacity": 1}},
	{Type: "radio", Label: "Radio", Category: "text",
		Defaults: map[string]any{"width": 120, "height": 30, "opacity": 1}},
	{Type: "checkbox", Label: "Checkbox", Category: "text",
		Defaults: map[string]any{"width": 120, "height": 30, "opacity": 1}},

	// ── charts ────────────────────────────────────────────────────────────────
	{Type: "echarts-bar", Label: "Bar Chart", Category: "chart",
		Defaults: map[string]any{"width": 300, "height": 200, "opacity": 1}},
	{Type: "echarts-line", Label: "Line Chart", Category: "chart",
		Defaults: map[string]any{"width": 300, "height": 200, "opacity": 1}},
	{Type: "echarts-pie", Label: "Pie Chart", Category: "chart",
		Defaults: map[string]any{"width": 200, "height": 200, "opacity": 1}},
	{Type: "echarts-gauge", Label: "Gauge", Category: "chart",
		Defaults: map[string]any{"width": 160, "height": 160, "opacity": 1}},

	// ── dynamic industrial ────────────────────────────────────────────────────
	{Type: "dynamic-valve", Label: "Valve", Category: "dynamic",
		Defaults: map[string]any{"width": 48, "height": 48, "fill": "#e8e8e8", "opacity": 1}},
	{Type: "dynamic-pump", Label: "Pump", Category: "dynamic",
		Defaults: map[string]any{"width": 64, "height": 64, "fill": "#e8e8e8", "opacity": 1}},
	{Type: "dynamic-tank", Label: "Tank", Category: "dynamic",
		Defaults: map[string]any{"width": 80, "height": 120, "fill": "#4a90d9", "opacity": 1}},
	{Type: "dynamic-pipe", Label: "Pipe", Category: "dynamic",
		Defaults: map[string]any{"width": 120, "height": 20, "fill": "#888888", "opacity": 1}},

	// ── custom ────────────────────────────────────────────────────────────────
	{Type: "custom", Label: "Custom Component", Category: "custom",
		Defaults: map[string]any{"width": 100, "height": 100, "opacity": 1}},
}
