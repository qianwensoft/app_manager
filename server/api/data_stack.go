package api

import (
	"app-manager/auth"
	"app-manager/database"
	"app-manager/models"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	_ "github.com/go-sql-driver/mysql"
	_ "modernc.org/sqlite"
)

// --- DataSource ---

func ListDataSources(c *gin.Context) {
	var rows []models.DataSource
	database.DB.Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataSource(c *gin.Context) {
	var body models.DataSource
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataSource(c *gin.Context) {
	id := c.Param("id")
	var body models.DataSource
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&models.DataSource{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name": body.Name, "type": body.Type, "dsn": body.DSN, "config_json": body.ConfigJSON, "read_only": body.ReadOnly,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataSource(c *gin.Context) {
	database.DB.Delete(&models.DataSource{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func TestDataSource(c *gin.Context) {
	id := c.Param("id")
	var ds models.DataSource
	if err := database.DB.First(&ds, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	db, err := openSQLDataSource(&ds)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func openSQLDataSource(ds *models.DataSource) (*sql.DB, error) {
	t := strings.ToLower(strings.TrimSpace(ds.Type))
	switch t {
	case "sqlite", "":
		dsn := strings.TrimSpace(ds.DSN)
		if dsn == "" {
			return nil, fmt.Errorf("empty dsn")
		}
		return sql.Open("sqlite", dsn)
	case "mysql":
		return sql.Open("mysql", ds.DSN)
	default:
		return nil, fmt.Errorf("unsupported data source type: %s", ds.Type)
	}
}

// --- Dataset ---

func ListDatasets(c *gin.Context) {
	var rows []models.Dataset
	database.DB.Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataset(c *gin.Context) {
	var body models.Dataset
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Kind == "" {
		body.Kind = "query"
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataset(c *gin.Context) {
	id := c.Param("id")
	var body models.Dataset
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&models.Dataset{}).Where("id = ?", id).Updates(map[string]interface{}{
		"data_source_id": body.DataSourceID,
		"name":           body.Name,
		"kind":           body.Kind,
		"definition":     body.Definition,
		"steps_json":     body.StepsJSON,
		"param_schema":   body.ParamSchema,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataset(c *gin.Context) {
	database.DB.Delete(&models.Dataset{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// PreviewDataset 管理端预览（参数 JSON body）
func PreviewDataset(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		ParamsJSON string `json:"param_values"`
		Limit      int    `json:"limit"`
	}
	_ = c.ShouldBindJSON(&body)
	if body.Limit <= 0 || body.Limit > 5000 {
		body.Limit = 500
	}
	var ds models.Dataset
	if err := database.DB.First(&ds, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if ds.Kind != "query" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only query datasets"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset has no data_source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	sqlStr := strings.TrimSpace(ds.Definition)
	if sqlStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty definition"})
		return
	}
	rows, err := db.Query(sqlStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]interface{}{}
	n := 0
	for rows.Next() && n < body.Limit {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		row := map[string]interface{}{}
		for i, col := range cols {
			row[col] = vals[i]
		}
		out = append(out, row)
		n++
	}
	b, _ := json.Marshal(out)
	c.JSON(http.StatusOK, gin.H{"data": string(b)})
}

// --- DataInterfaceGroup ---

func ListDataInterfaceGroups(c *gin.Context) {
	var rows []models.DataInterfaceGroup
	database.DB.Order("sort_order ASC, id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataInterfaceGroup(c *gin.Context) {
	var body models.DataInterfaceGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Create(&body)
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataInterfaceGroup(c *gin.Context) {
	var body models.DataInterfaceGroup
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&models.DataInterfaceGroup{}).Where("id = ?", c.Param("id")).Updates(map[string]interface{}{
		"name": body.Name, "sort_order": body.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataInterfaceGroup(c *gin.Context) {
	database.DB.Delete(&models.DataInterfaceGroup{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- DataInterface ---

func ListDataInterfaces(c *gin.Context) {
	q := database.DB.Model(&models.DataInterface{})
	if g := c.Query("group_id"); g != "" {
		q = q.Where("group_id = ?", g)
	}
	if cat := c.Query("category"); cat != "" {
		q = q.Where("category = ?", cat)
	}
	var rows []models.DataInterface
	q.Order("id DESC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateDataInterface(c *gin.Context) {
	var body models.DataInterface
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Slug == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug required"})
		return
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateDataInterface(c *gin.Context) {
	id := c.Param("id")
	var body models.DataInterface
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Model(&models.DataInterface{}).Where("id = ?", id).Updates(map[string]interface{}{
		"group_id": body.GroupID, "category": body.Category, "name": body.Name, "slug": body.Slug,
		"kind": body.Kind, "dataset_id": body.DatasetID, "method": body.Method, "enabled": body.Enabled,
		"required_scopes": body.RequiredScopes,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func DeleteDataInterface(c *gin.Context) {
	database.DB.Delete(&models.DataInterface{}, c.Param("id"))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func openScopeAllows(c *gin.Context, scope string) bool {
	v, _ := c.Get("open_scope_set")
	sm, _ := v.(map[string]struct{})
	return auth.ScopeSetAllows(sm, scope)
}

// OpenDataInterfaceInvoke 开放 API：按 slug 执行数据接口（X-API-Key）
func OpenDataInterfaceInvoke(c *gin.Context) {
	slug := c.Param("slug")
	var iface models.DataInterface
	if err := database.DB.Where("slug = ? AND enabled = ?", slug, true).First(&iface).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	need := auth.OpenDataInterfaceQuery
	if iface.Kind == "transaction" {
		need = auth.OpenDataInterfaceWrite
	}
	if !openScopeAllows(c, need) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden: missing scope " + need})
		return
	}
	if iface.RequiredScopes != "" {
		var required []string
		_ = json.Unmarshal([]byte(iface.RequiredScopes), &required)
		set, _ := c.Get("open_scope_set")
		sm, _ := set.(map[string]struct{})
		if sm != nil {
			for _, s := range required {
				if _, ok := sm[s]; !ok {
					c.JSON(http.StatusForbidden, gin.H{"error": "missing scope " + s})
					return
				}
			}
		}
	}
	if iface.Kind == "query" {
		previewDatasetByID(c, iface.DatasetID, 1000)
		return
	}
	// transaction: simplified — run steps in tx
	var ds models.Dataset
	if err := database.DB.First(&ds, iface.DatasetID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset missing"})
		return
	}
	if ds.Kind != "transaction" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "dataset not transaction"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	if dsSrc.ReadOnly {
		c.JSON(http.StatusForbidden, gin.H{"error": "read-only data source"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	var steps []string
	if err := json.Unmarshal([]byte(ds.StepsJSON), &steps); err != nil || len(steps) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid steps_json"})
		return
	}
	tx, err := db.Begin()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, s := range steps {
		if _, err := tx.Exec(s); err != nil {
			_ = tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func previewDatasetByID(c *gin.Context, datasetID uint, limit int) {
	var ds models.Dataset
	if err := database.DB.First(&ds, datasetID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	var dsSrc models.DataSource
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no data source"})
		return
	}
	if err := database.DB.First(&dsSrc, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source missing"})
		return
	}
	db, err := openSQLDataSource(&dsSrc)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer db.Close()
	rows, err := db.Query(ds.Definition)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	out := []map[string]interface{}{}
	n := 0
	for rows.Next() && n < limit {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			break
		}
		row := map[string]interface{}{}
		for i, col := range cols {
			row[col] = vals[i]
		}
		out = append(out, row)
		n++
	}
	b, _ := json.Marshal(out)
	c.JSON(http.StatusOK, gin.H{"data": string(b)})
}
