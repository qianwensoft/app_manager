package event

import (
	"app-manager/custompreset"
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const stompDestEventAnalysisPrefix = "/topic/device/"

// AnalyzeObservation 单次扫码观测到的 Intent 动作与 extra 键。
type AnalyzeObservation struct {
	IntentAction string   `json:"intent_action"`
	ExtraKey     string   `json:"extra_key"`
	HitCount     int      `json:"hit_count"`
	SampleValues []string `json:"sample_values"`
}

// AnalyzeSuggestion 与已启用事件定义的匹配建议。
type AnalyzeSuggestion struct {
	DefinitionID uint     `json:"definition_id"`
	Key          string   `json:"key"`
	Name         string   `json:"name"`
	Score        int      `json:"score"`
	MatchedPairs []string `json:"matched_pairs"`
}

// AnalyzeSession 设备自定义事件分析会话（内存态）。
type AnalyzeSession struct {
	ID            string     `json:"session_id"`
	DeviceID      uint       `json:"device_id"`
	Active        bool       `json:"active"`
	ScanCount     int        `json:"scan_count"`
	ProbeMode     string     `json:"probe_mode,omitempty"`
	ProbePatterns []string   `json:"probe_patterns,omitempty"`
	StartedAt     time.Time  `json:"started_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	StoppedAt     *time.Time `json:"stopped_at,omitempty"`
	obsKey        map[string]*AnalyzeObservation
}

type analyzeSessionStore struct {
	mu    sync.RWMutex
	byID  map[string]*AnalyzeSession
	byDev map[uint]string // device_id -> session_id
}

var analyzeStore = &analyzeSessionStore{
	byID:  make(map[string]*AnalyzeSession),
	byDev: make(map[uint]string),
}

func obsMapKey(action, extraKey string) string {
	return strings.TrimSpace(action) + "\x00" + strings.TrimSpace(extraKey)
}

// CollectProbeActions 汇总 PDA 预设与已启用定义中的广播动作（去重）。
func CollectProbeActions() []string {
	seen := make(map[string]struct{})
	var out []string
	add := func(a string) {
		a = strings.TrimSpace(a)
		if a == "" {
			return
		}
		if _, ok := seen[a]; ok {
			return
		}
		seen[a] = struct{}{}
		out = append(out, a)
	}
	for _, p := range custompreset.PDAScanPresets() {
		for _, a := range p.Actions {
			add(a)
		}
	}
	var defs []models.CustomEventDefinition
	_ = database.DB.Where("enabled = ?", true).Find(&defs).Error
	for _, d := range defs {
		for _, a := range d.BroadcastActions() {
			add(a)
		}
	}
	sort.Strings(out)
	return out
}

// StartAnalyzeSession 为设备创建分析会话；若已有活跃会话则先结束。
func StartAnalyzeSession(deviceID uint, probeMode string, probePatterns []string) *AnalyzeSession {
	analyzeStore.mu.Lock()
	defer analyzeStore.mu.Unlock()
	if sid, ok := analyzeStore.byDev[deviceID]; ok {
		if old, ok2 := analyzeStore.byID[sid]; ok2 && old.Active {
			now := time.Now()
			old.Active = false
			old.StoppedAt = &now
			old.UpdatedAt = now
		}
		delete(analyzeStore.byDev, deviceID)
	}
	if probeMode == "" {
		probeMode = ProbeModePreset
	}
	now := time.Now()
	s := &AnalyzeSession{
		ID:            uuid.NewString(),
		DeviceID:      deviceID,
		Active:        true,
		ProbeMode:     probeMode,
		ProbePatterns: NormalizeProbePatterns(probePatterns),
		StartedAt:     now,
		UpdatedAt:     now,
		obsKey:        make(map[string]*AnalyzeObservation),
	}
	analyzeStore.byID[s.ID] = s
	analyzeStore.byDev[deviceID] = s.ID
	return s
}

// StopAnalyzeSession 结束设备分析会话并返回快照。
func StopAnalyzeSession(deviceID uint) (*AnalyzeSession, []AnalyzeObservation, []AnalyzeSuggestion, bool) {
	analyzeStore.mu.Lock()
	defer analyzeStore.mu.Unlock()
	sid, ok := analyzeStore.byDev[deviceID]
	if !ok {
		return nil, nil, nil, false
	}
	s, ok := analyzeStore.byID[sid]
	if !ok {
		delete(analyzeStore.byDev, deviceID)
		return nil, nil, nil, false
	}
	now := time.Now()
	s.Active = false
	s.StoppedAt = &now
	s.UpdatedAt = now
	delete(analyzeStore.byDev, deviceID)
	obs := snapshotObservations(s)
	sug := buildSuggestions(obs)
	return cloneSession(s), obs, sug, true
}

// GetActiveAnalyzeSession 返回设备当前活跃分析会话（无则 nil）。
func GetActiveAnalyzeSession(deviceID uint) (*AnalyzeSession, []AnalyzeObservation, []AnalyzeSuggestion) {
	analyzeStore.mu.RLock()
	defer analyzeStore.mu.RUnlock()
	sid, ok := analyzeStore.byDev[deviceID]
	if !ok {
		return nil, nil, nil
	}
	s, ok := analyzeStore.byID[sid]
	if !ok || !s.Active {
		return nil, nil, nil
	}
	obs := snapshotObservations(s)
	return cloneSession(s), obs, buildSuggestions(obs)
}

func cloneSession(s *AnalyzeSession) *AnalyzeSession {
	cp := *s
	return &cp
}

func snapshotObservations(s *AnalyzeSession) []AnalyzeObservation {
	out := make([]AnalyzeObservation, 0, len(s.obsKey))
	for _, o := range s.obsKey {
		cp := *o
		out = append(out, cp)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].HitCount != out[j].HitCount {
			return out[i].HitCount > out[j].HitCount
		}
		ai := out[i].IntentAction + out[i].ExtraKey
		aj := out[j].IntentAction + out[j].ExtraKey
		return ai < aj
	})
	return out
}

// RecordAnalyzeProbe 记录 Agent 探针上报的原始广播 extras。
func RecordAnalyzeProbe(deviceID uint, sessionID, intentAction string, extras map[string]interface{}) bool {
	analyzeStore.mu.Lock()
	defer analyzeStore.mu.Unlock()
	s := activeSessionLocked(deviceID, sessionID)
	if s == nil {
		return false
	}
	action := strings.TrimSpace(intentAction)
	if action == "" {
		return false
	}
	if len(s.ProbePatterns) > 0 && !MatchProbeAction(action, s.ProbePatterns) {
		return false
	}
	added := false
	for k, raw := range extras {
		key := strings.TrimSpace(k)
		val := extraValueToString(raw)
		if key == "" || val == "" {
			continue
		}
		if recordObservationLocked(s, action, key, val) {
			added = true
		}
	}
	if added {
		s.ScanCount++
	}
	s.UpdatedAt = time.Now()
	obs := snapshotObservations(s)
	sug := buildSuggestions(obs)
	publishAnalyzeUpdate(s, obs, sug, "probe")
	return true
}

// RecordAnalyzeDeviceEvent 分析期间收到的正式 device_event（含 intent_action/extra_key）。
func RecordAnalyzeDeviceEvent(deviceID uint, eventData string) bool {
	var payload struct {
		IntentAction string `json:"intent_action"`
		ExtraKey     string `json:"extra_key"`
		Value        string `json:"value"`
	}
	if err := json.Unmarshal([]byte(eventData), &payload); err != nil {
		return false
	}
	action := strings.TrimSpace(payload.IntentAction)
	key := strings.TrimSpace(payload.ExtraKey)
	val := strings.TrimSpace(payload.Value)
	if action == "" || key == "" || val == "" {
		return false
	}
	analyzeStore.mu.Lock()
	defer analyzeStore.mu.Unlock()
	sid, ok := analyzeStore.byDev[deviceID]
	if !ok {
		return false
	}
	s, ok := analyzeStore.byID[sid]
	if !ok || !s.Active {
		return false
	}
	if !recordObservationLocked(s, action, key, val) {
		return false
	}
	s.ScanCount++
	s.UpdatedAt = time.Now()
	obs := snapshotObservations(s)
	sug := buildSuggestions(obs)
	publishAnalyzeUpdate(s, obs, sug, "device_event")
	return true
}

func activeSessionLocked(deviceID uint, sessionID string) *AnalyzeSession {
	sid, ok := analyzeStore.byDev[deviceID]
	if !ok || sid != strings.TrimSpace(sessionID) {
		return nil
	}
	s, ok := analyzeStore.byID[sid]
	if !ok || !s.Active {
		return nil
	}
	return s
}

func recordObservationLocked(s *AnalyzeSession, action, extraKey, value string) bool {
	mk := obsMapKey(action, extraKey)
	o, ok := s.obsKey[mk]
	if !ok {
		o = &AnalyzeObservation{
			IntentAction: action,
			ExtraKey:     extraKey,
			SampleValues: []string{},
		}
		s.obsKey[mk] = o
	}
	o.HitCount++
	if len(o.SampleValues) < 3 && !containsString(o.SampleValues, value) {
		o.SampleValues = append(o.SampleValues, truncateSample(value, 120))
	}
	return true
}

func buildSuggestions(obs []AnalyzeObservation) []AnalyzeSuggestion {
	if len(obs) == 0 {
		return nil
	}
	var defs []models.CustomEventDefinition
	_ = database.DB.Where("enabled = ?", true).Find(&defs).Error
	type scored struct {
		AnalyzeSuggestion
	}
	var rows []scored
	for _, d := range defs {
		acts := toSet(d.BroadcastActions())
		keys := toSet(d.ExtraKeys())
		if len(acts) == 0 || len(keys) == 0 {
			continue
		}
		score := 0
		var pairs []string
		for _, o := range obs {
			if _, ok := acts[o.IntentAction]; !ok {
				continue
			}
			if _, ok := keys[o.ExtraKey]; !ok {
				continue
			}
			score += o.HitCount
			pairs = append(pairs, fmt.Sprintf("%s + %s", o.IntentAction, o.ExtraKey))
		}
		if score <= 0 {
			continue
		}
		rows = append(rows, scored{AnalyzeSuggestion{
			DefinitionID: d.ID,
			Key:          d.Key,
			Name:         d.Name,
			Score:        score,
			MatchedPairs: pairs,
		}})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score != rows[j].Score {
			return rows[i].Score > rows[j].Score
		}
		return rows[i].Key < rows[j].Key
	})
	out := make([]AnalyzeSuggestion, len(rows))
	for i := range rows {
		out[i] = rows[i].AnalyzeSuggestion
	}
	return out
}

func publishAnalyzeUpdate(s *AnalyzeSession, obs []AnalyzeObservation, sug []AnalyzeSuggestion, source string) {
	payload := map[string]interface{}{
		"type":           "event_analysis_update",
		"session_id":     s.ID,
		"device_id":      s.DeviceID,
		"active":         s.Active,
		"scan_count":     s.ScanCount,
		"probe_mode":     s.ProbeMode,
		"probe_patterns": s.ProbePatterns,
		"source":         source,
		"observations":   obs,
		"suggestions":    sug,
		"updated_at":     s.UpdatedAt.UTC().Format(time.RFC3339Nano),
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	dest := fmt.Sprintf("%s%d/event-analysis", stompDestEventAnalysisPrefix, s.DeviceID)
	stomp.DefaultHub.PublishJSON(dest, string(b))
}

func extraValueToString(v interface{}) string {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case float64, float32, int, int64, bool:
		return strings.TrimSpace(fmt.Sprint(x))
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func toSet(ss []string) map[string]struct{} {
	m := make(map[string]struct{}, len(ss))
	for _, s := range ss {
		s = strings.TrimSpace(s)
		if s != "" {
			m[s] = struct{}{}
		}
	}
	return m
}

func containsString(ss []string, v string) bool {
	for _, s := range ss {
		if s == v {
			return true
		}
	}
	return false
}

func truncateSample(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
