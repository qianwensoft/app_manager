package outbound

import (
	"log"
	"strings"
	"sync"
	"time"

	"app-manager/database"
	"app-manager/models"

	"gorm.io/gorm"
)

const maxStepDelayMS = 600_000 // 10 分钟上限

func sleepStepDelay(ms int) {
	if ms <= 0 {
		return
	}
	if ms > maxStepDelayMS {
		ms = maxStepDelayMS
	}
	time.Sleep(time.Duration(ms) * time.Millisecond)
}

func runOneLoadedStep(db *gorm.DB, connector models.OutboundConnector, ph models.OutboundConnectorPhase, ls LoadedStep,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition, vars map[string]string, mergeHTTPResponseIntoVars bool,
) models.OutboundDelivery {
	sleepStepDelay(ls.Step.DelayBeforeMS)
	defer sleepStepDelay(ls.Step.DelayAfterMS)

	normType := NormalizeOutboundStepType(ls.Step.StepType)
	meta := StepExecutionMeta{PhaseID: ph.ID, StepID: ls.Step.ID, StepType: normType}
	switch normType {
	case "http":
		if ls.HTTP == nil {
			d := models.OutboundDelivery{
				DeviceEventID: rec.ID,
				ConnectorID:   connector.ID,
				PhaseID:       ph.ID,
				StepID:        ls.Step.ID,
				StepType:      "http",
				EndpointID:    ls.Step.EndpointID,
				Status:        "failed",
				Error:         "接口不可用或未启用",
				Attempts:      0,
			}
			d.DetailJSON = HTTPSetupDetail("endpoint", d.Error)
			_ = db.Create(&d).Error
			return d
		}
		return ExecuteHTTPWebhook(db, connector, *ls.HTTP, ls.HTTP.App, rec, dev, def, vars, meta, mergeHTTPResponseIntoVars)
	case "broadcast_intent", "view_url", "message":
		return ExecuteAgentOutboundStep(db, connector, ls.Step, rec, dev, def, vars, meta)
	default:
		d := models.OutboundDelivery{
			DeviceEventID: rec.ID,
			ConnectorID:   connector.ID,
			PhaseID:       ph.ID,
			StepID:        ls.Step.ID,
			StepType:      normType,
			Status:        "failed",
			Error:         "不支持的 step_type",
			Attempts:      0,
		}
		d.DetailJSON = HTTPSetupDetail("step_type", d.Error)
		_ = db.Create(&d).Error
		return d
	}
}

// RunPhasedConnector 按阶段执行连接器（阶段顺序；阶段内 parallel/sequential/failover）。
func RunPhasedConnector(db *gorm.DB, connector models.OutboundConnector, plan []LoadedPhase,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition,
) {
	vars := TemplateVars(rec, dev, def)
	for _, block := range plan {
		mode := strings.TrimSpace(block.Phase.RunMode)
		if mode == "" {
			mode = "parallel"
		}
		mergeHTTP := mode == "sequential" || mode == "failover"
		switch mode {
		case "parallel":
			var wg sync.WaitGroup
			for _, st := range block.Steps {
				st := st
				wg.Add(1)
				go func() {
					defer wg.Done()
					runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, vars, false)
				}()
			}
			wg.Wait()
		case "sequential":
			for _, st := range block.Steps {
				runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, vars, mergeHTTP)
			}
		case "failover":
			for _, st := range block.Steps {
				d := runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, vars, mergeHTTP)
				if NormalizeOutboundStepType(st.Step.StepType) == "http" && d.Status == "success" {
					break
				}
			}
		default:
			log.Printf("outbound: unknown phase run_mode %q connector=%d phase=%d", mode, connector.ID, block.Phase.ID)
		}
	}
}

// RunConnectorOutbound 优先多阶段计划，否则回退旧版 endpoint 列表。
func RunConnectorOutbound(connector models.OutboundConnector, rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition) {
	db := database.DB
	plan, ok := LoadConnectorPhases(db, connector.ID)
	if ok {
		RunPhasedConnector(db, connector, plan, rec, dev, def)
		return
	}
	eps, ok := loadOrderedEndpoints(db, connector.ID)
	if !ok || len(eps) == 0 {
		return
	}
	runConnectorDeliveries(db, connector, eps, rec, dev, def)
}
