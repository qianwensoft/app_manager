package api

import (
	"app-manager/adb"
	"strings"
	"sync"
	"time"
)

// adb connecting 状态在设备不可达时可能长期不消失；超过该时长在状态查询/保活时主动 disconnect。
const adbConnectingStale = 12 * time.Second

var (
	adbConnectingMu    sync.Mutex
	adbConnectingSince = map[string]time.Time{}
)

func noteAdbConnectAttempt(serial string) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return
	}
	adbConnectingMu.Lock()
	adbConnectingSince[serial] = time.Now()
	adbConnectingMu.Unlock()
}

func clearAdbConnectingNote(serial string) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return
	}
	adbConnectingMu.Lock()
	delete(adbConnectingSince, serial)
	adbConnectingMu.Unlock()
}

// resolveAdbSerialState 查询 serial 状态；connecting 过久则断开并返回 offline。
func resolveAdbSerialState(cli *adb.Client, serial string) string {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return "not_configured"
	}
	st := lookupAdbSerialState(cli, serial)
	if st != "connecting" {
		clearAdbConnectingNote(serial)
		return st
	}
	adbConnectingMu.Lock()
	since, ok := adbConnectingSince[serial]
	if !ok {
		adbConnectingSince[serial] = time.Now()
		adbConnectingMu.Unlock()
		return "connecting"
	}
	adbConnectingMu.Unlock()
	if time.Since(since) < adbConnectingStale {
		return "connecting"
	}
	_ = cli.Disconnect(serial)
	clearAdbConnectingNote(serial)
	return "offline"
}

// waitAdbSerialState 在 connect 后短轮询，避免 adb 已返回 connected 但列表仍为 connecting。
func waitAdbSerialState(cli *adb.Client, serial string, maxWait time.Duration) string {
	deadline := time.Now().Add(maxWait)
	for time.Now().Before(deadline) {
		st := lookupAdbSerialState(cli, serial)
		switch st {
		case "device", "offline", "unauthorized", "no_device":
			return st
		}
		time.Sleep(400 * time.Millisecond)
	}
	return lookupAdbSerialState(cli, serial)
}
