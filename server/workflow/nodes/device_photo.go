package nodes

import (
	"context"
	"fmt"
	"time"

	"app-manager/agent"
)

// DevicePhotoNode 设备拍照节点
type DevicePhotoNode struct{}

// Execute 执行拍照
func (n *DevicePhotoNode) Execute(ctx context.Context, config map[string]interface{}, variables map[string]interface{}) (map[string]interface{}, error) {
	// 解析配置
	deviceID, ok := config["deviceId"].(float64)
	if !ok {
		if id, ok := config["device_id"].(float64); ok {
			deviceID = id
		} else {
			return nil, fmt.Errorf("deviceId is required")
		}
	}

	camera, _ := config["camera"].(string)
	if camera == "" {
		camera = "back" // 默认后置摄像头
	}

	quality := 80 // 默认质量 80%
	if q, ok := config["quality"].(float64); ok && q > 0 && q <= 100 {
		quality = int(q)
	}

	timeout := 60 // 默认 60 秒
	if t, ok := config["timeout"].(float64); ok && t > 0 {
		timeout = int(t)
	}

	outputVar, _ := config["outputVariable"].(string)
	if outputVar == "" {
		outputVar = "photoUrl"
	}

	// 检查设备是否在线
	if !agent.AgentHub.IsConnected(fmt.Sprintf("%d", uint(deviceID))) {
		return nil, fmt.Errorf("device %d not connected", uint(deviceID))
	}

	// 生成命令 ID
	cmdID := fmt.Sprintf("photo_%d_%d", uint(deviceID), time.Now().UnixNano())

	// 创建结果通道
	resultChan := make(chan string, 1)
	errChan := make(chan error, 1)

	// 注册命令回调
	agent.AgentHub.RegisterCallback(cmdID, func(result map[string]interface{}) {
		if photoUrl, ok := result["photoUrl"].(string); ok {
			select {
			case resultChan <- photoUrl:
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

	// 发送拍照指令
	sent := agent.AgentHub.SendToDevice(uint(deviceID), map[string]interface{}{
		"type":      "command",
		"action":    "take_photo",
		"commandId": cmdID,
		"data": map[string]interface{}{
			"camera":  camera,
			"quality": quality,
		},
	})
	if !sent {
		return nil, fmt.Errorf("failed to send photo command to device %d", uint(deviceID))
	}

	// 等待结果
	select {
	case photoUrl := <-resultChan:
		// 保存到变量
		variables[outputVar] = photoUrl
		return map[string]interface{}{
			"success":  true,
			"photoUrl": photoUrl,
			"camera":   camera,
		}, nil

	case err := <-errChan:
		return nil, fmt.Errorf("photo capture failed: %w", err)

	case <-time.After(time.Duration(timeout) * time.Second):
		return nil, fmt.Errorf("photo timeout after %d seconds", timeout)

	case <-ctx.Done():
		return nil, fmt.Errorf("photo cancelled")
	}
}
