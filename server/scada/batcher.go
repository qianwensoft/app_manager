package scada

import (
	"time"

	"github.com/vmihailenco/msgpack/v5"
)

// BatchPoint is a single point in a msgpack batch frame sent to StreamHub subscribers.
type BatchPoint struct {
	K string  `msgpack:"k"`
	T int64   `msgpack:"t"`
	V float64 `msgpack:"v"`
}

// BatchFrame is the msgpack envelope published to StreamHub.
type BatchFrame struct {
	Points []BatchPoint `msgpack:"points"`
}

// StartBatcher starts the goroutine that drains batchCh every 10ms,
// calls aggregatePush for each item, groups by scadaCode, and publishes
// msgpack BatchFrames to StreamHub.
func StartBatcher() {
	go func() {
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for range ticker.C {
			// drain all pending items
			collected := map[string][]BatchPoint{}
			drained := false
			for !drained {
				select {
				case item := <-batchCh:
					aggregatePush(item.ScadaCode, item.LinkName, item.V)
					collected[item.ScadaCode] = append(collected[item.ScadaCode], BatchPoint{
						K: item.LinkName,
						T: time.Now().UnixMilli(),
						V: item.V,
					})
				default:
					drained = true
				}
			}
			// publish per-scadaCode frames to StreamHub
			for code, pts := range collected {
				frame, err := msgpack.Marshal(BatchFrame{Points: pts})
				if err != nil {
					continue
				}
				StreamHub.Publish(code, frame)
			}
		}
	}()
}
