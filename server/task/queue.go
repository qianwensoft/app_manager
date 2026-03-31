package task

import (
	"app-manager/adb"
	"app-manager/agent"
	"app-manager/config"
	"app-manager/database"
	"app-manager/models"
	"errors"
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Queue struct {
	tasks   chan uint // task ID
	workers int
	wg      sync.WaitGroup
}

var Q *Queue

func Init(workers int) {
	Q = &Queue{tasks: make(chan uint, 100), workers: workers}
	for i := 0; i < workers; i++ {
		Q.wg.Add(1)
		go Q.worker()
	}
}

func (q *Queue) Submit(taskID uint) {
	q.tasks <- taskID
}

func (q *Queue) Stop() {
	close(q.tasks)
	q.wg.Wait()
}

func (q *Queue) worker() {
	defer q.wg.Done()
	client := adb.NewClient(config.C.ADB.Path, config.C.ADB.Timeout)
	for taskID := range q.tasks {
		execute(client, taskID)
	}
}

func deviceSerialUsableWithAdb(serial string) bool {
	return serial != "" && !strings.HasPrefix(serial, "agent-")
}

// agentCanRelayInstall 设备在 Web 中绑定了 Agent Token 且当前 WS 在线，可下发 install_app。
func agentCanRelayInstall(device models.Device) bool {
	key, err := agent.AgentConnectionKey(fmt.Sprintf("%d", device.ID))
	if err != nil {
		return false
	}
	return agent.AgentHub.IsConnected(key)
}

func execute(client *adb.Client, taskID uint) {
	var t models.InstallTask
	if err := database.DB.First(&t, taskID).Error; err != nil {
		return
	}

	database.DB.Model(&t).Update("status", "running")

	var device models.Device
	var app models.App
	database.DB.First(&device, t.DeviceID)
	database.DB.First(&app, t.AppID)

	var output string
	var err error

	switch t.Action {
	case "install":
		if !deviceSerialUsableWithAdb(device.Serial) {
			output, err = installViaAgent(taskID, &t, device, app)
		} else {
			output, err = client.Install(device.Serial, app.FilePath)
			// ADB 失败（如签名/降级/厂商限制等）时，若已绑定 Agent 且在线，经 Agent 下载 APK 走 PackageInstaller 覆盖安装
			if err != nil && t.AgentFetchToken != "" && agentCanRelayInstall(device) {
				log.Printf("task %d: adb install failed (%v), fallback install via Agent", taskID, err)
				adbErr := err
				var out string
				out, err = installViaAgent(taskID, &t, device, app)
				if err == nil {
					if out != "" && out != "安装完成" {
						output = "ADB 失败后经 Agent 安装: " + out
					} else {
						output = "ADB 失败后经 Agent 安装成功"
					}
				} else {
					output = fmt.Sprintf("ADB: %v；Agent 透传: %v", adbErr, err)
					err = fmt.Errorf("ADB 安装失败 (%v)；Agent 透传仍失败: %w", adbErr, err)
				}
			}
		}
	case "uninstall":
		if !deviceSerialUsableWithAdb(device.Serial) {
			err = errors.New("仅 Agent 接入的设备暂不支持服务端远程卸载，请使用带 ADB 串号的设备")
		} else {
			output, err = client.Uninstall(device.Serial, app.PackageName)
		}
	default:
		err = fmt.Errorf("unknown action %s", t.Action)
	}

	if err == nil && t.Action == "install" && t.StartAfterInstall {
		if note := postInstallStartApp(client, device, app); note != "" {
			if output != "" {
				output += "；" + note
			} else {
				output = note
			}
		}
	}

	status := "success"
	if err != nil {
		status = "failed"
		output = err.Error()
		log.Printf("Task %d failed: %v", taskID, err)
	}

	now := time.Now()
	database.DB.Model(&t).Updates(map[string]interface{}{
		"status":      status,
		"output":      output,
		"finished_at": &now,
	})
}

// postInstallStartApp 安装成功后拉起主界面：优先 ADB monkey，失败或未接 ADB 则改由 Agent start_app。
func postInstallStartApp(client *adb.Client, device models.Device, app models.App) string {
	pkg := strings.TrimSpace(app.PackageName)
	if pkg == "" {
		return "未解析到包名，未自动启动"
	}
	if deviceSerialUsableWithAdb(device.Serial) {
		out, aerr := client.Shell(device.Serial, "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1")
		if aerr != nil {
			log.Printf("post-install adb start %s@%s: %v %s", pkg, device.Serial, aerr, out)
			if sendAgentStartApp(device, pkg) {
				return "ADB 启动失败，已改经 Agent 启动"
			}
			return "自动启动失败（ADB 与 Agent 均不可用）"
		}
		return "已启动应用"
	}
	if sendAgentStartApp(device, pkg) {
		return "已启动应用（Agent）"
	}
	return "Agent 离线，未自动启动"
}

func sendAgentStartApp(device models.Device, pkg string) bool {
	key, kerr := agent.AgentConnectionKey(fmt.Sprintf("%d", device.ID))
	if kerr != nil || !agent.AgentHub.IsConnected(key) {
		return false
	}
	_ = agent.AgentHub.Send(key, map[string]interface{}{
		"type":   "command",
		"action": "start_app",
		"data":   map[string]interface{}{"packageName": pkg},
	})
	return true
}

func installViaAgent(taskID uint, t *models.InstallTask, device models.Device, app models.App) (string, error) {
	routeKey, kerr := agent.AgentConnectionKey(fmt.Sprintf("%d", device.ID))
	if kerr != nil {
		return "", fmt.Errorf("无法解析 Agent 连接键: %v", kerr)
	}
	if !agent.AgentHub.IsConnected(routeKey) {
		return "", errors.New("Agent 未在线；本设备无 ADB 串号，无法通过 USB 安装")
	}
	if t.AgentFetchToken == "" {
		return "", errors.New("安装任务缺少 agent_fetch_token，请重新提交安装")
	}

	commandID := fmt.Sprintf("install_%d", taskID)
	ch := agent.RegisterInstallWait(commandID)
	defer agent.ForgetInstallWait(commandID)

	q := url.Values{}
	q.Set("task_id", fmt.Sprintf("%d", taskID))
	q.Set("token", t.AgentFetchToken)
	downloadPath := "/api/agent/install-apk?" + q.Encode()

	msg := map[string]interface{}{
		"type":      "command",
		"action":    "install_app",
		"commandId": commandID,
		"data": map[string]interface{}{
			"download_path": downloadPath,
			"task_id":       float64(taskID),
			"apk_name":      app.Name,
		},
	}
	if serr := agent.AgentHub.Send(routeKey, msg); serr != nil {
		return "", fmt.Errorf("下发安装命令失败: %v", serr)
	}

	select {
	case rep := <-ch:
		if rep.Err != "" {
			return rep.Output, errors.New(rep.Err)
		}
		if rep.Output == "" {
			return "安装完成", nil
		}
		return rep.Output, nil
	case <-time.After(25 * time.Minute):
		return "", errors.New("等待 Agent 安装结果超时（请在设备上完成系统安装界面操作）")
	}
}
