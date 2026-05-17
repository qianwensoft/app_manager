package scada

import (
	"app-manager/database"
	"app-manager/models"
	"app-manager/stomp"
	"context"
	"encoding/json"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// pointRuntime holds per-point mutable simulation state.
type pointRuntime struct {
	Last  float64
	Phase float64
	Rand  *rand.Rand
}

// batchItem is sent from per-point goroutines to the batcher.
type batchItem struct {
	ScadaCode string
	LinkName  string
	V         float64
}

var (
	rtMu     sync.Mutex
	runtimes = map[uint]*pointRuntime{}

	lastPush = map[string]map[string]float64{}
	pushMu   sync.Mutex

	batchCh = make(chan batchItem, 65536)

	workerMu  sync.Mutex
	workerMap = map[uint]context.CancelFunc{}
)

// StartSimEngine starts the batcher goroutine and spawns initial per-point workers.
func StartSimEngine() {
	StartBatcher()
	ReloadPoints(nil)
}

// loadPoints queries enabled points directly from DB.
func loadPoints() []models.ScadaSimPoint {
	if database.DB == nil {
		return nil
	}
	var points []models.ScadaSimPoint
	if err := database.DB.Where("enabled = ?", true).Find(&points).Error; err != nil {
		return nil
	}
	return points
}

// runWorker is the per-point goroutine. It ticks at p.IntervalMs and sends
// computed values to batchCh until ctx is cancelled.
func runWorker(ctx context.Context, p models.ScadaSimPoint) {
	intervalMs := p.IntervalMs
	if intervalMs <= 0 {
		intervalMs = 1000
	}

	rtMu.Lock()
	rt, ok := runtimes[p.ID]
	if !ok {
		rt = &pointRuntime{Rand: rand.New(rand.NewSource(time.Now().UnixNano() + int64(p.ID)))}
		runtimes[p.ID] = rt
	}
	rtMu.Unlock()

	ticker := time.NewTicker(time.Duration(intervalMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rtMu.Lock()
			v := nextValue(&p, rt)
			rtMu.Unlock()

			select {
			case batchCh <- batchItem{ScadaCode: p.ScadaCode, LinkName: p.LinkName, V: v}:
			default:
				// drop if channel is full to avoid blocking the ticker
			}
		}
	}
}

// nextValue computes the next simulated value for a point, mutating rt in place.
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
	amp := get("amplitude", (maxV-minV)/2)
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

// aggregatePush records history and publishes the full point-data snapshot via STOMP.
func aggregatePush(scadaCode, link string, v float64) {
	RecordHistory(scadaCode, link, v)

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
	stomp.DefaultHub.PublishJSON("/topic/scada/point-data/"+scadaCode, string(b))
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

// RemoveScadaFromCache clears the push-aggregation cache for a deleted scada.
func RemoveScadaFromCache(scadaCode string) {
	pushMu.Lock()
	delete(lastPush, scadaCode)
	pushMu.Unlock()
}

// ReloadPoints diffs the current enabled point list against running workers,
// stops workers for removed/disabled points, and starts workers for new ones.
func ReloadPoints(_ *gorm.DB) {
	points := loadPoints()

	// build a set of active point IDs from DB
	active := make(map[uint]models.ScadaSimPoint, len(points))
	for _, p := range points {
		active[p.ID] = p
	}

	workerMu.Lock()
	defer workerMu.Unlock()

	// stop workers for points no longer active
	for id, cancel := range workerMap {
		if _, ok := active[id]; !ok {
			cancel()
			delete(workerMap, id)
		}
	}

	// start workers for new points
	for id, p := range active {
		if _, running := workerMap[id]; !running {
			ctx, cancel := context.WithCancel(context.Background())
			workerMap[id] = cancel
			go runWorker(ctx, p)
		}
	}
}
