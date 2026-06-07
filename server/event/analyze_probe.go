package event

import (
	"strings"
)

// ProbeModePreset 使用 PDA 预设 + 已启用定义中的广播动作。
const ProbeModePreset = "preset"

// ProbeModeCustom 仅使用用户指定的 Action / 通配模式。
const ProbeModeCustom = "custom"

// ProbeBuildResult 探针下发：Agent 注册列表 + 运行时过滤模式。
type ProbeBuildResult struct {
	RegisterActions []string
	Patterns        []string
}

// NormalizeProbePatterns 去重、去空。
func NormalizeProbePatterns(patterns []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, p := range patterns {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

// BuildProbeActions 根据模式与通配规则生成 Agent 注册动作与过滤模式。
// 通配：`prefix.*` 匹配 prefix 或以 prefix. 开头；`*` 匹配目录内全部动作。
func BuildProbeActions(mode string, customPatterns []string, catalog []string) ProbeBuildResult {
	if mode != ProbeModeCustom {
		acts := make([]string, len(catalog))
		copy(acts, catalog)
		return ProbeBuildResult{RegisterActions: dedupeStrings(acts), Patterns: nil}
	}
	patterns := NormalizeProbePatterns(customPatterns)
	if len(patterns) == 0 {
		return ProbeBuildResult{}
	}
	regSet := make(map[string]struct{})
	for _, pat := range patterns {
		for _, a := range expandPattern(pat, catalog) {
			regSet[a] = struct{}{}
		}
	}
	// 通配未命中目录时仍用全量目录注册，由 Agent 端按 patterns 过滤上报
	if len(regSet) == 0 && hasWildcardPattern(patterns) {
		for _, a := range catalog {
			regSet[a] = struct{}{}
		}
	}
	register := make([]string, 0, len(regSet))
	for a := range regSet {
		register = append(register, a)
	}
	return ProbeBuildResult{
		RegisterActions: dedupeStrings(register),
		Patterns:        patterns,
	}
}

func hasWildcardPattern(patterns []string) bool {
	for _, p := range patterns {
		if p == "*" || strings.Contains(p, "*") {
			return true
		}
	}
	return false
}

func expandPattern(pat string, catalog []string) []string {
	pat = strings.TrimSpace(pat)
	if pat == "" {
		return nil
	}
	if pat == "*" {
		return append([]string(nil), catalog...)
	}
	if strings.HasSuffix(pat, ".*") {
		prefix := strings.TrimSuffix(pat, ".*")
		if prefix == "" {
			return append([]string(nil), catalog...)
		}
		var out []string
		out = append(out, prefix)
		for _, a := range catalog {
			if a == prefix || strings.HasPrefix(a, prefix+".") {
				out = append(out, a)
			}
		}
		return out
	}
	if strings.Contains(pat, "*") {
		var out []string
		for _, a := range catalog {
			if simpleGlobMatch(pat, a) {
				out = append(out, a)
			}
		}
		return out
	}
	return []string{pat}
}

// simpleGlobMatch 支持 `*` 单段通配（不含 `/` 语义，仅用于 action 字符串）。
func simpleGlobMatch(pattern, action string) bool {
	if pattern == action {
		return true
	}
	if !strings.Contains(pattern, "*") {
		return false
	}
	parts := strings.Split(pattern, "*")
	if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
		return strings.HasPrefix(action, parts[0]) && strings.HasSuffix(action, parts[1])
	}
	if len(parts) == 2 && parts[1] == "" {
		return strings.HasPrefix(action, parts[0])
	}
	if len(parts) == 2 && parts[0] == "" {
		return strings.HasSuffix(action, parts[1])
	}
	return false
}

// MatchProbeAction Agent/服务端过滤：action 是否命中用户探针模式。
func MatchProbeAction(action string, patterns []string) bool {
	action = strings.TrimSpace(action)
	if action == "" {
		return false
	}
	if len(patterns) == 0 {
		return true
	}
	for _, pat := range patterns {
		pat = strings.TrimSpace(pat)
		if pat == "" {
			continue
		}
		if pat == "*" {
			return true
		}
		if pat == action {
			return true
		}
		if strings.HasSuffix(pat, ".*") {
			prefix := strings.TrimSuffix(pat, ".*")
			if prefix != "" && (action == prefix || strings.HasPrefix(action, prefix+".")) {
				return true
			}
		}
		if strings.Contains(pat, "*") && simpleGlobMatch(pat, action) {
			return true
		}
	}
	return false
}

func dedupeStrings(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	var out []string
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}
