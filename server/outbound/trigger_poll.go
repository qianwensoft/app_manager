package outbound

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"gorm.io/gorm"
)

func runHTTPPollTrigger(ctx context.Context, db *gorm.DB, sess *triggerSession) {
	cfg := sess.cfg
	interval := time.Duration(cfg.PollIntervalMS) * time.Millisecond
	if interval <= 0 {
		interval = 60 * time.Second
	}
	method := strings.ToUpper(strings.TrimSpace(cfg.PollMethod))
	if method == "" {
		method = "GET"
	}

	log.Printf("trigger[poll] session %q started, interval=%s", sess.key, interval)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pollOnce(db, sess, cfg, method)
		}
	}
}

func pollOnce(db *gorm.DB, sess *triggerSession, cfg TriggerConfig, method string) {
	client := &http.Client{Timeout: 30 * time.Second}
	var body io.Reader
	if cfg.PollBody != "" {
		body = strings.NewReader(cfg.PollBody)
	}
	req, err := http.NewRequest(method, cfg.URL, body)
	if err != nil {
		log.Printf("trigger[poll] session %q build request error: %v", sess.key, err)
		return
	}
	for k, v := range cfg.PollHeaders {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("trigger[poll] session %q request error: %v", sess.key, err)
		return
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil || len(data) == 0 {
		return
	}

	if cfg.PollResultField != "" {
		items := extractJSONArray(data, cfg.PollResultField)
		for _, item := range items {
			DispatchTriggerMessage(db, sess, item)
		}
	} else {
		DispatchTriggerMessage(db, sess, data)
	}
}

// extractJSONFieldRaw 返回 JSON path 对应的原始值（interface{}）。
func extractJSONFieldRaw(data []byte, path string) interface{} {
	if len(data) == 0 || path == "" {
		return nil
	}
	var root interface{}
	if err := json.Unmarshal(data, &root); err != nil {
		return nil
	}
	parts := strings.Split(path, ".")
	cur := root
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

// marshalAny 将任意值序列化为 JSON。
func marshalAny(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

// extractJSONArray 从 JSON 中按点路径提取数组，每个元素序列化为 []byte。
func extractJSONArray(data []byte, path string) [][]byte {
	val := extractJSONFieldRaw(data, path)
	if val == nil {
		return nil
	}
	arr, ok := val.([]interface{})
	if !ok {
		return nil
	}
	out := make([][]byte, 0, len(arr))
	for _, item := range arr {
		b, err := marshalAny(item)
		if err == nil {
			out = append(out, b)
		}
	}
	return out
}
