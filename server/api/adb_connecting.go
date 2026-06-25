package api

import (
	"app-manager/adb"
	"strings"
	"sync"
	"time"
)

// adb connecting 状态在设备不可达时可能长期不消失；超过该时长在状态查询/保活时主动 disconnect。
const adbConnectingStale = 12 * time.Second

// 保活自动重连的指数退避：避免不可达设备每 30 秒在 connecting↔offline 之间无限抖动。
const (
	adbKeepaliveBaseBackoff = 30 * time.Second
	adbKeepaliveMaxBackoff  = 10 * time.Minute
)

var (
	adbConnectingMu    sync.Mutex
	adbConnectingSince = map[string]time.Time{}

	adbBackoffMu sync.Mutex
	adbBackoff   = map[string]adbBackoffEntry{}
)

type adbBackoffEntry struct {
	fails int
	next  time.Time
}

// adbKeepaliveInBackoff 返回该 serial 是否仍处于退避窗口内（本轮保活应跳过重连）。
func adbKeepaliveInBackoff(serial string) bool {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return false
	}
	adbBackoffMu.Lock()
	defer adbBackoffMu.Unlock()
	e, ok := adbBackoff[serial]
	if !ok {
		return false
	}
	return time.Now().Before(e.next)
}

// adbKeepaliveRecordFailure 记录一次自动重连失败并按指数退避推后下次尝试时间。
func adbKeepaliveRecordFailure(serial string) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return
	}
	adbBackoffMu.Lock()
	defer adbBackoffMu.Unlock()
	e := adbBackoff[serial]
	e.fails++
	shift := e.fails - 1
	if shift > 20 {
		shift = 20
	}
	backoff := adbKeepaliveBaseBackoff << shift
	if backoff > adbKeepaliveMaxBackoff {
		backoff = adbKeepaliveMaxBackoff
	}
	e.next = time.Now().Add(backoff)
	adbBackoff[serial] = e
}

// adbKeepaliveClearBackoff 在连接成功后清除退避记录。
func adbKeepaliveClearBackoff(serial string) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return
	}
	adbBackoffMu.Lock()
	delete(adbBackoff, serial)
	adbBackoffMu.Unlock()
}

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
