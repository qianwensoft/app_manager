package logcat

import "strings"

// NormalizeFilters 去空、去重，保留 adb logcat 过滤片段顺序。
func NormalizeFilters(in []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, raw := range in {
		for _, part := range splitFilterText(raw) {
			if _, ok := seen[part]; ok {
				continue
			}
			seen[part] = struct{}{}
			out = append(out, part)
		}
	}
	return out
}

func splitFilterText(s string) []string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var parts []string
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		for _, tok := range strings.Fields(line) {
			tok = strings.TrimSpace(tok)
			if tok != "" {
				parts = append(parts, tok)
			}
		}
	}
	return parts
}
