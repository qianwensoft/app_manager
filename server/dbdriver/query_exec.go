package dbdriver

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"
)

// rePlaceholder 匹配 {{ name }} 形式的命名占位符（允许内部空白）。
var rePlaceholder = regexp.MustCompile(`\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}`)

// inlineLimitOffsetParams 将 SQL 中的 {{limit}} 和 {{offset}} 直接替换为实际值（不使用占位符）。
// MySQL 某些版本不支持在 LIMIT/OFFSET 子句中使用预编译占位符，会报错 "Incorrect arguments to mysqld_stmt_execute"。
// 返回处理后的 SQL 和移除了 limit/offset 的参数 map。
func inlineLimitOffsetParams(sqlStr string, params map[string]interface{}) (string, map[string]interface{}) {
	if params == nil {
		return sqlStr, params
	}

	// 复制参数 map，移除 limit 和 offset
	newParams := make(map[string]interface{})
	for k, v := range params {
		if k != "limit" && k != "offset" {
			newParams[k] = v
		}
	}

	// 替换 {{limit}} 和 {{offset}} 为实际值
	limitVal := 100 // 默认值
	offsetVal := 0

	if v, ok := params["limit"]; ok {
		switch val := v.(type) {
		case int:
			limitVal = val
		case int32:
			limitVal = int(val)
		case int64:
			limitVal = int(val)
		case float64:
			limitVal = int(val)
		}
	}

	if v, ok := params["offset"]; ok {
		switch val := v.(type) {
		case int:
			offsetVal = val
		case int32:
			offsetVal = int(val)
		case int64:
			offsetVal = int(val)
		case float64:
			offsetVal = int(val)
		}
	}

	// 内联替换
	sqlStr = strings.ReplaceAll(sqlStr, "{{limit}}", fmt.Sprintf("%d", limitVal))
	sqlStr = strings.ReplaceAll(sqlStr, "{{ limit }}", fmt.Sprintf("%d", limitVal))
	sqlStr = strings.ReplaceAll(sqlStr, "{{offset}}", fmt.Sprintf("%d", offsetVal))
	sqlStr = strings.ReplaceAll(sqlStr, "{{ offset }}", fmt.Sprintf("%d", offsetVal))

	return sqlStr, newParams
}


// RewriteNamedSQLParams 将 SQL 中的 {{name}} 转为方言占位符，并生成参数列表。
// {{name}} 天生可选：参数存在则参数化绑定；缺失则自动剔除其所在条件子句（连接词边界推断），
// INSERT 语句中缺失参数对应的列/值对自动移除。剔除后仍残留的 {{name}} 视为缺参错误。
// PostgreSQL 使用 $1..$n；其余方言使用 ?。
// 特殊处理：{{limit}} 和 {{offset}} 不使用占位符，直接内联（MySQL 限制）。
func RewriteNamedSQLParams(dialect string, sqlStr string, params map[string]interface{}) (outSQL string, args []interface{}, err error) {
	if params == nil {
		params = map[string]interface{}{}
	}

	// 先内联 limit 和 offset（MySQL 不支持在 LIMIT/OFFSET 中使用占位符）
	sqlStr, params = inlineLimitOffsetParams(sqlStr, params)

	// 再剔除缺失参数所在的子句 / INSERT 列值对。
	sqlStr = StripMissingClauses(sqlStr, params)
	d := NormalizeType(dialect)
	type occ struct {
		start, end int
		name       string
	}
	var occs []occ
	idx := 0
	for {
		loc := rePlaceholder.FindStringSubmatchIndex(sqlStr[idx:])
		if loc == nil {
			break
		}
		start := idx + loc[0]
		end := idx + loc[1]
		name := sqlStr[idx+loc[2] : idx+loc[3]]
		if _, ok := params[name]; !ok {
			return "", nil, fmt.Errorf("缺少参数 {{%s}}", name)
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
		case "mssql", "sqlserver":
			n++
			b.WriteString(fmt.Sprintf("@p%d", n))
		default:
			b.WriteString("?")
		}
		args = append(args, params[o.name])
		last = o.end
	}
	b.WriteString(sqlStr[last:])
	return b.String(), args, nil
}

// ScanSQLRowsLimited 扫描查询结果，最多 limit 行（limit<=0 不限制）。
func ScanSQLRowsLimited(rows *sql.Rows, limit int) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, 64)
	n := 0
	for rows.Next() {
		if limit > 0 && n >= limit {
			break
		}
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return out, err
		}
		row := map[string]interface{}{}
		for i, col := range cols {
			row[col] = vals[i]
		}
		out = append(out, row)
		n++
	}
	return out, rows.Err()
}

// QuerySQL 执行查询类 SQL，支持 :name 命名参数。
func QuerySQL(db *sql.DB, dialect, sqlStr string, params map[string]interface{}, limit int) ([]map[string]interface{}, error) {
	sqlStr = strings.TrimSpace(sqlStr)
	if sqlStr == "" {
		return nil, fmt.Errorf("empty sql")
	}
	used, args, err := RewriteNamedSQLParams(dialect, sqlStr, params)
	if err != nil {
		return nil, err
	}
	var rows *sql.Rows
	if len(args) > 0 {
		rows, err = db.Query(used, args...)
	} else {
		rows, err = db.Query(used)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return ScanSQLRowsLimited(rows, limit)
}
