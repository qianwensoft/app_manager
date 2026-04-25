package scada

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"encoding/json"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// pointRuntime 内存态（上次值、正弦相位等）
type pointRuntime struct {
	Last       float64
	Phase      float64
	Rand       *rand.Rand
	LastFireMs int64
}

var (
	rtMu      sync.Mutex
	runtimes  = map[uint]*pointRuntime{} // by ScadaSimPoint.ID
	lastPush  = map[string]map[string]float64{}
	pushMu    sync.Mutex

	// 点位缓存，避免每 tick 查库
	cachedPoints    []models.ScadaSimPoint
	cachedPointsMu  sync.RWMutex
	lastPointsLoad  time.Time
	pointsCacheTTL  = 5 * time.Second
)

// StartSimEngine 启动模拟点位调度（全局单例）
func StartSimEngine() {
	go loop()
}

func loop() {
	t := time.NewTicker(200 * time.Millisecond)
	defer t.Stop()
	for range t.C {
		tick()
	}
}

func loadPoints() []models.ScadaSimPoint {
	cachedPointsMu.RLock()
	if time.Since(lastPointsLoad) < pointsCacheTTL {
		pts := cachedPoints
		cachedPointsMu.RUnlock()
		return pts
	}
	cachedPointsMu.RUnlock()

	var points []models.ScadaSimPoint
	if err := database.DB.Where("enabled = ?", true).Find(&points).Error; err != nil {
		cachedPointsMu.RLock()
		pts := cachedPoints
		cachedPointsMu.RUnlock()
		return pts
	}
	cachedPointsMu.Lock()
	cachedPoints = points
	lastPointsLoad = time.Now()
	cachedPointsMu.Unlock()
	return points
}

func tick() {
	if database.DB == nil {
		return
	}
	points := loadPoints()
	now := time.Now().UnixMilli()
	for _, p := range points {
		if p.IntervalMs <= 0 {
			p.IntervalMs = 1000
		}
		rtMu.Lock()
		rt, ok := runtimes[p.ID]
		if !ok {
			rt = &pointRuntime{Rand: rand.New(rand.NewSource(now + int64(p.ID)))}
			runtimes[p.ID] = rt
		}
		if now-rt.LastFireMs < int64(p.IntervalMs) {
			rtMu.Unlock()
			continue
		}
		rt.LastFireMs = now
		rtMu.Unlock()

		v := nextValue(&p, rt)
		aggregatePush(p.ScadaCode, p.LinkName, v)
	}
}

func nextValue(p *models.ScadaSimPoint, rt *pointRuntime) float64 {
	var cfg map[string]float64
	_ = json.Unmarshal([]byte(p.ParamsJSON), &cfg)
	get := func(k string, def float64) float64 {
		if v, ok := cfg[k]; ok {
			return v
		}
		return def
	}
	minV := get("min", 0)
	maxV := get("max", 100)
	step := get("step", 5)
	amp := get("amplitude", (maxV - minV) / 2)
	period := get("period", 10)
	if period <= 0 {
		period = 10
	}

	mode := strings.ToLower(strings.TrimSpace(p.Mode))
	switch mode {
	case "constant":
		return get("value", rt.Last)
	case "random":
		rt.Last = minV + rt.Rand.Float64()*(maxV-minV)
	case "random_walk", "random_delta":
		delta := (rt.Rand.Float64()*2 - 1) * step
		rt.Last += delta
		if rt.Last < minV {
			rt.Last = minV
		}
		if rt.Last > maxV {
			rt.Last = maxV
		}
	case "sine":
		rt.Phase += 2 * math.Pi / period * 0.2
		if rt.Phase > 2*math.Pi {
			rt.Phase -= 2 * math.Pi
		}
		center := (minV + maxV) / 2
		if amp <= 0 {
			amp = (maxV - minV) / 2
		}
		rt.Last = center + amp*math.Sin(rt.Phase)
	case "ramp":
		rt.Last += step * 0.05
		if rt.Last > maxV {
			rt.Last = minV
		}
	default:
		rt.Last = minV + rt.Rand.Float64()*(maxV-minV)
	}
	return rt.Last
}

func aggregatePush(scadaCode, link string, v float64) {
	pushMu.Lock()
	defer pushMu.Unlock()
	m, ok := lastPush[scadaCode]
	if !ok {
		m = map[string]float64{}
		lastPush[scadaCode] = m
	}
	m[link] = v
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	topic := "/topic/scada/point-data/" + scadaCode
	stomp.DefaultHub.PublishJSON(topic, string(b))
}

// GetLastSnapshot returns the last pushed point-data for a scada code (for HTTP polling).
func GetLastSnapshot(scadaCode string) map[string]float64 {
	pushMu.Lock()
	defer pushMu.Unlock()
	m := lastPush[scadaCode]
	if m == nil {
		return map[string]float64{}
	}
	cp := make(map[string]float64, len(m))
	for k, v := range m {
		cp[k] = v
	}
	return cp
}

// RemoveScadaFromCache 删除组态时清理推送聚合（可选）
func RemoveScadaFromCache(scadaCode string) {
	pushMu.Lock()
	delete(lastPush, scadaCode)
	pushMu.Unlock()
}

// ReloadPoints 配置变更时调用，立即失效点位缓存
func ReloadPoints(_ *gorm.DB) {
	cachedPointsMu.Lock()
	lastPointsLoad = time.Time{}
	cachedPointsMu.Unlock()
}
