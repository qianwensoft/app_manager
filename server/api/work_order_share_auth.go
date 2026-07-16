package api

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ── 分享链接需登录模式下的工单操作 API ────────────────────────────────────

// checkSharePermission 检查分享链接权限（需登录模式）
func checkSharePermission(c *gin.Context, token string, permissionKey string) (*models.WorkOrderReportShare, error) {
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		return nil, fmt.Errorf("分享链接不存在或已失效")
	}

	if time.Now().After(share.ExpiresAt) {
		return nil, fmt.Errorf("分享链接已过期")
	}

	// 必须是需登录模式
	if share.AuthMode != "login" {
		return nil, fmt.Errorf("此操作仅在需登录模式下可用")
	}

	// 检查用户是否已登录
	userID := c.GetUint("user_id")
	if userID == 0 {
		return nil, fmt.Errorf("需要登录才能执行此操作")
	}

	// 解析权限配置
	var permissions map[string]interface{}
	if share.Permissions != "" {
		json.Unmarshal([]byte(share.Permissions), &permissions)
	}

	// 检查特定权限
	if permissionKey != "" {
		allowed, ok := permissions[permissionKey].(bool)
		if !ok || !allowed {
			return nil, fmt.Errorf("没有权限执行此操作")
		}
	}

	return &share, nil
}

// GetSharedWorkOrderDetail 获取分享工单详情（需登录模式）
func GetSharedWorkOrderDetail(c *gin.Context) {
	token := c.Param("token")
	woID := c.Param("id")

	share, err := checkSharePermission(c, token, "can_view")
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	// 验证工单在分享范围内
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})
	if savedFilters != nil {
		if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
			q = q.Where("type_code = ?", typeCode)
		}
		if status, ok := savedFilters["status"].(string); ok && status != "" {
			q = q.Where("status = ?", status)
		}
		if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
			q = q.Where("device_id = ?", deviceID)
		}
	}

	var count int64
	q.Where("id = ?", woID).Count(&count)
	if count == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "该工单不在分享范围内"})
		return
	}

	// 获取工单详情
	var wo models.WorkOrder
	if err := database.DB.First(&wo, woID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	database.DB.Where("work_order_id = ?", wo.ID).Order("id ASC").Find(&wo.Items)
	database.DB.Where("work_order_id = ?", wo.ID).Order("id DESC").Find(&wo.Activities)

	// 标签
	var links []models.WorkOrderTagLink
	database.DB.Where("work_order_id = ?", wo.ID).Order("tag_code ASC").Find(&links)
	tags := make([]string, 0, len(links))
	for _, l := range links {
		tags = append(tags, l.TagCode)
	}

	type detailRow struct {
		models.WorkOrder
		Tags     []string                  `json:"tags"`
		TagLinks []models.WorkOrderTagLink `json:"tag_links"`
	}
	c.JSON(http.StatusOK, gin.H{"data": detailRow{WorkOrder: wo, Tags: tags, TagLinks: links}})
}

// AddSharedWorkOrderComment 分享工单添加评论（需登录模式）
func AddSharedWorkOrderComment(c *gin.Context) {
	token := c.Param("token")
	woID := c.Param("id")

	share, err := checkSharePermission(c, token, "can_comment")
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	var req struct {
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.TrimSpace(req.Comment) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "评论内容不能为空"})
		return
	}

	// 验证工单在分享范围内
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})
	if savedFilters != nil {
		if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
			q = q.Where("type_code = ?", typeCode)
		}
		if status, ok := savedFilters["status"].(string); ok && status != "" {
			q = q.Where("status = ?", status)
		}
		if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
			q = q.Where("device_id = ?", deviceID)
		}
	}

	var wo models.WorkOrder
	if err := q.Where("id = ?", woID).First(&wo).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "该工单不在分享范围内"})
		return
	}

	// 添加评论活动
	userID := c.GetUint("user_id")
	actor := actorLabel(c)
	addWorkOrderActivity(wo.ID, "comment", wo.Status, wo.Status, userID, actor, req.Comment)

	// 同时创建工单进展记录
	progress := models.WorkOrderProgress{
		WorkOrderID: wo.ID,
		Content:     strings.TrimSpace(req.Comment),
		CreatedBy:   userID,
		CreatorName: actor,
	}
	database.DB.Create(&progress)

	c.JSON(http.StatusOK, gin.H{"message": "评论已添加"})
}

// UpdateSharedWorkOrderStatus 分享工单更新状态（需登录模式）
func UpdateSharedWorkOrderStatus(c *gin.Context) {
	token := c.Param("token")
	woID := c.Param("id")

	share, err := checkSharePermission(c, token, "can_update_status")
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	var req struct {
		Status  string   `json:"status"`
		Comment string   `json:"comment"`
		Tags    []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !workOrderStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}

	// 验证工单在分享范围内
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})
	if savedFilters != nil {
		if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
			q = q.Where("type_code = ?", typeCode)
		}
		if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
			q = q.Where("device_id = ?", deviceID)
		}
	}

	var wo models.WorkOrder
	if err := q.Where("id = ?", woID).First(&wo).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "该工单不在分享范围内"})
		return
	}

	// 更新状态
	userID := c.GetUint("user_id")
	actor := actorLabel(c)
	applyWorkOrderStatus(c, &wo, req.Status, req.Comment, userID, actor)

	// 更新标签（如果提供）
	if req.Tags != nil {
		if err := syncWorkOrderTags(&wo, req.Tags); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "标签更新失败"})
			return
		}
		addWorkOrderActivity(wo.ID, "tag_change", wo.Status, wo.Status, userID, actor, fmt.Sprintf("更新标签：%v", req.Tags))
	}

	c.JSON(http.StatusOK, gin.H{"message": "状态已更新", "data": wo})
}

// UpdateSharedWorkOrderFields 分享工单更新字段（需登录模式）
func UpdateSharedWorkOrderFields(c *gin.Context) {
	token := c.Param("token")
	woID := c.Param("id")

	share, err := checkSharePermission(c, token, "can_update_fields")
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Priority    *string `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证工单在分享范围内
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})
	if savedFilters != nil {
		if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
			q = q.Where("type_code = ?", typeCode)
		}
		if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
			q = q.Where("device_id = ?", deviceID)
		}
	}

	var wo models.WorkOrder
	if err := q.Where("id = ?", woID).First(&wo).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "该工单不在分享范围内"})
		return
	}

	updates := map[string]interface{}{}
	actor := actorLabel(c)
	uid := c.GetUint("user_id")

	// 标题变更
	if req.Title != nil {
		newTitle := strings.TrimSpace(*req.Title)
		if newTitle != "" && newTitle != wo.Title {
			updates["title"] = newTitle
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, fmt.Sprintf("标题：%s → %s", wo.Title, newTitle))
		}
	}

	// 描述变更
	if req.Description != nil {
		newDesc := strings.TrimSpace(*req.Description)
		if newDesc != wo.Description {
			updates["description"] = newDesc
			var detail string
			if wo.Description == "" {
				detail = "添加了工单描述"
			} else if newDesc == "" {
				detail = "清空了工单描述"
			} else {
				detail = "修改了工单描述"
			}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, detail)
		}
	}

	// 优先级变更
	if req.Priority != nil {
		if *req.Priority != wo.Priority {
			updates["priority"] = *req.Priority
			priorityLabels := map[string]string{"normal": "普通", "high": "较高", "urgent": "紧急"}
			oldLabel := priorityLabels[wo.Priority]
			if oldLabel == "" {
				oldLabel = wo.Priority
			}
			newLabel := priorityLabels[*req.Priority]
			if newLabel == "" {
				newLabel = *req.Priority
			}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, fmt.Sprintf("优先级：%s → %s", oldLabel, newLabel))
		}
	}

	if len(updates) > 0 {
		database.DB.Model(&wo).Updates(updates)
		dispatchWorkOrderEvent("work_order.updated", &wo, actor, "")
	}

	c.JSON(http.StatusOK, gin.H{"message": "更新成功", "data": wo})
}
