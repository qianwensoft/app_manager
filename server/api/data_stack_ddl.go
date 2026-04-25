package api

import (
	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ApplyDatasetDDL POST /api/data/datasets/:id/apply-ddl
// 仅限 binding_mode=created_by_dataset 的数据集，允许 CREATE TABLE 和 ALTER TABLE。
// 执行成功后将 DDL 记录到 meta_json.table_binding.ddl_history。
func ApplyDatasetDDL(c *gin.Context) {
	ex, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ds := *ex

	// 仅限 query kind 且 binding_mode=created_by_dataset
	if normalizeDatasetKind(ds.Kind) != "query" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "apply-ddl 仅支持 kind=query 数据集"})
		return
	}
	if !isCreatedByDatasetBinding(ds.MetaJSON) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "apply-ddl 仅支持 binding_mode=created_by_dataset 的数据集（托管建表）"})
		return
	}
	if ds.DataSourceID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据集未绑定数据源"})
		return
	}

	var body struct {
		SQL string `json:"sql"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	parts := splitDDLStatements(body.SQL)
	if len(parts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "sql 不能为空"})
		return
	}

	// 校验：仅允许 CREATE / ALTER
	for _, p := range parts {
		up := strings.ToUpper(strings.TrimSpace(p))
		if !strings.HasPrefix(up, "CREATE") && !strings.HasPrefix(up, "ALTER") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "仅允许 CREATE 或 ALTER 类 DDL"})
			return
		}
	}

	// 查数据源
	var src models.DataSource
	if err := database.DB.First(&src, *ds.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "数据源未找到"})
		return
	}
	if src.IsReadOnly() {
		c.JSON(http.StatusForbidden, gin.H{"error": "数据源为只读，无法执行 DDL"})
		return
	}

	sqlDB, err := dbdriver.OpenDataSource(&src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer sqlDB.Close()

	for _, p := range parts {
		if _, err := sqlDB.Exec(p); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	// 记录 DDL 历史到 meta_json.table_binding.ddl_history
	_ = appendDDLHistory(ds.ID, ds.MetaJSON, body.SQL)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// isCreatedByDatasetBinding 检查 meta_json 中 table_binding.binding_mode 是否为 created_by_dataset。
func isCreatedByDatasetBinding(metaJSON string) bool {
	s := strings.TrimSpace(metaJSON)
	if s == "" {
		return false
	}
	var m struct {
		SQLShape    string `json:"sql_shape"`
		TableBinding *struct {
			BindingMode string `json:"binding_mode"`
		} `json:"table_binding"`
	}
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return false
	}
	if m.TableBinding == nil {
		return false
	}
	return m.TableBinding.BindingMode == "created_by_dataset"
}

// appendDDLHistory 将执行的 DDL 追加到 meta_json.table_binding.ddl_history 中。
func appendDDLHistory(datasetID uint, metaJSON, ddl string) error {
	type ddlRecord struct {
		SQL       string `json:"sql"`
		ExecutedAt string `json:"executed_at"`
	}
	type tableBinding struct {
		BindingMode string      `json:"binding_mode"`
		ObjectName  string      `json:"object_name,omitempty"`
		ObjectKind  string      `json:"object_kind,omitempty"`
		DDLHistory  []ddlRecord `json:"ddl_history,omitempty"`
	}
	type metaEnvelope struct {
		SQLShape     string        `json:"sql_shape,omitempty"`
		TableBinding *tableBinding `json:"table_binding,omitempty"`
	}

	s := strings.TrimSpace(metaJSON)
	var m metaEnvelope
	if s != "" {
		_ = json.Unmarshal([]byte(s), &m)
	}
	if m.TableBinding == nil {
		m.TableBinding = &tableBinding{BindingMode: "created_by_dataset"}
	}
	m.TableBinding.DDLHistory = append(m.TableBinding.DDLHistory, ddlRecord{
		SQL:       ddl,
		ExecutedAt: time.Now().UTC().Format(time.RFC3339),
	})

	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return database.DB.Model(&models.Dataset{}).Where("id = ?", datasetID).
		Update("meta_json", string(b)).Error
}
