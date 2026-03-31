package agent

import "sync"

var (
	deviceInfoPushMu    sync.Mutex
	deviceInfoPushWaits = make(map[string]chan struct{})
)

func RegisterDeviceInfoPushWait(requestID string) <-chan struct{} {
	ch := make(chan struct{}, 1)
	deviceInfoPushMu.Lock()
	deviceInfoPushWaits[requestID] = ch
	deviceInfoPushMu.Unlock()
	return ch
}

func DeliverDeviceInfoPushDone(requestID string) {
	deviceInfoPushMu.Lock()
	ch, ok := deviceInfoPushWaits[requestID]
	if ok {
		delete(deviceInfoPushWaits, requestID)
	}
	deviceInfoPushMu.Unlock()
	if ok {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

func ForgetDeviceInfoPushWait(requestID string) {
	deviceInfoPushMu.Lock()
	delete(deviceInfoPushWaits, requestID)
	deviceInfoPushMu.Unlock()
}
