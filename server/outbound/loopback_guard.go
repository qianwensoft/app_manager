package outbound

import (
	"fmt"
	"net"
	"net/url"
	"strings"

	"app-manager/config"
)

// BlockedSelfOpenAPIURL 检测出站 HTTP 是否回调本机开放数据接口（/api/open/v1/*）。
func BlockedSelfOpenAPIURL(rawURL string) (blocked bool, reason string) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Host == "" {
		return false, ""
	}
	path := u.Path
	if path == "" {
		path = "/"
	}
	if !strings.HasPrefix(path, "/api/open/v1") {
		return false, ""
	}
	host := strings.ToLower(u.Hostname())
	if isLoopbackHostname(host) {
		return true, fmt.Sprintf("禁止出站 HTTP 回调本机开放接口 %s", path)
	}
	if self := configuredServerHostname(); self != "" && strings.EqualFold(host, self) {
		return true, fmt.Sprintf("禁止出站 HTTP 回调本机开放接口 %s", path)
	}
	return false, ""
}

func isLoopbackHostname(host string) bool {
	if host == "localhost" || host == "0.0.0.0" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func configuredServerHostname() string {
	if config.C == nil {
		return ""
	}
	if pub := strings.TrimSpace(config.C.Server.PublicBaseURL); pub != "" {
		if u, err := url.Parse(pub); err == nil {
			if h := strings.TrimSpace(u.Hostname()); h != "" && !strings.EqualFold(h, "0.0.0.0") {
				return strings.ToLower(h)
			}
		}
	}
	host := strings.TrimSpace(config.C.Server.Host)
	if host != "" && !strings.EqualFold(host, "0.0.0.0") {
		return strings.ToLower(host)
	}
	return ""
}
