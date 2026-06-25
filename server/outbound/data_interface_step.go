package outbound

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"

	"github.com/dop251/goja"
	"gorm.io/gorm"
)

// DataInterfaceStepConfig 步骤 config_json 中 data_interface 类型的配置。
type DataInterfaceStepConfig struct {
	InterfaceID          uint           `json:"interface_id"`
	ParamMappings        []ParamMapping `json:"param_mappings"`
	PreScript            string         `json:"pre_script"`
	MergeResultToContext bool           `json:"merge_result_to_context"`
}

// ParamMapping 单个参数的取值规则。
// Source: "context" | "fixed" | "var"
type ParamMapping struct {
	Param  string `json:"param"`
	Source string `json:"source"`
	Value  string `json:"value"`
}

// ParseDataInterfaceStepConfig 从 config_json 解析 data_interface 步骤配置。
func ParseDataInterfaceStepConfig(configJSON string) (*DataInterfaceStepConfig, error) {
	s := strings.TrimSpace(configJSON)
	if s == "" || s == "{}" {
		return &DataInterfaceStepConfig{}, nil
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return nil, err
	}
	raw, ok := m["data_interface"]
	if !ok {
		return &DataInterfaceStepConfig{}, nil
	}
	var cfg DataInterfaceStepConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// resolveParamMappings 将 ParamMappings 解析为 param_values map。
// 若参数名含 "." 则通过 nestParamsByPath 展开为嵌套 JSON 对象。
func resolveParamMappings(mappings []ParamMapping, vars map[string]string) map[string]interface{} {
	flat := map[string]interface{}{}
	for _, m := range mappings {
		param := strings.TrimSpace(m.Param)
		if param == "" {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(m.Source)) {
		case "context":
			val := strings.TrimSpace(m.Value)
			var key string
			if strings.HasPrefix(val, "{{") && strings.HasSuffix(val, "}}") {
				// value 已经是完整模板 key，直接用
				key = val
			} else {
				key = "{{context." + val + "}}"
			}
			if v, ok := vars[key]; ok {
				flat[param] = v
			}
		case "var":
			key := strings.TrimSpace(m.Value)
			if v, ok := vars[key]; ok {
				flat[param] = v
			} else {
				flat[param] = expandTemplate(key, vars)
			}
		case "fixed":
			flat[param] = m.Value
		default:
			flat[param] = expandTemplate(m.Value, vars)
		}
	}
	return nestParamsByPath(flat)
}

// nestParamsByPath 将含 "." 的 key 展开为嵌套 map。
// 例：{"order.id": "1", "order.name": "x", "status": "ok"}
// →  {"order": {"id": "1", "name": "x"}, "status": "ok"}
func nestParamsByPath(flat map[string]interface{}) map[string]interface{} {
	out := map[string]interface{}{}
	for k, v := range flat {
		parts := strings.SplitN(k, ".", 2)
		if len(parts) == 1 {
			out[k] = v
			continue
		}
		// nested: recurse
		sub, ok := out[parts[0]].(map[string]interface{})
		if !ok {
			sub = map[string]interface{}{}
		}
		// flatten the remainder recursively
		inner := nestParamsByPath(map[string]interface{}{parts[1]: v})
		for ik, iv := range inner {
			sub[ik] = iv
		}
		out[parts[0]] = sub
	}
	return out
}

// ExecuteDataInterfaceStep 执行 data_interface 类型步骤。
func ExecuteDataInterfaceStep(db *gorm.DB, connector models.OutboundConnector, step models.OutboundConnectorStep,
	rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition, vars map[string]string, meta StepExecutionMeta,
) models.OutboundDelivery {
	d := models.OutboundDelivery{
		DeviceEventID: rec.ID,
		ConnectorID:   connector.ID,
		PhaseID:       meta.PhaseID,
		StepID:        meta.StepID,
		StepType:      "data_interface",
		Status:        "failed",
		Attempts:      1,
	}

	cfg, err := ParseDataInterfaceStepConfig(step.ConfigJSON)
	if err != nil || cfg.InterfaceID == 0 {
		d.Error = "data_interface 配置无效或未指定 interface_id"
		d.DetailJSON = dataIfaceDetail("config", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}

	var iface models.DataInterface
	if err := database.DB.First(&iface, cfg.InterfaceID).Error; err != nil {
		d.Error = fmt.Sprintf("数据接口 %d 不存在", cfg.InterfaceID)
		d.DetailJSON = dataIfaceDetail("load", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}
	if !iface.Enabled {
		d.Error = "数据接口已禁用"
		d.DetailJSON = dataIfaceDetail("disabled", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}

	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		d.Error = "数据集不存在"
		d.DetailJSON = dataIfaceDetail("dataset", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}
	if ds.DataSourceID == nil {
		d.Error = "数据集未绑定数据源"
		d.DetailJSON = dataIfaceDetail("datasource", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}
	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		d.Error = "数据源不存在"
		d.DetailJSON = dataIfaceDetail("datasource", d.Error, nil, nil)
		_ = db.Create(&d).Error
		return d
	}

	paramVals := resolveParamMappings(cfg.ParamMappings, vars)

	if strings.TrimSpace(cfg.PreScript) != "" {
		paramVals = runDataIfacePreScript(cfg.PreScript, vars, paramVals)
	}

	start := time.Now()
	var resultData interface{}
	var execErr error

	dsKind := strings.ToLower(strings.TrimSpace(ds.Kind))
	switch dsKind {
	case "query":
		resultData, execErr = execDataIfaceQuery(&dsSrc, &ds, paramVals)
	case "transaction":
		resultData, execErr = execDataIfaceTransaction(&dsSrc, &ds, &iface, paramVals)
	default:
		execErr = fmt.Errorf("不支持的数据集类型: %s", dsKind)
	}

	elapsed := time.Since(start).Milliseconds()

	if execErr != nil {
		d.Error = execErr.Error()
		d.DetailJSON = dataIfaceDetail("exec", d.Error, paramVals, nil)
		d.DurationMS = elapsed
		_ = db.Create(&d).Error
		return d
	}

	d.Status = "success"
	d.DurationMS = elapsed
	d.DetailJSON = dataIfaceDetail("", "", paramVals, resultData)

	resultJSON, _ := json.Marshal(resultData)
	if cfg.MergeResultToContext && len(resultJSON) > 0 {
		FlattenJSONEventDataIntoContext(vars, string(resultJSON), "context", maxContextFlattenKeys)
	}
	vars["{{data_iface.last.result}}"] = string(resultJSON)
	if meta.StepID > 0 {
		vars[fmt.Sprintf("{{data_iface.step.%d.result}}", meta.StepID)] = string(resultJSON)
	}

	_ = db.Create(&d).Error
	return d
}

func execDataIfaceQuery(dsSrc *models.DataSource, ds *models.Dataset, params map[string]interface{}) (interface{}, error) {
	sqlDB, err := dbdriver.OpenDataSource(dsSrc)
	if err != nil {
		return nil, err
	}
	defer sqlDB.Close()

	sqlStr := strings.TrimSpace(ds.Definition)
	if sqlStr == "" {
		return nil, fmt.Errorf("数据集 SQL 为空")
	}

	used, args, err := rewriteDataIfaceNamedParams(dsSrc.Type, sqlStr, params)
	if err != nil {
		return nil, err
	}

	var rows *sql.Rows
	if len(args) > 0 {
		rows, err = sqlDB.Query(used, args...)
	} else {
		rows, err = sqlDB.Query(used)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	cols, _ := rows.Columns()
	var result []map[string]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		row := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = v
			}
		}
		result = append(result, row)
	}
	return result, rows.Err()
}

func execDataIfaceTransaction(dsSrc *models.DataSource, ds *models.Dataset, iface *models.DataInterface, params map[string]interface{}) (interface{}, error) {
	sqlDB, err := dbdriver.OpenDataSource(dsSrc)
	if err != nil {
		return nil, err
	}
	defer sqlDB.Close()

	effectiveSteps := strings.TrimSpace(iface.StepsJSON)
	if effectiveSteps == "" || effectiveSteps == "[]" {
		effectiveSteps = strings.TrimSpace(ds.StepsJSON)
	}
	if effectiveSteps == "" || effectiveSteps == "[]" {
		return nil, fmt.Errorf("transaction 接口无 steps_json")
	}

	var stepObjs []struct {
		SQL string `json:"sql"`
	}
	var stepSQLs []string
	if err := json.Unmarshal([]byte(effectiveSteps), &stepObjs); err == nil {
		for _, s := range stepObjs {
			if strings.TrimSpace(s.SQL) != "" {
				stepSQLs = append(stepSQLs, s.SQL)
			}
		}
	} else if err := json.Unmarshal([]byte(effectiveSteps), &stepSQLs); err != nil {
		return nil, fmt.Errorf("无效的 steps_json")
	}

	tx, err := sqlDB.Begin()
	if err != nil {
		return nil, err
	}
	var lastInsertID int64
	for _, s := range stepSQLs {
		used, args, err := rewriteDataIfaceNamedParams(dsSrc.Type, s, params)
		if err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		var res sql.Result
		if len(args) > 0 {
			res, err = tx.Exec(used, args...)
		} else {
			res, err = tx.Exec(used)
		}
		if err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		if id, e := res.LastInsertId(); e == nil && id > 0 {
			lastInsertID = id
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	result := map[string]interface{}{"ok": true}
	if lastInsertID > 0 {
		result["last_insert_id"] = lastInsertID
	}
	return result, nil
}

// rewriteDataIfaceNamedParams 将 {{name}} 占位符转方言占位符（委托 dbdriver 统一实现，缺失参数自动剔除子句）。
func rewriteDataIfaceNamedParams(dialect, sqlStr string, params map[string]interface{}) (string, []interface{}, error) {
	return dbdriver.RewriteNamedSQLParams(dialect, sqlStr, params)
}

// runDataIfacePreScript 用 goja 执行前脚本，脚本可通过 ctx.setParam/getParam/getVar 操作参数。
func runDataIfacePreScript(script string, vars map[string]string, params map[string]interface{}) map[string]interface{} {
	vm := goja.New()
	done := make(chan struct{})
	time.AfterFunc(2*time.Second, func() {
		vm.Interrupt("timeout")
		close(done)
	})

	ctx := vm.NewObject()
	_ = ctx.Set("getVar", func(key string) string {
		return vars["{{"+key+"}}"]
	})
	_ = ctx.Set("setParam", func(key string, val goja.Value) {
		params[key] = val.Export()
	})
	_ = ctx.Set("getParam", func(key string) interface{} {
		return params[key]
	})
	_ = vm.Set("ctx", ctx)

	wrapped := "(function(ctx){" + script + "})(ctx);"
	_, _ = vm.RunString(wrapped)

	select {
	case <-done:
	default:
	}
	return params
}

func dataIfaceDetail(stage, errMsg string, params map[string]interface{}, result interface{}) string {
	m := map[string]interface{}{
		"kind":   "data_interface",
		"stage":  stage,
		"params": params,
	}
	if errMsg != "" {
		m["error"] = errMsg
	}
	if result != nil {
		m["result"] = result
	}
	b, _ := json.Marshal(m)
	return string(b)
}
