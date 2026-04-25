package datastack

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"

	"app-manager/dbdriver"
)

// inferSQLType 根据 JSON 值推断 SQL 列类型（按目标数据库方言）。
func inferSQLType(dbType string, v interface{}) string {
	switch dbType {
	case "postgres":
		return inferSQLTypePostgres(v)
	case "sqlserver":
		return inferSQLTypeSQLServer(v)
	default: // sqlite, mysql
		return inferSQLTypeGeneric(v)
	}
}

func inferSQLTypeGeneric(v interface{}) string {
	switch val := v.(type) {
	case bool:
		return "INTEGER"
	case float64:
		if val == math.Trunc(val) && val >= -9007199254740992 && val <= 9007199254740992 {
			return "INTEGER"
		}
		return "REAL"
	case string:
		return "TEXT"
	default:
		// nil, object, array → TEXT (stored as JSON)
		return "TEXT"
	}
}

func inferSQLTypePostgres(v interface{}) string {
	switch val := v.(type) {
	case bool:
		return "INTEGER"
	case float64:
		if val == math.Trunc(val) && val >= -9007199254740992 && val <= 9007199254740992 {
			return "BIGINT"
		}
		return "DOUBLE PRECISION"
	case string:
		return "TEXT"
	default:
		_ = val
		return "TEXT"
	}
}

func inferSQLTypeSQLServer(v interface{}) string {
	switch val := v.(type) {
	case bool:
		return "INT"
	case float64:
		if val == math.Trunc(val) && val >= -9007199254740992 && val <= 9007199254740992 {
			return "BIGINT"
		}
		return "FLOAT"
	case string:
		return "NVARCHAR(MAX)"
	default:
		_ = val
		return "NVARCHAR(MAX)"
	}
}

// autoIncrementDef 返回各数据库类型的自增主键定义片段。
func autoIncrementDef(dbType string) string {
	switch dbType {
	case "postgres":
		return "id BIGSERIAL PRIMARY KEY"
	case "sqlserver":
		return "id BIGINT IDENTITY(1,1) PRIMARY KEY"
	default: // sqlite, mysql
		return "id INTEGER PRIMARY KEY AUTOINCREMENT"
	}
}

// nowExpr 返回各数据库类型的当前时间表达式。
func nowExpr(dbType string) string {
	switch dbType {
	case "postgres":
		return "NOW()"
	case "sqlserver":
		return "GETDATE()"
	default:
		return "CURRENT_TIMESTAMP"
	}
}

// InferCreateTableSQL 根据事件 payload 推断并生成 CREATE TABLE IF NOT EXISTS DDL。
// 始终包含 id（自增主键）和 received_at（入站时间）两个系统列。
// 返回完整 DDL 和业务列名列表（不含系统列 id/received_at）。
func InferCreateTableSQL(dbType, tableName string, payload map[string]interface{}) (ddl string, cols []string) {
	q := dbdriver.QuoteTableIdent(dbType, tableName)
	var defs []string
	defs = append(defs, autoIncrementDef(dbType))

	for k, v := range payload {
		col := sanitizeColName(k)
		if col == "" || col == "id" || col == "received_at" {
			continue
		}
		colType := inferSQLType(dbType, v)
		defs = append(defs, fmt.Sprintf("%s %s", dbdriver.QuoteColumnIdent(dbType, col), colType))
		cols = append(cols, col)
	}

	defs = append(defs, fmt.Sprintf("received_at DATETIME DEFAULT %s", nowExpr(dbType)))

	ddl = fmt.Sprintf("CREATE TABLE IF NOT EXISTS %s (\n  %s\n)", q, strings.Join(defs, ",\n  "))
	return ddl, cols
}

// AlterTableAddColumns 为表新增列（仅新列，已有列跳过）。
// SQLite 不支持多列 ALTER TABLE，逐列循环执行。
// 返回实际新增的列名列表。
func AlterTableAddColumns(db *sql.DB, dbType, tableName string, existingCols []string, payload map[string]interface{}) ([]string, error) {
	existingSet := make(map[string]bool, len(existingCols))
	for _, c := range existingCols {
		existingSet[c] = true
	}

	var added []string
	for k, v := range payload {
		col := sanitizeColName(k)
		if col == "" || col == "id" || col == "received_at" {
			continue
		}
		if existingSet[col] {
			continue
		}
		colType := inferSQLType(dbType, v)
		alterSQL := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s",
			dbdriver.QuoteTableIdent(dbType, tableName),
			dbdriver.QuoteColumnIdent(dbType, col),
			colType,
		)
		if _, err := db.Exec(alterSQL); err != nil {
			// 忽略"列已存在"类错误（并发场景）
			if !isColumnExistsError(err) {
				return added, fmt.Errorf("ALTER TABLE 新增列 %s 失败: %w", col, err)
			}
		} else {
			added = append(added, col)
			existingSet[col] = true
		}
	}
	return added, nil
}

// InsertEventRow 将 payload 按列名插入目标表。
// cols 为当前已知业务列（不含系统列 id/received_at），多余字段忽略，缺失字段填 NULL。
func InsertEventRow(db *sql.DB, dbType, tableName string, cols []string, payload map[string]interface{}) error {
	if len(cols) == 0 {
		return nil
	}
	var colParts []string
	var placeholders []string
	var args []interface{}

	for i, col := range cols {
		colParts = append(colParts, dbdriver.QuoteColumnIdent(dbType, col))
		placeholders = append(placeholders, colPlaceholder(dbType, i+1))
		args = append(args, normalizeInsertValue(payload[col]))
	}

	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		dbdriver.QuoteTableIdent(dbType, tableName),
		strings.Join(colParts, ", "),
		strings.Join(placeholders, ", "),
	)
	_, err := db.Exec(q, args...)
	return err
}

// colPlaceholder 返回各数据库的参数占位符。
func colPlaceholder(dbType string, n int) string {
	switch dbType {
	case "postgres":
		return fmt.Sprintf("$%d", n)
	case "sqlserver":
		return fmt.Sprintf("@p%d", n)
	default:
		return "?"
	}
}

// normalizeInsertValue 将 Go JSON 反序列化值转换为适合 SQL 插入的形式。
func normalizeInsertValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case bool:
		if val {
			return 1
		}
		return 0
	case map[string]interface{}, []interface{}:
		b, err := json.Marshal(val)
		if err != nil {
			return fmt.Sprintf("%v", val)
		}
		return string(b)
	default:
		return v
	}
}

// sanitizeColName 将 payload key 转为合法 SQL 列名（小写，非字母数字替换为 _）。
func sanitizeColName(k string) string {
	var b strings.Builder
	for _, r := range k {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			b.WriteRune(r)
		} else if r >= 'A' && r <= 'Z' {
			b.WriteRune(r + 32) // toLower
		} else {
			b.WriteRune('_')
		}
	}
	s := b.String()
	// 去除前导数字/下划线
	for len(s) > 0 && (s[0] >= '0' && s[0] <= '9') {
		s = s[1:]
	}
	return s
}

// isColumnExistsError 判断错误是否为"列已存在"类错误（各数据库表述不同）。
func isColumnExistsError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate column") ||
		strings.Contains(msg, "column already exists") ||
		strings.Contains(msg, "already exists")
}
