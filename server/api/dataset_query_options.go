package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// QueryOptions 查询选项，支持分页、排序、限制等
type QueryOptions struct {
	// 分页参数
	Page     int `json:"page"`      // 页码，从 1 开始
	PageSize int `json:"page_size"` // 每页大小
	Limit    int `json:"limit"`     // 直接限制行数（与分页互斥）
	Offset   int `json:"offset"`    // 直接偏移量（与分页互斥）

	// 排序参数
	OrderBy    string `json:"order_by"`  // 排序字段，如 "created_at"
	OrderDir   string `json:"order_dir"` // 排序方向：ASC 或 DESC
	MultiOrder []struct {
		Field string `json:"field"`
		Dir   string `json:"dir"`
	} `json:"multi_order"` // 多字段排序

	// 查询模式
	FetchOne bool `json:"fetch_one"` // 是否只查询一条记录
}

// ApplyQueryOptions 应用查询选项到 SQL，返回包装后的 SQL
func ApplyQueryOptions(sqlStr string, opts QueryOptions, dialect string) (string, error) {
	sqlStr = strings.TrimSpace(sqlStr)

	// 检查是否已有 LIMIT/OFFSET
	upperSQL := strings.ToUpper(sqlStr)
	hasLimit := strings.Contains(upperSQL, " LIMIT ")
	hasOffset := strings.Contains(upperSQL, " OFFSET ")
	hasOrderBy := strings.Contains(upperSQL, " ORDER BY ")

	var wrapped strings.Builder
	wrapped.WriteString(sqlStr)

	// 1. 添加 ORDER BY（如果原 SQL 没有）
	if !hasOrderBy && (opts.OrderBy != "" || len(opts.MultiOrder) > 0) {
		wrapped.WriteString("\nORDER BY ")

		if len(opts.MultiOrder) > 0 {
			// 多字段排序
			var parts []string
			for _, order := range opts.MultiOrder {
				field := strings.TrimSpace(order.Field)
				dir := strings.ToUpper(strings.TrimSpace(order.Dir))
				if field == "" {
					continue
				}
				if dir != "ASC" && dir != "DESC" {
					dir = "ASC"
				}
				// 简单验证字段名（防止 SQL 注入）
				if !isValidColumnName(field) {
					return "", fmt.Errorf("invalid column name: %s", field)
				}
				parts = append(parts, fmt.Sprintf("%s %s", field, dir))
			}
			wrapped.WriteString(strings.Join(parts, ", "))
		} else if opts.OrderBy != "" {
			// 单字段排序
			if !isValidColumnName(opts.OrderBy) {
				return "", fmt.Errorf("invalid order_by column: %s", opts.OrderBy)
			}
			dir := strings.ToUpper(strings.TrimSpace(opts.OrderDir))
			if dir != "ASC" && dir != "DESC" {
				dir = "ASC"
			}
			wrapped.WriteString(fmt.Sprintf("%s %s", opts.OrderBy, dir))
		}
	}

	// 2. 添加 LIMIT/OFFSET（如果原 SQL 没有）
	if !hasLimit && !hasOffset {
		if opts.FetchOne {
			// 单条查询
			wrapped.WriteString("\nLIMIT 1")
		} else if opts.Page > 0 && opts.PageSize > 0 {
			// 分页模式
			limit := opts.PageSize
			offset := (opts.Page - 1) * opts.PageSize
			wrapped.WriteString(fmt.Sprintf("\nLIMIT %d OFFSET %d", limit, offset))
		} else if opts.Limit > 0 {
			// 直接 LIMIT 模式
			wrapped.WriteString(fmt.Sprintf("\nLIMIT %d", opts.Limit))
			if opts.Offset > 0 {
				wrapped.WriteString(fmt.Sprintf(" OFFSET %d", opts.Offset))
			}
		}
	}

	return wrapped.String(), nil
}

// isValidColumnName 简单验证列名（防止 SQL 注入）
// 允许：字母、数字、下划线、点号（用于表名.列名）
var reColumnName = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$`)

func isValidColumnName(name string) bool {
	return reColumnName.MatchString(name)
}

// QueryDatasetWithOptions 执行带选项的查询（分页、排序等）
func QueryDatasetWithOptions(db *sql.DB, dialect, sqlStr string, params map[string]interface{}, opts QueryOptions) ([]map[string]interface{}, string, []interface{}, error) {
	// 1. 应用动态 SQL 可选参数
	processedSQL, args, err := RewriteNamedSQLParamsOptional(dialect, sqlStr, params)
	if err != nil {
		return nil, "", nil, err
	}

	// 2. 应用查询选项（分页、排序）
	finalSQL, err := ApplyQueryOptions(processedSQL, opts, dialect)
	if err != nil {
		return nil, processedSQL, args, err
	}

	// 3. 执行查询
	var rows *sql.Rows
	if len(args) > 0 {
		rows, err = db.Query(finalSQL, args...)
	} else {
		rows, err = db.Query(finalSQL)
	}
	if err != nil {
		return nil, finalSQL, args, err
	}
	defer rows.Close()

	// 4. 扫描结果
	limit := 0
	if opts.FetchOne {
		limit = 1
	} else if opts.Limit > 0 {
		limit = opts.Limit
	} else if opts.PageSize > 0 {
		limit = opts.PageSize
	}

	out, scanErr := ScanSQLRowsLimited(rows, limit)
	return out, finalSQL, args, scanErr
}

// QueryOneRow 执行查询并返回单行（如果没有结果则返回 nil）
func QueryOneRow(db *sql.DB, dialect, sqlStr string, params map[string]interface{}) (map[string]interface{}, string, []interface{}, error) {
	opts := QueryOptions{FetchOne: true}
	rows, usedSQL, args, err := QueryDatasetWithOptions(db, dialect, sqlStr, params, opts)
	if err != nil {
		return nil, usedSQL, args, err
	}
	if len(rows) == 0 {
		return nil, usedSQL, args, nil
	}
	return rows[0], usedSQL, args, nil
}

// ParseQueryOptions 从请求体解析查询选项
func ParseQueryOptions(raw json.RawMessage) (QueryOptions, error) {
	var opts QueryOptions
	if len(raw) == 0 || string(raw) == "null" {
		return opts, nil
	}
	if err := json.Unmarshal(raw, &opts); err != nil {
		return opts, fmt.Errorf("invalid query_options: %w", err)
	}
	// 默认值
	if opts.PageSize <= 0 && opts.Page > 0 {
		opts.PageSize = 20
	}
	if opts.PageSize > 5000 {
		opts.PageSize = 5000
	}
	if opts.Limit > 5000 {
		opts.Limit = 5000
	}
	return opts, nil
}
