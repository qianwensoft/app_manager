package outbound

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"app-manager/datastack"
	"gorm.io/gorm"
)

func runDataPollTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	interval := time.Duration(cfg.DataPollIntervalMS) * time.Millisecond
	if interval <= 0 {
		interval = 60 * time.Second
	}

	log.Printf("trigger[data_poll] session %q started, interface=%q interval=%s", sess.key, cfg.DataInterfaceCode, interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			dataPollOnce(db, sess, cfg)
		}
	}
}

func dataPollOnce(db *gorm.DB, sess *triggerSession, cfg TriggerConfig) {
	rows, err := datastack.InvokeDataInterfaceByCode(cfg.DataInterfaceCode, cfg.DataPollParams)
	if err != nil {
		log.Printf("trigger[data_poll] session %q query error: %v", sess.key, err)
		return
	}
	if len(rows) == 0 {
		return
	}

	if cfg.DataPollResultField != "" {
		for _, row := range rows {
			val := extractNestedField(row, cfg.DataPollResultField)
			if val == nil {
				continue
			}
			b, err := json.Marshal(val)
			if err == nil {
				DispatchTriggerMessage(db, sess, b)
			}
		}
	} else {
		b, err := json.Marshal(rows)
		if err == nil {
			DispatchTriggerMessage(db, sess, b)
		}
	}
}

func extractNestedField(row map[string]interface{}, path string) interface{} {
	if path == "" {
		return row
	}
	parts := splitDotPath(path)
	var cur interface{} = row
	for _, p := range parts {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil
		}
		cur, ok = m[p]
		if !ok {
			return nil
		}
	}
	return cur
}

func splitDotPath(path string) []string {
	return strings.Split(path, ".")
}
