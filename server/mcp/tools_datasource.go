package mcp

import (
	"encoding/json"
	"fmt"

	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"
)

// ── list_datasources ──────────────────────────────────────────────────────────

func listDatasources(_ json.RawMessage) (any, *RPCError) {
	var rows []models.DataSource
	database.DB.Order("id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── list_datasets ─────────────────────────────────────────────────────────────

type listDatasetsParams struct {
	DataSourceID *uint `json:"datasource_id"`
}

func listDatasets(raw json.RawMessage) (any, *RPCError) {
	var p listDatasetsParams
	json.Unmarshal(raw, &p)
	var rows []models.Dataset
	q := database.DB.Select("id,code,name,kind,category,data_source_id,updated_at")
	if p.DataSourceID != nil {
		q = q.Where("data_source_id = ?", *p.DataSourceID)
	}
	q.Order("id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── query_dataset ─────────────────────────────────────────────────────────────

type queryDatasetParams struct {
	DatasetID uint           `json:"dataset_id"`
	Params    map[string]any `json:"params"`
	Limit     int            `json:"limit"`
}

func queryDataset(raw json.RawMessage) (any, *RPCError) {
	var p queryDatasetParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.Limit == 0 {
		p.Limit = 100
	}

	var ds models.Dataset
	if err := database.DB.Preload("DataSource").First(&ds, p.DatasetID).Error; err != nil {
		return nil, &RPCError{Code: ErrNotFound, Message: "dataset not found"}
	}
	if ds.Kind != "query" && ds.Kind != "static" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: fmt.Sprintf("dataset kind '%s' is not queryable via MCP", ds.Kind)}
	}
	if ds.Kind == "static" {
		var data any
		json.Unmarshal([]byte(ds.Definition), &data)
		return map[string]any{"rows": data, "kind": "static"}, nil
	}

	// query kind — open a connection to the datasource and run the SQL
	if ds.DataSource == nil {
		return nil, &RPCError{Code: ErrInternal, Message: "dataset has no datasource"}
	}
	rows, err := execDatasetQuery(ds, p.Params, p.Limit)
	if err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	return map[string]any{"rows": rows, "kind": "query"}, nil
}

// execDatasetQuery runs the dataset SQL against its datasource.
func execDatasetQuery(ds models.Dataset, params map[string]any, limit int) ([]map[string]any, error) {
	if ds.DataSource == nil {
		return nil, fmt.Errorf("no datasource")
	}
	// reuse the app's own DB for sqlite/same-db datasets; for external DSNs open a temp connection
	sqlStr := ds.Definition
	if sqlStr == "" {
		return nil, fmt.Errorf("empty dataset definition")
	}
	// {{name}} → 方言占位符（缺失参数所在子句自动剔除），与数据接口执行保持一致
	used, args, err := dbdriver.RewriteNamedSQLParams(ds.DataSource.Type, sqlStr, params)
	if err != nil {
		return nil, err
	}
	sqlStr = used
	if limit > 0 {
		sqlStr = fmt.Sprintf("SELECT * FROM (%s) _q LIMIT %d", sqlStr, limit)
	}
	rows, err := database.DB.Raw(sqlStr, args...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var result []map[string]any
	for rows.Next() {
		vals := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		row := map[string]any{}
		for i, c := range cols {
			row[c] = vals[i]
		}
		result = append(result, row)
	}
	return result, nil
}

// ── list_data_interfaces ──────────────────────────────────────────────────────

func listDataInterfaces(_ json.RawMessage) (any, *RPCError) {
	var rows []models.DataInterface
	database.DB.Select("id,code,name,kind,method,enabled,updated_at").Order("id ASC").Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── bind_data_to_canvas ───────────────────────────────────────────────────────

type bindingSpec struct {
	ElementID   string `json:"element_id"`
	PointKey    string `json:"point_key"`
	DeviceCode  string `json:"device_code"`
	DataMode    string `json:"data_mode"` // "stomp" | "http"
	Transform   string `json:"transform"`
}

type bindDataParams struct {
	ScadaID  uint          `json:"scada_id"`
	CanvasID int           `json:"canvas_id"`
	Bindings []bindingSpec `json:"bindings"`
}

func bindDataToCanvas(raw json.RawMessage) (any, *RPCError) {
	var p bindDataParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	bindMap := map[string]bindingSpec{}
	for _, b := range p.Bindings {
		bindMap[b.ElementID] = b
	}
	return patchCanvasElements(p.ScadaID, p.CanvasID, func(elements []any) ([]any, error) {
		for i, raw := range elements {
			el, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			id := fmt.Sprint(el["id"])
			if b, found := bindMap[id]; found {
				dataMode := b.DataMode
				if dataMode == "" {
					dataMode = "stomp"
				}
				binding := map[string]any{
					"pointKey":   b.PointKey,
					"deviceCode": b.DeviceCode,
					"dataMode":   dataMode,
				}
				if b.Transform != "" {
					binding["transform"] = b.Transform
				}
				el["pointBinding"] = binding
				elements[i] = el
			}
		}
		return elements, nil
	})
}

// ── list_sim_points ───────────────────────────────────────────────────────────

type listSimPointsParams struct {
	ScadaCode string `json:"scada_code"`
}

func listSimPoints(raw json.RawMessage) (any, *RPCError) {
	var p listSimPointsParams
	json.Unmarshal(raw, &p)
	var rows []models.ScadaSimPoint
	q := database.DB.Order("id ASC")
	if p.ScadaCode != "" {
		q = q.Where("scada_code = ?", p.ScadaCode)
	}
	q.Find(&rows)
	return map[string]any{"items": rows}, nil
}

// ── create_sim_point ──────────────────────────────────────────────────────────

type createSimPointParams struct {
	ScadaCode  string `json:"scada_code"`
	LinkName   string `json:"link_name"`
	Mode       string `json:"mode"`        // random | random_walk | sine | ramp | constant
	IntervalMs int    `json:"interval_ms"`
	ParamsJSON string `json:"params_json"`
}

func createSimPoint(raw json.RawMessage) (any, *RPCError) {
	var p createSimPointParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, &RPCError{Code: ErrInvalidParams, Message: err.Error()}
	}
	if p.ScadaCode == "" || p.LinkName == "" {
		return nil, &RPCError{Code: ErrInvalidParams, Message: "scada_code and link_name are required"}
	}
	if p.Mode == "" {
		p.Mode = "random"
	}
	if p.IntervalMs == 0 {
		p.IntervalMs = 1000
	}
	row := models.ScadaSimPoint{
		ScadaCode:  p.ScadaCode,
		LinkName:   p.LinkName,
		Mode:       p.Mode,
		IntervalMs: p.IntervalMs,
		ParamsJSON: p.ParamsJSON,
		Enabled:    true,
	}
	if err := database.DB.Create(&row).Error; err != nil {
		return nil, &RPCError{Code: ErrInternal, Message: err.Error()}
	}
	return map[string]any{"ok": true, "id": row.ID}, nil
}
