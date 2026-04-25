package dbdriver

import (
	"database/sql"
	"fmt"
	"strings"
)

// ColumnInfo 表列元数据（供同步结构 / 参数推荐）。
type ColumnInfo struct {
	Name          string `json:"name"`
	DataType      string `json:"data_type"`
	Nullable      bool   `json:"nullable"`
	PrimaryKey    bool   `json:"primary_key,omitempty"`
	AutoIncrement bool   `json:"auto_increment,omitempty"`
	DefaultExpr   string `json:"default_expr,omitempty"`
}

// ListColumns 返回表或视图的列信息；table 须已通过安全校验（字母数字下划线）。
func ListColumns(db *sql.DB, dsType, table string) ([]ColumnInfo, error) {
	t := NormalizeType(dsType)
	switch t {
	case "sqlite":
		esc := strings.ReplaceAll(table, "'", "''")
		rows, err := db.Query("PRAGMA table_info('" + esc + "')")
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []ColumnInfo
		for rows.Next() {
			var cid int
			var name, typ string
			var notnull, pk int
			var dflt sql.NullString
			if err := rows.Scan(&cid, &name, &typ, &notnull, &dflt, &pk); err != nil {
				return nil, err
			}
			autoInc := pk == 1 && strings.EqualFold(typ, "INTEGER")
			out = append(out, ColumnInfo{
				Name:          name,
				DataType:      typ,
				Nullable:      notnull == 0,
				PrimaryKey:    pk == 1,
				AutoIncrement: autoInc,
				DefaultExpr:   dflt.String,
			})
		}
		return out, rows.Err()
	case "mysql":
		q := `SELECT COLUMN_NAME, DATA_TYPE,
CASE WHEN IS_NULLABLE='YES' THEN 1 ELSE 0 END,
CASE WHEN COLUMN_KEY='PRI' THEN 1 ELSE 0 END,
CASE WHEN EXTRA LIKE '%auto_increment%' THEN 1 ELSE 0 END,
COALESCE(COLUMN_DEFAULT, '')
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`
		rows, err := db.Query(q, table)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanColumnRows(rows)
	case "postgres":
		q := `SELECT column_name, data_type,
CASE WHEN is_nullable='YES' THEN 1 ELSE 0 END,
COALESCE((SELECT 1 FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY' AND kcu.column_name=columns.column_name LIMIT 1),0),
CASE WHEN column_default LIKE 'nextval(%' THEN 1 ELSE 0 END,
COALESCE(column_default, '')
FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`
		rows, err := db.Query(q, table)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanColumnRows(rows)
	case "sqlserver":
		q := fmt.Sprintf(`SELECT c.name, t.name,
CASE WHEN c.is_nullable=1 THEN 1 ELSE 0 END,
CASE WHEN EXISTS (SELECT 1 FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.object_id=c.object_id AND i.is_primary_key=1 AND ic.column_id=c.column_id) THEN 1 ELSE 0 END,
CASE WHEN c.is_identity=1 THEN 1 ELSE 0 END,
COALESCE(OBJECT_DEFINITION(c.default_object_id), '')
FROM sys.columns c INNER JOIN sys.types t ON c.user_type_id=t.user_type_id
WHERE c.object_id=OBJECT_ID(N'dbo.%s') ORDER BY c.column_id`, table)
		rows, err := db.Query(q)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanColumnRows(rows)
	default:
		return nil, fmt.Errorf("unsupported data source type: %s", t)
	}
}

func scanColumnRows(rows *sql.Rows) ([]ColumnInfo, error) {
	var out []ColumnInfo
	for rows.Next() {
		var name, dataType, defaultExpr string
		var nullInt, pkInt, aiInt int
		if err := rows.Scan(&name, &dataType, &nullInt, &pkInt, &aiInt, &defaultExpr); err != nil {
			return nil, err
		}
		out = append(out, ColumnInfo{
			Name:          name,
			DataType:      dataType,
			Nullable:      nullInt != 0,
			PrimaryKey:    pkInt != 0,
			AutoIncrement: aiInt != 0,
			DefaultExpr:   defaultExpr,
		})
	}
	return out, rows.Err()
}
