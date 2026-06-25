package webrtc

import (
	"app-manager/config"
	"strings"

	"github.com/pion/webrtc/v3"
)

// PeerConnectionConfig returns ICE settings for phone ↔ server.
//
// 局域网部署应留空 ICE 服务器：手机与服务器在同一网段时仅用 host 候选即可秒连。
// 若仍配置了内网访问不到的公网 STUN（如 stun.l.google.com），ICE 会等待该
// 服务器反射候选（srflx）收集超时后才完成连接，表现为「能出画面但首帧要等数十秒」。
//
// 跨网段 / 公网穿透时，在 config 的 webrtc.ice_servers 填 STUN/TURN：
//
//	webrtc:
//	  ice_servers:
//	    - "stun:stun.l.google.com:19302"
//	    - "turn:user:pass@turn.example.com:3478"
func PeerConnectionConfig() webrtc.Configuration {
	return webrtc.Configuration{
		ICEServers: iceServersFromConfig(),
	}
}

// ICEServersJSON 返回供 Agent / 浏览器复用的 ICE 服务器列表（统一三端配置）。
func ICEServersJSON() []map[string]interface{} {
	out := make([]map[string]interface{}, 0)
	for _, s := range iceServersFromConfig() {
		entry := map[string]interface{}{"urls": s.URLs}
		if s.Username != "" {
			entry["username"] = s.Username
		}
		if cred, ok := s.Credential.(string); ok && cred != "" {
			entry["credential"] = cred
		}
		out = append(out, entry)
	}
	return out
}

func iceServersFromConfig() []webrtc.ICEServer {
	var raw []string
	if config.C != nil {
		raw = config.C.WebRTC.ICEServers
	}
	servers := make([]webrtc.ICEServer, 0, len(raw))
	for _, item := range raw {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		servers = append(servers, parseICEServer(item))
	}
	return servers
}

// parseICEServer 支持两种写法：
//   - "stun:host:port" / "turn:host:port"（无凭据）
//   - "turn:user:pass@host:port"（含凭据，仅 turn/turns）
func parseICEServer(item string) webrtc.ICEServer {
	scheme := ""
	rest := item
	if i := strings.Index(item, ":"); i >= 0 {
		scheme = strings.ToLower(item[:i])
		rest = item[i+1:]
	}
	// 含凭据：scheme:user:pass@host:port
	if (scheme == "turn" || scheme == "turns") && strings.Contains(rest, "@") {
		at := strings.LastIndex(rest, "@")
		creds := rest[:at]
		host := rest[at+1:]
		user := creds
		pass := ""
		if c := strings.Index(creds, ":"); c >= 0 {
			user = creds[:c]
			pass = creds[c+1:]
		}
		return webrtc.ICEServer{
			URLs:       []string{scheme + ":" + host},
			Username:   user,
			Credential: pass,
		}
	}
	return webrtc.ICEServer{URLs: []string{item}}
}
