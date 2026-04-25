package outbound

import (
	"sync"
)

// webhookRegistry 全局 Webhook token → sessionKey 注册表（TriggerManager 管理）。
var webhookRegistry = &whRegistry{m: map[string]string{}}

type whRegistry struct {
	mu sync.RWMutex
	m  map[string]string // token -> sessionKey
}

func (r *whRegistry) register(token, sessionKey string) {
	if token == "" {
		return
	}
	r.mu.Lock()
	r.m[token] = sessionKey
	r.mu.Unlock()
}

func (r *whRegistry) unregister(token string) {
	r.mu.Lock()
	delete(r.m, token)
	r.mu.Unlock()
}

// LookupWebhookSession 根据 token 找到对应的 triggerSession（供 HTTP handler 调用）。
func LookupWebhookSession(token string) *triggerSession {
	if GlobalTriggerManager == nil {
		return nil
	}
	webhookRegistry.mu.RLock()
	key, ok := webhookRegistry.m[token]
	webhookRegistry.mu.RUnlock()
	if !ok {
		return nil
	}
	GlobalTriggerManager.mu.RLock()
	sess := GlobalTriggerManager.sessions[key]
	GlobalTriggerManager.mu.RUnlock()
	return sess
}
