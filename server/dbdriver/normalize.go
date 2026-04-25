package dbdriver

import "strings"

// NormalizeType maps UI / 常见拼写别名到内部统一类型：sqlite | mysql | postgres | sqlserver
func NormalizeType(raw string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	switch t {
	case "", "sqlite", "sqllite":
		return "sqlite"
	case "mysql", "mariadb":
		return "mysql"
	case "postgres", "postgresql", "pgsql", "postgree", "postgre":
		return "postgres"
	case "sqlserver", "mssql", "sql_server", "microsoftsqlserver":
		return "sqlserver"
	default:
		return t
	}
}
