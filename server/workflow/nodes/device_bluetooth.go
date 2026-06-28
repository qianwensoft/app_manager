package nodes

import (
	"context"
	"fmt"
	"time"

	"app-manager/agent"
)

// DeviceBluetoothNode 设备蓝牙打印节点
type DeviceBluetoothNode struct{}

// Execute 执行蓝牙打印
func (n *DeviceBluetoothNode) Execute(ctx context.Context, config map[string]interface{}, variables map[string]interface{}) (map[string]interface{}, error) {
	// 解析配置
	deviceID, ok := config["deviceId"].(float64)
	if !ok {
		if id, ok := config["device_id"].(float64); ok {
			deviceID = id
		} else {
			return nil, fmt.Errorf("deviceId is required")
		}
	}

	// 打印机地址
	printerAddress, _ := config["printerAddress"].(string)
	if printerAddress == "" {
		printerAddress, _ = config["printer_address"].(string)
	}

	// 打印内容
	content, _ := config["content"].(string)
	if content == "" {
		return nil, fmt.Errorf("content is required")
	}

	// 打印模板（可选）
	template, _ := config["template"].(string)

	timeout := 30 // 默认 30 秒
	if t, ok := config["timeout"].(float64); ok && t > 0 {
		timeout = int(t)
	}

	// 检查设备是否在线
	if !agent.AgentHub.IsConnected(fmt.Sprintf("%d", uint(deviceID))) {
		return nil, fmt.Errorf("device %d not connected", uint(deviceID))
	}

	// 生成命令 ID
	cmdID := fmt.Sprintf("print_%d_%d", uint(deviceID), time.Now().UnixNano())

	// 创建结果通道
	resultChan := make(chan bool, 1)
	errChan := make(chan error, 1)

	// 注册命令回调
	agent.AgentHub.RegisterCallback(cmdID, func(result map[string]interface{}) {
		if success, ok := result["success"].(bool); ok {
			select {
			case resultChan <- success:
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

	// 发送打印指令
	printData := map[string]interface{}{
		"content": content,
	}
	if printerAddress != "" {
		printData["printerAddress"] = printerAddress
	}
	if template != "" {
		printData["template"] = template
	}

	sent := agent.AgentHub.SendToDevice(uint(deviceID), map[string]interface{}{
		"type":      "command",
		"action":    "print",
		"commandId": cmdID,
		"data":      printData,
	})
	if !sent {
		return nil, fmt.Errorf("failed to send print command to device %d", uint(deviceID))
	}

	// 等待结果
	select {
	case success := <-resultChan:
		if success {
			return map[string]interface{}{
				"success": true,
				"message": "Print completed",
			}, nil
		}
		return nil, fmt.Errorf("print failed")

	case err := <-errChan:
		return nil, fmt.Errorf("bluetooth print failed: %w", err)

	case <-time.After(time.Duration(timeout) * time.Second):
		return nil, fmt.Errorf("print timeout after %d seconds", timeout)

	case <-ctx.Done():
		return nil, fmt.Errorf("print cancelled")
	}
}
