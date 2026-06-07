package api

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var reSQLNamedParam = regexp.MustCompile(`:([a-zA-Z_][a-zA-Z0-9_]*)`)

// stripMissingInsertParams 对 INSERT INTO t (c1, c2, ...) VALUES (:p1, :p2, ...) 语句，
// 自动移除 params 中不存在的命名参数对应的列/值对，使数据库自增字段（如 id）可省略。
// 非 INSERT 语句原样返回。
func stripMissingInsertParams(sqlStr string, params map[string]interface{}) string {
	upper := strings.ToUpper(strings.TrimSpace(sqlStr))
	if !strings.HasPrefix(upper, "INSERT") {
		return sqlStr
	}
	open1 := strings.Index(sqlStr, "(")
	if open1 < 0 {
		return sqlStr
	}
	close1 := strings.Index(sqlStr[open1:], ")")
	if close1 < 0 {
		return sqlStr
	}
	close1 += open1

	afterClose1Upper := strings.ToUpper(sqlStr[close1+1:])
	valIdx := strings.Index(afterClose1Upper, "VALUES")
	if valIdx < 0 {
		return sqlStr
	}
	valKwStart := close1 + 1 + valIdx
	valKwEnd := valKwStart + len("VALUES")
	restAfterValues := strings.TrimLeft(sqlStr[valKwEnd:], " \t\r\n")
	if !strings.HasPrefix(restAfterValues, "(") {
		return sqlStr
	}
	open2 := valKwEnd + strings.Index(sqlStr[valKwEnd:], "(")
	close2 := strings.LastIndex(sqlStr, ")")
	if close2 <= open2 {
		return sqlStr
	}

	colsStr := sqlStr[open1+1 : close1]
	valsStr := sqlStr[open2+1 : close2]
	cols := splitSQLList(colsStr)
	vals := splitSQLList(valsStr)
	if len(cols) != len(vals) {
		return sqlStr
	}

	var newCols, newVals []string
	changed := false
	for i, v := range vals {
		m := reSQLNamedParam.FindStringSubmatch(v)
		if m == nil {
			// 非命名参数（字面量、函数调用等），始终保留
			newCols = append(newCols, cols[i])
			newVals = append(newVals, v)
			continue
		}
		paramName := m[1]
		if _, ok := params[paramName]; ok {
			newCols = append(newCols, cols[i])
			newVals = append(newVals, v)
		} else {
			changed = true
		}
	}
	if !changed {
		return sqlStr
	}
	prefix := sqlStr[:open1]
	between := sqlStr[close1+1 : open2]
	suffix := sqlStr[close2+1:]
	return prefix + "(" + strings.Join(newCols, ", ") + ")" + between + "(" + strings.Join(newVals, ", ") + ")" + suffix
}

func splitSQLList(s string) []string {
	parts := strings.Split(s, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	return parts
}

var mockRand = rand.New(rand.NewSource(time.Now().UnixNano()))

// extractSQLNamedParamNames 从 SQL 中提取所有 :name 参数名（去重，保序）。
func extractSQLNamedParamNames(sql string) []string {
	seen := map[string]bool{}
	var out []string
	idx := 0
	for {
		loc := reSQLNamedParam.FindStringSubmatchIndex(sql[idx:])
		if loc == nil {
			break
		}
		start := idx + loc[0]
		end := idx + loc[1]
		name := sql[idx+loc[2] : idx+loc[3]]
		if start > 0 && sql[start-1] == ':' {
			idx = end
			continue
		}
		if !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
		idx = end
	}
	return out
}

// demoValueForName 根据参数名推断合理的模拟值（带随机性）。
func demoValueForName(name string) interface{} {
	n := strings.ToLower(name)
	switch {
	case n == "id":
		return mockRand.Intn(9000) + 1000
	case strings.HasSuffix(n, "_id") || strings.HasSuffix(n, "id"):
		return mockRand.Intn(9000) + 1000
	case n == "page" || n == "page_no" || n == "page_num":
		return mockRand.Intn(5) + 1
	case n == "limit" || n == "page_size" || n == "size":
		return []int{10, 20, 50}[mockRand.Intn(3)]
	case n == "offset":
		return mockRand.Intn(3) * 20
	case strings.Contains(n, "status") || strings.Contains(n, "state"):
		return mockRand.Intn(3)
	case strings.Contains(n, "enabled") || strings.Contains(n, "active"):
		return mockRand.Intn(2)
	case strings.Contains(n, "deleted"):
		return 0
	case strings.Contains(n, "start") || (strings.Contains(n, "time") && strings.Contains(n, "begin")):
		y := 2024 + mockRand.Intn(2)
		m := mockRand.Intn(12) + 1
		return fmt.Sprintf("%d-%02d-01", y, m)
	case strings.Contains(n, "end") || (strings.Contains(n, "time") && strings.Contains(n, "end")):
		y := 2024 + mockRand.Intn(2)
		m := mockRand.Intn(12) + 1
		return fmt.Sprintf("%d-%02d-28", y, m)
	case strings.Contains(n, "time") || strings.Contains(n, "date") || strings.HasSuffix(n, "_at"):
		y := 2024 + mockRand.Intn(2)
		m := mockRand.Intn(12) + 1
		d := mockRand.Intn(28) + 1
		return fmt.Sprintf("%d-%02d-%02d", y, m, d)
	case strings.Contains(n, "name") || strings.Contains(n, "title"):
		samples := []string{"示例A", "示例B", "测试项", "演示数据"}
		return samples[mockRand.Intn(len(samples))]
	case strings.Contains(n, "code") || strings.Contains(n, "slug"):
		samples := []string{"demo", "test", "sample", "example"}
		return samples[mockRand.Intn(len(samples))]
	case strings.Contains(n, "keyword") || strings.Contains(n, "search") || strings.Contains(n, "query") || strings.Contains(n, "kw"):
		samples := []string{"关键词", "测试", "查询", ""}
		return samples[mockRand.Intn(len(samples))]
	case strings.Contains(n, "email"):
		users := []string{"alice", "bob", "carol", "dave"}
		return users[mockRand.Intn(len(users))] + "@example.com"
	case strings.Contains(n, "phone") || strings.Contains(n, "mobile") || strings.Contains(n, "tel"):
		return fmt.Sprintf("138%08d", mockRand.Intn(100000000))
	case strings.Contains(n, "count") || strings.Contains(n, "num") || strings.Contains(n, "amount") || strings.Contains(n, "qty"):
		return mockRand.Intn(100) + 1
	case strings.Contains(n, "type") || strings.Contains(n, "kind") || strings.Contains(n, "category"):
		return mockRand.Intn(5) + 1
	default:
		samples := []string{"demo", "test", "示例", "sample"}
		return samples[mockRand.Intn(len(samples))]
	}
}

// MockParamsDataset GET /datasets/:id/mock-params
func MockParamsDataset(c *gin.Context) {
	ds, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(404, gin.H{"error": "数据集不存在"})
		return
	}
	params := buildMockParamsForDataset(ds.Kind, ds.Definition, ds.StepsJSON, ds.ParamSchema)
	c.JSON(200, gin.H{"param_values": params})
}

// MockParamsInterface GET /interfaces/:id/mock-params
func MockParamsInterface(c *gin.Context) {
	iface, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(404, gin.H{"error": "接口不存在"})
		return
	}
	// 优先从绑定数据集提取 SQL 参数
	var dsKind, dsDef, dsSteps, dsParamSchema string
	if iface.DatasetID != 0 {
		ds, e := firstDatasetByID(iface.DatasetID)
		if e == nil {
			dsKind, dsDef, dsSteps, dsParamSchema = ds.Kind, ds.Definition, ds.StepsJSON, ds.ParamSchema
		}
	}
	params := buildMockParamsForDataset(dsKind, dsDef, dsSteps, dsParamSchema)
	// 再叠加接口自身 steps_json 里的参数
	if iface.Kind == "transaction" && iface.StepsJSON != "" {
		for _, n := range extractSQLNamedParamNames(iface.StepsJSON) {
			if _, ok := params[n]; !ok {
				params[n] = demoValueForName(n)
			}
		}
	}
	// 叠加接口 schema_json 里的字段（static crud）
	if iface.SchemaJSON != "" {
		for _, k := range parseSchemaJSONKeys(iface.SchemaJSON) {
			if _, ok := params[k]; !ok {
				params[k] = demoValueForName(k)
			}
		}
	}
	c.JSON(200, gin.H{"param_values": params})
}

type InterfaceParamItem struct {
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Required    bool     `json:"required"`
	Enum        []string `json:"enum,omitempty"`
}

// GetInterfaceParamSchema GET /interfaces/:id/param-schema
func GetInterfaceParamSchema(c *gin.Context) {
	iface, err := firstDataInterfaceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(404, gin.H{"error": "接口不存在"})
		return
	}

	seen := map[string]bool{}
	var params []InterfaceParamItem
	schemaItems := map[string]InterfaceParamItem{}

	addParam := func(name string) {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			return
		}
		seen[name] = true
		if item, ok := schemaItems[name]; ok {
			params = append(params, item)
		} else {
			params = append(params, InterfaceParamItem{Name: name, Type: "string"})
		}
	}

	// from dataset SQL / steps
	if iface.DatasetID != 0 {
		ds, e := firstDatasetByID(iface.DatasetID)
		if e == nil {
			for _, item := range parseSchemaJSONItems(ds.ParamSchema) {
				schemaItems[item.Name] = item
			}
			for _, n := range extractSQLNamedParamNames(ds.Definition) {
				addParam(n)
			}
			if ds.StepsJSON != "" {
				for _, n := range extractSQLNamedParamNames(ds.StepsJSON) {
					addParam(n)
				}
			}
			for _, k := range parseSchemaJSONKeys(ds.ParamSchema) {
				addParam(k)
			}
		}
	}
	// from interface steps_json (transaction)
	if iface.StepsJSON != "" {
		for _, n := range extractSQLNamedParamNames(iface.StepsJSON) {
			addParam(n)
		}
	}

	// result fields from schema_json
	resultFields := parseSchemaJSONKeys(iface.SchemaJSON)

	if params == nil {
		params = []InterfaceParamItem{}
	}
	if resultFields == nil {
		resultFields = []string{}
	}
	c.JSON(200, gin.H{"params": params, "result_fields": resultFields})
}

func buildMockParamsForDataset(kind, definition, stepsJSON, paramSchema string) map[string]interface{} {
	params := map[string]interface{}{}
	// 从 SQL definition 提取
	for _, n := range extractSQLNamedParamNames(definition) {
		params[n] = demoValueForName(n)
	}
	// 从 steps_json 提取
	if stepsJSON != "" {
		for _, n := range extractSQLNamedParamNames(stepsJSON) {
			if _, ok := params[n]; !ok {
				params[n] = demoValueForName(n)
			}
		}
	}
	// 从 param_schema 补充
	for _, k := range parseSchemaJSONKeys(paramSchema) {
		if _, ok := params[k]; !ok {
			params[k] = demoValueForName(k)
		}
	}
	return params
}

// parseSchemaJSONKeys 从 param_schema / schema_json 提取键名。
func parseSchemaJSONKeys(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var o interface{}
	if err := json.Unmarshal([]byte(raw), &o); err != nil {
		return nil
	}
	switch v := o.(type) {
	case map[string]interface{}:
		if props, ok := v["properties"].(map[string]interface{}); ok {
			keys := make([]string, 0, len(props))
			for k := range props {
				keys = append(keys, k)
			}
			return keys
		}
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		return keys
	case []interface{}:
		var keys []string
		for _, item := range v {
			if s, ok := item.(string); ok {
				keys = append(keys, s)
			}
		}
		return keys
	}
	return nil
}


// parseSchemaJSONItems 从 param_schema 提取完整参数信息（含 type、enum、description、required）。
func parseSchemaJSONItems(raw string) []InterfaceParamItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var o map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &o); err != nil {
		return nil
	}
	props, ok := o["properties"].(map[string]interface{})
	if !ok {
		// flat object: keys are param names, values are type strings or objects
		var items []InterfaceParamItem
		for k, v := range o {
			item := InterfaceParamItem{Name: k, Type: "string"}
			if s, ok := v.(string); ok {
				item.Type = s
			}
			items = append(items, item)
		}
		return items
	}
	requiredSet := map[string]bool{}
	if req, ok := o["required"].([]interface{}); ok {
		for _, r := range req {
			if s, ok := r.(string); ok {
				requiredSet[s] = true
			}
		}
	}
	var items []InterfaceParamItem
	for k, v := range props {
		item := InterfaceParamItem{Name: k, Type: "string", Required: requiredSet[k]}
		if def, ok := v.(map[string]interface{}); ok {
			if t, ok := def["type"].(string); ok {
				item.Type = t
			}
			if d, ok := def["description"].(string); ok {
				item.Description = d
			}
			if enums, ok := def["enum"].([]interface{}); ok {
				for _, e := range enums {
					if s, ok := e.(string); ok {
						item.Enum = append(item.Enum, s)
					} else {
						item.Enum = append(item.Enum, fmt.Sprintf("%v", e))
					}
				}
			}
		}
		items = append(items, item)
	}
	return items
}

// ParseParamValuesJSON 解析请求体中的 param_values（JSON 对象字符串或对象）。
func ParseParamValuesJSON(raw string) (map[string]interface{}, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return map[string]interface{}{}, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, fmt.Errorf("param_values 须为 JSON 对象: %w", err)
	}
	if m == nil {
		return map[string]interface{}{}, nil
	}
	return m, nil
}

// RewriteNamedSQLParams 将 SQL 中的 :name 转为方言占位符，并生成参数列表（按出现顺序）。
// PostgreSQL 使用 $1..$n；MySQL / SQLite / SQL Server 使用 ?（mssql 驱动支持位置 ?）。
// 跳过 PostgreSQL 类型转换中的 ::foo（前一字符为冒号则不匹配——通过扫描修复）。
func RewriteNamedSQLParams(dialect string, sqlStr string, params map[string]interface{}) (outSQL string, args []interface{}, err error) {
	if params == nil {
		params = map[string]interface{}{}
	}
	d := normalizeSQLDataSourceType(dialect)
	type occ struct {
		start, end int
		name       string
	}
	var occs []occ
	idx := 0
	for {
		loc := reSQLNamedParam.FindStringSubmatchIndex(sqlStr[idx:])
		if loc == nil {
			break
		}
		start := idx + loc[0]
		end := idx + loc[1]
		name := sqlStr[idx+loc[2] : idx+loc[3]]
		if start > 0 && sqlStr[start-1] == ':' {
			idx = end
			continue
		}
		if _, ok := params[name]; !ok {
			return "", nil, fmt.Errorf("缺少参数 :%s", name)
		}
		occs = append(occs, occ{start, end, name})
		idx = end
	}
	if len(occs) == 0 {
		return sqlStr, nil, nil
	}
	var b strings.Builder
	last := 0
	n := 0
	for _, o := range occs {
		b.WriteString(sqlStr[last:o.start])
		switch d {
		case "postgres":
			n++
			b.WriteString(fmt.Sprintf("$%d", n))
		default:
			b.WriteString("?")
		}
		args = append(args, params[o.name])
		last = o.end
	}
	b.WriteString(sqlStr[last:])
	return b.String(), args, nil
}
