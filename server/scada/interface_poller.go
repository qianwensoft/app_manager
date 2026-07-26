package scada

import (
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/models"
	"app-manager/outbound"
	"app-manager/stomp"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type interfacePollBinding struct {
	ID         string                 `json:"id"`
	SourceType string                 `json:"source_type"`
	Code       string                 `json:"code"`
	EndpointID uint                   `json:"endpoint_id"`
	Params     map[string]interface{} `json:"params"`
	Interval   int                    `json:"interval_ms"`
}

type interfacePollCanvas struct {
	Canvases map[string]struct {
		Elements []struct {
			ID           string `json:"id"`
			PointBinding struct {
				Mode            string                 `json:"mode"`
				IfaceSourceType string                 `json:"ifaceSourceType"`
				IfaceCode       string                 `json:"ifaceCode"`
				IfaceID         uint                   `json:"ifaceId"`
				IfaceTransport  string                 `json:"ifaceTransport"`
				IfaceRefreshMs  int                    `json:"ifaceRefreshMs"`
				IfaceParams     map[string]interface{} `json:"ifaceParamValues"`
			} `json:"pointBinding"`
		} `json:"elements"`
	} `json:"canvases"`
}

var interfacePollers = struct {
	sync.Mutex
	cancel map[string]func()
}{cancel: map[string]func(){}}

// ReloadInterfacePollers derives server-owned STOMP sources from persisted SCADA bindings.
// Only bindings explicitly marked stomp are registered, so session-specific parameter sources
// remain browser-local and cannot leak into a shared topic.
func ReloadInterfacePollers() {
	if database.DB == nil {
		return
	}
	var scadas []models.ScadaInfo
	if err := database.DB.Where("publish_status = ?", 1).Find(&scadas).Error; err != nil {
		return
	}

	interfacePollers.Lock()
	for _, cancel := range interfacePollers.cancel {
		cancel()
	}
	interfacePollers.cancel = map[string]func(){}
	interfacePollers.Unlock()

	for _, scadaInfo := range scadas {
		for _, binding := range extractInterfacePollBindings(scadaInfo.CanvasData) {
			key := scadaInfo.ScadaCode + ":" + binding.ID
			stop := make(chan struct{})
			interfacePollers.Lock()
			interfacePollers.cancel[key] = func() { close(stop) }
			interfacePollers.Unlock()
			go runInterfacePoller(scadaInfo.ScadaCode, binding, stop)
		}
	}
}

func extractInterfacePollBindings(canvasData string) []interfacePollBinding {
	var project interfacePollCanvas
	if json.Unmarshal([]byte(canvasData), &project) != nil {
		return nil
	}
	var bindings []interfacePollBinding
	for _, canvas := range project.Canvases {
		for _, element := range canvas.Elements {
			pb := element.PointBinding
			if pb.Mode != "interface" || pb.IfaceTransport != "stomp" {
				continue
			}
			// 数据源类型缺省为平台数据接口（向后兼容旧组态）。
			sourceType := pb.IfaceSourceType
			if sourceType == "" {
				sourceType = "data_iface"
			}
			switch sourceType {
			case "data_iface":
				if pb.IfaceCode == "" {
					continue
				}
				bindings = append(bindings, interfacePollBinding{
					ID: element.ID, SourceType: sourceType, Code: pb.IfaceCode,
					Params: pb.IfaceParams, Interval: pb.IfaceRefreshMs,
				})
			case "open_api":
				// 外部应用开放接口仅持有出站 endpoint id（无 ifaceCode）。
				if pb.IfaceID == 0 {
					continue
				}
				bindings = append(bindings, interfacePollBinding{
					ID: element.ID, SourceType: sourceType, EndpointID: pb.IfaceID,
					Params: pb.IfaceParams, Interval: pb.IfaceRefreshMs,
				})
			default:
				// webhook 等类型暂不支持服务端周期调用。
				continue
			}
		}
	}
	return bindings
}

func runInterfacePoller(scadaCode string, binding interfacePollBinding, stop <-chan struct{}) {
	interval := binding.Interval
	if interval < 1000 {
		interval = 5000
	}
	ticker := time.NewTicker(time.Duration(interval) * time.Millisecond)
	defer ticker.Stop()
	publishInterfaceBinding(scadaCode, binding)
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			publishInterfaceBinding(scadaCode, binding)
		}
	}
}

func publishInterfaceBinding(scadaCode string, binding interfacePollBinding) {
	var rows []map[string]interface{}
	var err error
	switch binding.SourceType {
	case "open_api":
		rows, err = invokeOutboundEndpoint(binding.EndpointID, binding.Params)
	default:
		rows, err = datastack.InvokeDataInterfaceByCode(binding.Code, binding.Params)
	}

	info := map[string]interface{}{
		"binding_id": binding.ID,
		"code":       binding.Code,
		"updated_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if err != nil {
		info["error"] = err.Error()
	} else {
		info["rows"] = rows
		info["error"] = ""
	}
	payload, err := json.Marshal(map[string]interface{}{
		"__scada_interface": info,
	})
	if err != nil {
		return
	}
	stomp.DefaultHub.PublishJSON("/topic/scada/point-data/"+scadaCode, string(payload))
}

// invokeOutboundEndpoint 执行一次外部应用开放接口调用，并将响应体归一化为行列表，
// 与 datastack.InvokeDataInterfaceByCode 的返回形态保持一致，供前端 STOMP 订阅统一处理。
func invokeOutboundEndpoint(endpointID uint, params map[string]interface{}) ([]map[string]interface{}, error) {
	if endpointID == 0 {
		return nil, fmt.Errorf("open_api: endpoint id is empty")
	}

	var endpoint models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&endpoint, endpointID).Error; err != nil {
		return nil, fmt.Errorf("open_api: endpoint %d not found", endpointID)
	}
	if !endpoint.Enabled {
		return nil, fmt.Errorf("open_api: endpoint %d is disabled", endpointID)
	}
	if endpoint.App == nil || !endpoint.App.Enabled {
		return nil, fmt.Errorf("open_api: app disabled or not found for endpoint %d", endpointID)
	}

	// 参数转为模板变量（{{key}}），与 CallOutboundEndpoint 保持一致。
	sampleVars := make(map[string]string, len(params))
	for k, v := range params {
		switch s := v.(type) {
		case string:
			sampleVars["{{"+k+"}}"] = s
		default:
			if b, jerr := json.Marshal(v); jerr == nil {
				sampleVars["{{"+k+"}}"] = string(b)
			}
		}
	}

	tr, _, _, _, _, err := outbound.DebugHTTPEndpoint(database.DB, endpoint.App, endpoint, sampleVars, endpoint.TimeoutMS, nil)
	if err != nil {
		return nil, err
	}
	if tr == nil {
		return nil, fmt.Errorf("open_api: empty response")
	}
	httpStatus := tr.Response.Status
	if httpStatus < 200 || httpStatus >= 300 {
		return nil, fmt.Errorf("open_api: upstream status %d", httpStatus)
	}

	body := tr.Response.Body
	if body == "" {
		return []map[string]interface{}{}, nil
	}
	return normalizeOutboundRows(body), nil
}

// normalizeOutboundRows 将出站响应体解析为行列表：对象→单行；数组→多行；其它→包裹为 {value:...}。
func normalizeOutboundRows(body string) []map[string]interface{} {
	var parsed interface{}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return []map[string]interface{}{{"value": body}}
	}
	switch v := parsed.(type) {
	case map[string]interface{}:
		return []map[string]interface{}{v}
	case []interface{}:
		rows := make([]map[string]interface{}, 0, len(v))
		for _, item := range v {
			if m, ok := item.(map[string]interface{}); ok {
				rows = append(rows, m)
			} else {
				rows = append(rows, map[string]interface{}{"value": item})
			}
		}
		return rows
	default:
		return []map[string]interface{}{{"value": v}}
	}
}
