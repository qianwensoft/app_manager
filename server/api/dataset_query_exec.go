package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// parseFlexibleParamValues 解析请求体中的 param_values（对象或 JSON 字符串）。
func parseFlexibleParamValues(raw json.RawMessage) (map[string]interface{}, error) {
	raw = bytesTrimSpaceJSON(raw)
	if len(raw) == 0 || string(raw) == "null" {
		return map[string]interface{}{}, nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err == nil && m != nil {
		return m, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return nil, fmt.Errorf("param_values 须为 JSON 对象")
	}
	return ParseParamValuesJSON(s)
}

func bytesTrimSpaceJSON(raw json.RawMessage) json.RawMessage {
	s := strings.TrimSpace(string(raw))
	return json.RawMessage(s)
}

// ScanSQLRowsLimited 扫描查询结果，最多 limit 行（limit<=0 表示不限制）。
func ScanSQLRowsLimited(rows *sql.Rows, limit int) ([]map[string]interface{}, error) {
	return ScanSQLRowsLimitedOffset(rows, limit, 0)
}

func ScanSQLRowsLimitedOffset(rows *sql.Rows, limit, offset int) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0, 64)
	n := 0
	skipped := 0
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return out, err
		}
		if skipped < offset {
			skipped++
			continue
		}
		if limit > 0 && n >= limit {
			break
		}
		row := map[string]interface{}{}
		for i, col := range cols {
			v := vals[i]
			if b, ok := v.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = v
			}
		}
		out = append(out, row)
		n++
	}
	return out, rows.Err()
}

// QueryDatasetSQL 执行查询类 SQL，支持 :name 命名参数（见 RewriteNamedSQLParams）。
func QueryDatasetSQL(db *sql.DB, dialect, sqlStr string, params map[string]interface{}, limit int) ([]map[string]interface{}, string, []interface{}, error) {
	sqlStr = strings.TrimSpace(sqlStr)
	if sqlStr == "" {
		return nil, "", nil, fmt.Errorf("empty sql")
	}
	if params == nil {
		params = map[string]interface{}{}
	}
	used, args, err := RewriteNamedSQLParams(dialect, sqlStr, params)
	if err != nil {
		return nil, "", nil, fmt.Errorf("SQL rewrite failed: %w\nOriginal SQL: %s\nParams: %+v", err, sqlStr, params)
	}
	var rows *sql.Rows
	if len(args) > 0 {
		rows, err = db.Query(used, args...)
	} else {
		rows, err = db.Query(used)
	}
	if err != nil {
		return nil, used, args, fmt.Errorf("query execution failed: %w\nSQL: %s\nArgs: %+v\nOriginal params: %+v", err, used, args, params)
	}
	defer rows.Close()
	out, scanErr := ScanSQLRowsLimited(rows, limit)
	return out, used, args, scanErr
}

// DebugTransactionStepsDryRun 在事务中依次执行 SQL（参数化），最后回滚，用于调试。
func DebugTransactionStepsDryRun(db *sql.DB, dialect string, steps []string, params map[string]interface{}) ([]string, error) {
	if params == nil {
		params = map[string]interface{}{}
	}
	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	executed := make([]string, 0, len(steps))
	for i, step := range steps {
		step = strings.TrimSpace(step)
		if step == "" {
			continue
		}
		used, args, err := RewriteNamedSQLParams(dialect, step, params)
		if err != nil {
			return executed, fmt.Errorf("步骤 %d 参数: %w", i+1, err)
		}
		if len(args) > 0 {
			_, err = tx.Exec(used, args...)
		} else {
			_, err = tx.Exec(used)
		}
		executed = append(executed, used)
		if err != nil {
			return executed, fmt.Errorf("步骤 %d 执行: %w, SQL: %s", i+1, err, used)
		}
	}
	return executed, nil
}

// ElapsedMS 用于调试响应。
func ElapsedMS(start time.Time) int64 {
	return time.Since(start).Milliseconds()
}
