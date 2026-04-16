package outbound

import (
	"fmt"
	"strings"

	"app-manager/models"

	"gorm.io/gorm"
)

// RetryDelivery 按原设备事件与连接器步骤重新执行一次，并写入新的 outbound_deliveries 记录。
func RetryDelivery(db *gorm.DB, deliveryID uint) (models.OutboundDelivery, error) {
	var orig models.OutboundDelivery
	if err := db.First(&orig, deliveryID).Error; err != nil {
		return models.OutboundDelivery{}, err
	}
	var rec models.DeviceEvent
	if err := db.First(&rec, orig.DeviceEventID).Error; err != nil {
		return models.OutboundDelivery{}, fmt.Errorf("device_event: %w", err)
	}
	var dev models.Device
	if err := db.First(&dev, rec.DeviceID).Error; err != nil {
		return models.OutboundDelivery{}, fmt.Errorf("device: %w", err)
	}
	var def models.CustomEventDefinition
	if err := db.Where("`key` = ? AND enabled = ?", rec.EventType, true).First(&def).Error; err != nil {
		return models.OutboundDelivery{}, fmt.Errorf("事件定义 %q 不存在或未启用: %w", rec.EventType, err)
	}
	var co models.OutboundConnector
	if err := db.First(&co, orig.ConnectorID).Error; err != nil {
		return models.OutboundDelivery{}, err
	}
	if !ConnectorAppliesToDevice(db, co.ID, rec.DeviceID) {
		return models.OutboundDelivery{}, fmt.Errorf("连接器已排除该设备或未在设备范围内")
	}
	if DeviceOutboundConnectorPaused(db, co.ID, rec.DeviceID) {
		return models.OutboundDelivery{}, fmt.Errorf("连接器在该设备上处于暂停状态")
	}

	plan, ok := LoadConnectorPhases(db, co.ID)
	if ok && orig.PhaseID > 0 && orig.StepID > 0 {
		for _, block := range plan {
			if block.Phase.ID != orig.PhaseID {
				continue
			}
			for _, ls := range block.Steps {
				if ls.Step.ID != orig.StepID {
					continue
				}
				vars := TemplateVars(rec, &dev, &def)
				return runOneLoadedStep(db, co, block.Phase, ls, rec, &dev, &def, vars, false), nil
			}
			return models.OutboundDelivery{}, fmt.Errorf("阶段 #%d 下找不到步骤 #%d（配置可能已变更）", orig.PhaseID, orig.StepID)
		}
		return models.OutboundDelivery{}, fmt.Errorf("找不到阶段 #%d（配置可能已变更）", orig.PhaseID)
	}

	if orig.EndpointID == 0 {
		return models.OutboundDelivery{}, fmt.Errorf("无法重试：缺少 endpoint_id 且连接器无匹配阶段/步骤")
	}
	var ep models.OutboundEndpoint
	if err := db.Preload("App").First(&ep, orig.EndpointID).Error; err != nil {
		return models.OutboundDelivery{}, fmt.Errorf("endpoint: %w", err)
	}
	if ep.App == nil {
		return models.OutboundDelivery{}, fmt.Errorf("接口所属应用未加载")
	}
	meta := StepExecutionMeta{
		PhaseID:  orig.PhaseID,
		StepID:   orig.StepID,
		StepType: orig.StepType,
	}
	if strings.TrimSpace(meta.StepType) == "" {
		meta.StepType = "http"
	}
	vars := TemplateVars(rec, &dev, &def)
	return ExecuteHTTPWebhook(db, co, ep, ep.App, rec, &dev, &def, vars, meta, false), nil
}
