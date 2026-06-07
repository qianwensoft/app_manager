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
	lastExec      time.Time
	lastKey       string
	lastScanValue string
}

var (
	debounceMu   sync.Mutex
	debounceLast = map[debounceKey]debounceEntry{}
)

// ConnectorDebouncePass 兼容旧调用（不含扫码值）。
func ConnectorDebouncePass(c models.OutboundConnector, deviceID uint, eventType string) bool {
	return connectorDebouncePass(c, deviceID, eventType, "")
}

func connectorDebouncePass(c models.OutboundConnector, deviceID uint, eventType, eventData string) bool {
	sameMS := c.DebounceSameEventMS
	diffMS := c.DebounceDiffEventMS
	sameScanMS := c.DebounceSameScanMS
	if sameMS <= 0 && diffMS <= 0 && sameScanMS <= 0 {
		return true
	}
	eventType = strings.TrimSpace(eventType)
	scanVal := ScanValueFromEventData(eventData)
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
		if sameScanMS > 0 && scanVal != "" && st.lastScanValue == scanVal && dt < time.Duration(sameScanMS)*time.Millisecond {
			return false
		}
	}
	debounceLast[key] = debounceEntry{lastExec: now, lastKey: eventType, lastScanValue: scanVal}
	return true
}
