package api

import (
	"fmt"
	"regexp"
	"strings"
)

// reDataStackCode 业务编码：字母开头，总长 2–80，避免与纯数字主键混淆。
var reDataStackCode = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{1,79}$`)

func slugifyDataStackCodeHint(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '_', r == '-':
			b.WriteRune(r)
		case r == ' ', r == '.', r == '·':
			b.WriteRune('_')
		default:
			continue
		}
		if b.Len() >= 48 {
			break
		}
	}
	out := strings.Trim(b.String(), "_-")
	if out == "" {
		return "item"
	}
	return out
}

func validateNonEmptyDataStackCode(code, label string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return fmt.Errorf("%s不能为空", label)
	}
	if !reDataStackCode.MatchString(code) {
		return fmt.Errorf("%s须为字母开头，2–80 位字母、数字、下划线、短横线", label)
	}
	return nil
}

func suggestUniqueDataStackCode(base string, exists func(string) bool) string {
	b := slugifyDataStackCodeHint(base)
	if len(b) > 56 {
		b = b[:56]
	}
	for i := 0; i < 80; i++ {
		cand := b
		if i > 0 {
			cand = fmt.Sprintf("%s_%d", b, i)
		}
		if len(cand) > 80 {
			cand = cand[:80]
		}
		if !reDataStackCode.MatchString(cand) {
			cand = "c_" + strings.TrimLeft(cand, "_-")
			if len(cand) > 80 {
				cand = cand[:80]
			}
			if !reDataStackCode.MatchString(cand) {
				cand = "code"
			}
		}
		if !exists(cand) {
			return cand
		}
	}
	return "c_" + b
}
