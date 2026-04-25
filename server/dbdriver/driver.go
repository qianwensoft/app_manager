package dbdriver

import (
	"database/sql"

	"app-manager/models"
)

// SQLDriver 统一 SQL 数据源：连接池、列表明、列元数据（新增库种时在此扩展）。
type SQLDriver struct{}

// DefaultSQL 全局默认实现。
var DefaultSQL = SQLDriver{}

func (SQLDriver) Open(ds *models.DataSource) (*sql.DB, error) { return OpenDataSource(ds) }

func (SQLDriver) ListTables(db *sql.DB, dsType string) ([]string, error) {
	return ListTables(db, dsType)
}

func (SQLDriver) ListColumns(db *sql.DB, dsType, table string) ([]ColumnInfo, error) {
	return ListColumns(db, dsType, table)
}

func (SQLDriver) NormalizeType(raw string) string { return NormalizeType(raw) }
