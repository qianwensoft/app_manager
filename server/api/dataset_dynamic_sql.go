package api

import (
	"database/sql"
	"fmt"
	"strings"

	"app-manager/dbdriver"
)

// StripMissingOptionalBlocks 移除 SQL 中标记为可选且参数缺失的条件块（兼容旧 /*? ... ?*/ 写法）。
// 新写法无需显式标记：{{name}} 天生可选，缺失即自动剔除所在子句（见 dbdriver.StripMissingClauses）。
func StripMissingOptionalBlocks(sqlStr string, params map[string]interface{}) string {
	if params == nil {
		params = map[string]interface{}{}
	}
	return dbdriver.StripMissingClauses(sqlStr, params)
}

// RewriteNamedSQLParamsOptional 支持可选参数的 SQL 参数化。
// {{name}} 缺失时自动剔除（条件子句 / INSERT 列值对），由 RewriteNamedSQLParams 统一处理。
func RewriteNamedSQLParamsOptional(dialect string, sqlStr string, params map[string]interface{}) (outSQL string, args []interface{}, err error) {
	return RewriteNamedSQLParams(dialect, sqlStr, params)
}

// QueryDatasetSQLOptional 执行支持可选参数的查询。
func QueryDatasetSQLOptional(db interface{}, dialect, sqlStr string, params map[string]interface{}, limit int) ([]map[string]interface{}, string, []interface{}, error) {
	sqlStr = strings.TrimSpace(sqlStr)
	if sqlStr == "" {
		return nil, "", nil, fmt.Errorf("empty sql")
	}
	if params == nil {
		params = map[string]interface{}{}
	}

	// 使用可选参数版本
	used, args, err := RewriteNamedSQLParamsOptional(dialect, sqlStr, params)
	if err != nil {
		return nil, "", nil, err
	}

	// 执行查询（复用原有逻辑）
	return executeQuery(db, used, args, limit)
}

// executeQuery 执行实际的数据库查询（从 QueryDatasetSQL 中提取）
func executeQuery(db interface{}, sqlStr string, args []interface{}, limit int) ([]map[string]interface{}, string, []interface{}, error) {
	// 实际实现应该在 QueryDatasetSQLOptional 中直接调用原有的 db.Query 逻辑
	// 这里仅作为接口示例
	return nil, sqlStr, args, fmt.Errorf("需要在调用处实现具体查询逻辑")
}

// QueryDatasetSQLDynamic 完整实现：支持动态 SQL 的查询执行（直接操作 *sql.DB）
// 这是对 QueryDatasetSQL 的增强版本，添加了可选参数支持
func QueryDatasetSQLDynamic(db *sql.DB, dialect, sqlStr string, params map[string]interface{}, limit int) ([]map[string]interface{}, string, []interface{}, error) {
	sqlStr = strings.TrimSpace(sqlStr)
	if sqlStr == "" {
		return nil, "", nil, fmt.Errorf("empty sql")
	}
	if params == nil {
		params = map[string]interface{}{}
	}

	// 使用可选参数处理
	used, args, err := RewriteNamedSQLParamsOptional(dialect, sqlStr, params)
	if err != nil {
		return nil, "", nil, err
	}

	// 执行查询
	var rows *sql.Rows
	if len(args) > 0 {
		rows, err = db.Query(used, args...)
	} else {
		rows, err = db.Query(used)
	}
	if err != nil {
		return nil, used, args, err
	}
	defer rows.Close()

	out, scanErr := ScanSQLRowsLimited(rows, limit)
	return out, used, args, scanErr
}
