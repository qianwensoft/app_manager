package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
)

type interfaceDebugIn struct {
	ConnectorID     uint                   `json:"connector_id"`      // 可选：取默认超时
	InterfaceCode   string                 `json:"interface_code"`    // 仅展示用
	Phases          []json.RawMessage      `json:"phases"`            // 当前表单 phases（未保存也能调试）
	OutputMappings  []interface{}          `json:"output_mappings"`   // 当前表单输出映射（未保存）
	InputParamsJSON string                 `json:"input_params_json"` // 当前表单入参 schema（seed 默认值）
	CustomScript    json.RawMessage        `json:"custom_script"`     // 当前表单连接器全局自定义脚本（含 result）；未保存即可调试
	Params          map[string]interface{} `json:"params"`
	ExecuteLiveHTTP bool                   `json:"execute_live_http"`
}

// PostOutboundInterfaceDebug POST /api/outbound/connectors/interface-debug
// 以接口入参 seed context，端到端执行当前（可未保存）连接器各阶段步骤，
// 返回逐步 context 演变与按 output_mappings 计算的最终输出。
func PostOutboundInterfaceDebug(c *gin.Context) {
	var req interfaceDebugIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	wires, err := outbound.ParsePhasePreviewWires(req.Phases)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "phases 解析失败: " + err.Error()})
		return
	}

	// 构造调试用 connector：有 ID 则加载取默认超时，再用请求体覆盖入参/输出映射（支持未保存改动）。
	var connector models.OutboundConnector
	if req.ConnectorID > 0 {
		_ = database.DB.First(&connector, req.ConnectorID).Error
	}
	connector.InputParamsJSON = req.InputParamsJSON
	if len(req.OutputMappings) > 0 {
		if b, err := json.Marshal(req.OutputMappings); err == nil {
			connector.OutputMappingsJSON = string(b)
		}
	}
	// 连接器全局自定义脚本草稿覆盖（未保存即调试）
	if s := strings.TrimSpace(string(req.CustomScript)); s != "" && s != "null" {
		connector.CustomScriptJSON = s
	}

	res, finalVars, err := outbound.RunInterfaceDebug(database.DB, &connector, wires, req.Params, req.ExecuteLiveHTTP)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 由 {{context.*}} 全量 vars 还原扁平 ctxMap 与 context.* vars，供输出映射使用。
	ctxMap, mappingVars := contextVarsForOutputMapping(finalVars)
	if connectorHasOutputMappings(connector.OutputMappingsJSON) {
		res.Output = applyConnectorOutputMappings(connector.OutputMappingsJSON, ctxMap, mappingVars)
	} else {
		// 未配置输出映射：返回完整 context，但把点路径还原为嵌套对象，并把
		// 形如 [...] / {...} 的字符串值解析回真实数组/对象，便于查看。
		res.Output = expandFlatContextToNested(ctxMap)
	}

	// 全流程结束、输出映射之后：执行连接器全局 result 脚本整体改写返回值。
	if newOut, ran, rerr := outbound.RunConnectorResultScript(connector.CustomScriptJSON, res.Output, contextStringVars(finalVars)); rerr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "返回值脚本: " + rerr.Error()})
		return
	} else if ran {
		res.Output = newOut
		res.Note = "已执行连接器返回值脚本（result）改写最终输出。" + res.Note
	}

	c.JSON(http.StatusOK, gin.H{"data": res})
}

// contextStringVars 提取 {{context.*}} 占位符表（保持完整键，供 result 脚本 ctx.getContext 使用）。
func contextStringVars(finalVars map[string]string) map[string]string {
	out := make(map[string]string)
	for k, v := range finalVars {
		if strings.HasPrefix(k, "{{context.") && strings.HasSuffix(k, "}}") {
			out[k] = v
		}
	}
	return out
}

// connectorHasOutputMappings 判断是否配置了非空的输出映射数组。
func connectorHasOutputMappings(mappingsJSON string) bool {
	if strings.TrimSpace(mappingsJSON) == "" {
		return false
	}
	var mappings []map[string]interface{}
	if err := json.Unmarshal([]byte(mappingsJSON), &mappings); err != nil {
		return false
	}
	return len(mappings) > 0
}

// expandFlatContextToNested 将扁平的 a.b.c -> value 还原为嵌套对象。
// 当某键是其他键的前缀（如同时有 data 与 data.list）时，丢弃该前缀的标量值，
// 以嵌套对象为准；叶子值若为合法 JSON 数组/对象则解析回真实结构。
func expandFlatContextToNested(flat map[string]interface{}) map[string]interface{} {
	// 找出「前缀键」：存在另一键以 key+"." 开头。
	prefixes := make(map[string]bool)
	for k := range flat {
		for k2 := range flat {
			if k != k2 && strings.HasPrefix(k2, k+".") {
				prefixes[k] = true
				break
			}
		}
	}
	root := make(map[string]interface{})
	for k, v := range flat {
		if prefixes[k] {
			continue // 跳过被更深路径覆盖的标量
		}
		setNestedValue(root, k, parseJSONValueLeaf(v))
	}
	return root
}

// parseJSONValueLeaf 将形如 [...] / {...} 的字符串解析回数组/对象；其余保持原样（含数字字符串，避免精度丢失）。
func parseJSONValueLeaf(v interface{}) interface{} {
	s, ok := v.(string)
	if !ok {
		return v
	}
	trimmed := strings.TrimSpace(s)
	if len(trimmed) >= 2 {
		if (trimmed[0] == '[' && trimmed[len(trimmed)-1] == ']') || (trimmed[0] == '{' && trimmed[len(trimmed)-1] == '}') {
			var parsed interface{}
			if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil {
				return parsed
			}
		}
	}
	return s
}

// contextVarsForOutputMapping 将形如 {{context.a.b}} 的占位符表，
// 还原为 applyConnectorOutputMappings 所需的两份 map：
//   - ctxMap[a.b] = value      （source=context，value 为去前缀路径）
//   - vars[context.a.b] = value（source=context 的 fallback 与 source=var 的 {{context.a.b}}）
func contextVarsForOutputMapping(finalVars map[string]string) (map[string]interface{}, map[string]interface{}) {
	ctxMap := make(map[string]interface{})
	mappingVars := make(map[string]interface{})
	for k, v := range finalVars {
		if !strings.HasPrefix(k, "{{context.") || !strings.HasSuffix(k, "}}") {
			continue
		}
		path := strings.TrimSuffix(strings.TrimPrefix(k, "{{context."), "}}")
		if path == "" {
			continue
		}
		ctxMap[path] = v
		mappingVars["context."+path] = v
	}
	return ctxMap, mappingVars
}
