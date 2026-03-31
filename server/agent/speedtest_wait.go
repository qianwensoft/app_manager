package agent

import "sync"

// SpeedtestReply Agent 测速回包（ping 仅作完成信号，由 HTTP 层用时间差算 RTT）。
type SpeedtestReply struct {
	Phase                      string
	DownloadMs, UploadMs       int64
	DownloadBytes, UploadBytes int64
	Err                        string
}

var speedtestMu sync.Mutex
var speedtestWaiters = make(map[string]chan SpeedtestReply)

func RegisterSpeedtestWait(id string) <-chan SpeedtestReply {
	ch := make(chan SpeedtestReply, 1)
	speedtestMu.Lock()
	speedtestWaiters[id] = ch
	speedtestMu.Unlock()
	return ch
}

func ForgetSpeedtestWait(id string) {
	speedtestMu.Lock()
	delete(speedtestWaiters, id)
	speedtestMu.Unlock()
}

func DeliverSpeedtestReply(id string, rep SpeedtestReply) {
	speedtestMu.Lock()
	ch, ok := speedtestWaiters[id]
	if ok {
		delete(speedtestWaiters, id)
	}
	speedtestMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- rep:
	default:
	}
}
