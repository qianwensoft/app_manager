package api

import (
	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetDataSourcePoolStats GET /api/data/sources/:id/pool-stats
// 返回数据源连接池的实时统计信息（若首次访问则建立连接池）。
func GetDataSourcePoolStats(c *gin.Context) {
	ex, err := firstDataSourceByRouteKey(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	ds := *ex

	// 尝试从注册表获取或新建单例连接池
	db, err := dbdriver.OpenOrGetPooled(&ds)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stats := db.Stats()

	// 解析 config_json 中配置的池参数
	poolCfg := dbdriver.ParsePoolFromConfigJSON(ds.ConfigJSON)

	c.JSON(http.StatusOK, gin.H{
		"open_connections":   stats.OpenConnections,
		"in_use":             stats.InUse,
		"idle":               stats.Idle,
		"wait_count":         stats.WaitCount,
		"wait_duration_ms":   stats.WaitDuration.Milliseconds(),
		"max_idle_closed":    stats.MaxIdleClosed,
		"max_lifetime_closed": stats.MaxLifetimeClosed,
		"config_max_open":    poolCfg.MaxOpen,
		"config_max_idle":    poolCfg.MaxIdle,
		"config_max_lifetime_sec": poolCfg.ConnMaxLifetime,
	})
}

// poolMetaFromConfigJSON 从 config_json 提取连接池配置（供前端展示）
func poolMetaFromConfigJSON(configJSON string) map[string]interface{} {
	var m map[string]interface{}
	if configJSON == "" {
		return m
	}
	_ = json.Unmarshal([]byte(configJSON), &m)
	return m
}

// evictDataSourcePool 在数据源更新/删除时清除连接池缓存
func evictDataSourcePool(ds *models.DataSource) {
	if ds != nil {
		dbdriver.EvictFromPool(ds.ID)
	}
}

// listDataSourcesWithPoolStatus GET /api/data/sources（附带已有连接池状态快照）
// 用于前端列表页区分哪些数据源当前有活跃连接。
func listDataSourcesWithPoolStatus() func(c *gin.Context) {
	return func(c *gin.Context) {
		var rows []models.DataSource
		database.DB.Order("id DESC").Find(&rows)

		type row struct {
			models.DataSource
			HasPool bool `json:"has_pool"`
		}
		out := make([]row, len(rows))
		for i, r := range rows {
			_, hasPool := dbdriver.GetPoolStats(r.ID)
			out[i] = row{DataSource: r, HasPool: hasPool}
		}
		c.JSON(http.StatusOK, gin.H{"data": out})
	}
}
