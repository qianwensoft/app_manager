package agent

import (
	"sync"
)

// InstallTaskReply 安装任务在 Agent 侧完成后的结果（成功或失败说明）。
type InstallTaskReply struct {
	Output string
	Err    string
}

var installMu sync.Mutex
var installWaiters = make(map[string]chan InstallTaskReply)

// RegisterInstallWait 注册等待 commandId（与下发 WS 的 commandId 一致，如 install_123）。
func RegisterInstallWait(commandID string) <-chan InstallTaskReply {
	installMu.Lock()
	defer installMu.Unlock()
	ch := make(chan InstallTaskReply, 1)
	installWaiters[commandID] = ch
	return ch
}

// ForgetInstallWait 超时或取消时移除等待，避免泄漏。
func ForgetInstallWait(commandID string) {
	installMu.Lock()
	defer installMu.Unlock()
	delete(installWaiters, commandID)
}

// DeliverInstallTaskResult 由 Agent 上行 install_task_result 时调用。
func DeliverInstallTaskResult(commandID, output, errStr string) {
	if commandID == "" {
		return
	}
	installMu.Lock()
	ch, ok := installWaiters[commandID]
	if ok {
		delete(installWaiters, commandID)
	}
	installMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- InstallTaskReply{Output: output, Err: errStr}:
	default:
	}
}
