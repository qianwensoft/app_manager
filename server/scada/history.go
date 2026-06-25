package scada

import (
	"sync"
	"time"
)

const defaultHistoryMax = 100_000

// HistoryPoint is a single timestamped value.
type HistoryPoint struct {
	T int64   `json:"t"` // Unix ms
	V float64 `json:"v"`
}

// ringBuffer is a fixed-size circular buffer for HistoryPoint.
type ringBuffer struct {
	data []HistoryPoint
	head int // next write position
	size int // number of valid entries
	cap  int
}

func newRing(cap int) *ringBuffer {
	return &ringBuffer{data: make([]HistoryPoint, cap), cap: cap}
}

func (r *ringBuffer) push(p HistoryPoint) {
	r.data[r.head] = p
	r.head = (r.head + 1) % r.cap
	if r.size < r.cap {
		r.size++
	}
}

// slice returns entries in chronological order (oldest first).
func (r *ringBuffer) slice(limit int) []HistoryPoint {
	if r.size == 0 {
		return nil
	}
	n := r.size
	if limit > 0 && limit < n {
		n = limit
	}
	out := make([]HistoryPoint, n)
	// oldest entry index
	start := (r.head - r.size + r.cap) % r.cap
	// if we want only the last n, advance start
	if n < r.size {
		start = (r.head - n + r.cap) % r.cap
	}
	for i := 0; i < n; i++ {
		out[i] = r.data[(start+i)%r.cap]
	}
	return out
}

// historyStore holds per-(scadaCode, linkName) ring buffers.
var (
	histMu   sync.RWMutex
	histData = map[string]map[string]*ringBuffer{} // scadaCode → linkName → ring
)

func histKey(scadaCode, linkName string) (string, string) {
	return scadaCode, linkName
}

// RecordHistory appends a value to the ring buffer for (scadaCode, linkName).
func RecordHistory(scadaCode, linkName string, v float64) {
	p := HistoryPoint{T: time.Now().UnixMilli(), V: v}
	histMu.Lock()
	m, ok := histData[scadaCode]
	if !ok {
		m = map[string]*ringBuffer{}
		histData[scadaCode] = m
	}
	rb, ok := m[linkName]
	if !ok {
		rb = newRing(defaultHistoryMax)
		m[linkName] = rb
	}
	rb.push(p)
	histMu.Unlock()
}

// GetHistory returns the last limit points (all if limit<=0) for the given keys.
// Returns map[linkName][]HistoryPoint.
func GetHistory(scadaCode string, keys []string, limit int) map[string][]HistoryPoint {
	histMu.RLock()
	defer histMu.RUnlock()
	m := histData[scadaCode]
	result := make(map[string][]HistoryPoint, len(keys))
	for _, k := range keys {
		if m != nil {
			if rb, ok := m[k]; ok {
				result[k] = rb.slice(limit)
				continue
			}
		}
		result[k] = []HistoryPoint{}
	}
	return result
}
