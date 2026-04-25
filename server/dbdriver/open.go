package dbdriver

import (
	"database/sql"
	"fmt"
	"strings"

	"app-manager/models"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	_ "modernc.org/sqlite"
)

// OpenDataSource 打开 SQL 数据源并在 config_json 有池参数时应用 SetMax*。
func OpenDataSource(ds *models.DataSource) (*sql.DB, error) {
	if ds == nil {
		return nil, fmt.Errorf("nil data source")
	}
	t := NormalizeType(ds.Type)
	dsn := strings.TrimSpace(ds.DSN)
	if dsn == "" {
		return nil, fmt.Errorf("empty dsn")
	}
	var db *sql.DB
	var err error
	switch t {
	case "sqlite":
		db, err = sql.Open("sqlite", dsn)
	case "mysql":
		db, err = sql.Open("mysql", dsn)
	case "postgres":
		db, err = sql.Open("postgres", dsn)
	case "sqlserver":
		db, err = sql.Open("sqlserver", dsn)
	default:
		return nil, fmt.Errorf("unsupported data source type: %s (use sqlite, mysql, postgres, sqlserver)", ds.Type)
	}
	if err != nil {
		return nil, err
	}
	ApplyPool(db, ParsePoolFromConfigJSON(ds.ConfigJSON))
	return db, nil
}
