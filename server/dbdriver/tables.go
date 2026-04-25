package dbdriver

import (
	"database/sql"
	"fmt"
)

// ListTables 列出用户表与视图名（供数据集「固定表/视图」绑定）。
func ListTables(db *sql.DB, dsType string) ([]string, error) {
	t := NormalizeType(dsType)
	var names []string
	switch t {
	case "mysql":
		q := `SELECT TABLE_NAME FROM information_schema.tables
			WHERE table_schema = DATABASE() AND table_type IN ('BASE TABLE','VIEW')
			ORDER BY TABLE_NAME`
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				break
			}
			if name != "" {
				names = append(names, name)
			}
		}
		return names, rows.Err()
	case "sqlite":
		q := `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				break
			}
			if n != "" {
				names = append(names, n)
			}
		}
		return names, rows.Err()
	case "postgres":
		q := `SELECT table_name FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type IN ('BASE TABLE','VIEW')
			ORDER BY table_name`
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				break
			}
			if n != "" {
				names = append(names, n)
			}
		}
		return names, rows.Err()
	case "sqlserver":
		q := `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
			WHERE TABLE_SCHEMA = 'dbo' AND TABLE_TYPE IN ('BASE TABLE','VIEW')
			ORDER BY TABLE_NAME`
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			var n string
			if err := rows.Scan(&n); err != nil {
				break
			}
			if n != "" {
				names = append(names, n)
			}
		}
		return names, rows.Err()
	default:
		return nil, fmt.Errorf("unsupported data source type: %s", t)
	}
}
