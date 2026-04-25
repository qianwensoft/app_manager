package mcp

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// JSON-RPC 2.0 types
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

type Response struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id"`
	Result  any       `json:"result,omitempty"`
	Error   *RPCError `json:"error,omitempty"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

const (
	ErrParse        = -32700
	ErrInvalidReq   = -32600
	ErrNotFound     = -32601
	ErrInvalidParams = -32602
	ErrInternal     = -32603
)

type toolFunc func(params json.RawMessage) (any, *RPCError)

var tools map[string]toolFunc

func init() {
	tools = map[string]toolFunc{
		// registry
		"list_components": listComponents,
		// scada
		"list_scada":     listScada,
		"get_canvas":     getCanvas,
		"save_canvas":    saveCanvas,
		"publish_scada":  publishScada,
		"add_element":    addElement,
		"update_element": updateElement,
		"delete_element": deleteElement,
		// ai
		"image_to_canvas": imageToCanvas,
		"text_to_canvas":  textToCanvas,
		"refine_canvas":   refineCanvas,
		// datasource
		"list_datasources":    listDatasources,
		"list_datasets":       listDatasets,
		"query_dataset":       queryDataset,
		"list_data_interfaces": listDataInterfaces,
		"bind_data_to_canvas": bindDataToCanvas,
		"list_sim_points":     listSimPoints,
		"create_sim_point":    createSimPoint,
		// outbound
		"list_outbound_connectors": listOutboundConnectors,
		"list_webhook_event_types": listWebhookEventTypes,
		"get_connector_schema":     getConnectorSchema,
		"trigger_connector":        triggerConnector,
		// deploy
		"list_devices":      listDevices,
		"list_device_groups": listDeviceGroups,
		"list_departments":  listDepartments,
		"deploy_scada":      deployScada,
		"get_deploy_status": getDeployStatus,
		// config
		"get_server_config":    getServerConfig,
		"update_server_config": updateServerConfig,
	}
}

// Handle is the single Gin handler for POST /mcp/v1/
func Handle(c *gin.Context) {
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, Response{
			JSONRPC: "2.0",
			Error:   &RPCError{Code: ErrParse, Message: "parse error: " + err.Error()},
		})
		return
	}

	fn, ok := tools[req.Method]
	if !ok {
		c.JSON(http.StatusOK, Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &RPCError{Code: ErrNotFound, Message: "method not found: " + req.Method},
		})
		return
	}

	result, rpcErr := fn(req.Params)
	c.JSON(http.StatusOK, Response{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result:  result,
		Error:   rpcErr,
	})
}
