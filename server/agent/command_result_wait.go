package agent

import (
	"sync"
)

// CommandResultReply Agent 执行通用 command 后回传的结果（type=command_result）。
type CommandResultReply struct {
	Success bool
	Output  string
}

var cmdResultMu sync.Mutex
var cmdResultWaiters = make(map[string]chan CommandResultReply)

// RegisterCommandResultWait 注册等待某 commandId 的 command_result 上行。
func RegisterCommandResultWait(commandID string) <-chan CommandResultReply {
	cmdResultMu.Lock()
	defer cmdResultMu.Unlock()
	ch := make(chan CommandResultReply, 1)
	cmdResultWaiters[commandID] = ch
	return ch
}

// ForgetCommandResultWait 超时或取消时移除等待，避免泄漏。
func ForgetCommandResultWait(commandID string) {
	cmdResultMu.Lock()
	defer cmdResultMu.Unlock()
	delete(cmdResultWaiters, commandID)
}

// DeliverCommandResult 由 Agent 上行 command_result 时调用，唤醒等待方。
func DeliverCommandResult(commandID string, success bool, output string) {
	if commandID == "" {
		return
	}
	cmdResultMu.Lock()
	ch, ok := cmdResultWaiters[commandID]
	if ok {
		delete(cmdResultWaiters, commandID)
	}
	cmdResultMu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- CommandResultReply{Success: success, Output: output}:
	default:
	}
}
