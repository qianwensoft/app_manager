package database

import (
	"app-manager/models"
	"log"

	"gorm.io/gorm"
)

// MigrateLegacyOutboundPhases 将旧版 connector_endpoints 迁入 phases+steps 后删除旧关联行（幂等）。
func MigrateLegacyOutboundPhases(db *gorm.DB) {
	var cids []uint
	if err := db.Model(&models.OutboundConnectorEndpoint{}).Distinct("connector_id").Pluck("connector_id", &cids).Error; err != nil || len(cids) == 0 {
		return
	}
	for _, cid := range cids {
		if cid == 0 {
			continue
		}
		var n int64
		db.Model(&models.OutboundConnectorPhase{}).Where("connector_id = ?", cid).Count(&n)
		if n > 0 {
			continue
		}
		var co models.OutboundConnector
		if err := db.First(&co, cid).Error; err != nil {
			continue
		}
		mode := co.DeliveryMode
		if mode != "parallel" && mode != "sequential" && mode != "failover" {
			mode = "parallel"
		}
		ph := models.OutboundConnectorPhase{
			ConnectorID: cid,
			SortOrder:   0,
			RunMode:     mode,
		}
		if err := db.Create(&ph).Error; err != nil {
			log.Printf("migrate outbound phases: create phase connector=%d: %v", cid, err)
			continue
		}
		var rows []models.OutboundConnectorEndpoint
		db.Where("connector_id = ?", cid).Order("sort_order ASC, endpoint_id ASC").Find(&rows)
		for _, r := range rows {
			st := models.OutboundConnectorStep{
				PhaseID:    ph.ID,
				SortOrder:  r.SortOrder,
				StepType:   "http",
				EndpointID: r.EndpointID,
				ConfigJSON: "{}",
			}
			if err := db.Create(&st).Error; err != nil {
				log.Printf("migrate outbound phases: step connector=%d ep=%d: %v", cid, r.EndpointID, err)
			}
		}
		if err := db.Where("connector_id = ?", cid).Delete(&models.OutboundConnectorEndpoint{}).Error; err != nil {
			log.Printf("migrate outbound phases: delete legacy endpoints connector=%d: %v", cid, err)
		}
	}
	if len(cids) > 0 {
		log.Printf("migrate outbound phases: migrated %d connector(s) to phased model", len(cids))
	}
}
