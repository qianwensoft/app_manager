package datastack

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"app-manager/dbdriver"
	"app-manager/models"
)

// 本文件为纯整形/校验原语：无 gin、无 database.DB、无 api 助手依赖，仅做 SQL 文本变换与 []map 变换。
// 供 server/api 执行器与出站轮询路径共用，使 datastack 保持 api-free（避免 api→outbound→api 导入环）。

// reShapeIdent 限制字段名为安全标识符，防止注入。
var reShapeIdent = regexp.MustCompile(`^[a-zA-Z0-9_]{1,64}$`)

// ParamSpec 单个参数契约。
type ParamSpec struct {
	Name     string        `json:"name"`
	Type     string        `json:"type"` // string | number | integer | boolean | any（空=any）
	Required bool          `json:"required"`
	Enum     []interface{} `json:"enum,omitempty"`
	Min      *float64      `json:"min,omitempty"`
	Max      *float64      `json:"max,omitempty"`
	Pattern  string        `json:"pattern,omitempty"`
	Default  interface{}   `json:"default,omitempty"`
}

// FieldMap 输出字段投影/重命名；To 为空表示保留 From 原名。
type FieldMap struct {
	From string `json:"from"`
	To   string `json:"to,omitempty"`
}

// ProjectionSpec 输出投影。Fields 为空表示不投影（原样返回所有列）。
type ProjectionSpec struct {
	Fields []FieldMap `json:"fields,omitempty"`
}

// ShapeFilter 声明式附加过滤。Param 非空时，仅当 params[Param] 存在才生成该子句。
type ShapeFilter struct {
	Field    string      `json:"field"`
	Operator string      `json:"operator"`
	Value    interface{} `json:"value,omitempty"`
	Param    string      `json:"param,omitempty"`
}

// SortSpec 排序项。
type SortSpec struct {
	Field string `json:"field"`
	Desc  bool   `json:"desc,omitempty"`
}

// PaginationSpec 分页默认值与上限。
type PaginationSpec struct {
	Enabled        bool   `json:"enabled,omitempty"`
	DefaultLimit   int    `json:"default_limit,omitempty"`
	MaxLimit       int    `json:"max_limit,omitempty"`
	LimitParam     string `json:"limit_param,omitempty"`  // 默认 "limit"
	OffsetParam    string `json:"offset_param,omitempty"` // 默认 "offset"
	EmitTotalCount bool   `json:"emit_total_count,omitempty"`
}

// IfaceShaping 整形配置聚合。
type IfaceShaping struct {
	Params     []ParamSpec
	Projection ProjectionSpec
	Filters    []ShapeFilter
	Sort       []SortSpec
	Pagination PaginationSpec
}

// ParseIfaceShaping 解析 DataInterface 上的 5 个整形 JSON 字段。空字段=对应整形关闭。
func ParseIfaceShaping(iface *models.DataInterface) (IfaceShaping, error) {
	var sh IfaceShaping
	if iface == nil {
		return sh, nil
	}
	if s := strings.TrimSpace(iface.ParamContractJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &sh.Params); err != nil {
			return sh, fmt.Errorf("param_contract_json 解析失败: %w", err)
		}
	}
	if s := strings.TrimSpace(iface.FieldMappingJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &sh.Projection); err != nil {
			return sh, fmt.Errorf("field_mapping_json 解析失败: %w", err)
		}
	}
	if s := strings.TrimSpace(iface.ExtraFiltersJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &sh.Filters); err != nil {
			return sh, fmt.Errorf("extra_filters_json 解析失败: %w", err)
		}
	}
	if s := strings.TrimSpace(iface.SortJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &sh.Sort); err != nil {
			return sh, fmt.Errorf("sort_json 解析失败: %w", err)
		}
	}
	if s := strings.TrimSpace(iface.PaginationJSON); s != "" {
		if err := json.Unmarshal([]byte(s), &sh.Pagination); err != nil {
			return sh, fmt.Errorf("pagination_json 解析失败: %w", err)
		}
	}
	return sh, nil
}

// ValidateParams 在默认值合并之前校验请求参数是否满足契约。
// 仅校验已声明的参数；未在请求中出现的非必填参数跳过。
func ValidateParams(specs []ParamSpec, params map[string]interface{}) error {
	for _, sp := range specs {
		name := strings.TrimSpace(sp.Name)
		if name == "" {
			continue
		}
		v, present := params[name]
		if !present || v == nil || (isStringVal(v) && strings.TrimSpace(v.(string)) == "") {
			// 缺失：默认值（Default 或 ParamDefaultsJSON）在后续步骤补；此处仅判必填。
			// 特殊处理：id 参数允许为空（新增记录时无 id，更新时有 id）
			if sp.Required && sp.Default == nil && name != "id" {
				return fmt.Errorf("缺少必填参数 %q", name)
			}
			continue
		}
		if err := validateOneParam(sp, v); err != nil {
			return err
		}
	}
	return nil
}

func validateOneParam(sp ParamSpec, v interface{}) error {
	name := sp.Name
	switch strings.ToLower(strings.TrimSpace(sp.Type)) {
	case "number", "integer":
		f, ok := toFloat(v)
		if !ok {
			return fmt.Errorf("参数 %q 须为数字", name)
		}
		if sp.Type == "integer" && f != float64(int64(f)) {
			return fmt.Errorf("参数 %q 须为整数", name)
		}
		if sp.Min != nil && f < *sp.Min {
			return fmt.Errorf("参数 %q 不得小于 %v", name, *sp.Min)
		}
		if sp.Max != nil && f > *sp.Max {
			return fmt.Errorf("参数 %q 不得大于 %v", name, *sp.Max)
		}
	case "boolean":
		if _, ok := v.(bool); !ok {
			s := fmt.Sprintf("%v", v)
			if s != "true" && s != "false" {
				return fmt.Errorf("参数 %q 须为布尔值", name)
			}
		}
	default: // string / any
		if sp.Pattern != "" {
			re, err := regexp.Compile(sp.Pattern)
			if err == nil && !re.MatchString(fmt.Sprintf("%v", v)) {
				return fmt.Errorf("参数 %q 不符合格式要求", name)
			}
		}
	}
	if len(sp.Enum) > 0 {
		matched := false
		vs := fmt.Sprintf("%v", v)
		for _, e := range sp.Enum {
			if fmt.Sprintf("%v", e) == vs {
				matched = true
				break
			}
		}
		if !matched {
			return fmt.Errorf("参数 %q 取值不在允许范围内", name)
		}
	}
	return nil
}

// ApplyParamDefaultsFromContract 在默认值合并之后、参数仍缺失时，补 ParamSpec.Default（最低优先级）。
func ApplyParamDefaultsFromContract(specs []ParamSpec, params map[string]interface{}) {
	if params == nil {
		return
	}
	for _, sp := range specs {
		if sp.Default == nil {
			continue
		}
		name := strings.TrimSpace(sp.Name)
		if name == "" {
			continue
		}
		if _, ok := params[name]; !ok {
			params[name] = sp.Default
		}
	}
}

// ResolveLimit 计算最终 limit/offset。优先级：请求覆盖 > 分页默认 > kind 默认；并按 MaxLimit 钳制。
func ResolveLimit(sh IfaceShaping, requestLimit, requestOffset, kindDefault int) (limit, offset int) {
	limit = kindDefault
	if sh.Pagination.Enabled && sh.Pagination.DefaultLimit > 0 {
		limit = sh.Pagination.DefaultLimit
	}
	if requestLimit > 0 {
		limit = requestLimit
	}
	if sh.Pagination.Enabled && sh.Pagination.MaxLimit > 0 && limit > sh.Pagination.MaxLimit {
		limit = sh.Pagination.MaxLimit
	}
	offset = requestOffset
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}

// BuildShapedSQL 在 baseSQL 之上织入声明式过滤、排序、分页（LIMIT/OFFSET）。
// 过滤参数写入 params（键名 __shape_filter_N），由 RewriteNamedSQLParams（{{name}} 占位符）消费。
// limit<=0 表示不追加 LIMIT/OFFSET（由调用方的扫描层裁剪）。
func BuildShapedSQL(dsType, baseSQL string, sh IfaceShaping, params map[string]interface{}, limit, offset int) string {
	out := strings.TrimSpace(baseSQL)
	if out == "" {
		return out
	}
	if params == nil {
		params = map[string]interface{}{}
	}
	// 1) 附加过滤
	if where := buildShapeWhere(dsType, sh.Filters, params); where != "" {
		out = spliceShapeWhere(out, where)
	}
	// 2) 排序：仅当 base SQL 尚无 ORDER BY 时追加（避免与既有排序冲突）。
	if len(sh.Sort) > 0 && !strings.Contains(strings.ToUpper(out), " ORDER BY ") {
		var parts []string
		for _, s := range sh.Sort {
			f := strings.TrimSpace(s.Field)
			if !reShapeIdent.MatchString(f) {
				continue
			}
			dir := "ASC"
			if s.Desc {
				dir = "DESC"
			}
			parts = append(parts, dbdriver.QuoteColumnIdent(dsType, f)+" "+dir)
		}
		if len(parts) > 0 {
			out = out + " ORDER BY " + strings.Join(parts, ", ")
		}
	}
	// 3) 分页：仅当显式启用分页整形、且 base SQL 尚无 LIMIT/OFFSET 时才注入 SQL。
	// 未启用分页时不改写 SQL —— 行数由调用方扫描层（QueryDatasetSQL 的 limit）裁剪，
	// 与历史行为字节级一致（旧路径从不向 SQL 追加 LIMIT）。
	if sh.Pagination.Enabled && limit > 0 && !strings.Contains(strings.ToUpper(out), " LIMIT ") {
		if strings.EqualFold(dbdriver.NormalizeType(dsType), "sqlserver") {
			// SQL Server 需 ORDER BY 才能用 OFFSET FETCH；缺省排序由调用方/扫描层兜底，这里不强行追加。
			if strings.Contains(strings.ToUpper(out), " ORDER BY ") {
				out = fmt.Sprintf("%s OFFSET %d ROWS FETCH NEXT %d ROWS ONLY", out, offset, limit)
			}
		} else {
			out = fmt.Sprintf("%s LIMIT %d", out, limit)
			if offset > 0 {
				out = fmt.Sprintf("%s OFFSET %d", out, offset)
			}
		}
	}
	return out
}

// BuildCountSQL 包裹 baseSQL（含整形过滤，但不含排序/分页）为 SELECT COUNT(*)。
func BuildCountSQL(dsType, baseSQL string, sh IfaceShaping, params map[string]interface{}) string {
	inner := strings.TrimSpace(baseSQL)
	inner = strings.TrimRight(inner, "; \n\t")
	if inner == "" {
		return ""
	}
	if where := buildShapeWhere(dsType, sh.Filters, params); where != "" {
		inner = spliceShapeWhere(inner, where)
	}
	return "SELECT COUNT(*) AS total FROM (" + inner + ") AS __shape_count"
}

// buildShapeWhere 构造声明式过滤的 WHERE 表达式（不含 WHERE 关键字），并写入参数。
func buildShapeWhere(dsType string, filters []ShapeFilter, params map[string]interface{}) string {
	var clauses []string
	for idx, f := range filters {
		field := strings.TrimSpace(f.Field)
		if !reShapeIdent.MatchString(field) {
			continue
		}
		// 值来源：Param 引用请求参数；否则用字面 Value。
		var val interface{}
		if p := strings.TrimSpace(f.Param); p != "" {
			v, ok := params[p]
			if !ok || v == nil {
				continue // 参数缺失 → 跳过该子句（可选过滤）
			}
			val = v
		} else {
			if f.Value == nil {
				continue
			}
			val = f.Value
		}
		col := dbdriver.QuoteColumnIdent(dsType, field)
		op := strings.ToLower(strings.TrimSpace(f.Operator))
		pk := fmt.Sprintf("__shape_filter_%d", idx)
		raw := fmt.Sprintf("%v", val)
		switch op {
		case "contains":
			params[pk] = "%" + raw + "%"
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, pk))
		case "starts_with":
			params[pk] = raw + "%"
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, pk))
		case "ends_with":
			params[pk] = "%" + raw
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, pk))
		case "gt":
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s > {{%s}}", col, pk))
		case "gte":
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s >= {{%s}}", col, pk))
		case "lt":
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s < {{%s}}", col, pk))
		case "lte":
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s <= {{%s}}", col, pk))
		case "ne":
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s <> {{%s}}", col, pk))
		case "in":
			items := strings.Split(raw, ",")
			var holders []string
			for i, it := range items {
				it = strings.TrimSpace(it)
				if it == "" {
					continue
				}
				k := fmt.Sprintf("%s_%d", pk, i)
				params[k] = it
				holders = append(holders, fmt.Sprintf("{{%s}}", k))
			}
			if len(holders) > 0 {
				clauses = append(clauses, fmt.Sprintf("%s IN (%s)", col, strings.Join(holders, ", ")))
			}
		default: // eq
			params[pk] = val
			clauses = append(clauses, fmt.Sprintf("%s = {{%s}}", col, pk))
		}
	}
	return strings.Join(clauses, " AND ")
}

// spliceShapeWhere 把 whereExpr 安全插入到 baseSQL（拷贝自 api.spliceWhereIntoSQL 的纯逻辑，保持 datastack api-free）。
func spliceShapeWhere(sqlText, whereExpr string) string {
	base := strings.TrimSpace(sqlText)
	if whereExpr == "" {
		return base
	}
	if strings.Contains(base, "/*__DYNAMIC_WHERE__*/") {
		return strings.Replace(base, "/*__DYNAMIC_WHERE__*/", " "+whereExpr+" ", 1)
	}
	up := strings.ToUpper(base)
	insertAt := len(base)
	for _, kw := range []string{" ORDER BY ", " LIMIT ", " OFFSET "} {
		if idx := strings.LastIndex(up, kw); idx >= 0 && idx < insertAt {
			insertAt = idx
		}
	}
	prefix := strings.TrimSpace(base[:insertAt])
	suffix := strings.TrimSpace(base[insertAt:])
	if strings.Contains(strings.ToUpper(prefix), " WHERE ") {
		if suffix != "" {
			return fmt.Sprintf("%s AND %s %s", prefix, whereExpr, suffix)
		}
		return fmt.Sprintf("%s AND %s", prefix, whereExpr)
	}
	if suffix != "" {
		return fmt.Sprintf("%s WHERE %s %s", prefix, whereExpr, suffix)
	}
	return fmt.Sprintf("%s WHERE %s", prefix, whereExpr)
}

// ApplyProjection 在查询结果行上应用字段投影/重命名。Fields 为空则原样返回。
func ApplyProjection(rows []map[string]interface{}, proj ProjectionSpec) []map[string]interface{} {
	if len(proj.Fields) == 0 {
		return rows
	}
	out := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		nr := map[string]interface{}{}
		for _, fm := range proj.Fields {
			from := strings.TrimSpace(fm.From)
			if from == "" {
				continue
			}
			to := strings.TrimSpace(fm.To)
			if to == "" {
				to = from
			}
			if v, ok := row[from]; ok {
				nr[to] = v
			}
		}
		out = append(out, nr)
	}
	return out
}

// ApplyProjectionOne 单行投影（queryOne）。
func ApplyProjectionOne(row map[string]interface{}, proj ProjectionSpec) map[string]interface{} {
	if row == nil || len(proj.Fields) == 0 {
		return row
	}
	res := ApplyProjection([]map[string]interface{}{row}, proj)
	if len(res) > 0 {
		return res[0]
	}
	return nil
}

func isStringVal(v interface{}) bool {
	_, ok := v.(string)
	return ok
}

func toFloat(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case int64:
		return float64(t), true
	case int32:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	default:
		return 0, false
	}
}
