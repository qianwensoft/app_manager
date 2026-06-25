package mcp

import (
	"encoding/json"
	"fmt"
	"time"

	"app-manager/agent"
	"app-manager/database"
	"app-manager/models"
)

// ── list_devices ──────────────────────────────────────────────────────────────

type listDevicesParams struct {
	GroupID      *uint `json:"group_id"`
	DepartmentID *uint `json:"department_id"`
	OnlineOnly   bool  `json:"online_only"`
}

func listDevices(raw json.RawMessage) (any, *RPCError) {
	var p listDevicesParams
	json.Unmarshal(raw, &p)

	var deviceIDs []uint
	if p.GroupID != nil {
		var members []models.DeviceGroupMember
		database.DB.Where("group_id = ?", *p.GroupID).Find(&members)
		for _, m := range members {
			deviceIDs = append(deviceIDs, m.DeviceID)
		}
	}
	if p.DepartmentID != nil {
		var uds []models.UserDepartment
		database.DB.Where("department_id = ?", *p.DepartmentID).Find(&uds)
		var userIDs []uint
		for _, ud := range uds {
			userIDs = append(userIDs, ud.UserID)
		}
		if len(userIDs) > 0 {
			var devs []models.Device
			database.DB.Select("id").Where("user_id IN ?", userIDs).Find(&devs)
			for _, d := range devs {
				deviceIDs = append(deviceIDs, d.ID)
			}
		}
	}

	var rows []models.Device
	q := database.DB.Select("id,name,serial,model,brand,status,agent_connected,ip_address,group_name,user_id,last_seen_at")
	if len(deviceIDs) > 0 {
		q = q.Where("id IN ?", deviceIDs)
	}
	if p.OnlineOnly {
		q = q.Where("status = 'online'")
	}
	q.Order("id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── list_device_groups ────────────────────────────────────────────────────────

func listDeviceGroups(_ json.RawMessage) (any, *RPCError) {
	var rows []models.DeviceGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── list_departments ──────────────────────────────────────────────────────────

func listDepartments(_ json.RawMessage) (any, *RPCError) {
	var rows []models.Department
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── deploy_scada ──────────────────────────────────────────────────────────────

type deployScadaParams struct {
	ScadaID    uint   `json:"scada_id"`
	TargetType string `json:"target_type"` // device | device_group | department | position | user
	TargetIDs  []uint `json:"target_ids"`
	DeployMode string `json:"deploy_mode"` // webview | apk
	RuleName   string `json:"rule_name"`
}

func deployScada(raw json.RawMessage) (any, *RPCError) {
	var p deployScadaParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.ScadaID == 0 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "scada_id is required"}
	}
	if p.DeployMode == "" {
		p.DeployMode = "webview"
	}

	// verify scada is published
	var scada models.ScadaInfo
	if err := database.DB.First(&scada, p.ScadaID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "scada not found"}
	}
	if scada.PublishStatus != 1 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "scada must be published before deploying"}
	}

	// resolve target_ids → device IDs
	deviceIDs, err := resolveTargetDevices(p.TargetType, p.TargetIDs)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	if len(deviceIDs) == 0 {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "no devices found for the given targets"}
	}

	// save deploy rule
	targetIDsJSON, _ := json.Marshal(p.TargetIDs)
	rule := models.ScadaDeployRule{
		ScadaID:    p.ScadaID,
		Name:       p.RuleName,
		TargetType: p.TargetType,
		TargetIDs:  string(targetIDsJSON),
		DeployMode: p.DeployMode,
	}
	database.DB.Create(&rule)

	// deploy
	var successCount, failCount int
	for _, deviceID := range deviceIDs {
		rec := models.ScadaDeployRecord{
			RuleID:   rule.ID,
			ScadaID:  p.ScadaID,
			DeviceID: deviceID,
			Status:   "pending",
		}
		database.DB.Create(&rec)

		var deployErr error
		if p.DeployMode == "webview" {
			deployErr = deployWebview(scada, deviceID)
		}
		// apk mode: future implementation via task queue

		now := time.Now()
		if deployErr != nil {
			database.DB.Model(&rec).Updates(map[string]any{"status": "failed", "error": deployErr.Error(), "deployed_at": now})
			failCount++
		} else {
			database.DB.Model(&rec).Updates(map[string]any{"status": "success", "deployed_at": now})
			successCount++
		}
	}

	return map[string]any{
		"ok":            true,
		"rule_id":       rule.ID,
		"total_devices": len(deviceIDs),
		"success":       successCount,
		"failed":        failCount,
	}, nil
}

// deployWebview creates/updates an AgentMenuItem and pushes it to the device.
func deployWebview(scada models.ScadaInfo, deviceID uint) error {
	// upsert AgentMenuItem for this scada
	var menu models.AgentMenuItem
	database.DB.Where("target_ref = ? AND target_type = 'scada_preview'", scada.ScadaCode).First(&menu)
	if menu.ID == 0 {
		menu = models.AgentMenuItem{
			Title:           scada.ScadaName,
			TargetType:      "scada_preview",
			TargetRef:       scada.ScadaCode,
			ShowOnAgentHome: true,
			SortOrder:       0,
		}
		if err := database.DB.Create(&menu).Error; err != nil {
			return err
		}
	}

	// assign menu to device（追加 upsert，不删除该设备已有的其它菜单）
	database.DB.
		Where("menu_id = ? AND device_id = ?", menu.ID, deviceID).
		FirstOrCreate(&models.AgentMenuAssignment{MenuID: menu.ID, DeviceID: deviceID})

	// increment revision and push via WebSocket
	database.DB.Model(&models.Device{}).Where("id = ?", deviceID).
		UpdateColumn("agent_menu_revision", database.DB.Raw("agent_menu_revision + 1"))

	// build menu payload and push
	var menus []models.AgentMenuItem
	var assignments []models.AgentMenuAssignment
	database.DB.Where("device_id = ?", deviceID).Find(&assignments)
	menuIDs := make([]uint, 0, len(assignments))
	for _, a := range assignments {
		menuIDs = append(menuIDs, a.MenuID)
	}
	if len(menuIDs) > 0 {
		database.DB.Where("id IN ?", menuIDs).Find(&menus)
	}

	var dev models.Device
	database.DB.First(&dev, deviceID)
	routeKey, err := agent.AgentConnectionKey(fmt.Sprint(deviceID))
	if err != nil {
		return err
	}
	agent.AgentHub.Send(routeKey, map[string]any{
		"type":     "agent_menu_sync",
		"revision": dev.AgentMenuRevision,
		"menus":    menus,
	})
	return nil
}

// ── get_deploy_status ─────────────────────────────────────────────────────────

type getDeployStatusParams struct {
	RuleID  *uint `json:"rule_id"`
	ScadaID *uint `json:"scada_id"`
}

func getDeployStatus(raw json.RawMessage) (any, *RPCError) {
	var p getDeployStatusParams
	json.Unmarshal(raw, &p)
	var rows []models.ScadaDeployRecord
	q := database.DB.Order("id DESC").Limit(100)
	if p.RuleID != nil {
		q = q.Where("rule_id = ?", *p.RuleID)
	}
	if p.ScadaID != nil {
		q = q.Where("scada_id = ?", *p.ScadaID)
	}
	q.Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── helpers ───────────────────────────────────────────────────────────────────

func resolveTargetDevices(targetType string, targetIDs []uint) ([]uint, error) {
	var deviceIDs []uint
	switch targetType {
	case "device":
		return targetIDs, nil

	case "device_group":
		var members []models.DeviceGroupMember
		database.DB.Where("group_id IN ?", targetIDs).Find(&members)
		for _, m := range members {
			deviceIDs = append(deviceIDs, m.DeviceID)
		}

	case "user":
		var devs []models.Device
		database.DB.Select("id").Where("user_id IN ?", targetIDs).Find(&devs)
		for _, d := range devs {
			deviceIDs = append(deviceIDs, d.ID)
		}

	case "department":
		var uds []models.UserDepartment
		database.DB.Where("department_id IN ?", targetIDs).Find(&uds)
		userIDs := make([]uint, 0, len(uds))
		for _, ud := range uds {
			userIDs = append(userIDs, ud.UserID)
		}
		if len(userIDs) > 0 {
			var devs []models.Device
			database.DB.Select("id").Where("user_id IN ?", userIDs).Find(&devs)
			for _, d := range devs {
				deviceIDs = append(deviceIDs, d.ID)
			}
		}

	case "position":
		var uds []models.UserDepartment
		database.DB.Where("position_id IN ?", targetIDs).Find(&uds)
		userIDs := make([]uint, 0, len(uds))
		for _, ud := range uds {
			userIDs = append(userIDs, ud.UserID)
		}
		if len(userIDs) > 0 {
			var devs []models.Device
			database.DB.Select("id").Where("user_id IN ?", userIDs).Find(&devs)
			for _, d := range devs {
				deviceIDs = append(deviceIDs, d.ID)
			}
		}

	default:
		return nil, fmt.Errorf("unknown target_type: %s", targetType)
	}
	return deviceIDs, nil
}
