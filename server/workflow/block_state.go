package workflow

import (
	"sync"
)

// deviceWorkflowBlockState 跟踪每个设备的工作流阻塞状态
// key: deviceID (uint)
var deviceWorkflowBlockState = struct {
	mu     sync.RWMutex
	blocks map[uint]bool // true = workflows blocked
}{
	blocks: make(map[uint]bool),
}

// SetWorkflowBlocked 设置设备的workflow阻塞状态
func SetWorkflowBlocked(deviceID uint, blocked bool) {
	deviceWorkflowBlockState.mu.Lock()
	defer deviceWorkflowBlockState.mu.Unlock()
	if blocked {
		deviceWorkflowBlockState.blocks[deviceID] = true
	} else {
		delete(deviceWorkflowBlockState.blocks, deviceID)
	}
}

// IsWorkflowBlocked 检查设备的工作流是否被阻塞
func IsWorkflowBlocked(deviceID uint) bool {
	deviceWorkflowBlockState.mu.RLock()
	defer deviceWorkflowBlockState.mu.RUnlock()
	return deviceWorkflowBlockState.blocks[deviceID]
}

// GetBlockedDevices 返回所有被阻塞的设备ID列表
func GetBlockedDevices() []uint {
	deviceWorkflowBlockState.mu.RLock()
	defer deviceWorkflowBlockState.mu.RUnlock()
	devices := make([]uint, 0, len(deviceWorkflowBlockState.blocks))
	for d := range deviceWorkflowBlockState.blocks {
		devices = append(devices, d)
	}
	return devices
}
