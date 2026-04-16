package outbound

import (
	"app-manager/models"

	"gorm.io/gorm"
)

// LoadedStep 已解析的一条步骤（HTTP 时预加载 Endpoint）。
type LoadedStep struct {
	Step models.OutboundConnectorStep
	HTTP *models.OutboundEndpoint
}

// LoadedPhase 一个执行阶段及其步骤。
type LoadedPhase struct {
	Phase models.OutboundConnectorPhase
	Steps []LoadedStep
}

// LoadConnectorPhases 加载连接器的多阶段计划；无阶段返回 false。
func LoadConnectorPhases(db *gorm.DB, connectorID uint) ([]LoadedPhase, bool) {
	var phases []models.OutboundConnectorPhase
	if err := db.Where("connector_id = ?", connectorID).Order("sort_order ASC, id ASC").Find(&phases).Error; err != nil || len(phases) == 0 {
		return nil, false
	}
	out := make([]LoadedPhase, 0, len(phases))
	for _, ph := range phases {
		var steps []models.OutboundConnectorStep
		if err := db.Where("phase_id = ?", ph.ID).Order("sort_order ASC, id ASC").Find(&steps).Error; err != nil {
			continue
		}
		ls := make([]LoadedStep, 0, len(steps))
		for _, st := range steps {
			ld := LoadedStep{Step: st}
			if st.StepType == "http" && st.EndpointID > 0 {
				var ep models.OutboundEndpoint
				if err := db.Preload("App").First(&ep, st.EndpointID).Error; err == nil {
					if ep.Enabled && ep.App != nil && ep.App.Enabled {
						ld.HTTP = &ep
					}
				}
			}
			ls = append(ls, ld)
		}
		out = append(out, LoadedPhase{Phase: ph, Steps: ls})
	}
	return out, len(out) > 0
}
