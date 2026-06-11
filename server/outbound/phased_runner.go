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

// mergeSuccessfulHTTPDeliveryIntoSharedVars 将一次成功 HTTP 投递的响应合并进跨阶段共用的 vars（与 ExecuteHTTPWebhook 成功分支一致）。
func mergeSuccessfulHTTPDeliveryIntoSharedVars(vars map[string]string, step models.OutboundConnectorStep, d models.OutboundDelivery) {
	if vars == nil || strings.TrimSpace(d.DetailJSON) == "" {
		return
	}
	if NormalizeOutboundStepType(d.StepType) != "http" || !strings.EqualFold(strings.TrimSpace(d.Status), "success") {
		return
	}
	bodyStr, statusCode, ok := HTTPDetailResponseBodyAndStatus(d.DetailJSON, d.HTTPStatus)
	if !ok {
		return
	}
	if statusCode < 200 || statusCode >= 300 {
		if d.HTTPStatus >= 200 && d.HTTPStatus < 300 {
			statusCode = d.HTTPStatus
		}
	}
	if statusCode < 200 || statusCode >= 300 {
		return
	}
	sid := step.ID
	if sid == 0 {
		sid = d.StepID
	}
	MergeHTTPResponseContext(vars, sid, statusCode, []byte(bodyStr))
	MergeHTTPResponseBodyToContext(vars, step, []byte(bodyStr))
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
		return ExecuteHTTPWebhook(db, connector, *ls.HTTP, ls.HTTP.App, rec, dev, def, vars, meta, mergeHTTPResponseIntoVars, ls.Step, nil)
	case "app_script":
		return ExecuteAppScriptStep(db, connector, ls.Step, rec, dev, def, vars, meta)
	case "broadcast_intent", "view_url", "message", "keyboard_hid":
		return ExecuteAgentOutboundStep(db, connector, ls.Step, rec, dev, def, vars, meta)
	case "data_interface":
		return ExecuteDataInterfaceStep(db, connector, ls.Step, rec, dev, def, vars, meta)
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
	SeedContextFromWebhookSchema(vars, connector)
	FlattenJSONEventDataIntoContext(vars, rec.EventData, "context", maxContextFlattenKeys)
	for _, block := range plan {
		MergeParamsJSONObjectIntoVars(vars, block.Phase.ParamsJSON)
		mode := strings.TrimSpace(block.Phase.RunMode)
		if mode == "" {
			mode = "parallel"
		}
		mergeHTTP := mode == "sequential" || mode == "failover"
		switch mode {
		case "parallel":
			// 多步并行时各 goroutine 不能同时写同一 vars；单步时直接写回 vars。
			// 多步时：阶段结束后按步骤顺序把「成功的 HTTP」响应合并进共享 vars，供下一阶段使用（与顺序执行对下游的效果一致）。
			if len(block.Steps) == 1 {
				st := block.Steps[0]
				MergeStepEventDataToContext(vars, st.Step, rec)
				MergeStepTemplateParamsFromConfigJSON(vars, st.Step.ConfigJSON)
				runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, vars, true)
				break
			}
			results := make([]models.OutboundDelivery, len(block.Steps))
			var wg sync.WaitGroup
			for i := range block.Steps {
				i := i
				st := block.Steps[i]
				wg.Add(1)
				go func() {
					defer wg.Done()
					branchVars := ShallowCloneStringMap(vars)
					MergeStepEventDataToContext(branchVars, st.Step, rec)
					MergeStepTemplateParamsFromConfigJSON(branchVars, st.Step.ConfigJSON)
					results[i] = runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, branchVars, false)
				}()
			}
			wg.Wait()
			for i := range block.Steps {
				ls := block.Steps[i]
				if NormalizeOutboundStepType(ls.Step.StepType) != "http" {
					continue
				}
				mergeSuccessfulHTTPDeliveryIntoSharedVars(vars, ls.Step, results[i])
			}
		case "sequential":
			for _, st := range block.Steps {
				MergeStepEventDataToContext(vars, st.Step, rec)
				MergeStepTemplateParamsFromConfigJSON(vars, st.Step.ConfigJSON)
				runOneLoadedStep(db, connector, block.Phase, st, rec, dev, def, vars, mergeHTTP)
			}
		case "failover":
			for _, st := range block.Steps {
				MergeStepEventDataToContext(vars, st.Step, rec)
				MergeStepTemplateParamsFromConfigJSON(vars, st.Step.ConfigJSON)
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
