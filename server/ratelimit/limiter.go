package ratelimit

import (
	"sync"

	"golang.org/x/time/rate"
)

type store struct {
	mu      sync.Mutex
	entries map[string]*rate.Limiter
}

var globalStore = &store{entries: make(map[string]*rate.Limiter)}

func allow(key string, perMinute, burst int) bool {
	if perMinute <= 0 {
		perMinute = 120
	}
	if burst <= 0 {
		burst = 30
	}
	lim := globalStore.get(key, rate.Limit(float64(perMinute)/60.0), burst)
	return lim.Allow()
}

func (s *store) get(key string, r rate.Limit, burst int) *rate.Limiter {
	s.mu.Lock()
	defer s.mu.Unlock()
	lim, ok := s.entries[key]
	if !ok {
		lim = rate.NewLimiter(r, burst)
		s.entries[key] = lim
		return lim
	}
	lim.SetLimit(r)
	return lim
}

// ResetStore clears in-memory limiters (tests only).
func ResetStore() {
	globalStore.mu.Lock()
	defer globalStore.mu.Unlock()
	globalStore.entries = make(map[string]*rate.Limiter)
}
