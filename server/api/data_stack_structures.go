package api

import (
	"app-manager/database"
	"app-manager/models"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ListDataStructures GET /api/data/datasets/:id/structures
func ListDataStructures(c *gin.Context) {
	dsEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	var rows []models.DataStructure
	database.DB.Where("dataset_id = ?", dsEx.ID).Order("id ASC").Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// CreateDataStructure POST /api/data/datasets/:id/structures
func CreateDataStructure(c *gin.Context) {
	dsEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	var body models.DataStructure
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "结构编码必填"})
		return
	}
	if err := validateNonEmptyDataStackCode(body.Code, "结构编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var n int64
	database.DB.Model(&models.DataStructure{}).Where("dataset_id = ? AND code = ?", dsEx.ID, body.Code).Count(&n)
	if n > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该数据集下结构编码已存在"})
		return
	}
	body.DatasetID = dsEx.ID
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": body})
}

// UpdateDataStructure PUT /api/data/datasets/:id/structures/:sid
func UpdateDataStructure(c *gin.Context) {
	dsEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	st, err := firstDataStructureUnderDataset(dsEx.ID, c.Param("sid"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "structure not found"})
		return
	}
	var body models.DataStructure
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Code = strings.TrimSpace(body.Code)
	if body.Code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "结构编码不能为空"})
		return
	}
	if err := validateNonEmptyDataStackCode(body.Code, "结构编码"); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var n int64
	database.DB.Model(&models.DataStructure{}).Where("dataset_id = ? AND code = ? AND id <> ?", dsEx.ID, body.Code, st.ID).Count(&n)
	if n > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "结构编码冲突"})
		return
	}
	if err := database.DB.Model(&models.DataStructure{}).Where("id = ?", st.ID).Updates(map[string]interface{}{
		"code":                 body.Code,
		"name":                 body.Name,
		"schema_json":          body.SchemaJSON,
		"default_param_values": body.DefaultParamValues,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteDataStructure DELETE /api/data/datasets/:id/structures/:sid
func DeleteDataStructure(c *gin.Context) {
	dsEx, err := firstDatasetByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "dataset not found"})
		return
	}
	st, err := firstDataStructureUnderDataset(dsEx.ID, c.Param("sid"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "structure not found"})
		return
	}
	var cnt int64
	database.DB.Model(&models.DataInterface{}).Where("data_structure_id = ?", st.ID).Count(&cnt)
	if cnt > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仍有数据接口引用该结构，请先解除引用"})
		return
	}
	database.DB.Delete(&models.DataStructure{}, st.ID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func firstDataStructureUnderDataset(datasetID uint, key string) (*models.DataStructure, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var st models.DataStructure
	q := database.DB.Where("dataset_id = ?", datasetID)
	if id, err := strconv.ParseUint(key, 10, 32); err == nil {
		if err := q.Where("id = ?", uint(id)).First(&st).Error; err != nil {
			return nil, err
		}
		return &st, nil
	}
	if err := q.Where("code = ?", key).First(&st).Error; err != nil {
		return nil, err
	}
	return &st, nil
}
