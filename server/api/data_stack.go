package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/datastack"
	"app-manager/dbdriver"
	"app-manager/models"
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// --- DataSource ---

func ListDataSources(c *gin.Context) {
	var rows []models.DataSource
	database.DB.Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataSource(c *gin.Context) {
	var body models.DataSource
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		body.Code = suggestUniqueDataStackCode(body.Name, func(s string) bool { return dataSourceCodeExists(s, 0) })
	}
	if err := validateNonEmptyDataStackCode(body.Code, "数据源编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if dataSourceCodeExists(body.Code, 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源编码已存在"})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataSource(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body models.DataSource
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源编码不能为空"})
		return
	}
	if err := validateNonEmptyDataStackCode(body.Code, "数据源编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if dataSourceCodeExists(body.Code, ex.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源编码已存在"})
		return
	}
	if err := database.DB.Model(&models.DataSource{}).Where("id = ?", ex.ID).Updates(map[string]interface{}{
		"code": body.Code, "name": body.Name, "type": body.Type, "dsn": body.DSN, "config_json": body.ConfigJSON, "read_only": body.ReadOnly,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dbdriver.EvictFromPool(ex.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataSource(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	dbdriver.EvictFromPool(ex.ID)
	database.DB.Delete(&models.DataSource{}, ex.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func TestDataSource(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ds := ex
	db, err := openSQLDataSource(ds)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// normalizeSQLDataSourceType maps UI / 常见拼写别名到内部统一类型：sqlite | mysql | postgres | sqlserver
func normalizeSQLDataSourceType(raw string) string {
	return dbdriver.NormalizeType(raw)
}

func openSQLDataSource(ds *models.DataSource) (*sql.DB, error) {
	return dbdriver.OpenDataSource(ds)
}

// ListDataSourceTables 列出数据源中的表名（供数据集选表 / 建表后刷新）
func ListDataSourceTables(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	src := *ex
	db, err := openSQLDataSource(&src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	names, err := dbdriver.ListTables(db, src.Type)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": names})
}

// ListDataSourceTableColumns GET .../sources/:id/tables/:table/columns
func ListDataSourceTableColumns(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	tbl := strings.TrimSpace(c.Param("table"))
	if tbl == "" || !reSQLTableName.MatchString(tbl) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid table"})
		return
	}
	src := *ex
	db, err := openSQLDataSource(&src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	cols, err := dbdriver.ListColumns(db, src.Type, tbl)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": cols})
}

// DataSourceSelectAllSQL 返回 SELECT * FROM 表 LIMIT 2000（标识符按数据源类型转义）
func DataSourceSelectAllSQL(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	src := *ex
	tbl := strings.TrimSpace(c.Query("table"))
	if tbl == "" || !reSQLTableName.MatchString(tbl) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid table"})
		return
	}
	q := quoteSQLTableIdent(src.Type, tbl)
	sqlStr := sqlSelectStarLimited(src.Type, q)
	c.JSON(http.StatusOK, gin.H{"sql": sqlStr})
}

// ExecDataSourceDDL 执行建表/改表 DDL（仅允许 CREATE / ALTER；数据源须非只读）
func ExecDataSourceDDL(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	src := *ex
	var body struct {
		SQL string `json:"sql"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if src.IsReadOnly() {
		c.JSON(http.StatusForbidden, gin.H{"error": "数据源为只读，无法执行 DDL"})
		return
	}
	db, err := openSQLDataSource(&src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	parts := splitDDLStatements(body.SQL)
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty sql"})
		return
	}
	for _, p := range parts {
		up := strings.ToUpper(strings.TrimSpace(p))
		if !strings.HasPrefix(up, "CREATE") && !strings.HasPrefix(up, "ALTER") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "仅允许 CREATE / ALTER 类 DDL"})
			return
		}
		if _, err := db.Exec(p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func splitDDLStatements(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	var out []string
	for _, part := range strings.Split(s, ";") {
		p := strings.TrimSpace(part)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// --- Dataset ---

func ListDatasets(c *gin.Context) {
	var rows []models.Dataset
	database.DB.Preload("DataSource").Preload("Structures").Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func normalizeDatasetKind(k string) string {
	switch strings.ToLower(strings.TrimSpace(k)) {
	case "static", "query", "buffer", "transaction", "event_bound":
		return strings.ToLower(strings.TrimSpace(k))
	default:
		return "query"
	}
}

func datasetKindQueryable(k string) bool {
	switch normalizeDatasetKind(k) {
	case "query", "buffer", "event_bound", "transaction":
		return true
	default:
		return false
	}
}

func validateDatasetForSave(body *models.Dataset) error {
	body.Kind = normalizeDatasetKind(body.Kind)
	if body.DataSourceID != nil && *body.DataSourceID == 0 {
		body.DataSourceID = nil
	}
	switch body.Kind {
	case "static":
		body.DataSourceID = nil
		return datastack.ValidateDatasetMetaForKind(body.Kind, body.MetaJSON, body.DataSourceID)
	case "query", "buffer", "transaction":
		if body.DataSourceID == nil {
			return fmt.Errorf("请选择数据源")
		}
		if err := datastack.ValidateDatasetMetaForKind(body.Kind, body.MetaJSON, body.DataSourceID); err != nil {
			return err
		}
		return nil
	case "event_bound":
		if body.DataSourceID == nil {
			return fmt.Errorf("事件绑定数据集须绑定（可写）数据源")
		}
		return datastack.ValidateEventBoundMeta(body.MetaJSON)
	default:
		return fmt.Errorf("未知的数据集类型: %s", body.Kind)
	}
}

func CreateDataset(c *gin.Context) {
	var body models.Dataset
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Kind == "" {
		body.Kind = "query"
	}
	body.Kind = normalizeDatasetKind(body.Kind)
	if err := validateDatasetForSave(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		body.Code = suggestUniqueDataStackCode(body.Name, func(s string) bool { return datasetCodeExists(s, 0) })
	}
	if err := validateNonEmptyDataStackCode(body.Code, "数据集编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if datasetCodeExists(body.Code, 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据集编码已存在"})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataset(c *gin.Context) {
	ex, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body models.Dataset
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Kind = normalizeDatasetKind(body.Kind)
	if err := validateDatasetForSave(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据集编码不能为空"})
		return
	}
	if err := validateNonEmptyDataStackCode(body.Code, "数据集编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if datasetCodeExists(body.Code, ex.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据集编码已存在"})
		return
	}
	if err := database.DB.Model(&models.Dataset{}).Where("id = ?", ex.ID).Updates(map[string]interface{}{
		"code":           body.Code,
		"data_source_id": body.DataSourceID,
		"category":       body.Category,
		"name":           body.Name,
		"kind":           body.Kind,
		"definition":     body.Definition,
		"steps_json":     body.StepsJSON,
		"param_schema":   body.ParamSchema,
		"meta_json":      body.MetaJSON,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataset(c *gin.Context) {
	ex, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Delete(&models.Dataset{}, ex.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PreviewDataset 管理端预览（body: param_values JSON 对象、limit、offset）
func PreviewDataset(c *gin.Context) {
	var body struct {
		ParamValues json.RawMessage `json:"param_values"`
		Limit       int             `json:"limit"`
		Offset      int             `json:"offset"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Limit <= 0 || body.Limit > 5000 {
		body.Limit = 100
	}
	if body.Offset < 0 {
		body.Offset = 0
	}
	params, perr := parseFlexibleParamValues(body.ParamValues)
	if perr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": perr.Error()})
		return
	}
	ex, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ds := *ex
	ds.Kind = normalizeDatasetKind(ds.Kind)
	switch ds.Kind {
	case "static":
		out, err := staticDatasetRows(ds.Definition, 0)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		total := len(out)
		end := body.Offset + body.Limit
		if body.Offset >= total {
			out = []map[string]interface{}{}
		} else {
			if end > total {
				end = total
			}
			out = out[body.Offset:end]
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{"data": string(b), "total": total})
		return
	case "query", "buffer":
		previewDatasetByIDPaged(c, ds.ID, body.Limit, body.Offset, params)
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持预览「固定数据表」或「SQL 查询」类数据集"})
		return
	}
}

// DebugDataset 管理端调试：返回 data、实际 SQL、耗时等（不写库）。
// body.mode：空则按数据集 kind 执行；query — 仅执行 definition 的 SELECT；transaction — 仅 steps_json 事务演练（回滚）。
// 事务类数据集可在调试时传 mode=query 用首条 SQL（definition）做只读查询，与事务演练区分。
func DebugDataset(c *gin.Context) {
	start := time.Now()
	var body struct {
		ParamValues json.RawMessage `json:"param_values"`
		Limit       int             `json:"limit"`
		Mode        string          `json:"mode"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Limit <= 0 || body.Limit > 5000 {
		body.Limit = 200
	}
	params, perr := parseFlexibleParamValues(body.ParamValues)
	if perr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": perr.Error()})
		return
	}
	ex, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ds := *ex
	ds.Kind = normalizeDatasetKind(ds.Kind)
	debugMode := strings.ToLower(strings.TrimSpace(body.Mode))
	switch ds.Kind {
	case "static":
		if debugMode != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "固定数据表调试不支持 mode 参数"})
			return
		}
		out, err := staticDatasetRows(ds.Definition, body.Limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "static", "data": string(b), "elapsed_ms": ElapsedMS(start),
			"param_schema": ds.ParamSchema,
		})
		return
	case "query", "buffer":
		if debugMode == "transaction" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "查询类数据集不支持事务调试；请勿传 mode=transaction，或改用 kind=transaction 的数据集"})
			return
		}
		if debugMode != "" && debugMode != "query" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 mode（查询数据集请省略 mode 或传 mode=query）"})
			return
		}
		var dsSrc models.DataSource
		if ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
			return
		}
		if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
			return
		}
		db, err := openSQLDataSource(&dsSrc)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer db.Close()
		out, usedSQL, args, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, body.Limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": usedSQL, "elapsed_ms": ElapsedMS(start)})
			return
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": ds.Kind, "data": string(b), "sql": usedSQL, "arg_count": len(args),
			"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
		})
		return
	case "transaction":
		if debugMode == "query" {
			if strings.TrimSpace(ds.Definition) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "查询调试需要非空的 definition（首条 SQL）"})
				return
			}
			var dsSrc models.DataSource
			if ds.DataSourceID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
				return
			}
			if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
				return
			}
			db, err := openSQLDataSource(&dsSrc)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			defer db.Close()
			out, usedSQL, args, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, body.Limit)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": usedSQL, "elapsed_ms": ElapsedMS(start)})
				return
			}
			b, _ := json.Marshal(out)
			c.JSON(http.StatusOK, gin.H{
				"ok": true, "kind": "query", "debug_mode": "query", "data": string(b), "sql": usedSQL, "arg_count": len(args),
				"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
			})
			return
		}
		if debugMode != "" && debugMode != "transaction" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 mode（事务数据集请使用 query 或 transaction）"})
			return
		}
		var dsSrc models.DataSource
		if ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
			return
		}
		if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
			return
		}
		steps, err := parseStepsJSON(ds.StepsJSON)
		if err != nil || len(steps) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid steps_json"})
			return
		}
		db, err := openSQLDataSource(&dsSrc)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer db.Close()
		executed, err := DebugTransactionStepsDryRun(db, dsSrc.Type, steps, params)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "steps_sql": executed, "elapsed_ms": ElapsedMS(start)})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "transaction", "debug_mode": "transaction", "rolled_back": true, "steps_sql": executed,
			"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
		})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "未知数据集类型"})
	}
}

// DebugDataInterface 管理端按接口配置调试执行（事务仅 dry-run 回滚）。
// body.mode 语义与 DebugDataset 一致；kind=transaction 的接口可传 mode=query 仅调试数据集 definition（SELECT）。
func DebugDataInterface(c *gin.Context) {
	start := time.Now()
	var body struct {
		ParamValues json.RawMessage `json:"param_values"`
		Limit       int             `json:"limit"`
		Mode        string          `json:"mode"`
		StepsJSON   string          `json:"steps_json"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Limit <= 0 || body.Limit > 5000 {
		body.Limit = 200
	}
	params, perr := parseFlexibleParamValues(body.ParamValues)
	if perr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": perr.Error()})
		return
	}
	ifaceEx, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "interface not found"})
		return
	}
	iface := *ifaceEx
	if strings.TrimSpace(body.StepsJSON) != "" {
		iface.StepsJSON = strings.TrimSpace(body.StepsJSON)
	}
	applyDataInterfaceParamDefaults(&iface, params)
	fmt.Printf("[DebugDataInterface] iface.ID=%d name=%q kind=%q static_crud_op=%q dataset_id=%d steps_json=%q\n",
		iface.ID, iface.Name, iface.Kind, iface.StaticCrudOp, iface.DatasetID, iface.StepsJSON)
	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset missing"})
		return
	}
	ds.Kind = normalizeDatasetKind(ds.Kind)
	debugMode := strings.ToLower(strings.TrimSpace(body.Mode))
	crudOp := normalizeStaticCrudOp(iface.StaticCrudOp)
	fmt.Printf("[DebugDataInterface] ds.ID=%d ds.Kind=%q ds.StepsJSON=%q debugMode=%q crudOp=%q params=%v\n",
		ds.ID, ds.Kind, ds.StepsJSON, debugMode, crudOp, params)

	switch {
	case crudOp != "":
		if debugMode != "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "静态 CRUD 调试不支持 mode 参数"})
			return
		}
		if crudOp != "list" {
			c.JSON(http.StatusOK, gin.H{
				"ok": true, "kind": "static_crud", "op": crudOp,
				"hint":       "写类静态 CRUD 调试请使用数据集预览或开放 API 测试环境；list 与 query 等价。",
				"elapsed_ms": ElapsedMS(start),
			})
			return
		}
		if normalizeDatasetKind(ds.Kind) != "static" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "static_crud list 须绑定 kind=static 的数据集"})
			return
		}
		out, err := staticDatasetRows(ds.Definition, body.Limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "static_list", "data": string(b), "elapsed_ms": ElapsedMS(start),
			"iface": iface.Name, "slug": iface.Slug,
		})
		return
	case iface.Kind == "query":
		if debugMode == "transaction" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "query 类型接口不支持事务调试；请使用 kind=transaction 的接口或去掉 mode"})
			return
		}
		if debugMode != "" && debugMode != "query" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 mode（query 接口请省略 mode 或传 mode=query）"})
			return
		}
		var dsSrc models.DataSource
		if ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
			return
		}
		if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
			return
		}
		db, err := openSQLDataSource(&dsSrc)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer db.Close()
		out, usedSQL, args, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, body.Limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": usedSQL, "iface": iface.Name, "slug": iface.Slug, "elapsed_ms": ElapsedMS(start)})
			return
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "query", "data": string(b), "sql": usedSQL, "arg_count": len(args),
			"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
			"iface": iface.Name, "slug": iface.Slug,
		})
		return
	case iface.Kind == "queryOne":
		// queryOne: same SQL execution as query but caps at 1 row and returns first row as object (or null).
		if debugMode != "" && debugMode != "query" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "queryOne 接口请省略 mode 或传 mode=query"})
			return
		}
		if ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
			return
		}
		var dsSrcOne models.DataSource
		if err := database.DB.First(&dsSrcOne, *ds.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
			return
		}
		dbOne, err := openSQLDataSource(&dsSrcOne)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer dbOne.Close()
		outMany, usedSQL, args, err := QueryDatasetSQL(dbOne, dsSrcOne.Type, ds.Definition, params, 1)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": usedSQL, "iface": iface.Name, "slug": iface.Slug, "elapsed_ms": ElapsedMS(start)})
			return
		}
		var rowOne interface{}
		if len(outMany) > 0 {
			rowOne = outMany[0]
		}
		bOne, _ := json.Marshal(rowOne)
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "queryOne", "data": string(bOne), "sql": usedSQL, "arg_count": len(args),
			"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
			"iface": iface.Name, "slug": iface.Slug,
		})
		return
	case iface.Kind == "transaction":
		if debugMode == "query" {
			if strings.TrimSpace(ds.Definition) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "查询调试需要非空的 definition（首条 SQL）"})
				return
			}
			if ds.DataSourceID == nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
				return
			}
			var dsSrc models.DataSource
			if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
				return
			}
			db, err := openSQLDataSource(&dsSrc)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			defer db.Close()
			out, usedSQL, args, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, body.Limit)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "sql": usedSQL, "iface": iface.Name, "slug": iface.Slug, "elapsed_ms": ElapsedMS(start)})
				return
			}
			b, _ := json.Marshal(out)
			c.JSON(http.StatusOK, gin.H{
				"ok": true, "kind": "query", "debug_mode": "query", "data": string(b), "sql": usedSQL, "arg_count": len(args),
				"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
				"iface": iface.Name, "slug": iface.Slug,
			})
			return
		}
		if debugMode != "" && debugMode != "transaction" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "无效的 mode（transaction 接口请传 query 或 transaction）"})
			return
		}
		if ds.DataSourceID == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
			return
		}
		var dsSrc models.DataSource
		if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
			return
		}
		effectiveSteps := iface.StepsJSON
		if effectiveSteps == "" {
			effectiveSteps = ds.StepsJSON
		}
		fmt.Printf("[DebugDataInterface/transaction] effectiveSteps=%q iface.StepsJSON=%q ds.StepsJSON=%q\n",
			effectiveSteps, iface.StepsJSON, ds.StepsJSON)
		var steps []string
		if effectiveSteps == "" || effectiveSteps == "[]" {
			fmt.Printf("[DebugDataInterface/transaction] ERROR: no steps_json\n")
			c.JSON(http.StatusBadRequest, gin.H{"error": "transaction interface has no steps_json"})
			return
		}
		steps, err = parseStepsJSON(effectiveSteps)
		if err != nil || len(steps) == 0 {
			fmt.Printf("[DebugDataInterface/transaction] ERROR: parseStepsJSON failed err=%v steps=%v\n", err, steps)
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid steps_json"})
			return
		}
		fmt.Printf("[DebugDataInterface/transaction] steps count=%d steps=%v\n", len(steps), steps)
		db, err := openSQLDataSource(&dsSrc)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer db.Close()
		executed, err := DebugTransactionStepsDryRun(db, dsSrc.Type, steps, params)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "steps_sql": executed, "iface": iface.Name, "elapsed_ms": ElapsedMS(start)})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok": true, "kind": "transaction", "debug_mode": "transaction", "rolled_back": true, "steps_sql": executed,
			"elapsed_ms": ElapsedMS(start), "param_schema": ds.ParamSchema,
			"iface": iface.Name, "slug": iface.Slug,
		})
		return
	default:
		fmt.Printf("[DebugDataInterface] ERROR: unhandled switch — iface.Kind=%q crudOp=%q ds.Kind=%q\n",
			iface.Kind, crudOp, ds.Kind)
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的接口 kind"})
	}
}

// parseStepsJSON 兼容两种格式：["sql1","sql2"] 或 [{"sql":"...","label":"..."}]
func parseStepsJSON(s string) ([]string, error) {
	s = strings.TrimSpace(s)
	if s == "" || s == "[]" {
		return nil, nil
	}
	// 尝试字符串数组
	var strSlice []string
	if err := json.Unmarshal([]byte(s), &strSlice); err == nil {
		return strSlice, nil
	}
	// 尝试对象数组，取 sql 字段
	var objSlice []struct {
		SQL string `json:"sql"`
	}
	if err := json.Unmarshal([]byte(s), &objSlice); err != nil {
		return nil, err
	}
	out := make([]string, 0, len(objSlice))
	for _, o := range objSlice {
		if strings.TrimSpace(o.SQL) != "" {
			out = append(out, o.SQL)
		}
	}
	return out, nil
}

// staticDatasetRows 解析 definition 为 JSON 对象数组，例如 [{"a":1},{"a":2}]
func staticDatasetRows(definition string, limit int) ([]map[string]interface{}, error) {
	s := strings.TrimSpace(definition)
	if s == "" {
		return []map[string]interface{}{}, nil
	}
	var out []map[string]interface{}
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil, fmt.Errorf("固定数据须为 JSON 数组，元素为对象: %w", err)
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// --- DataInterfaceGroup ---

func ListDataInterfaceGroups(c *gin.Context) {
	var rows []models.DataInterfaceGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataInterfaceGroup(c *gin.Context) {
	var body models.DataInterfaceGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Create(&body)
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataInterfaceGroup(c *gin.Context) {
	var body models.DataInterfaceGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&models.DataInterfaceGroup{}).Where("id = ?", c.Param("id")).Updates(map[string]interface{}{
		"name": body.Name, "sort_order": body.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataInterfaceGroup(c *gin.Context) {
	database.DB.Delete(&models.DataInterfaceGroup{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- DataInterface ---

func ListDataInterfaces(c *gin.Context) {
	q := database.DB.Model(&models.DataInterface{})
	if g := c.Query("group_id"); g != "" {
		q = q.Where("group_id = ?", g)
	}
	if cat := c.Query("category"); cat != "" {
		q = q.Where("category = ?", cat)
	}
	var rows []models.DataInterface
	q.Preload("Dataset").Preload("DataStructure").Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataInterface(c *gin.Context) {
	var body models.DataInterface
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	body.Slug = strings.TrimSpace(body.Slug)
	if body.Code == "" {
		body.Code = body.Slug
	}
	if body.Slug == "" {
		body.Slug = body.Code
	}
	if body.Slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "接口编码或 slug 须至少填一项"})
		return
	}
	if err := validateNonEmptyDataStackCode(body.Code, "接口编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !reDataSlugBase.MatchString(body.Slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug 须为字母开头，2–50 位字母数字、下划线、短横线"})
		return
	}
	if dataInterfaceKeysConflictOnSave(body.Code, body.Slug, 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "接口编码或 slug 与已有接口冲突"})
		return
	}
	if body.DataStructureID != nil && *body.DataStructureID != 0 {
		var st models.DataStructure
		if err := database.DB.First(&st, *body.DataStructureID).Error; err != nil || st.DatasetID != body.DatasetID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data_structure_id 须属于所选数据集"})
			return
		}
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataInterface(c *gin.Context) {
	ex, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var body models.DataInterface
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	body.Slug = strings.TrimSpace(body.Slug)
	if body.Code == "" {
		body.Code = body.Slug
	}
	if body.Slug == "" {
		body.Slug = body.Code
	}
	if err := validateNonEmptyDataStackCode(body.Code, "接口编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !reDataSlugBase.MatchString(body.Slug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug 格式无效"})
		return
	}
	if dataInterfaceKeysConflictOnSave(body.Code, body.Slug, ex.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "接口编码或 slug 与已有接口冲突"})
		return
	}
	if body.DataStructureID != nil && *body.DataStructureID != 0 {
		var st models.DataStructure
		if err := database.DB.First(&st, *body.DataStructureID).Error; err != nil || st.DatasetID != body.DatasetID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data_structure_id 须属于所选数据集"})
			return
		}
	}
	if err := database.DB.Model(&models.DataInterface{}).Where("id = ?", ex.ID).Updates(map[string]interface{}{
		"code": body.Code, "group_id": body.GroupID, "category": body.Category, "name": body.Name, "slug": body.Slug,
		"kind": body.Kind, "dataset_id": body.DatasetID, "method": body.Method, "enabled": body.Enabled,
		"required_scopes": body.RequiredScopes, "static_crud_op": body.StaticCrudOp,
		"data_structure_id": body.DataStructureID, "param_defaults_json": body.ParamDefaultsJSON,
		"schema_json": body.SchemaJSON, "steps_json": body.StepsJSON,
		"param_contract_json": body.ParamContractJSON, "field_mapping_json": body.FieldMappingJSON,
		"extra_filters_json": body.ExtraFiltersJSON, "sort_json": body.SortJSON,
		"pagination_json": body.PaginationJSON,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataInterface(c *gin.Context) {
	ex, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Delete(&models.DataInterface{}, ex.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func BatchDeleteDataInterfaces(c *gin.Context) {
	var body struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	database.DB.Delete(&models.DataInterface{}, body.IDs)
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": len(body.IDs)})
}

func openScopeAllows(c *gin.Context, scope string) bool {
	v, _ := c.Get("open_scope_set")
	sm, _ := v.(map[string]struct{})
	return auth.ScopeSetAllows(sm, scope)
}

// OpenDataInterfaceInvoke 开放 API：路径参数为接口编码 code（优先），兼容历史 slug。
func OpenDataInterfaceInvoke(c *gin.Context) {
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	c.Request.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	paramVals := map[string]interface{}{}
	var top map[string]interface{}
	_ = json.Unmarshal(bodyBytes, &top)
	if top != nil {
		if pv, ok := top["param_values"]; ok && pv != nil {
			if m, ok := pv.(map[string]interface{}); ok {
				paramVals = m
			}
		}
	}

	openKey := strings.TrimSpace(c.Param("code"))
	ifacePtr, err := firstEnabledDataInterfaceByOpenKey(openKey)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	iface := *ifacePtr
	applyDataInterfaceParamDefaults(&iface, paramVals)
	crudOp := normalizeStaticCrudOp(iface.StaticCrudOp)
	need := auth.OpenDataInterfaceQuery
	if crudOp != "" {
		if crudOp != "list" {
			need = auth.OpenDataInterfaceWrite
		}
	} else if iface.Kind == "transaction" {
		need = auth.OpenDataInterfaceWrite
	}
	if !openScopeAllows(c, need) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: missing scope " + need})
		return
	}
	if iface.RequiredScopes != "" {
		var required []string
		_ = json.Unmarshal([]byte(iface.RequiredScopes), &required)
		set, _ := c.Get("open_scope_set")
		sm, _ := set.(map[string]struct{})
		if sm != nil {
			for _, s := range required {
				if _, ok := sm[s]; !ok {
					c.JSON(http.StatusForbidden, gin.H{"error": "missing scope " + s})
					return
				}
			}
		}
	}
	if crudOp != "" {
		openStaticCrudInvoke(c, crudOp, iface.DatasetID)
		return
	}
	// 委托至统一执行器；保持开放 API 既有响应格式（query/queryOne 的 data 为 JSON 字符串）。
	res, err := Execute(InvokeRequest{
		Code:        openKey,
		ParamValues: paramVals,
		EnabledOnly: true,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	switch res.Kind {
	case InvokeKindQuery, InvokeKindStaticList:
		rows := res.Rows
		if rows == nil {
			rows = []map[string]interface{}{}
		}
		b, _ := json.Marshal(rows)
		c.JSON(http.StatusOK, gin.H{"data": string(b)})
		return
	case InvokeKindQueryOne:
		var row interface{}
		if res.HasRow {
			row = res.Row
		}
		b, _ := json.Marshal(row)
		c.JSON(http.StatusOK, gin.H{"data": string(b)})
		return
	case InvokeKindTransaction:
		resp := gin.H{"ok": true}
		if res.LastInsertID > 0 {
			resp["last_insert_id"] = res.LastInsertID
			if res.InsertedRow != nil {
				resp["data"] = res.InsertedRow
			}
		}
		c.JSON(http.StatusOK, resp)
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported interface kind"})
		return
	}
}

func previewDatasetByID(c *gin.Context, datasetID uint, limit int, params map[string]interface{}) {
	if params == nil {
		params = map[string]interface{}{}
	}
	var ds models.Dataset
	if err := database.DB.First(&ds, datasetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	ds.Kind = normalizeDatasetKind(ds.Kind)
	if ds.Kind == "static" {
		out, err := staticDatasetRows(ds.Definition, limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		b, _ := json.Marshal(out)
		c.JSON(http.StatusOK, gin.H{"data": string(b)})
		return
	}
	if !datasetKindQueryable(ds.Kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset kind not supported for open query"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	out, _, _, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, limit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	b, _ := json.Marshal(out)
	c.JSON(http.StatusOK, gin.H{"data": string(b)})
}

// queryOneDatasetByID 执行数据集 SQL，只返回第一行（map 对象）或 null。
// 用于 DataInterface.kind == "queryOne" 的开放接口：响应体 data 字段为 JSON 对象而非数组。
func queryOneDatasetByID(c *gin.Context, datasetID uint, params map[string]interface{}) {
	if params == nil {
		params = map[string]interface{}{}
	}
	var ds models.Dataset
	if err := database.DB.First(&ds, datasetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	ds.Kind = normalizeDatasetKind(ds.Kind)
	if ds.Kind == "static" {
		out, err := staticDatasetRows(ds.Definition, 1)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		var row interface{}
		if len(out) > 0 {
			row = out[0]
		}
		b, _ := json.Marshal(row)
		c.JSON(http.StatusOK, gin.H{"data": string(b)})
		return
	}
	if !datasetKindQueryable(ds.Kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset kind not supported for queryOne"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	// Fetch at most 1 row — the SQL itself may not have a LIMIT clause.
	out, _, _, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, 1)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var row interface{}
	if len(out) > 0 {
		row = out[0]
	}
	b, _ := json.Marshal(row)
	c.JSON(http.StatusOK, gin.H{"data": string(b)})
}

func previewDatasetByIDPaged(c *gin.Context, datasetID uint, limit, offset int, params map[string]interface{}) {
	if params == nil {
		params = map[string]interface{}{}
	}
	var ds models.Dataset
	if err := database.DB.First(&ds, datasetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	ds.Kind = normalizeDatasetKind(ds.Kind)
	if !datasetKindQueryable(ds.Kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset kind not supported for preview"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	// fetch limit+offset+1 to detect hasMore; scan with offset skip
	fetchLimit := limit + offset + 1
	out, _, _, err := QueryDatasetSQL(db, dsSrc.Type, ds.Definition, params, fetchLimit)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	total := len(out)
	// apply offset
	if offset >= total {
		out = []map[string]interface{}{}
	} else {
		out = out[offset:]
		if len(out) > limit {
			out = out[:limit]
		}
	}
	b, _ := json.Marshal(out)
	c.JSON(http.StatusOK, gin.H{"data": string(b), "total": total})
}

var (
	reDataSlugBase = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_-]{1,48}$`)
	reSQLTableName = regexp.MustCompile(`^[a-zA-Z0-9_]{1,64}$`)
)

func normalizeStaticCrudOp(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "list", "create", "update", "delete":
		return strings.ToLower(strings.TrimSpace(s))
	default:
		return ""
	}
}

func dataInterfaceSlugExists(slug string) bool {
	return dataInterfaceOpenKeyExists(slug, 0)
}

// mustMarshalString JSON-encodes a string (produces a quoted JSON string literal).
func mustMarshalString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// fetchInsertedRow 从 INSERT SQL 中提取表名，按 lastInsertID 查回插入行。
var reInsertTable = regexp.MustCompile(`(?i)INSERT\s+INTO\s+([` + "`" + `"\[]?\w+[` + "`" + `"\]]?)`)

func fetchInsertedRow(db *sql.DB, dialect string, steps []string, lastID int64) (map[string]interface{}, error) {
	for _, s := range steps {
		m := reInsertTable.FindStringSubmatch(s)
		if m == nil {
			continue
		}
		table := strings.Trim(m[1], "`\"[]")
		q := quoteSQLTableIdent(dialect, table)
		var query string
		switch normalizeSQLDataSourceType(dialect) {
		case "sqlserver":
			query = fmt.Sprintf("SELECT TOP 1 * FROM %s WHERE id = %d", q, lastID)
		default:
			query = fmt.Sprintf("SELECT * FROM %s WHERE id = %d LIMIT 1", q, lastID)
		}
		rows, err := db.Query(query)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out, err := ScanSQLRowsLimited(rows, 1)
		if err != nil || len(out) == 0 {
			return nil, err
		}
		return out[0], nil
	}
	return nil, nil
}

func quoteSQLTableIdent(dsType, name string) string {
	return dbdriver.QuoteTableIdent(dsType, name)
}

// sqlSelectStarLimited 各库兼容的「最多 2000 行」全表查询（用于选表预览 / 生成开放列表 SQL）
func sqlSelectStarLimited(dsType, quotedTable string) string {
	switch normalizeSQLDataSourceType(dsType) {
	case "sqlserver":
		return fmt.Sprintf("SELECT TOP 2000 * FROM %s", quotedTable)
	default:
		return fmt.Sprintf("SELECT * FROM %s LIMIT 2000", quotedTable)
	}
}

func persistStaticDatasetRows(datasetID uint, rows []map[string]interface{}) error {
	b, err := json.Marshal(rows)
	if err != nil {
		return err
	}
	return database.DB.Model(&models.Dataset{}).Where("id = ?", datasetID).Update("definition", string(b)).Error
}

func openStaticCrudInvoke(c *gin.Context, op string, datasetID uint) {
	var ds models.Dataset
	if err := database.DB.First(&ds, datasetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	if normalizeDatasetKind(ds.Kind) != "static" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "static_crud 仅支持 kind=static 的数据集"})
		return
	}
	switch op {
	case "list":
		previewDatasetByID(c, datasetID, 1000, nil)
		return
	case "create":
		var raw map[string]interface{}
		if err := c.ShouldBindJSON(&raw); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		row, ok := extractStaticRowJSON(raw)
		if !ok || len(row) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body 须为 JSON 对象，或 {\"row\":{...}}"})
			return
		}
		rows, err := staticDatasetRows(ds.Definition, 0)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		rows = append(rows, row)
		if err := persistStaticDatasetRows(datasetID, rows); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "index": len(rows) - 1})
		return
	case "update":
		var raw struct {
			Index int                    `json:"index"`
			Row   map[string]interface{} `json:"row"`
		}
		if err := c.ShouldBindJSON(&raw); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if raw.Row == nil || len(raw.Row) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "row 必填"})
			return
		}
		rows, err := staticDatasetRows(ds.Definition, 0)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if raw.Index < 0 || raw.Index >= len(rows) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "index 越界"})
			return
		}
		rows[raw.Index] = raw.Row
		if err := persistStaticDatasetRows(datasetID, rows); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	case "delete":
		var raw struct {
			Index int `json:"index"`
		}
		if err := c.ShouldBindJSON(&raw); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		rows, err := staticDatasetRows(ds.Definition, 0)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if raw.Index < 0 || raw.Index >= len(rows) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "index 越界"})
			return
		}
		rows = append(rows[:raw.Index], rows[raw.Index+1:]...)
		if err := persistStaticDatasetRows(datasetID, rows); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "unknown static op"})
	}
}

func extractStaticRowJSON(m map[string]interface{}) (map[string]interface{}, bool) {
	if m == nil {
		return nil, false
	}
	if inner, ok := m["row"].(map[string]interface{}); ok {
		return inner, true
	}
	out := map[string]interface{}{}
	for k, v := range m {
		if k == "index" || k == "param_values" {
			continue
		}
		out[k] = v
	}
	return out, true
}

// GenerateStaticCrudInterfaces 为静态数据集一键生成 4 个开放接口（list/create/update/delete）
func GenerateStaticCrudInterfaces(c *gin.Context) {
	var body struct {
		BaseSlug string `json:"base_slug"`
		Category string `json:"category"`
		GroupID  *uint  `json:"group_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !reDataSlugBase.MatchString(body.BaseSlug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "base_slug 须为字母开头，2–50 位字母数字、下划线、短横线"})
		return
	}
	dsEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	ds := *dsEx
	if normalizeDatasetKind(ds.Kind) != "static" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 kind=static 的数据集"})
		return
	}
	type spec struct {
		suf  string
		op   string
		name string
	}
	specs := []spec{
		{"list", "list", ds.Name + " · 列表"},
		{"create", "create", ds.Name + " · 新增行"},
		{"update", "update", ds.Name + " · 更新行"},
		{"delete", "delete", ds.Name + " · 删除行"},
	}
	for _, s := range specs {
		slug := body.BaseSlug + "-" + s.suf
		if dataInterfaceSlugExists(slug) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug 已占用: " + slug})
			return
		}
	}
	tx := database.DB.Begin()
	out := make([]models.DataInterface, 0, 4)
	for _, s := range specs {
		slug := body.BaseSlug + "-" + s.suf
		method := "POST"
		if s.op == "list" {
			method = "GET"
		}
		iface := models.DataInterface{
			GroupID:        body.GroupID,
			Category:       body.Category,
			Name:           s.name,
			Code:           slug,
			Slug:           slug,
			Kind:           "query",
			DatasetID:      ds.ID,
			Method:         method,
			Enabled:        true,
			RequiredScopes: "",
			StaticCrudOp:   s.op,
		}
		if err := tx.Create(&iface).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		out = append(out, iface)
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GenerateCrudInterfaces 基于已有 SQL 数据集的数据源，按选定操作批量生成数据集与开放接口。
// ops 可选值：list / get / create / update / delete；只读数据源自动过滤写操作。
// primary_key 默认 "id"，用于 get/update/delete 的 WHERE 条件。
func GenerateCrudInterfaces(c *gin.Context) {
	var body struct {
		BaseSlug   string   `json:"base_slug"`
		Table      string   `json:"table"`
		PrimaryKey string   `json:"primary_key"`
		Ops        []string `json:"ops"`
		Category   string   `json:"category"`
		GroupID    *uint    `json:"group_id"`
		Name       string   `json:"name"`
		SchemaJSON string   `json:"schema_json"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !reDataSlugBase.MatchString(body.BaseSlug) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "base_slug 格式无效"})
		return
	}
	if !reSQLTableName.MatchString(body.Table) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "table 仅允许字母数字下划线，最长 64"})
		return
	}
	pk := strings.TrimSpace(body.PrimaryKey)
	if pk == "" {
		pk = "id"
	}
	if !reSQLTableName.MatchString(pk) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "primary_key 仅允许字母数字下划线，最长 64"})
		return
	}
	if len(body.Ops) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ops 不能为空"})
		return
	}

	parentEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	parent := *parentEx
	if !datasetKindQueryable(parent.Kind) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请基于 kind=query/buffer/transaction 的数据集（已绑定数据源）生成"})
		return
	}
	if parent.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "父数据集未绑定数据源"})
		return
	}
	var src models.DataSource
	if parent.DataSource != nil {
		src = *parent.DataSource
	} else if err := database.DB.First(&src, *parent.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源不存在"})
		return
	}

	// kind=query 数据集只允许只读接口；kind=transaction 允许全部
	queryOnlyDataset := normalizeDatasetKind(parent.Kind) == "query"
	// 只读数据源过滤写操作
	writeOps := map[string]bool{"create": true, "batch_create": true, "update": true, "delete": true}
	var ops []string
	for _, op := range body.Ops {
		if writeOps[op] && (src.IsReadOnly() || queryOnlyDataset) {
			continue
		}
		ops = append(ops, op)
	}
	if len(ops) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源为只读，所选操作均不可用"})
		return
	}

	// 预检 slug 冲突
	for _, op := range ops {
		slug := body.BaseSlug + "-" + op
		if dataInterfaceSlugExists(slug) {
			c.JSON(http.StatusConflict, gin.H{"error": "slug 已占用: " + slug})
			return
		}
	}

	q := quoteSQLTableIdent(src.Type, body.Table)
	dsName := strings.TrimSpace(body.Name)
	if dsName == "" {
		dsName = body.Table
	}

	// 尝试拉列信息，用于自动生成 INSERT/UPDATE SQL；失败时降级为注释模板
	var tableCols []dbdriver.ColumnInfo
	if db, dbErr := openSQLDataSource(&src); dbErr == nil {
		if cols, colErr := dbdriver.ListColumns(db, src.Type, body.Table); colErr == nil {
			tableCols = cols
		}
		db.Close()
	}

	// 过滤掉主键列（INSERT 时通常自增），收集非主键列名
	buildInsertSQL := func() string {
		var cols []string
		for _, c := range tableCols {
			if !c.PrimaryKey {
				cols = append(cols, c.Name)
			}
		}
		if len(cols) == 0 {
			return fmt.Sprintf("INSERT INTO %s (col1, col2) VALUES (:col1, :col2)", q)
		}
		var quoted, params []string
		for _, name := range cols {
			quoted = append(quoted, quoteSQLTableIdent(src.Type, name))
			params = append(params, ":"+name)
		}
		return fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
			q, strings.Join(quoted, ", "), strings.Join(params, ", "))
	}

	buildUpdateSQL := func(pkCol string) string {
		var sets []string
		for _, c := range tableCols {
			if c.PrimaryKey || c.Name == pk {
				continue
			}
			sets = append(sets, fmt.Sprintf("%s = :%s", quoteSQLTableIdent(src.Type, c.Name), c.Name))
		}
		if len(sets) == 0 {
			return fmt.Sprintf("UPDATE %s SET col1 = :col1 WHERE %s = :%s", q, pkCol, pk)
		}
		return fmt.Sprintf("UPDATE %s SET %s WHERE %s = :%s",
			q, strings.Join(sets, ", "), pkCol, pk)
	}

	// op → (dataset kind, sql/steps, http method, interface name suffix)
	type opSpec struct {
		dsKind    string
		sql       string
		stepsJSON string
		method    string
		nameSufx  string
	}
	buildSpec := func(op string) opSpec {
		pkCol := quoteSQLTableIdent(src.Type, pk)
		switch op {
		case "list":
			return opSpec{"query", sqlSelectStarLimited(src.Type, q), "[]", "GET", "列表查询"}
		case "get":
			sql := fmt.Sprintf("SELECT * FROM %s WHERE %s = :%s", q, pkCol, pk)
			return opSpec{"query", sql, "[]", "GET", "单条查询"}
		case "create":
			insertSQL := buildInsertSQL()
			steps := fmt.Sprintf(`[{"sql":%s,"label":"新增"}]`, mustMarshalString(insertSQL))
			return opSpec{"transaction", "", steps, "POST", "新增"}
		case "batch_create":
			insertSQL := buildInsertSQL()
			steps := fmt.Sprintf(`[{"sql":%s,"label":"批量新增"}]`, mustMarshalString(insertSQL))
			return opSpec{"transaction", "", steps, "POST", "批量新增"}
		case "update":
			updateSQL := buildUpdateSQL(pkCol)
			steps := fmt.Sprintf(`[{"sql":%s,"label":"修改"}]`, mustMarshalString(updateSQL))
			return opSpec{"transaction", "", steps, "PUT", "修改"}
		case "delete":
			steps := fmt.Sprintf(`[{"sql":%s,"label":"删除"}]`, mustMarshalString(fmt.Sprintf("DELETE FROM %s WHERE %s = :%s", q, pkCol, pk)))
			return opSpec{"transaction", "", steps, "DELETE", "删除"}
		}
		return opSpec{}
	}

	tx := database.DB.Begin()
	type result struct {
		Op        string               `json:"op"`
		Interface models.DataInterface `json:"interface"`
	}
	var results []result

	for _, op := range ops {
		spec := buildSpec(op)
		stepsJSON := spec.stepsJSON
		if stepsJSON == "" {
			stepsJSON = "[]"
		}
		slug := body.BaseSlug + "-" + op
		iface := models.DataInterface{
			GroupID:        body.GroupID,
			Category:       body.Category,
			Name:           dsName + " · " + spec.nameSufx,
			Code:           slug,
			Slug:           slug,
			Kind:           spec.dsKind,
			DatasetID:      parent.ID,
			Method:         spec.method,
			Enabled:        true,
			RequiredScopes: "",
			StaticCrudOp:   "",
			StepsJSON:      stepsJSON,
			SchemaJSON:     body.SchemaJSON,
		}
		if err := tx.Create(&iface).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		results = append(results, result{Op: op, Interface: iface})
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": results})
}

// GetDatasetEventRows 查询 event_bound 数据集最近入表的行。
// GET /data/datasets/:id/event-rows?limit=50
func GetDatasetEventRows(c *gin.Context) {
	var ds models.Dataset
	if err := database.DB.First(&ds, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	if normalizeDatasetKind(ds.Kind) != "event_bound" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅 event_bound 数据集支持此接口"})
		return
	}
	meta, err := datastack.ParseEventBoundMeta(ds.MetaJSON)
	if err != nil || meta.TableName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "event_bound 元数据未配置或表名为空"})
		return
	}
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()

	limit := 50
	if l := c.Query("limit"); l != "" {
		if n, e := strconv.Atoi(l); e == nil && n > 0 && n <= 500 {
			limit = n
		}
	}

	dsType := normalizeSQLDataSourceType(dsSrc.Type)
	quoted := quoteSQLTableIdent(dsType, meta.TableName)
	var query string
	switch dsType {
	case "sqlserver":
		query = fmt.Sprintf("SELECT TOP %d * FROM %s ORDER BY id DESC", limit, quoted)
	default:
		query = fmt.Sprintf("SELECT * FROM %s ORDER BY id DESC LIMIT %d", quoted, limit)
	}

	rows, err := db.Query(query)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
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
	if result == nil {
		result = []map[string]interface{}{}
	}
	c.JSON(http.StatusOK, gin.H{"data": result, "table": meta.TableName})
}
