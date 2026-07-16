package api

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

// ── 工单标签 API ───────────────────────────────────────────────────────────

// ListWorkOrderTagDict 标签字典（启用项），供 web 处理端与 app 选择用（两端）。
func ListWorkOrderTagDict(c *gin.Context) {
	var tags []models.WorkOrderTag
	database.DB.Where("enabled = ?", true).Order("sort_order ASC, id ASC").Find(&tags)
	c.JSON(http.StatusOK, gin.H{"data": tags})
}

// ListWorkOrderTags 标签字典全量（管理端）。
func ListWorkOrderTags(c *gin.Context) {
	var tags []models.WorkOrderTag
	database.DB.Order("sort_order ASC, id ASC").Find(&tags)
	c.JSON(http.StatusOK, gin.H{"data": tags})
}

// CreateWorkOrderTag 新建标签。
func CreateWorkOrderTag(c *gin.Context) {
	var req models.WorkOrderTag
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Code = strings.TrimSpace(req.Code)
	req.Name = strings.TrimSpace(req.Name)
	if req.Code == "" || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code and name are required"})
		return
	}
	req.ID = 0
	if err := database.DB.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": req})
}

// UpdateWorkOrderTag 改标签（name/color/enabled/sort_order；code 不可改）。
func UpdateWorkOrderTag(c *gin.Context) {
	var tag models.WorkOrderTag
	if err := database.DB.First(&tag, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		Enabled   *bool   `json:"enabled"`
		SortOrder *int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = strings.TrimSpace(*req.Name)
	}
	if req.Color != nil {
		updates["color"] = *req.Color
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if len(updates) > 0 {
		database.DB.Model(&tag).Updates(updates)
	}
	c.JSON(http.StatusOK, gin.H{"data": tag})
}

// DeleteWorkOrderTag 删标签字典项（已挂载的 link 一并清理）。
func DeleteWorkOrderTag(c *gin.Context) {
	var tag models.WorkOrderTag
	if err := database.DB.First(&tag, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Where("tag_code = ?", tag.Code).Delete(&models.WorkOrderTagLink{})
	database.DB.Delete(&tag)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"ok": true}})
}

// workOrderTagCodes 取某工单当前标签 code 列表。
func workOrderTagCodes(woID uint) []string {
	var links []models.WorkOrderTagLink
	database.DB.Where("work_order_id = ?", woID).Find(&links)
	codes := make([]string, 0, len(links))
	for _, l := range links {
		codes = append(codes, l.TagCode)
	}
	sort.Strings(codes)
	return codes
}

// SetWorkOrderTags 全量覆盖某工单的标签，并把变更记入时间线。
// 挂在 woRuntime 组：web(JWT) 与 app(device-token) 共用；device-token 须校验工单归属。
func SetWorkOrderTags(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// device-token 提交端：仅可维护本设备工单（与 GetMyWorkOrder/ChangeMyWorkOrderStatus 一致）。
	if deviceID := c.GetUint("device_id"); deviceID > 0 && wo.DeviceID != deviceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		Tags []string `json:"tags"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 规整入参：去空去重
	want := map[string]bool{}
	for _, t := range req.Tags {
		t = strings.TrimSpace(t)
		if t != "" {
			want[t] = true
		}
	}
	old := map[string]bool{}
	for _, code := range workOrderTagCodes(wo.ID) {
		old[code] = true
	}
	var added, removed []string
	for code := range want {
		if !old[code] {
			added = append(added, code)
		}
	}
	for code := range old {
		if !want[code] {
			removed = append(removed, code)
		}
	}
	if len(added) == 0 && len(removed) == 0 {
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"tags": workOrderTagCodes(wo.ID)}})
		return
	}
	// 重建关联：挂载时把当前字典名称作为快照一起写入。
	nameByCode := map[string]string{}
	if len(added) > 0 {
		var tags []models.WorkOrderTag
		database.DB.Where("code IN ?", added).Find(&tags)
		for _, t := range tags {
			nameByCode[t.Code] = t.Name
		}
	}
	for _, code := range added {
		database.DB.Create(&models.WorkOrderTagLink{
			WorkOrderID: wo.ID, TagCode: code, TagName: nameByCode[code], CreatedAt: time.Now(),
		})
	}
	for _, code := range removed {
		database.DB.Where("work_order_id = ? AND tag_code = ?", wo.ID, code).Delete(&models.WorkOrderTagLink{})
	}
	// 记时间线（中文摘要，标签名优先）
	sort.Strings(added)
	sort.Strings(removed)
	detail := tagChangeDetail(added, removed)
	addWorkOrderActivity(wo.ID, "tag_change", wo.Status, wo.Status, c.GetUint("user_id"), actorLabel(c), detail)

	// 触发标签变更事件
	dispatchWorkOrderEvent("work_order.tags_changed", &wo, actorLabel(c), detail)

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"tags": workOrderTagCodes(wo.ID)}})
}

// tagChangeDetail 把新增/移除的标签 code 映射为名称，拼成「+紧急 +误报 -待定」式摘要。
func tagChangeDetail(added, removed []string) string {
	nameOf := map[string]string{}
	codes := append(append([]string{}, added...), removed...)
	if len(codes) > 0 {
		var tags []models.WorkOrderTag
		database.DB.Where("code IN ?", codes).Find(&tags)
		for _, t := range tags {
			nameOf[t.Code] = t.Name
		}
	}
	label := func(code string) string {
		if n := nameOf[code]; n != "" {
			return n
		}
		return code
	}
	var parts []string
	for _, c := range added {
		parts = append(parts, "+"+label(c))
	}
	for _, c := range removed {
		parts = append(parts, "-"+label(c))
	}
	return strings.Join(parts, " ")
}

// syncWorkOrderTags 同步工单标签（内部函数，供分享页等场景复用）
func syncWorkOrderTags(wo *models.WorkOrder, tags []string) error {
	// 规整入参：去空去重
	want := map[string]bool{}
	for _, t := range tags {
		t = strings.TrimSpace(t)
		if t != "" {
			want[t] = true
		}
	}
	old := map[string]bool{}
	for _, code := range workOrderTagCodes(wo.ID) {
		old[code] = true
	}
	var added, removed []string
	for code := range want {
		if !old[code] {
			added = append(added, code)
		}
	}
	for code := range old {
		if !want[code] {
			removed = append(removed, code)
		}
	}
	if len(added) == 0 && len(removed) == 0 {
		return nil
	}
	// 重建关联：挂载时把当前字典名称作为快照一起写入
	nameByCode := map[string]string{}
	if len(added) > 0 {
		var tagModels []models.WorkOrderTag
		database.DB.Where("code IN ?", added).Find(&tagModels)
		for _, t := range tagModels {
			nameByCode[t.Code] = t.Name
		}
	}
	for _, code := range added {
		database.DB.Create(&models.WorkOrderTagLink{
			WorkOrderID: wo.ID, TagCode: code, TagName: nameByCode[code], CreatedAt: time.Now(),
		})
	}
	for _, code := range removed {
		database.DB.Where("work_order_id = ? AND tag_code = ?", wo.ID, code).Delete(&models.WorkOrderTagLink{})
	}
	return nil
}
