package nodes

import (
	"context"
	"fmt"
	"time"

	"app-manager/agent"
)

// DeviceScanNode 设备扫码节点
type DeviceScanNode struct{}

// DeviceScanConfig 扫码配置
type DeviceScanConfig struct {
	DeviceID  uint   `json:"device_id"`  // 设备 ID
	ScanType  string `json:"scan_type"`  // qrcode | barcode | any
	Timeout   int    `json:"timeout"`    // 超时时间（秒）
	OutputVar string `json:"output_var"` // 结果保存的变量名
}

// Execute 执行扫码
func (n *DeviceScanNode) Execute(ctx context.Context, config map[string]interface{}, variables map[string]interface{}) (map[string]interface{}, error) {
	// 解析配置
	deviceID, ok := config["deviceId"].(float64)
	if !ok {
		if id, ok := config["device_id"].(float64); ok {
			deviceID = id
		} else {
			return nil, fmt.Errorf("deviceId is required")
		}
	}

	scanType, _ := config["scanType"].(string)
	if scanType == "" {
		scanType, _ = config["scan_type"].(string)
	}
	if scanType == "" {
		scanType = "any" // 默认任意类型
	}

	timeout := 30 // 默认 30 秒
	if t, ok := config["timeout"].(float64); ok && t > 0 {
		timeout = int(t)
	}

	outputVar, _ := config["outputVariable"].(string)
	if outputVar == "" {
		outputVar, _ = config["output_var"].(string)
	}
	if outputVar == "" {
		outputVar = "scanResult"
	}

	// 检查设备是否在线
	if !agent.AgentHub.IsConnected(fmt.Sprintf("%d", uint(deviceID))) {
		return nil, fmt.Errorf("device %d not connected", uint(deviceID))
	}

	// 生成命令 ID
	cmdID := fmt.Sprintf("scan_%d_%d", uint(deviceID), time.Now().UnixNano())

	// 创建结果通道
	resultChan := make(chan string, 1)
	errChan := make(chan error, 1)

	// 注册命令回调
	agent.AgentHub.RegisterCallback(cmdID, func(result map[string]interface{}) {
		if code, ok := result["code"].(string); ok {
			select {
			case resultChan <- code:
			default:
			}
		} else if errMsg, ok := result["error"].(string); ok {
			select {
			case errChan <- fmt.Errorf(errMsg):
			default:
			}
		}
	})
	defer agent.AgentHub.UnregisterCallback(cmdID)

	// 发送扫码指令
	sent := agent.AgentHub.SendToDevice(uint(deviceID), map[string]interface{}{
		"type":      "command",
		"action":    "start_scan",
		"commandId": cmdID,
		"data": map[string]interface{}{
			"scanType": scanType,
		},
	})
	if !sent {
		return nil, fmt.Errorf("failed to send scan command to device %d", uint(deviceID))
	}

	// 等待结果
	select {
	case result := <-resultChan:
		// 保存到变量
		variables[outputVar] = result
		return map[string]interface{}{
			"success": true,
			"code":    result,
			"type":    scanType,
		}, nil

	case err := <-errChan:
		return nil, fmt.Errorf("scan failed: %w", err)

	case <-time.After(time.Duration(timeout) * time.Second):
		return nil, fmt.Errorf("scan timeout after %d seconds", timeout)

	case <-ctx.Done():
		return nil, fmt.Errorf("scan cancelled")
	}
}
