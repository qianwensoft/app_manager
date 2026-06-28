package workflow

import (
	"context"
	"fmt"
	"sync"

	"app-manager/workflow/nodes"
)

// NodeExecutor 节点执行器接口
// 自定义节点需要实现此接口才能注册到工作流引擎
type NodeExecutor interface {
	Execute(ctx context.Context, config map[string]interface{}, variables map[string]interface{}) (map[string]interface{}, error)
}

// NodeRegistry 节点注册表
type NodeRegistry struct {
	mu        sync.RWMutex
	executors map[string]NodeExecutor
}

var globalRegistry = &NodeRegistry{
	executors: make(map[string]NodeExecutor),
}

// init 初始化时注册内置的设备节点
func init() {
	// 注册设备节点
	RegisterNode("device_scan", &nodes.DeviceScanNode{})
	RegisterNode("device_photo", &nodes.DevicePhotoNode{})
	RegisterNode("device_bluetooth", &nodes.DeviceBluetoothNode{})
}

// RegisterNode 注册自定义节点
func RegisterNode(nodeType string, executor NodeExecutor) {
	globalRegistry.mu.Lock()
	defer globalRegistry.mu.Unlock()

	globalRegistry.executors[nodeType] = executor
}

// GetNodeExecutor 获取节点执行器
func GetNodeExecutor(nodeType string) (NodeExecutor, bool) {
	globalRegistry.mu.RLock()
	defer globalRegistry.mu.RUnlock()

	executor, ok := globalRegistry.executors[nodeType]
	return executor, ok
}

// UnregisterNode 取消注册节点
func UnregisterNode(nodeType string) {
	globalRegistry.mu.Lock()
	defer globalRegistry.mu.Unlock()

	delete(globalRegistry.executors, nodeType)
}

// ListRegisteredNodes 列出所有已注册的节点类型
func ListRegisteredNodes() []string {
	globalRegistry.mu.RLock()
	defer globalRegistry.mu.RUnlock()

	types := make([]string, 0, len(globalRegistry.executors))
	for nodeType := range globalRegistry.executors {
		types = append(types, nodeType)
	}
	return types
}

// ExecuteRegisteredNode 执行已注册的节点
func ExecuteRegisteredNode(nodeType string, ctx context.Context, config map[string]interface{}, variables map[string]interface{}) (map[string]interface{}, error) {
	executor, ok := GetNodeExecutor(nodeType)
	if !ok {
		return nil, fmt.Errorf("node type %q not registered", nodeType)
	}

	return executor.Execute(ctx, config, variables)
}
