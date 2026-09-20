package workflow

import "testing"

func TestSetAndCheckWorkflowBlocked(t *testing.T) {
	// 清理：重置所有状态
	for _, dev := range GetBlockedDevices() {
		SetWorkflowBlocked(dev, false)
	}

	deviceID := uint(100)

	// 初始状态：未阻塞
	if IsWorkflowBlocked(deviceID) {
		t.Fatal("expected device to not be blocked initially")
	}

	// 设置阻塞
	SetWorkflowBlocked(deviceID, true)
	if !IsWorkflowBlocked(deviceID) {
		t.Fatal("expected device to be blocked after SetWorkflowBlocked(true)")
	}

	// 验证出现在 GetBlockedDevices 中
	devices := GetBlockedDevices()
	found := false
	for _, d := range devices {
		if d == deviceID {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected device to be in GetBlockedDevices list")
	}

	// 取消阻塞
	SetWorkflowBlocked(deviceID, false)
	if IsWorkflowBlocked(deviceID) {
		t.Fatal("expected device to not be blocked after SetWorkflowBlocked(false)")
	}
}

func TestMultipleDevices(t *testing.T) {
	// 清理
	for _, dev := range GetBlockedDevices() {
		SetWorkflowBlocked(dev, false)
	}

	dev1 := uint(201)
	dev2 := uint(202)

	// 阻塞两个设备
	SetWorkflowBlocked(dev1, true)
	SetWorkflowBlocked(dev2, true)

	if !IsWorkflowBlocked(dev1) {
		t.Error("device 1 should be blocked")
	}
	if !IsWorkflowBlocked(dev2) {
		t.Error("device 2 should be blocked")
	}

	// 取消阻塞其中一个，另一个应该仍然阻塞
	SetWorkflowBlocked(dev1, false)
	if IsWorkflowBlocked(dev1) {
		t.Error("device 1 should be unblocked")
	}
	if !IsWorkflowBlocked(dev2) {
		t.Error("device 2 should still be blocked")
	}
}

func TestNonExistentDevice(t *testing.T) {
	// 查询一个不存在的设备ID，应该返回 false
	if IsWorkflowBlocked(99999) {
		t.Error("non-existent device should not be blocked")
	}
}
