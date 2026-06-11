package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/datastack"
	"app-manager/dbdriver"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// InvokeRequest 规范化的数据接口调用请求，统一 4 条历史执行路径。
type InvokeRequest struct {
	Code           string                 // 开放 key（code 或 slug），或 id 字符串（配合 EnabledOnly=false 走 route-key 查找）
	ParamValues    map[string]interface{} // 原始请求参数（默认值合并之前）
	DynamicFilters []runtimeQueryFilter   // 运行时动态过滤（表单），在声明式过滤之后应用
	LimitOverride  int                    // <=0 表示使用整形默认或 kind 默认
	Offset         int
	EnabledOnly    bool   // open/form/poll=true（仅启用，按 open key 查找）；SCADA/debug=false（按 route key 查找，含未启用）
	DryRun         bool   // 事务：执行后回滚（管理端调试）
	StepsOverride  string // 事务：覆盖 steps_json（管理端调试）
}

// InvokeResultKind 标识结果形态，供各适配器决定响应封装。
type InvokeResultKind string

const (
	InvokeKindQuery       InvokeResultKind = "query"
	InvokeKindQueryOne    InvokeResultKind = "queryOne"
	InvokeKindTransaction InvokeResultKind = "transaction"
	InvokeKindStaticList  InvokeResultKind = "static_list"
	InvokeKindStaticCrud  InvokeResultKind = "static_crud" // 非 list 静态写：由 gin 适配器委托 openStaticCrudInvoke
)

// InvokeResult 规范化结果。
type InvokeResult struct {
	Kind         InvokeResultKind
	Rows         []map[string]interface{} // query / static_list（非 nil）
	Row          map[string]interface{}   // queryOne（nil 表示无行）
	HasRow       bool                     // queryOne 是否命中
	LastInsertID int64
	InsertedRow  map[string]interface{} // transaction 尽力回查
	RolledBack   bool
	UsedSQL      string
	StepsSQL     []string
	ElapsedMS    int64
	TotalCount   *int64
	ArgCount     int
	CrudOp       string // 非空且非 list 时 Kind=static_crud
	DatasetID    uint
	IfaceName    string
	IfaceSlug    string
	IfaceKind    string
}

// Execute 统一数据接口执行入口。所有调用方（开放 API / 表单运行时 / SCADA / 出站轮询）委托至此。
// gin-free，便于单测；仅在需要 gin 的静态写场景返回 InvokeKindStaticCrud 让上层委托。
func Execute(req InvokeRequest) (*InvokeResult, error) {
	start := time.Now()
	params := req.ParamValues
	if params == nil {
		params = map[string]interface{}{}
	}

	// 1) 解析接口
	var ifacePtr *models.DataInterface
	var err error
	if req.EnabledOnly {
		ifacePtr, err = firstEnabledDataInterfaceByOpenKey(req.Code)
	} else {
		ifacePtr, err = firstDataInterfaceByRouteKey(req.Code)
	}
	if err != nil {
		return nil, fmt.Errorf("interface not found")
	}
	iface := *ifacePtr
	if strings.TrimSpace(req.StepsOverride) != "" {
		iface.StepsJSON = strings.TrimSpace(req.StepsOverride)
	}

	// 2) 整形配置
	sh, err := datastack.ParseIfaceShaping(&iface)
	if err != nil {
		return nil, err
	}

	// 3) 参数契约校验（默认值合并之前）
	if err := datastack.ValidateParams(sh.Params, params); err != nil {
		return nil, err
	}
	// 4) 默认值合并（数据结构默认 + 接口 param_defaults，请求优先），再补契约级默认（最低优先级）
	applyDataInterfaceParamDefaults(&iface, params)
	datastack.ApplyParamDefaultsFromContract(sh.Params, params)

	res := &InvokeResult{
		DatasetID: iface.DatasetID,
		IfaceName: iface.Name,
		IfaceSlug: iface.Slug,
		IfaceKind: iface.Kind,
	}

	// 5) 静态 CRUD 分支
	crudOp := normalizeStaticCrudOp(iface.StaticCrudOp)
	res.CrudOp = crudOp
	if crudOp != "" {
		if crudOp != "list" {
			res.Kind = InvokeKindStaticCrud
			res.ElapsedMS = ElapsedMS(start)
			return res, nil
		}
		// list 等价于 query：读取静态数据集行
		var ds models.Dataset
		if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
			return nil, fmt.Errorf("接口 %q 绑定的数据集(id=%d)不存在，可能已被删除", iface.Code, iface.DatasetID)
		}
		if normalizeDatasetKind(ds.Kind) != "static" {
			return nil, fmt.Errorf("static_crud list 须绑定 kind=static 的数据集")
		}
		rows, err := staticDatasetRows(ds.Definition, resolveStaticLimit(sh, req.LimitOverride))
		if err != nil {
			return nil, err
		}
		res.Kind = InvokeKindStaticList
		res.Rows = datastack.ApplyProjection(rows, sh.Projection)
		res.ElapsedMS = ElapsedMS(start)
		return res, nil
	}

	// 6) 加载数据集
	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		return nil, fmt.Errorf("接口 %q 绑定的数据集(id=%d)不存在，可能已被删除", iface.Code, iface.DatasetID)
	}
	ds.Kind = normalizeDatasetKind(ds.Kind)

	switch iface.Kind {
	case "query", "queryOne":
		return executeQueryKind(res, &iface, &ds, sh, params, req, start)
	case "transaction":
		return executeTransactionKind(res, &iface, &ds, params, req, start)
	default:
		return nil, fmt.Errorf("unsupported interface kind: %s", iface.Kind)
	}
}

func resolveStaticLimit(sh datastack.IfaceShaping, requestLimit int) int {
	limit, _ := datastack.ResolveLimit(sh, requestLimit, 0, 200)
	if limit <= 0 {
		limit = 200
	}
	return limit
}

func executeQueryKind(res *InvokeResult, iface *models.DataInterface, ds *models.Dataset, sh datastack.IfaceShaping, params map[string]interface{}, req InvokeRequest, start time.Time) (*InvokeResult, error) {
	isOne := iface.Kind == "queryOne"

	// 静态数据集查询
	if ds.Kind == "static" {
		limit := 1
		if !isOne {
			limit = resolveStaticLimit(sh, req.LimitOverride)
		}
		rows, err := staticDatasetRows(ds.Definition, limit)
		if err != nil {
			return nil, err
		}
		if isOne {
			res.Kind = InvokeKindQueryOne
			if len(rows) > 0 {
				res.Row = datastack.ApplyProjectionOne(rows[0], sh.Projection)
				res.HasRow = true
			}
		} else {
			res.Kind = InvokeKindQuery
			res.Rows = datastack.ApplyProjection(rows, sh.Projection)
		}
		res.ElapsedMS = ElapsedMS(start)
		return res, nil
	}

	if !datasetKindQueryable(ds.Kind) {
		return nil, fmt.Errorf("dataset kind not supported for query")
	}
	if ds.DataSourceID == nil {
		return nil, fmt.Errorf("dataset missing data source")
	}
	var src models.DataSource
	if err := database.DB.First(&src, *ds.DataSourceID).Error; err != nil {
		return nil, fmt.Errorf("data source missing")
	}
	db, err := openSQLDataSource(&src)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// limit 解析：queryOne 固定 1；query 走整形/请求/默认
	kindDefault := 1000
	if req.LimitOverride <= 0 && !req.EnabledOnly {
		kindDefault = 500 // SCADA/debug 历史默认值偏小，但 LimitOverride 通常会给出
	}
	limit, offset := datastack.ResolveLimit(sh, req.LimitOverride, req.Offset, kindDefault)
	if isOne {
		limit = 1
		offset = 0
	}

	// 声明式整形 → 动态过滤（表单）
	shaped := datastack.BuildShapedSQL(src.Type, ds.Definition, sh, params, limit, offset)
	shaped = applyDynamicFiltersToSQL(src.Type, shaped, req.DynamicFilters, params)

	out, usedSQL, args, err := QueryDatasetSQL(db, src.Type, shaped, params, limit)
	if err != nil {
		return nil, err
	}
	res.UsedSQL = usedSQL
	res.ArgCount = len(args)

	// 总数（分页）
	if !isOne && sh.Pagination.Enabled && sh.Pagination.EmitTotalCount {
		if cnt, ok := queryTotalCount(db, src.Type, ds.Definition, sh, params); ok {
			res.TotalCount = &cnt
		}
	}

	if isOne {
		res.Kind = InvokeKindQueryOne
		if len(out) > 0 {
			res.Row = datastack.ApplyProjectionOne(out[0], sh.Projection)
			res.HasRow = true
		}
	} else {
		res.Kind = InvokeKindQuery
		res.Rows = datastack.ApplyProjection(out, sh.Projection)
	}
	res.ElapsedMS = ElapsedMS(start)
	return res, nil
}

func queryTotalCount(db *sql.DB, dsType, baseSQL string, sh datastack.IfaceShaping, params map[string]interface{}) (int64, bool) {
	countSQL := datastack.BuildCountSQL(dsType, baseSQL, sh, params)
	if countSQL == "" {
		return 0, false
	}
	rows, _, _, err := QueryDatasetSQL(db, dsType, countSQL, params, 1)
	if err != nil || len(rows) == 0 {
		return 0, false
	}
	for _, v := range rows[0] {
		switch t := v.(type) {
		case int64:
			return t, true
		case int:
			return int64(t), true
		case float64:
			return int64(t), true
		case []byte:
			var n int64
			if _, e := fmt.Sscan(string(t), &n); e == nil {
				return n, true
			}
		}
	}
	return 0, false
}

func executeTransactionKind(res *InvokeResult, iface *models.DataInterface, ds *models.Dataset, params map[string]interface{}, req InvokeRequest, start time.Time) (*InvokeResult, error) {
	if ds.Kind != "transaction" {
		return nil, fmt.Errorf("dataset not transaction")
	}
	if ds.DataSourceID == nil {
		return nil, fmt.Errorf("no data source")
	}
	var dsSrc models.DataSource
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		return nil, fmt.Errorf("data source missing")
	}
	if dsSrc.IsReadOnly() {
		return nil, fmt.Errorf("read-only data source")
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	steps, err := resolveTransactionSteps(iface, ds, &dsSrc, db, params)
	if err != nil {
		return nil, err
	}
	res.StepsSQL = steps

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	var lastInsertID int64
	for _, s := range steps {
		s = stripMissingInsertParams(s, params)
		used, args, err := RewriteNamedSQLParams(dsSrc.Type, s, params)
		if err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		var r sql.Result
		if len(args) > 0 {
			r, err = tx.Exec(used, args...)
		} else {
			r, err = tx.Exec(used)
		}
		if err != nil {
			_ = tx.Rollback()
			return nil, err
		}
		if id, e := r.LastInsertId(); e == nil && id > 0 {
			lastInsertID = id
		}
	}

	if req.DryRun {
		_ = tx.Rollback()
		res.RolledBack = true
		res.Kind = InvokeKindTransaction
		res.LastInsertID = lastInsertID
		res.ElapsedMS = ElapsedMS(start)
		return res, nil
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	res.Kind = InvokeKindTransaction
	res.LastInsertID = lastInsertID
	if lastInsertID > 0 {
		if row, fetchErr := fetchInsertedRow(db, dsSrc.Type, steps, lastInsertID); fetchErr == nil && row != nil {
			res.InsertedRow = row
		}
	}
	res.ElapsedMS = ElapsedMS(start)
	return res, nil
}

// resolveTransactionSteps 解析事务步骤；空 steps + 现有表绑定时按列动态合成 INSERT（保留历史行为）。
func resolveTransactionSteps(iface *models.DataInterface, ds *models.Dataset, dsSrc *models.DataSource, db *sql.DB, params map[string]interface{}) ([]string, error) {
	effectiveSteps := strings.TrimSpace(iface.StepsJSON)
	if effectiveSteps == "" {
		effectiveSteps = strings.TrimSpace(ds.StepsJSON)
	}
	if effectiveSteps != "" && effectiveSteps != "[]" {
		var steps []string
		if err := json.Unmarshal([]byte(effectiveSteps), &steps); err != nil || len(steps) == 0 {
			return nil, fmt.Errorf("invalid steps_json")
		}
		return steps, nil
	}

	// existing-table 模式：按实时表列合成 INSERT
	var uiMeta struct {
		UI struct {
			TableMode string `json:"table_mode"`
			TableName string `json:"table_name"`
		} `json:"_ui"`
	}
	metaStr := ds.MetaJSON
	if metaStr == "" {
		metaStr = "{}"
	}
	if err := json.Unmarshal([]byte(metaStr), &uiMeta); err != nil || uiMeta.UI.TableMode != "existing" || uiMeta.UI.TableName == "" {
		return nil, fmt.Errorf("invalid steps_json and no table binding in meta_json")
	}
	cols, err := dbdriver.ListColumns(db, dsSrc.Type, uiMeta.UI.TableName)
	if err != nil || len(cols) == 0 {
		if err != nil {
			return nil, fmt.Errorf("failed to read table columns: %s", err.Error())
		}
		return nil, fmt.Errorf("failed to read table columns: empty")
	}
	var colNames, placeholders []string
	for _, col := range cols {
		if col.AutoIncrement {
			continue
		}
		v, provided := params[col.Name]
		hasVal := provided && v != nil && fmt.Sprintf("%v", v) != ""
		if col.PrimaryKey {
			if !hasVal {
				continue
			}
		} else {
			if !hasVal {
				if col.Nullable || col.DefaultExpr != "" {
					continue
				}
				return nil, fmt.Errorf("column %q is required (not null, no default)", col.Name)
			}
		}
		colNames = append(colNames, dbdriver.QuoteColumnIdent(dsSrc.Type, col.Name))
		placeholders = append(placeholders, fmt.Sprintf("{{%s}}", col.Name))
	}
	if len(colNames) == 0 {
		return nil, fmt.Errorf("table has no writable columns")
	}
	insertSQL := "INSERT INTO " + dbdriver.QuoteTableIdent(dsSrc.Type, uiMeta.UI.TableName) +
		" (" + strings.Join(colNames, ", ") + ") VALUES (" + strings.Join(placeholders, ", ") + ")"
	return []string{insertSQL}, nil
}

// InvokeDataInterfaceForClient 内部客户端（SCADA / 管理端绑定）调用端点：返回对象形态结果。
// POST /api/data/interfaces/:id/invoke
func InvokeDataInterfaceForClient(c *gin.Context) {
	var body struct {
		ParamValues json.RawMessage `json:"param_values"`
		Limit       int             `json:"limit"`
		Offset      int             `json:"offset"`
	}
	_ = c.ShouldBindJSON(&body)
	params, perr := parseFlexibleParamValues(body.ParamValues)
	if perr != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": perr.Error()})
		return
	}
	res, err := Execute(InvokeRequest{
		Code:          c.Param("id"),
		ParamValues:   params,
		LimitOverride: body.Limit,
		Offset:        body.Offset,
		EnabledOnly:   false,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if res.Kind == InvokeKindStaticCrud {
		c.JSON(http.StatusBadRequest, gin.H{"error": "写类静态 CRUD 接口不支持客户端只读调用"})
		return
	}
	resp := gin.H{
		"ok":         true,
		"kind":       res.Kind,
		"elapsed_ms": res.ElapsedMS,
		"iface":      res.IfaceName,
	}
	switch res.Kind {
	case InvokeKindQueryOne:
		resp["row"] = res.Row
		resp["data"] = res.Row
	case InvokeKindTransaction:
		resp["last_insert_id"] = res.LastInsertID
		resp["data"] = res.InsertedRow
	default: // query / static_list
		rows := res.Rows
		if rows == nil {
			rows = []map[string]interface{}{}
		}
		resp["data"] = rows
		resp["rows"] = rows
	}
	if res.TotalCount != nil {
		resp["total_count"] = *res.TotalCount
	}
	if res.UsedSQL != "" {
		resp["sql"] = res.UsedSQL
	}
	c.JSON(http.StatusOK, resp)
}
