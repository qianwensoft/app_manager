package outbound

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"app-manager/models"
)

const maxEventDataSubst = 256 * 1024

// maxHTTPResponseContextBody 注入下游模板用的 HTTP 响应体上限（与 device_event.event_data 截断一致思路）。
const maxHTTPResponseContextBody = maxEventDataSubst

// MergeHTTPResponseContext 将最近一次成功 HTTP 响应写入 vars，供同连接器后续步骤 expandTemplate 使用。
// 占位符：
//   {{http.last.body}}  {{http.last.status}}
//   {{http.step.<步骤表 id>.body}}  {{http.step.<步骤表 id>.status}}（meta.StepID / 步骤主键）
func MergeHTTPResponseContext(vars map[string]string, stepID uint, httpStatus int, body []byte) {
	if vars == nil {
		return
	}
	bodyStr := string(body)
	if len(bodyStr) > maxHTTPResponseContextBody {
		bodyStr = bodyStr[:maxHTTPResponseContextBody] + "...(truncated)"
	}
	statusStr := fmt.Sprintf("%d", httpStatus)
	vars["{{http.last.status}}"] = statusStr
	vars["{{http.last.body}}"] = bodyStr
	if stepID > 0 {
		vars[fmt.Sprintf("{{http.step.%d.status}}", stepID)] = statusStr
		vars[fmt.Sprintf("{{http.step.%d.body}}", stepID)] = bodyStr
	}
}

// TemplateVars 占位符与 expandTemplate 共用。
func TemplateVars(rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition) map[string]string {
	evData := strings.TrimSpace(rec.EventData)
	if len(evData) > maxEventDataSubst {
		evData = evData[:maxEventDataSubst] + "...(truncated)"
	}
	created := rec.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	v := map[string]string{
		"{{device_event.id}}":         fmt.Sprintf("%d", rec.ID),
		"{{device_event.event_type}}": rec.EventType,
		"{{device_event.event_data}}": evData,
		"{{device_event.created_at}}": created.UTC().Format(time.RFC3339Nano),
	}
	if dev != nil {
		v["{{device.id}}"] = fmt.Sprintf("%d", dev.ID)
		v["{{device.name}}"] = strings.TrimSpace(dev.Name)
		v["{{device.serial}}"] = strings.TrimSpace(dev.Serial)
		v["{{device.agent_alias}}"] = strings.TrimSpace(dev.AgentAlias)
		v["{{device.server_alias}}"] = strings.TrimSpace(dev.ServerAlias)
	} else {
		v["{{device.id}}"] = fmt.Sprintf("%d", rec.DeviceID)
	}
	if def != nil {
		v["{{definition.key}}"] = def.Key
		v["{{definition.name}}"] = strings.TrimSpace(def.Name)
	}
	return v
}

func expandTemplate(s string, vars map[string]string) string {
	type kv struct {
		k, v string
	}
	list := make([]kv, 0, len(vars))
	for k, val := range vars {
		list = append(list, kv{k, val})
	}
	sort.Slice(list, func(i, j int) bool {
		if len(list[i].k) != len(list[j].k) {
			return len(list[i].k) > len(list[j].k)
		}
		return list[i].k < list[j].k
	})
	for _, p := range list {
		s = strings.ReplaceAll(s, p.k, p.v)
	}
	return s
}
