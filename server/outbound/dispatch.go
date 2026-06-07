package outbound

import (
	"log"
	"strings"
	"sync"

	"app-manager/database"
	"app-manager/models"

	"gorm.io/gorm"
)

// NotifyDeviceEvent 在 DeviceEvent 落库后异步触发出站（不阻塞 WS）。
func NotifyDeviceEvent(rec models.DeviceEvent, dev *models.Device) {
	if rec.ID == 0 || strings.TrimSpace(rec.EventType) == "" {
		return
	}
	go processDeviceEvent(rec, dev)
}

func processDeviceEvent(rec models.DeviceEvent, dev *models.Device) {
	db := database.DB
	var def models.CustomEventDefinition
	if err := db.Where("`key` = ? AND enabled = ?", rec.EventType, true).First(&def).Error; err != nil {
		return
	}

	var links []models.OutboundConnectorDefinition
	if err := db.Where("definition_id = ?", def.ID).Find(&links).Error; err != nil || len(links) == 0 {
		return
	}
	ids := make([]uint, 0, len(links))
	seen := map[uint]struct{}{}
	for _, l := range links {
		if _, ok := seen[l.ConnectorID]; ok {
			continue
		}
		seen[l.ConnectorID] = struct{}{}
		ids = append(ids, l.ConnectorID)
	}

	var connectors []models.OutboundConnector
	if err := db.Where("id IN ? AND enabled = ?", ids, true).Order("priority ASC, id ASC").Find(&connectors).Error; err != nil {
		return
	}

	for _, c := range connectors {
		if strings.TrimSpace(c.ConnectorCode) != "" && c.ConnectorCode != "http_webhook" {
			continue
		}
		if !ConnectorAppliesToDevice(db, c.ID, rec.DeviceID) {
			continue
		}
		if DeviceOutboundConnectorPaused(db, c.ID, rec.DeviceID) {
			continue
		}
		if !ConnectorEventPass(c, rec.DeviceID, rec.EventType, rec.EventData) {
			continue
		}
		RunConnectorOutbound(c, rec, dev, &def)
	}
}

func loadOrderedEndpoints(db *gorm.DB, connectorID uint) ([]models.OutboundEndpoint, bool) {
	var rows []models.OutboundConnectorEndpoint
	if err := db.Where("connector_id = ?", connectorID).Order("sort_order ASC, endpoint_id ASC").Find(&rows).Error; err != nil || len(rows) == 0 {
		return nil, false
	}
	out := make([]models.OutboundEndpoint, 0, len(rows))
	for _, r := range rows {
		var ep models.OutboundEndpoint
		if err := db.Preload("App").First(&ep, r.EndpointID).Error; err != nil {
			continue
		}
		if !ep.Enabled || ep.App == nil || !ep.App.Enabled {
			continue
		}
		out = append(out, ep)
	}
	return out, len(out) > 0
}

func runConnectorDeliveries(db *gorm.DB, connector models.OutboundConnector, eps []models.OutboundEndpoint,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition,
) {
	mode := strings.TrimSpace(connector.DeliveryMode)
	if mode == "" {
		mode = "parallel"
	}

	vars := TemplateVars(rec, dev, def)
	SeedContextFromWebhookSchema(vars, connector)
	FlattenJSONEventDataIntoContext(vars, rec.EventData, "context", maxContextFlattenKeys)
	switch mode {
	case "parallel":
		var wg sync.WaitGroup
		for i := range eps {
			ep := eps[i]
			app := ep.App
			wg.Add(1)
			go func(ep models.OutboundEndpoint, app *models.OutboundApp) {
				defer wg.Done()
				meta := StepExecutionMeta{StepType: "http"}
				ExecuteHTTPWebhook(db, connector, ep, app, rec, dev, def, vars, meta, false, models.OutboundConnectorStep{}, nil)
			}(ep, app)
		}
		wg.Wait()
	case "sequential":
		for i := range eps {
			meta := StepExecutionMeta{StepType: "http"}
			ExecuteHTTPWebhook(db, connector, eps[i], eps[i].App, rec, dev, def, vars, meta, true, models.OutboundConnectorStep{}, nil)
		}
	case "failover":
		for i := range eps {
			meta := StepExecutionMeta{StepType: "http"}
			d := ExecuteHTTPWebhook(db, connector, eps[i], eps[i].App, rec, dev, def, vars, meta, true, models.OutboundConnectorStep{}, nil)
			if d.Status == "success" {
				return
			}
		}
	default:
		log.Printf("outbound: unknown delivery_mode %q for connector %d", mode, connector.ID)
	}
}
