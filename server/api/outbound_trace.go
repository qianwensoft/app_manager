package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// traceLastRun 兼容 Raw 聚合：MySQL 常为 time.Time，SQLite 常为 string / []byte。
type traceLastRun struct {
	T     time.Time
	Valid bool
}

func (t *traceLastRun) Scan(src interface{}) error {
	*t = traceLastRun{}
	if src == nil {
		return nil
	}
	switch v := src.(type) {
	case time.Time:
		if v.IsZero() {
			return nil
		}
		t.T = v
		t.Valid = true
		return nil
	case []byte:
		return t.scanString(string(v))
	case string:
		return t.scanString(v)
	default:
		return fmt.Errorf("traceLastRun: unsupported %T", src)
	}
}

func (t *traceLastRun) scanString(s string) error {
	if tm, ok := parseOutboundLastRun(s); ok {
		t.T = tm
		t.Valid = true
	}
	return nil
}

// traceStatRow 聚合 outbound_deliveries（SQLite / MySQL 通用 SUM CASE）。
type traceStatRow struct {
	PhaseID    uint         `gorm:"column:phase_id"`
	StepID     uint         `gorm:"column:step_id"`
	StepType   string       `gorm:"column:step_type"`
	EndpointID uint         `gorm:"column:endpoint_id"`
	Total      int64        `gorm:"column:total"`
	Success    int64        `gorm:"column:success"`
	Failed     int64        `gorm:"column:failed"`
	LastRun    traceLastRun `gorm:"column:last_run"`
}

type traceNodeStatOut struct {
	PhaseID    uint       `json:"phase_id"`
	StepID     uint       `json:"step_id"`
	StepType   string     `json:"step_type"`
	EndpointID uint       `json:"endpoint_id"`
	Label      string     `json:"label"`
	Total      int64      `json:"total"`
	Success    int64      `json:"success"`
	Failed     int64      `json:"failed"`
	LastRun    *time.Time `json:"last_run,omitempty"`
}

// GetOutboundConnectorExecutionTrace GET /api/outbound/connectors/:id/execution-trace
// 返回连接器拓扑快照 + 各执行节点（步骤）在投递日志中的运转统计。
func GetOutboundConnectorExecutionTrace(c *gin.Context) {
	idU := parseUint(c.Param("id"))
	if idU == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	id := uint(idU)
	h, err := connectorDetail(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	var rows []traceStatRow
	raw := `
SELECT 
  COALESCE(phase_id, 0) AS phase_id,
  COALESCE(step_id, 0) AS step_id,
  COALESCE(step_type, '') AS step_type,
  COALESCE(endpoint_id, 0) AS endpoint_id,
  COUNT(*) AS total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  MAX(created_at) AS last_run
FROM outbound_deliveries
WHERE connector_id = ?
GROUP BY phase_id, step_id, step_type, endpoint_id
ORDER BY phase_id, step_id
`
	if err := database.DB.Raw(raw, id).Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	labelByStep := buildStepLabelMap(h)
	out := make([]traceNodeStatOut, 0, len(rows))
	for _, r := range rows {
		lb := labelForTraceRow(r, labelByStep)
		tr := traceNodeStatOut{
			PhaseID:    r.PhaseID,
			StepID:     r.StepID,
			StepType:   r.StepType,
			EndpointID: r.EndpointID,
			Label:      lb,
			Total:      r.Total,
			Success:    r.Success,
			Failed:     r.Failed,
		}
		if r.LastRun.Valid {
			tm := r.LastRun.T
			tr.LastRun = &tm
		}
		out = append(out, tr)
	}

	c.JSON(http.StatusOK, gin.H{
		"connector":  h,
		"node_stats": out,
	})
}

// parseOutboundLastRun 兼容 SQLite / MySQL 驱动对聚合时间戳的不同返回格式。
func parseOutboundLastRun(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999",
		"2006-01-02 15:04:05.000",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z07:00",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, s, time.Local); err == nil {
			return t, true
		}
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func uintFromIface(v interface{}) uint {
	switch t := v.(type) {
	case float64:
		return uint(t)
	case int:
		return uint(t)
	case int64:
		return uint(t)
	case uint:
		return t
	case uint64:
		return uint(t)
	default:
		return 0
	}
}

func buildStepLabelMap(h gin.H) map[uint]string {
	m := make(map[uint]string)
	epNames := map[uint]string{}
	phases, ok := h["phases"].([]gin.H)
	if !ok {
		return m
	}
	var epIDs []uint
	for _, ph := range phases {
		steps, ok := ph["steps"].([]gin.H)
		if !ok {
			continue
		}
		for _, st := range steps {
			if strings.TrimSpace(fmt.Sprint(st["step_type"])) == "http" {
				eid := uintFromIface(st["endpoint_id"])
				if eid > 0 {
					epIDs = append(epIDs, eid)
				}
			}
		}
	}
	if len(epIDs) > 0 {
		var eps []models.OutboundEndpoint
		database.DB.Where("id IN ?", epIDs).Find(&eps)
		for _, e := range eps {
			epNames[e.ID] = strings.TrimSpace(e.Name)
		}
	}
	for _, ph := range phases {
		steps, ok := ph["steps"].([]gin.H)
		if !ok {
			continue
		}
		for _, st := range steps {
			sid := uintFromIface(st["id"])
			if sid == 0 {
				continue
			}
			typ, _ := st["step_type"].(string)
			switch strings.TrimSpace(typ) {
			case "http":
				epID := uintFromIface(st["endpoint_id"])
				nm := epNames[epID]
				if nm != "" {
					m[sid] = fmt.Sprintf("HTTP · %s", nm)
				} else if epID > 0 {
					m[sid] = fmt.Sprintf("HTTP #%d", epID)
				} else {
					m[sid] = "HTTP"
				}
			case "view_url":
				m[sid] = "打开网页"
			case "broadcast_intent":
				m[sid] = "广播 Intent"
			case "message":
				m[sid] = "消息提醒"
			default:
				m[sid] = typ
			}
		}
	}
	return m
}

func labelForTraceRow(r traceStatRow, byStep map[uint]string) string {
	if r.StepID > 0 {
		if lb, ok := byStep[r.StepID]; ok && lb != "" {
			return lb
		}
	}
	switch strings.TrimSpace(r.StepType) {
	case "http":
		if r.EndpointID > 0 {
			return fmt.Sprintf("HTTP #%d", r.EndpointID)
		}
		return "HTTP"
	case "view_url":
		return "打开网页"
	case "broadcast_intent":
		return "广播 Intent"
	case "message":
		return "消息提醒"
	default:
		if r.StepType != "" {
			return r.StepType
		}
		return fmt.Sprintf("节点 p%d/s%d", r.PhaseID, r.StepID)
	}
}
