package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// traceAggRow 仅用于内存组装（不经 GORM Scan），避免 GORM 将嵌套/自定义类型误判为关联模型。
type traceAggRow struct {
	PhaseID    uint
	StepID     uint
	StepType   string
	EndpointID uint
	Total      int64
	Success    int64
	Failed     int64
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

	var rawRows []map[string]interface{}
	deviceWhere := ""
	args := []interface{}{id}
	if ds := strings.TrimSpace(c.Query("device_id")); ds != "" {
		if du, err := strconv.ParseUint(ds, 10, 32); err == nil && du > 0 {
			deviceWhere = " AND device_event_id IN (SELECT id FROM device_events WHERE device_id = ?)"
			args = append(args, uint(du))
		}
	}
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
WHERE connector_id = ?` + deviceWhere + `
GROUP BY COALESCE(phase_id, 0), COALESCE(step_id, 0), COALESCE(step_type, ''), COALESCE(endpoint_id, 0)
ORDER BY COALESCE(phase_id, 0), COALESCE(step_id, 0)
`
	if err := database.DB.Raw(raw, args...).Scan(&rawRows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	labelByStep := buildStepLabelMap(h)
	out := make([]traceNodeStatOut, 0, len(rawRows))
	for _, m := range rawRows {
		r := traceAggRowFromMap(m)
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
		if tm, ok := lastRunFromTraceMap(m); ok {
			tr.LastRun = &tm
		}
		out = append(out, tr)
	}

	c.JSON(http.StatusOK, gin.H{
		"connector":  h,
		"node_stats": out,
	})
}

// gormRawMapValue GORM 将 Raw().Scan 到 map 的单元格存为 *interface{}（可能多层），需解引用后再做类型断言。
func gormRawMapValue(v interface{}) interface{} {
	for v != nil {
		p, ok := v.(*interface{})
		if !ok || p == nil {
			break
		}
		v = *p
	}
	return v
}

func traceAggRowFromMap(m map[string]interface{}) traceAggRow {
	return traceAggRow{
		PhaseID:    uintFromIface(gormRawMapValue(m["phase_id"])),
		StepID:     uintFromIface(gormRawMapValue(m["step_id"])),
		StepType:   strings.TrimSpace(fmt.Sprint(gormRawMapValue(m["step_type"]))),
		EndpointID: uintFromIface(gormRawMapValue(m["endpoint_id"])),
		Total:      int64FromIface(gormRawMapValue(m["total"])),
		Success:    int64FromIface(gormRawMapValue(m["success"])),
		Failed:     int64FromIface(gormRawMapValue(m["failed"])),
	}
}

func int64FromIface(v interface{}) int64 {
	switch t := v.(type) {
	case int64:
		return t
	case int:
		return int64(t)
	case uint:
		return int64(t)
	case uint64:
		return int64(t)
	case float64:
		return int64(t)
	case []byte:
		var n int64
		_, _ = fmt.Sscan(string(t), &n)
		return n
	default:
		var n int64
		_, _ = fmt.Sscan(strings.TrimSpace(fmt.Sprint(v)), &n)
		return n
	}
}

func lastRunFromTraceMap(m map[string]interface{}) (time.Time, bool) {
	v, ok := m["last_run"]
	if !ok {
		return time.Time{}, false
	}
	v = gormRawMapValue(v)
	if v == nil {
		return time.Time{}, false
	}
	switch t := v.(type) {
	case time.Time:
		if t.IsZero() {
			return time.Time{}, false
		}
		return t, true
	case []byte:
		return parseOutboundLastRun(string(t))
	case string:
		return parseOutboundLastRun(t)
	default:
		return parseOutboundLastRun(strings.TrimSpace(fmt.Sprint(v)))
	}
}

// parseOutboundLastRun 兼容 SQLite / MySQL 驱动对聚合时间戳的不同返回格式。
func parseOutboundLastRun(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	// SQLite / GORM 常见： "2006-01-02 15:04:05.999999+08:00"（空格），与 RFC3339 的 T 不兼容
	if len(s) >= 19 && s[4] == '-' && s[7] == '-' && s[10] == ' ' && s[13] == ':' {
		s = s[:10] + "T" + s[11:]
		if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
			return t, true
		}
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t, true
		}
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999 -07:00 MST", // SQLite / 驱动常见：带时区缩写
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
			case "keyboard_hid":
				m[sid] = "键盘输入"
			case "print":
				m[sid] = "打印"
			case "app_script":
				cfg, _ := st["config"].(map[string]interface{})
				var appID uint
				if cfg != nil {
					appID = uintFromIface(cfg["app_id"])
				}
				hook := ""
				if cfg != nil {
					hook = strings.TrimSpace(fmt.Sprint(cfg["hook"]))
				}
				if hook == "" {
					hook = "before_request"
				}
				if appID > 0 {
					m[sid] = fmt.Sprintf("应用脚本 · #%d · %s", appID, hook)
				} else {
					m[sid] = "应用脚本"
				}
			default:
				m[sid] = typ
			}
		}
	}
	return m
}

func labelForTraceRow(r traceAggRow, byStep map[uint]string) string {
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
	case "keyboard_hid":
		return "键盘输入"
	case "print":
		return "打印"
	case "app_script":
		return "应用脚本"
	default:
		if r.StepType != "" {
			return r.StepType
		}
		return fmt.Sprintf("节点 p%d/s%d", r.PhaseID, r.StepID)
	}
}
