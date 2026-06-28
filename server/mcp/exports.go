package mcp

// CallClaude 导出给其他包使用
func CallClaude(system, userText string) (string, *claudeUsage, error) {
	return callClaude(system, userText)
}

// CallClaudeVision 导出给其他包使用
func CallClaudeVision(system, imageBase64, mediaType, userText string) (string, *claudeUsage, error) {
	return callClaudeVision(system, imageBase64, mediaType, userText)
}

// ExtractJSON 导出给其他包使用
func ExtractJSON(s string) string {
	return extractJSON(s)
}
