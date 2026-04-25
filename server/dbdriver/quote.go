package dbdriver

import (
	"database/sql"
	"fmt"
	"strings"
)

// QuoteTableIdent 表/列标识符引用（与 api/data_stack 一致）。
func QuoteTableIdent(dsType, name string) string {
	switch NormalizeType(dsType) {
	case "mysql":
		return "`" + strings.ReplaceAll(name, "`", "") + "`"
	case "sqlserver":
		esc := strings.ReplaceAll(name, "]", "]]")
		return "[" + esc + "]"
	default:
		return "\"" + strings.ReplaceAll(name, "\"", "") + "\""
	}
}

// QuoteColumnIdent 列名引用。
func QuoteColumnIdent(dsType, name string) string { return QuoteTableIdent(dsType, name) }

// InsertSingleColumnRow 向单列写入一条 JSON/文本（缓冲入站）。
func InsertSingleColumnRow(db *sql.DB, dsType, table, column string, value []byte) error {
	tq := QuoteTableIdent(dsType, table)
	cq := QuoteColumnIdent(dsType, column)
	q := fmt.Sprintf("INSERT INTO %s (%s) VALUES (?)", tq, cq)
	_, err := db.Exec(q, string(value))
	return err
}
