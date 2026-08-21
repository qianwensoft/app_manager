package api

import (
	"app-manager/config"
	"app-manager/models"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ── SSO 跳转安全（redirect_to 白名单 + HMAC 签名）──────────────────────────────────

// ErrRedirectNotAllowed redirect_to 不在白名单。
var ErrRedirectNotAllowed = errors.New("redirect_to not in allowlist")

// ErrSignatureInvalid 签名校验失败。
var ErrSignatureInvalid = errors.New("signature invalid or expired")

// SSOSignResult 签名结果，用于在 thirdparty_sso.go 透传到前端。
type SSOSignResult struct {
	Sig   string `json:"sig"`    // hex(HMAC-SHA256(secret, baseURL|path|exp|provider))
	Exp   int64  `json:"exp"`    // unix 秒
	KeyID string `json:"key_id"` // 标识使用哪把密钥（"global" 或 "provider:<id>"）
}

// resolveRedirectAllowlist 计算最终生效的 redirect_to 白名单：
//
//	Provider.RedirectAllowlistJSON（精确）> 系统 server.sso.redirect_to_whitelist > 内置兜底（仅 "/"）。
func resolveRedirectAllowlist(p *models.ThirdPartyProvider) []string {
	if p != nil && p.RedirectAllowlistJSON != "" {
		var list []string
		if err := json.Unmarshal([]byte(p.RedirectAllowlistJSON), &list); err == nil && len(list) > 0 {
			return list
		}
	}
	if config.C != nil {
		if cfg := config.C.SSO.RedirectToWhitelist; len(cfg) > 0 {
			return cfg
		}
	}
	// 内置兜底：仅允许根路径，避免完全开放
	return []string{"/"}
}

// resolveHMACSecret 优先 Provider 自身密钥，其次系统密钥，两者都空返回空字符串。
func resolveHMACSecret(p *models.ThirdPartyProvider) string {
	if p != nil && strings.TrimSpace(p.HMACSecret) != "" {
		return strings.TrimSpace(p.HMACSecret)
	}
	if config.C != nil {
		return strings.TrimSpace(config.C.SSO.HMACSecret)
	}
	return ""
}

// resolveClockSkew 时钟偏移容忍秒数。
func resolveClockSkew(p *models.ThirdPartyProvider) int {
	if p != nil && p.HMACClockSkewSec > 0 {
		return p.HMACClockSkewSec
	}
	if config.C != nil {
		return config.C.SSO.ClockSkewOrDefault()
	}
	return 300
}

// isRedirectAllowed 判断 redirect_to 是否命中白名单。
//   - 必须为相对路径（以 "/" 开头，非 "//" 开头，避免 protocol-relative 跳转）
//   - 不允许协议头（http:、javascript:、data:）
//   - 不允许 URL fragment 中的特殊用法
//   - 命中规则：精确等于、或匹配 "/*" 前缀
func isRedirectAllowed(redirect string, allowlist []string) bool {
	redirect = strings.TrimSpace(redirect)
	if redirect == "" {
		return false
	}
	// 防止 protocol-relative URL（//evil.com）
	if strings.HasPrefix(redirect, "//") {
		return false
	}
	// 必须以 "/" 开头且不是协议头
	if !strings.HasPrefix(redirect, "/") {
		return false
	}
	lower := strings.ToLower(redirect)
	for _, bad := range []string{"javascript:", "data:", "vbscript:"} {
		if strings.HasPrefix(lower, bad) {
			return false
		}
	}
	// 拆掉 query 与 fragment，只校验 path
	if idx := strings.IndexAny(redirect, "?#"); idx >= 0 {
		redirect = redirect[:idx]
	}
	for _, pattern := range allowlist {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if pattern == redirect {
			return true
		}
		if strings.HasSuffix(pattern, "/*") {
			prefix := strings.TrimSuffix(pattern, "*")
			if strings.HasPrefix(redirect, prefix) {
				return true
			}
		}
	}
	return false
}

// signRedirect 为 redirect_to 签发 HMAC-SHA256。
//
//	payload 形如：baseURL|path|exp|provider
//	签名随同 exp 与 key_id 一起下发，前端拼接为 ?redirect_to=...&exp=...&sig=...&kid=...
func signRedirect(secret, baseURL, path string, exp int64, providerID uint) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(baseURL))
	mac.Write([]byte("|"))
	mac.Write([]byte(path))
	mac.Write([]byte("|"))
	mac.Write([]byte(strconv.FormatInt(exp, 10)))
	mac.Write([]byte("|"))
	mac.Write([]byte(strconv.FormatUint(uint64(providerID), 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

// VerifyRedirect 校验 redirect_to 是否被白名单允许 + HMAC 签名是否有效。
// 同时支持：
//   - signedRedirect：传 sig/exp/baseURL → 严格校验签名（含 provider 隔离）
//   - plainRedirect：未传签名 → 仅校验白名单（保留向后兼容入口）
//   - emptyRedirect：redirect_to 为空 → 直接放行（调用方不关心跳转，
//     例如老脚本被动调 /api/auth/thirdparty/login，只拿 token）
//
// 调用方传入的 baseURL 应来自回调页的 window.location.origin，避免 path-only 被跨域劫持。
func VerifyRedirect(p *models.ThirdPartyProvider, redirectTo, sig, expStr, baseURL string, now time.Time) error {
	redirectTo = strings.TrimSpace(redirectTo)
	if redirectTo == "" {
		// 调用方未传 redirect_to：无跳转风险，按"原始功能"放行
		return nil
	}

	// Provider 关闭白名单时直接放行（向后兼容旧 Provider 配置）
	if p != nil && !p.RedirectAllowEnabled {
		return nil
	}

	allowlist := resolveRedirectAllowlist(p)
	if !isRedirectAllowed(redirectTo, allowlist) {
		return fmt.Errorf("%w (allowlist size=%d)", ErrRedirectNotAllowed, len(allowlist))
	}

	// 未提供签名 → 仅作白名单校验（兼容旧测试场景）；生产建议始终传签名。
	if sig == "" || expStr == "" {
		return nil
	}

	secret := resolveHMACSecret(p)
	if secret == "" {
		// fail-closed：未配置密钥时拒绝签名链接
		return fmt.Errorf("%w: hmac_secret not configured", ErrSignatureInvalid)
	}

	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return fmt.Errorf("%w: bad exp", ErrSignatureInvalid)
	}
	clockSkew := resolveClockSkew(p)
	if now.Unix() > exp+int64(clockSkew) {
		return fmt.Errorf("%w: expired", ErrSignatureInvalid)
	}
	if now.Unix() < exp-int64(clockSkew)*10 {
		// exp 远在未来（> 1 小时偏移），极可能是伪造/篡改
		return fmt.Errorf("%w: exp too far in future", ErrSignatureInvalid)
	}

	providerID := uint(0)
	if p != nil {
		providerID = p.ID
	}

	expected := signRedirect(secret, baseURL, redirectTo, exp, providerID)
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		return fmt.Errorf("%w: mismatch", ErrSignatureInvalid)
	}
	return nil
}

// BuildSignedRedirect 在后端为前端构造带签名的 callback URL（用于「生成 SSO 链接」API）。
//
//	返回完整的 callback URL 与签名要素。
//	baseURL 为本系统浏览器可达的对外基址（如 https://app.example.com）。
func BuildSignedRedirect(p *models.ThirdPartyProvider, baseURL, redirectTo string, ttl time.Duration) (callbackURL string, result SSOSignResult, err error) {
	redirectTo = strings.TrimSpace(redirectTo)
	if redirectTo == "" {
		return "", result, errors.New("redirect_to required")
	}
	allowlist := resolveRedirectAllowlist(p)
	if !isRedirectAllowed(redirectTo, allowlist) {
		return "", result, fmt.Errorf("%w", ErrRedirectNotAllowed)
	}
	secret := resolveHMACSecret(p)
	if secret == "" {
		return "", result, errors.New("hmac_secret not configured")
	}
	if !strings.HasSuffix(baseURL, "/") {
		baseURL += "/"
	}
	exp := time.Now().Add(ttl).Unix()
	sig := signRedirect(secret, baseURL, redirectTo, exp, p.ID)

	keyID := "global"
	if strings.TrimSpace(p.HMACSecret) != "" {
		keyID = fmt.Sprintf("provider:%d", p.ID)
	}
	result = SSOSignResult{Sig: sig, Exp: exp, KeyID: keyID}

	u, perr := url.Parse(baseURL + "auth-eteams-callback.html")
	if perr != nil {
		return "", result, perr
	}
	q := u.Query()
	q.Set("provider_id", strconv.FormatUint(uint64(p.ID), 10))
	q.Set("redirect_to", redirectTo)
	q.Set("exp", strconv.FormatInt(exp, 10))
	q.Set("sig", sig)
	q.Set("kid", keyID)
	u.RawQuery = q.Encode()
	return u.String(), result, nil
}
