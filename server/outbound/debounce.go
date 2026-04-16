package outbound

import (
	"strings"
	"sync"
	"time"

	"app-manager/models"
)

type debounceKey struct {
	DeviceID    uint
	ConnectorID uint
}

type debounceEntry struct {
	lastExec time.Time
	lastKey  string
}

var (
	debounceMu   sync.Mutex
	debounceLast = map[debounceKey]debounceEntry{}
)

// ConnectorDebouncePass 在即将执行连接器前调用：若应跳过返回 false（不更新防抖状态）。
// 相同码：同一设备 + 同一连接器 + 同一事件类型（event_type）在 debounce_same_event_ms 内忽略。
// 不同码：距上次执行不足 debounce_diff_event_ms 且本次事件类型与上次不同则忽略。
func ConnectorDebouncePass(c models.OutboundConnector, deviceID uint, eventType string) bool {
	sameMS := c.DebounceSameEventMS
	diffMS := c.DebounceDiffEventMS
	if sameMS <= 0 && diffMS <= 0 {
		return true
	}
	eventType = strings.TrimSpace(eventType)
	key := debounceKey{DeviceID: deviceID, ConnectorID: c.ID}
	now := time.Now()

	debounceMu.Lock()
	defer debounceMu.Unlock()

	st, ok := debounceLast[key]
	if ok {
		dt := now.Sub(st.lastExec)
		if sameMS > 0 && st.lastKey == eventType && dt < time.Duration(sameMS)*time.Millisecond {
			return false
		}
		if diffMS > 0 && st.lastKey != "" && st.lastKey != eventType && dt < time.Duration(diffMS)*time.Millisecond {
			return false
		}
	}
	debounceLast[key] = debounceEntry{lastExec: now, lastKey: eventType}
	return true
}
