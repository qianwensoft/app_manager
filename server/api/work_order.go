package api

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"app-manager/agent"
	"app-manager/barcode"
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"app-manager/workflow"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

// ── 工单（问题反馈）API ────────────────────────────────────────────────────

var workOrderStatuses = map[string]bool{
	"open": true, "in_progress": true, "resolved": true, "closed": true, "reopened": true,
}

// genWorkOrderCode 生成工单编号：类型编码 + 日期(YYMMDD) + 4位流水号。
// 例如：typeCode="Y" → Y2606220001
// typeCode 为空时使用 "WO" 作为默认前缀。
func genWorkOrderCode(typeCode string) string {
	prefix := typeCode
	if prefix == "" {
		prefix = "WO"
	}
	today := time.Now().Format("060102") // YYMMDD
	codePrefix := prefix + today

	// 查询当天该类型已有的最大流水号
	var lastCode string
	err := database.DB.Model(&models.WorkOrder{}).
		Where("code LIKE ?", codePrefix+"%").
		Order("code DESC").
		Limit(1).
		Pluck("code", &lastCode).Error

	seq := 1
	if err == nil && lastCode != "" && len(lastCode) >= len(codePrefix)+4 {
		// 提取后4位流水号
		seqStr := lastCode[len(codePrefix) : len(codePrefix)+4]
		if n, err := strconv.Atoi(seqStr); err == nil {
			seq = n + 1
		}
	}

	return fmt.Sprintf("%s%04d", codePrefix, seq)
}

// normalizeCodes 规整「其他编码」：按逗号拆分、去空白、去重，再用逗号拼接。
// 兼容中英文逗号与换行（扫码/识别可能带入）。
func normalizeCodes(raw string) string {
	if strings.TrimSpace(raw) == "" {
		return ""
	}
	repl := strings.NewReplacer("，", ",", "\n", ",", "\r", ",", ";", ",", "；", ",")
	parts := strings.Split(repl.Replace(raw), ",")
	seen := make(map[string]bool, len(parts))
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		s := strings.TrimSpace(p)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return strings.Join(out, ",")
}

// actorLabel 取上下文里的用户名；device 提交时返回设备标识。
func actorLabel(c *gin.Context) string {
	if u := strings.TrimSpace(c.GetString("username")); u != "" {
		return u
	}
	if did := c.GetUint("device_id"); did > 0 {
		return fmt.Sprintf("设备#%d", did)
	}
	return "系统"
}

// ListWorkOrders 列表（分页 + 过滤）。非 admin 仅见 public 或与自己相关的工单。
func ListWorkOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 20
	}

	q := database.DB.Model(&models.WorkOrder{})
	// 归档过滤：默认仅未归档；archived=1 时仅归档（独立归档页）。
	if c.Query("archived") == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if t := c.Query("type_code"); t != "" {
		q = q.Where("type_code = ?", t)
	}
	if d := c.Query("device_id"); d != "" {
		q = q.Where("device_id = ?", d)
	}
	if a := c.Query("assigned_to"); a != "" {
		q = q.Where("assigned_to = ?", a)
	}
	if v := c.Query("visibility"); v != "" {
		q = q.Where("visibility = ?", v)
	}
	if bn := strings.TrimSpace(c.Query("business_no")); bn != "" {
		q = q.Where("business_no LIKE ?", "%"+bn+"%")
	}
	// 标签多选筛选：命中任一选中标签即可（OR 语义），用 link 表子查询避免 join 去重。
	if t := strings.TrimSpace(c.Query("tags")); t != "" {
		codes := make([]string, 0)
		for _, p := range strings.Split(t, ",") {
			if s := strings.TrimSpace(p); s != "" {
				codes = append(codes, s)
			}
		}
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}
	// 关键词搜索：OR 查询工单编号、业务单号、其他编码、标题、描述。
	if searchKey := strings.TrimSpace(c.Query("search_key")); searchKey != "" {
		pattern := "%" + searchKey + "%"
		q = q.Where("code LIKE ? OR business_no LIKE ? OR other_codes LIKE ? OR title LIKE ? OR description LIKE ?",
			pattern, pattern, pattern, pattern, pattern)
	}

	// 非管理员：仅公开 或 自己创建/被指派的工单。
	if c.GetString("role") != "admin" {
		uid := c.GetUint("user_id")
		q = q.Where("visibility = ? OR created_by = ? OR assigned_to = ?", "public", uid, uid)
	}

	var total int64
	q.Count(&total)

	var rows []models.WorkOrder
	q.Order("id DESC").Offset((page - 1) * limit).Limit(limit).Find(&rows)

	// 批量补标签（避免逐行查询）：一次取本页所有工单的 link，按工单聚合。
	ids := make([]uint, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	tagsByWO := map[uint][]string{}
	if len(ids) > 0 {
		var links []models.WorkOrderTagLink
		database.DB.Where("work_order_id IN ?", ids).Find(&links)
		for _, l := range links {
			tagsByWO[l.WorkOrderID] = append(tagsByWO[l.WorkOrderID], l.TagCode)
		}
	}
	type listRow struct {
		models.WorkOrder
		Tags []string `json:"tags"`
	}
	out := make([]listRow, 0, len(rows))
	for i := range rows {
		t := tagsByWO[rows[i].ID]
		if t == nil {
			t = []string{}
		}
		out = append(out, listRow{WorkOrder: rows[i], Tags: t})
	}
	c.JSON(http.StatusOK, gin.H{"data": out, "total": total, "page": page, "limit": limit})
}

// GetWorkOrder 详情（含 items + activities + tags）。
func GetWorkOrder(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Where("work_order_id = ?", wo.ID).Order("id ASC").Find(&wo.Items)
	database.DB.Where("work_order_id = ?", wo.ID).Order("id DESC").Find(&wo.Activities)
	// 标签：tags 为 code 列表（与列表/看板一致），tag_links 含名称快照供详情展示。
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

// CreateWorkOrder 创建工单（Agent device-token 或登录用户）。
func CreateWorkOrder(c *gin.Context) {
	var req struct {
		TypeCode    string   `json:"type_code"`
		DeviceID    uint     `json:"device_id"`
		Title       string   `json:"title"`
		Description string   `json:"description"`
		Priority    string   `json:"priority"`
		BusinessNo  string   `json:"business_no"`
		DataJSON    string   `json:"data_json"`
		OtherCodes  string   `json:"other_codes"`
		Tags        []string `json:"tags"` // 支持创建时直接挂标签
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	deviceID := req.DeviceID
	if deviceID == 0 {
		deviceID = c.GetUint("device_id") // device-token 提交
	}
	priority := req.Priority
	if priority == "" {
		priority = "normal"
	}
	wo := models.WorkOrder{
		Code:        genWorkOrderCode(req.TypeCode),
		TypeCode:    req.TypeCode,
		DeviceID:    deviceID,
		Title:       strings.TrimSpace(req.Title),
		Description: req.Description,
		Status:      "open",
		Priority:    priority,
		BusinessNo:  strings.TrimSpace(req.BusinessNo),
		Visibility:  "private",
		DataJSON:    req.DataJSON,
		OtherCodes:  normalizeCodes(req.OtherCodes),
		CreatedBy:   c.GetUint("user_id"),
	}
	// 设备信息快照：以服务端权威设备记录为准，冻结提交时刻的名称/别名/分组。
	if deviceID > 0 {
		var dev models.Device
		if err := database.DB.Select("name", "server_alias", "agent_alias", "group_name").First(&dev, deviceID).Error; err == nil {
			wo.DeviceName = dev.Name
			wo.DeviceAliasServer = dev.ServerAlias
			wo.DeviceAliasAgent = dev.AgentAlias
			wo.DeviceGroup = dev.GroupName
		}
	}
	if err := database.DB.Create(&wo).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 创建时挂载标签（如果有）
	if len(req.Tags) > 0 {
		attachInitialTags(wo.ID, req.Tags)
	}

	addWorkOrderActivity(wo.ID, "create", "", "open", c.GetUint("user_id"), actorLabel(c), wo.Title)
	dispatchWorkOrderEvent("work_order.created", &wo, actorLabel(c), "")
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// attachInitialTags 为新建工单挂载初始标签（去重、查字典名）
func attachInitialTags(woID uint, tagCodes []string) {
	// 去重
	seen := make(map[string]bool)
	unique := make([]string, 0, len(tagCodes))
	for _, code := range tagCodes {
		code = strings.TrimSpace(code)
		if code != "" && !seen[code] {
			seen[code] = true
			unique = append(unique, code)
		}
	}
	if len(unique) == 0 {
		return
	}

	// 批量查字典名
	nameByCode := make(map[string]string)
	var tags []models.WorkOrderTag
	database.DB.Where("code IN ?", unique).Find(&tags)
	for _, t := range tags {
		nameByCode[t.Code] = t.Name
	}

	// 批量创建关联
	now := time.Now()
	for _, code := range unique {
		database.DB.Create(&models.WorkOrderTagLink{
			WorkOrderID: woID,
			TagCode:     code,
			TagName:     nameByCode[code],
			CreatedAt:   now,
		})
	}
}

// UpdateWorkOrder 改 title/description/priority/visibility/other_codes，变更记入时间线。
func UpdateWorkOrder(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		Priority    *string `json:"priority"`
		Visibility  *string `json:"visibility"`
		BusinessNo  *string `json:"business_no"`
		OtherCodes  *string `json:"other_codes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]interface{}{}
	actor := actorLabel(c)
	uid := c.GetUint("user_id")

	// 标题变更
	if req.Title != nil {
		newTitle := strings.TrimSpace(*req.Title)
		if newTitle != wo.Title {
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
				// 添加描述：显示新内容（截取前50字）
				preview := newDesc
				if len(preview) > 50 {
					preview = preview[:50] + "..."
				}
				detail = fmt.Sprintf("添加了工单描述：%s", preview)
			} else if newDesc == "" {
				// 清空描述：显示原内容（截取前50字）
				preview := wo.Description
				if len(preview) > 50 {
					preview = preview[:50] + "..."
				}
				detail = fmt.Sprintf("清空了工单描述（原内容：%s）", preview)
			} else {
				// 修改描述：显示新旧内容对比（各截取前30字）
				oldPreview := wo.Description
				if len(oldPreview) > 30 {
					oldPreview = oldPreview[:30] + "..."
				}
				newPreview := newDesc
				if len(newPreview) > 30 {
					newPreview = newPreview[:30] + "..."
				}
				detail = fmt.Sprintf("修改了工单描述：\n旧：%s\n新：%s", oldPreview, newPreview)
			}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, detail)
		}
	}
	// 其他编码变更
	if req.OtherCodes != nil {
		newCodes := normalizeCodes(*req.OtherCodes)
		if newCodes != wo.OtherCodes {
			updates["other_codes"] = newCodes
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, fmt.Sprintf("其他编码：%s → %s", wo.OtherCodes, newCodes))
		}
	}
	// 业务单号变更
	if req.BusinessNo != nil {
		newBusinessNo := strings.TrimSpace(*req.BusinessNo)
		if newBusinessNo != wo.BusinessNo {
			updates["business_no"] = newBusinessNo
			var detail string
			if wo.BusinessNo == "" {
				detail = fmt.Sprintf("添加业务单号：%s", newBusinessNo)
			} else if newBusinessNo == "" {
				detail = fmt.Sprintf("清空业务单号（原：%s）", wo.BusinessNo)
			} else {
				detail = fmt.Sprintf("业务单号：%s → %s", wo.BusinessNo, newBusinessNo)
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
	// 可见性变更
	if req.Visibility != nil {
		if *req.Visibility != "public" && *req.Visibility != "private" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid visibility"})
			return
		}
		if *req.Visibility != wo.Visibility {
			updates["visibility"] = *req.Visibility
			visLabel := map[string]string{"public": "公开", "private": "私有"}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, fmt.Sprintf("可见性：%s → %s", visLabel[wo.Visibility], visLabel[*req.Visibility]))
		}
	}

	if len(updates) > 0 {
		database.DB.Model(&wo).Updates(updates)
		// 触发更新事件
		dispatchWorkOrderEvent("work_order.updated", &wo, actor, "")
	}
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// AssignWorkOrder 转交给他人。
func AssignWorkOrder(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		AssignedTo uint   `json:"assigned_to"`
		Comment    string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&wo).Update("assigned_to", req.AssignedTo)
	detail := req.Comment
	if detail == "" {
		detail = fmt.Sprintf("转交给用户#%d", req.AssignedTo)
	}
	addWorkOrderActivity(wo.ID, "assign", wo.Status, wo.Status, c.GetUint("user_id"), actorLabel(c), detail)
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// ChangeWorkOrderStatus 状态流转。
func ChangeWorkOrderStatus(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Status  string `json:"status"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !workOrderStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	applyWorkOrderStatus(c, &wo, req.Status, req.Comment, c.GetUint("user_id"), actorLabel(c))
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// applyWorkOrderStatus 共用：内部接口与开放 API 第三方调用都走它。
func applyWorkOrderStatus(c *gin.Context, wo *models.WorkOrder, status, comment string, actorUserID uint, actor string) {
	from := wo.Status
	now := time.Now()
	updates := map[string]interface{}{"status": status}
	action := "status_change"
	if status == "closed" {
		updates["closed_at"] = &now
		if actorUserID > 0 {
			updates["closed_by"] = &actorUserID
		}
		action = "close"
	} else if status == "reopened" {
		action = "reopen"
		updates["closed_at"] = nil
		updates["closed_by"] = nil
	}
	// 结算时刻：首次进入已解决/已关闭时冻结耗时终点（已有则保留）；
	// 其它状态（重开/待处理/处理中）清空，耗时恢复从 CreatedAt 起算。
	if isSettledStatus(status) {
		if wo.SettledAt == nil {
			updates["settled_at"] = &now
			wo.SettledAt = &now
		}
	} else if wo.SettledAt != nil {
		updates["settled_at"] = nil
		wo.SettledAt = nil
	}
	database.DB.Model(wo).Updates(updates)
	wo.Status = status
	addWorkOrderActivity(wo.ID, action, from, status, actorUserID, actor, comment)

	// 如果状态变更有说明，自动创建工单进展
	if strings.TrimSpace(comment) != "" {
		statusLabel := workOrderStatusLabel(status)
		progressContent := fmt.Sprintf("[状态变更：%s] %s", statusLabel, strings.TrimSpace(comment))
		progress := models.WorkOrderProgress{
			WorkOrderID: wo.ID,
			Content:     progressContent,
			CreatedBy:   actorUserID,
			CreatorName: actor,
		}
		database.DB.Create(&progress)
	}

	evt := "work_order.status_changed"
	if status == "closed" {
		evt = "work_order.closed"
	}
	dispatchWorkOrderEvent(evt, wo, actor, comment)

	// 实时推送状态变更到发起设备（复用 show_device_message，agent 端已处理）。
	pushWorkOrderStatusToDevice(wo, from, status)
}

// pushWorkOrderStatusToDevice 向工单所属设备下发状态变更通知。
func pushWorkOrderStatusToDevice(wo *models.WorkOrder, from, to string) {
	if wo == nil || wo.DeviceID == 0 {
		return
	}
	body := fmt.Sprintf("工单 %s 状态：%s → %s", wo.Code, workOrderStatusLabel(from), workOrderStatusLabel(to))
	if wo.Title != "" {
		body = wo.Title + "\n" + body
	}
	agent.AgentHub.SendToDevice(wo.DeviceID, map[string]interface{}{
		"type":       "command",
		"action":     "show_device_message",
		"command_id": "wo_status_" + wo.Code,
		"data": map[string]interface{}{
			"title":       "工单进度更新",
			"body":        body,
			"duration_ms": 10000,
		},
	})
}

// isSettledStatus 判断状态是否为「结算态」（已解决/已关闭）：耗时在此冻结、可被自动归档。
func isSettledStatus(s string) bool {
	return s == "resolved" || s == "closed"
}

// workOrderStatusLabel 状态中文展示（与 web/agent 端一致）。
func workOrderStatusLabel(s string) string {
	switch s {
	case "open":
		return "待处理"
	case "in_progress":
		return "处理中"
	case "resolved":
		return "已解决"
	case "closed":
		return "已关闭"
	case "reopened":
		return "重新打开"
	default:
		return s
	}
}

// DeleteWorkOrder 删除工单（连带 items/activities + 磁盘文件）。
func DeleteWorkOrder(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var items []models.WorkOrderItem
	database.DB.Where("work_order_id = ?", wo.ID).Find(&items)
	for _, it := range items {
		if it.FilePath != "" {
			_ = os.Remove(it.FilePath)
		}
	}
	database.DB.Where("work_order_id = ?", wo.ID).Delete(&models.WorkOrderItem{})
	database.DB.Where("work_order_id = ?", wo.ID).Delete(&models.WorkOrderActivity{})
	database.DB.Delete(&wo)
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// BatchArchiveWorkOrders 批量归档：仅允许 closed/resolved 状态的工单归档。
func BatchArchiveWorkOrders(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	var rows []models.WorkOrder
	database.DB.Where("id IN ?", req.IDs).Find(&rows)
	uid := c.GetUint("user_id")
	actor := actorLabel(c)
	now := time.Now()
	archived := 0
	var skipped []string
	for i := range rows {
		wo := &rows[i]
		if wo.Archived {
			continue // 已归档跳过
		}
		if wo.Status != "closed" && wo.Status != "resolved" {
			skipped = append(skipped, wo.Code)
			continue // 仅已关闭/已解决可归档
		}
		database.DB.Model(wo).Updates(map[string]interface{}{
			"archived":    true,
			"archived_at": &now,
			"archived_by": &uid,
		})
		wo.Archived = true
		wo.ArchivedAt = &now
		addWorkOrderActivity(wo.ID, "archive", wo.Status, wo.Status, uid, actor, "")
		// 实时推送：前端默认列表/看板移除该工单（与自动归档一致）。
		dispatchWorkOrderEvent("work_order.archived", wo, actor, "")
		archived++
	}
	c.JSON(http.StatusOK, gin.H{"archived": archived, "skipped": skipped})
}

// BatchUnarchiveWorkOrders 批量取消归档。
func BatchUnarchiveWorkOrders(c *gin.Context) {
	var req struct {
		IDs []uint `json:"ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ids required"})
		return
	}
	var rows []models.WorkOrder
	database.DB.Where("id IN ?", req.IDs).Find(&rows)
	uid := c.GetUint("user_id")
	actor := actorLabel(c)
	unarchived := 0
	for i := range rows {
		wo := &rows[i]
		if !wo.Archived {
			continue
		}
		database.DB.Model(wo).Updates(map[string]interface{}{
			"archived":    false,
			"archived_at": nil,
			"archived_by": nil,
		})
		addWorkOrderActivity(wo.ID, "unarchive", wo.Status, wo.Status, uid, actor, "")
		unarchived++
	}
	c.JSON(http.StatusOK, gin.H{"unarchived": unarchived})
}

// workOrderView 给 device 端补充设备名/提交人展示字段。
type workOrderView struct {
	models.WorkOrder
	DeviceName string   `json:"device_name"`
	Submitter  string   `json:"submitter"`
	Tags       []string `json:"tags"`
}

// enrichWorkOrder 填充 device_name 与 submitter（提交人）。
// device_name 优先用提交时刻的快照（DeviceName）；历史工单无快照时回退实时查设备。
func enrichWorkOrder(wo *models.WorkOrder) workOrderView {
	v := workOrderView{WorkOrder: *wo}
	if wo.DeviceName != "" {
		v.DeviceName = wo.DeviceName
	} else if wo.DeviceID > 0 {
		var dev models.Device
		if err := database.DB.Select("name", "serial").First(&dev, wo.DeviceID).Error; err == nil {
			v.DeviceName = dev.Name
			if v.DeviceName == "" {
				v.DeviceName = dev.Serial
			}
		}
	}
	if wo.CreatedBy > 0 {
		var u models.User
		if err := database.DB.Select("username").First(&u, wo.CreatedBy).Error; err == nil {
			v.Submitter = u.Username
		}
	}
	if v.Submitter == "" {
		if v.DeviceName != "" {
			v.Submitter = v.DeviceName
		} else if wo.DeviceID > 0 {
			v.Submitter = fmt.Sprintf("设备#%d", wo.DeviceID)
		}
	}
	v.Tags = workOrderTagCodes(wo.ID)
	return v
}

// ListMyWorkOrders Agent 进度/结果查询：按 device_id 返回（含设备名/提交人）。
func ListMyWorkOrders(c *gin.Context) {
	deviceID := c.GetUint("device_id")
	if deviceID == 0 {
		if d := c.Query("device_id"); d != "" {
			if n, err := strconv.Atoi(d); err == nil {
				deviceID = uint(n)
			}
		}
	}
	if deviceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id required"})
		return
	}
	var rows []models.WorkOrder
	database.DB.Where("device_id = ?", deviceID).
		Where("archived = ? OR archived IS NULL", false).
		Order("id DESC").Limit(100).Find(&rows)
	out := make([]workOrderView, 0, len(rows))
	for i := range rows {
		out = append(out, enrichWorkOrder(&rows[i]))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

// GetMyWorkOrder device-token 查看自己设备提交的工单详情（含 items + activities）。
func GetMyWorkOrder(c *gin.Context) {
	deviceID := c.GetUint("device_id")
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// device-token 仅可查看本设备工单；JWT 用户走管理端接口，这里不额外放行。
	if deviceID > 0 && wo.DeviceID != deviceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	database.DB.Where("work_order_id = ?", wo.ID).Order("id ASC").Find(&wo.Items)
	database.DB.Where("work_order_id = ?", wo.ID).Order("id DESC").Find(&wo.Activities)
	c.JSON(http.StatusOK, gin.H{"data": enrichWorkOrder(&wo)})
}

// UpdateMyWorkOrder device-token 修改本设备工单的标题、描述、其他编码等（仅未关闭的工单）。
func UpdateMyWorkOrder(c *gin.Context) {
	deviceID := c.GetUint("device_id")
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	// device-token 仅可修改本设备工单
	if deviceID > 0 && wo.DeviceID != deviceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	// 已关闭的工单不允许修改内容
	if wo.Status == "closed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "closed work order cannot be updated"})
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
		BusinessNo  *string `json:"business_no"`
		OtherCodes  *string `json:"other_codes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	actor := actorLabel(c)

	// 标题变更
	if req.Title != nil {
		newTitle := strings.TrimSpace(*req.Title)
		if newTitle == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "title cannot be empty"})
			return
		}
		if newTitle != wo.Title {
			updates["title"] = newTitle
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, 0, actor, fmt.Sprintf("标题：%s → %s", wo.Title, newTitle))
		}
	}

	// 描述变更
	if req.Description != nil {
		newDesc := strings.TrimSpace(*req.Description)
		if newDesc != wo.Description {
			updates["description"] = newDesc
			detail := "修改了工单描述"
			if wo.Description == "" {
				detail = "添加了工单描述"
			} else if newDesc == "" {
				detail = "清空了工单描述"
			}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, 0, actor, detail)
		}
	}

	// 其他编码变更
	if req.OtherCodes != nil {
		newCodes := normalizeCodes(*req.OtherCodes)
		if newCodes != wo.OtherCodes {
			updates["other_codes"] = newCodes
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, 0, actor, fmt.Sprintf("其他编码：%s → %s", wo.OtherCodes, newCodes))
		}
	}

	// 业务单号变更
	if req.BusinessNo != nil {
		newBusinessNo := strings.TrimSpace(*req.BusinessNo)
		if newBusinessNo != wo.BusinessNo {
			updates["business_no"] = newBusinessNo
			var detail string
			if wo.BusinessNo == "" {
				detail = fmt.Sprintf("添加业务单号：%s", newBusinessNo)
			} else if newBusinessNo == "" {
				detail = fmt.Sprintf("清空业务单号（原：%s）", wo.BusinessNo)
			} else {
				detail = fmt.Sprintf("业务单号：%s → %s", wo.BusinessNo, newBusinessNo)
			}
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, 0, actor, detail)
		}
	}

	if len(updates) > 0 {
		database.DB.Model(&wo).Updates(updates)
		dispatchWorkOrderEvent("work_order.updated", &wo, actor, "")
	}

	c.JSON(http.StatusOK, gin.H{"data": enrichWorkOrder(&wo)})
}

// deviceWorkOrderStatuses device 提交人可自助流转的状态（催单走 comment）。
var deviceWorkOrderStatuses = map[string]bool{
	"in_progress": true, "resolved": true, "closed": true, "reopened": true,
}

// ChangeMyWorkOrderStatus device-token 对本设备工单做催单/重开/解决/关闭。
func ChangeMyWorkOrderStatus(c *gin.Context) {
	deviceID := c.GetUint("device_id")
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if deviceID > 0 && wo.DeviceID != deviceID {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	var req struct {
		Status  string `json:"status"`
		Comment string `json:"comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 仅补充说明（催单）：不改状态，记一条 comment。
	if req.Status == "" {
		if strings.TrimSpace(req.Comment) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "status or comment required"})
			return
		}
		addWorkOrderActivity(wo.ID, "comment", wo.Status, wo.Status, 0, actorLabel(c), req.Comment)
		c.JSON(http.StatusOK, gin.H{"data": wo})
		return
	}
	if !deviceWorkOrderStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	applyWorkOrderStatus(c, &wo, req.Status, req.Comment, 0, actorLabel(c))
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// ── 附件 items ──────────────────────────────────────────────────────────

// UploadWorkOrderItem multipart 上传单个采集产物。
func UploadWorkOrderItem(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work order not found"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing file"})
		return
	}
	kind := c.PostForm("kind")
	if kind == "" {
		kind = "resource"
	}
	path, err := storage.SaveFile(file, "work-order")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	item := models.WorkOrderItem{
		WorkOrderID: wo.ID,
		Kind:        kind,
		FileName:    file.Filename,
		FilePath:    path,
		FileSize:    file.Size,
		ContentType: file.Header.Get("Content-Type"),
		TargetPkg:   c.PostForm("target_pkg"),
		MetaJSON:    c.PostForm("meta_json"),
	}
	if err := database.DB.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": item})
}

// DownloadWorkOrderItem 下载/预览附件。
func DownloadWorkOrderItem(c *gin.Context) {
	var item models.WorkOrderItem
	if err := database.DB.Where("work_order_id = ? AND id = ?", c.Param("id"), c.Param("item_id")).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if item.ContentType != "" {
		c.Header("Content-Type", item.ContentType)
	}
	c.File(item.FilePath)
}

// UpdateWorkOrderItem 更新工单附件（如替换旋转后的图片）。
func UpdateWorkOrderItem(c *gin.Context) {
	var item models.WorkOrderItem
	if err := database.DB.Where("work_order_id = ? AND id = ?", c.Param("id"), c.Param("item_id")).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	// 仅支持更新图片类型
	if item.Kind != "photo" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only photo items can be updated"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file required"})
		return
	}

	// 删除旧文件
	if item.FilePath != "" {
		_ = os.Remove(item.FilePath)
	}

	// 使用与上传时相同的方式保存文件
	savePath, err := storage.SaveFile(file, "work-order")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	// 更新数据库记录
	updates := map[string]interface{}{
		"file_path":    savePath,
		"content_type": file.Header.Get("Content-Type"),
		"file_size":    file.Size,
	}
	if err := database.DB.Model(&item).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ok", "data": item})
}

// ── 工单类型 types ────────────────────────────────────────────────────────

func ListWorkOrderTypes(c *gin.Context) {
	var rows []models.WorkOrderType
	q := database.DB.Order("sort_order ASC, id ASC")
	// device-token（runtime）或显式 ?enabled=1 时仅返回启用类型；管理端默认全量。
	if c.GetString("auth_kind") == "device" || c.Query("enabled") == "1" {
		q = q.Where("enabled = ?", true)
	}
	q.Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func CreateWorkOrderType(c *gin.Context) {
	var t models.WorkOrderType
	if err := c.ShouldBindJSON(&t); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(t.Code) == "" || strings.TrimSpace(t.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code and name are required"})
		return
	}
	if t.FormPageKey == "" {
		t.FormPageKey = "form"
	}
	if err := database.DB.Create(&t).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": t})
}

func UpdateWorkOrderType(c *gin.Context) {
	var t models.WorkOrderType
	if err := database.DB.First(&t, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req models.WorkOrderType
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.Model(&t).Updates(map[string]interface{}{
		"name":                       req.Name,
		"description":                req.Description,
		"form_app_code":              req.FormAppCode,
		"form_page_key":              req.FormPageKey,
		"default_title":              req.DefaultTitle,
		"board_card_template":        req.BoardCardTemplate,
		"auto_archive_enabled":       req.AutoArchiveEnabled,
		"auto_archive_statuses":      req.AutoArchiveStatuses,
		"auto_archive_delay_minutes": req.AutoArchiveDelayMinutes,
		"enabled":                    req.Enabled,
		"sort_order":                 req.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"data": t})
}

func DeleteWorkOrderType(c *gin.Context) {
	if err := database.DB.Delete(&models.WorkOrderType{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// ── 工具 ────────────────────────────────────────────────────────────────

func addWorkOrderActivity(woID uint, action, from, to string, actorUserID uint, actorLabel, detail string) {
	rec := models.WorkOrderActivity{
		WorkOrderID: woID,
		Action:      action,
		FromStatus:  from,
		ToStatus:    to,
		ActorUserID: actorUserID,
		ActorLabel:  actorLabel,
		Detail:      detail,
		CreatedAt:   time.Now(),
	}
	database.DB.Create(&rec)
}

// findWorkOrderByCode 开放 API 按 code 定位。
func findWorkOrderByCode(code string) (*models.WorkOrder, error) {
	var wo models.WorkOrder
	if err := database.DB.Where("code = ?", code).First(&wo).Error; err != nil {
		return nil, err
	}
	return &wo, nil
}

// ── 开放 API（第三方 X-API-Key） ──────────────────────────────────────────

// AgentListWorkOrders GET /api/agent/work-orders
// Agent 端（device token 或 JWT 认证）工单列表，支持搜索和分页。
func AgentListWorkOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	q := database.DB.Model(&models.WorkOrder{})
	// 默认仅未归档
	q = q.Where("archived = ? OR archived IS NULL", false)

	// "我的工单"场景：按设备ID或创建者过滤
	if c.Query("my") == "1" {
		deviceID := c.GetUint("device_id")
		userID := c.GetUint("user_id")
		role := c.GetString("role")

		// admin/operator 可以查看所有工单
		if role == "admin" || role == "operator" {
			// 不添加过滤条件，返回所有工单
		} else if userID > 0 && deviceID > 0 {
			// JWT用户 + 设备token：设备工单 OR 用户创建的工单
			q = q.Where("device_id = ? OR created_by = ?", deviceID, userID)
		} else if userID > 0 {
			// 仅JWT用户：用户创建的工单
			q = q.Where("created_by = ?", userID)
		} else if deviceID > 0 {
			// 仅设备token：设备工单
			q = q.Where("device_id = ?", deviceID)
		}
	}

	// 状态过滤
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}

	// 关键词搜索：编号、业务单号、其他编码、标题
	if searchKey := strings.TrimSpace(c.Query("search_key")); searchKey != "" {
		pattern := "%" + searchKey + "%"
		q = q.Where("code LIKE ? OR business_no LIKE ? OR other_codes LIKE ? OR title LIKE ?",
			pattern, pattern, pattern, pattern)
	}

	var total int64
	q.Count(&total)

	var rows []models.WorkOrder
	q.Order("id DESC").Offset((page - 1) * limit).Limit(limit).Find(&rows)

	// 批量补标签
	ids := make([]uint, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	tagsByWO := map[uint][]string{}
	if len(ids) > 0 {
		var links []models.WorkOrderTagLink
		database.DB.Where("work_order_id IN ?", ids).Find(&links)
		for _, l := range links {
			tagsByWO[l.WorkOrderID] = append(tagsByWO[l.WorkOrderID], l.TagCode)
		}
	}

	type listRow struct {
		models.WorkOrder
		Tags []string `json:"tags"`
	}
	out := make([]listRow, 0, len(rows))
	for _, wo := range rows {
		out = append(out, listRow{WorkOrder: wo, Tags: tagsByWO[wo.ID]})
	}

	c.JSON(http.StatusOK, gin.H{"data": out, "total": total})
}

// AgentGetWorkOrder GET /api/agent/work-orders/:id
// Agent 端（device token 或 JWT 认证）工单详情。
func AgentGetWorkOrder(c *gin.Context) {
	var wo models.WorkOrder
	if err := database.DB.First(&wo, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	// 权限检查
	deviceID := c.GetUint("device_id")
	userID := c.GetUint("user_id")
	role := c.GetString("role")
	canView := false

	// 1. admin/operator 可查看所有工单
	if role == "admin" || role == "operator" {
		canView = true
	}

	// 2. 设备token：可查看本设备工单
	if deviceID > 0 && wo.DeviceID == deviceID {
		canView = true
	}

	// 3. JWT用户：可查看自己创建或被指派的工单
	if userID > 0 && (wo.CreatedBy == userID || (wo.AssignedTo != nil && *wo.AssignedTo == userID)) {
		canView = true
	}

	if !canView {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
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

// OpenGetWorkOrder GET /api/open/v1/work-orders/:code
func OpenGetWorkOrder(c *gin.Context) {
	wo, err := findWorkOrderByCode(c.Param("code"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Where("work_order_id = ?", wo.ID).Order("id ASC").Find(&wo.Items)
	database.DB.Where("work_order_id = ?", wo.ID).Order("id DESC").Find(&wo.Activities)
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// OpenCloseWorkOrder POST /api/open/v1/work-orders/:code/close
func OpenCloseWorkOrder(c *gin.Context) {
	wo, err := findWorkOrderByCode(c.Param("code"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Comment     string `json:"comment"`
		ExternalRef string `json:"external_ref"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.ExternalRef != "" {
		database.DB.Model(wo).Update("external_ref", req.ExternalRef)
		wo.ExternalRef = req.ExternalRef
	}
	applyWorkOrderStatus(c, wo, "closed", req.Comment, 0, "第三方系统")
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// OpenProcessWorkOrder POST /api/open/v1/work-orders/:code/process
// 第三方改状态 / 加处理备注 / 回写 ExternalRef。
func OpenProcessWorkOrder(c *gin.Context) {
	wo, err := findWorkOrderByCode(c.Param("code"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Status      string `json:"status"`
		Comment     string `json:"comment"`
		ExternalRef string `json:"external_ref"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ExternalRef != "" {
		database.DB.Model(wo).Update("external_ref", req.ExternalRef)
		wo.ExternalRef = req.ExternalRef
	}
	if req.Status != "" {
		if !workOrderStatuses[req.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
			return
		}
		applyWorkOrderStatus(c, wo, req.Status, req.Comment, 0, "第三方系统")
	} else if req.Comment != "" {
		addWorkOrderActivity(wo.ID, "external_update", wo.Status, wo.Status, 0, "第三方系统", req.Comment)
	}
	c.JSON(http.StatusOK, gin.H{"data": wo})
}

// jsonString 工具。
func jsonString(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// ── 工作流（Workflow）─────────────────────────────────────────────────────

// ListWorkOrderWorkflows 工作流列表。
func ListWorkOrderWorkflows(c *gin.Context) {
	var rows []models.WorkOrderWorkflow
	q := database.DB.Order("sort_order ASC, id ASC")
	if t := c.Query("type_code"); t != "" {
		q = q.Where("type_code = ?", t)
	}
	q.Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

// GetWorkOrderWorkflow 工作流详情。
func GetWorkOrderWorkflow(c *gin.Context) {
	var wf models.WorkOrderWorkflow
	if err := database.DB.First(&wf, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": wf})
}

// CreateWorkOrderWorkflow 创建工作流。
func CreateWorkOrderWorkflow(c *gin.Context) {
	var wf models.WorkOrderWorkflow
	if err := c.ShouldBindJSON(&wf); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(wf.Name) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	// 验证 actions_json 格式
	var actions []workflow.WorkflowAction
	if err := json.Unmarshal([]byte(wf.ActionsJSON), &actions); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid actions_json: " + err.Error()})
		return
	}
	if err := database.DB.Create(&wf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": wf})
}

// UpdateWorkOrderWorkflow 更新工作流。
func UpdateWorkOrderWorkflow(c *gin.Context) {
	var wf models.WorkOrderWorkflow
	if err := database.DB.First(&wf, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req models.WorkOrderWorkflow
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 验证 actions_json 格式
	if req.ActionsJSON != "" {
		var actions []workflow.WorkflowAction
		if err := json.Unmarshal([]byte(req.ActionsJSON), &actions); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid actions_json: " + err.Error()})
			return
		}
	}
	database.DB.Model(&wf).Updates(map[string]interface{}{
		"name":         req.Name,
		"type_code":    req.TypeCode,
		"events":       req.Events,
		"actions_json": req.ActionsJSON,
		"description":  req.Description,
		"enabled":      req.Enabled,
		"sort_order":   req.SortOrder,
	})
	c.JSON(http.StatusOK, gin.H{"data": wf})
}

// DeleteWorkOrderWorkflow 删除工作流。
func DeleteWorkOrderWorkflow(c *gin.Context) {
	if err := database.DB.Delete(&models.WorkOrderWorkflow{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// ListWorkOrderWorkflowLogs 工作流执行日志。
func ListWorkOrderWorkflowLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}

	q := database.DB.Model(&models.WorkOrderWorkflowLog{})
	if wfID := c.Query("workflow_id"); wfID != "" {
		q = q.Where("workflow_id = ?", wfID)
	}
	if woID := c.Query("work_order_id"); woID != "" {
		q = q.Where("work_order_id = ?", woID)
	}
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}

	var total int64
	q.Count(&total)

	var rows []models.WorkOrderWorkflowLog
	q.Order("id DESC").Offset((page - 1) * limit).Limit(limit).Find(&rows)
	c.JSON(http.StatusOK, gin.H{"data": rows, "total": total, "page": page, "limit": limit})
}

// TestWorkOrderWorkflow 测试工作流（手动触发）。
func TestWorkOrderWorkflow(c *gin.Context) {
	var req struct {
		WorkOrderID uint   `json:"work_order_id"`
		Event       string `json:"event"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var wf models.WorkOrderWorkflow
	if err := database.DB.First(&wf, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workflow not found"})
		return
	}
	var wo models.WorkOrder
	if err := database.DB.First(&wo, req.WorkOrderID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "work order not found"})
		return
	}
	event := req.Event
	if event == "" {
		event = "work_order.test"
	}
	actor := actorLabel(c)
	// 同步执行测试
	go workflow.DefaultEngine.Dispatch(event, &wo, actor)
	c.JSON(http.StatusOK, gin.H{"message": "workflow dispatched"})
}

// RecognizeWorkOrderItemBarcode 识别工单附件中的二维码/条形码
func RecognizeWorkOrderItemBarcode(c *gin.Context) {
	itemID := c.Param("item_id")
	var item models.WorkOrderItem
	if err := database.DB.First(&item, itemID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
		return
	}

	// 只支持图片类型
	if item.Kind != "photo" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "只支持识别图片类型的附件"})
		return
	}

	// 获取文件路径（FilePath 已经是完整路径）
	filePath := item.FilePath

	// 调用 barcode 包的识别函数
	codes, err := barcode.RecognizeFromFile(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("识别失败: %v", err)})
		return
	}

	if len(codes) == 0 {
		c.JSON(http.StatusOK, gin.H{"codes": []string{}, "message": "未识别到二维码或条形码"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"codes": codes})
}

// ── 工单进展 API ────────────────────────────────────────────────────

// ListWorkOrderProgress 获取工单进展列表（含附件）
func ListWorkOrderProgress(c *gin.Context) {
	woID := c.Param("id")
	var list []models.WorkOrderProgress
	if err := database.DB.Where("work_order_id = ?", woID).Order("id DESC").Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 批量查询所有进展的附件
	progressIDs := make([]uint, 0, len(list))
	for _, p := range list {
		progressIDs = append(progressIDs, p.ID)
	}
	attachmentsByProgress := make(map[uint][]models.WorkOrderProgressAttachment)
	if len(progressIDs) > 0 {
		var attachments []models.WorkOrderProgressAttachment
		database.DB.Where("progress_id IN ?", progressIDs).Order("id ASC").Find(&attachments)
		for _, att := range attachments {
			attachmentsByProgress[att.ProgressID] = append(attachmentsByProgress[att.ProgressID], att)
		}
	}

	type progressRow struct {
		models.WorkOrderProgress
		Attachments []models.WorkOrderProgressAttachment `json:"attachments"`
	}
	out := make([]progressRow, 0, len(list))
	for _, p := range list {
		atts := attachmentsByProgress[p.ID]
		if atts == nil {
			atts = []models.WorkOrderProgressAttachment{}
		}
		out = append(out, progressRow{WorkOrderProgress: p, Attachments: atts})
	}

	c.JSON(http.StatusOK, gin.H{"data": out})
}

// CreateWorkOrderProgress 新增工单进展（Web端/App端通用）
func CreateWorkOrderProgress(c *gin.Context) {
	woID := c.Param("id")
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.Content) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "进展内容不能为空"})
		return
	}

	// 验证工单存在
	var wo models.WorkOrder
	if err := database.DB.First(&wo, woID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "工单不存在"})
		return
	}

	progress := models.WorkOrderProgress{
		WorkOrderID: wo.ID,
		Content:     strings.TrimSpace(req.Content),
		CreatedBy:   c.GetUint("user_id"), // 0 表示设备端提交
		CreatorName: actorLabel(c),
	}
	if err := database.DB.Create(&progress).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": progress})
}

// UploadWorkOrderProgressAttachment 上传进展附件（支持 photo|video|audio|screen_record|voice|logcat）
func UploadWorkOrderProgressAttachment(c *gin.Context) {
	progressID := c.Param("progress_id")
	var progress models.WorkOrderProgress
	if err := database.DB.First(&progress, progressID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "进展记录不存在"})
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file uploaded"})
		return
	}
	kind := c.PostForm("kind") // photo|video|audio|screen_record|voice|logcat
	if kind == "" {
		kind = "photo"
	}
	metaJSON := c.PostForm("meta_json") // 可选扩展信息

	// 保存文件到 uploads/work_order_progress/ 目录
	destPath, err := storage.SaveFile(file, "work_order_progress")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	attachment := models.WorkOrderProgressAttachment{
		ProgressID:  progress.ID,
		FileName:    file.Filename,
		FilePath:    destPath,
		FileSize:    file.Size,
		Kind:        kind,
		ContentType: file.Header.Get("Content-Type"),
		MetaJSON:    metaJSON,
	}
	if err := database.DB.Create(&attachment).Error; err != nil {
		os.Remove(destPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": attachment})
}

// DownloadWorkOrderProgressAttachment 下载进展附件
func DownloadWorkOrderProgressAttachment(c *gin.Context) {
	attID := c.Param("att_id")
	var att models.WorkOrderProgressAttachment
	if err := database.DB.First(&att, attID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "附件不存在"})
		return
	}
	c.FileAttachment(att.FilePath, att.FileName)
}

// GetWorkOrderStatistics 获取工单统计分析报告（支持按当前查询条件过滤）
func GetWorkOrderStatistics(c *gin.Context) {
	q := database.DB.Model(&models.WorkOrder{})

	// 归档过滤：默认仅未归档；archived=1 时仅归档（独立归档页）
	if c.Query("archived") == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}

	// 应用与列表相同的过滤条件
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if t := c.Query("type_code"); t != "" {
		q = q.Where("type_code = ?", t)
	}
	if d := c.Query("device_id"); d != "" {
		q = q.Where("device_id = ?", d)
	}
	if a := c.Query("assigned_to"); a != "" {
		q = q.Where("assigned_to = ?", a)
	}
	if v := c.Query("visibility"); v != "" {
		q = q.Where("visibility = ?", v)
	}

	// 创建时间范围
	if startTime := c.Query("created_start"); startTime != "" {
		q = q.Where("created_at >= ?", startTime)
	}
	if endTime := c.Query("created_end"); endTime != "" {
		q = q.Where("created_at <= ?", endTime)
	}

	// 归档时间范围
	if startTime := c.Query("archived_start"); startTime != "" {
		q = q.Where("archived_at >= ?", startTime)
	}
	if endTime := c.Query("archived_end"); endTime != "" {
		q = q.Where("archived_at <= ?", endTime)
	}

	// 标签多选筛选
	if t := strings.TrimSpace(c.Query("tags")); t != "" {
		codes := make([]string, 0)
		for _, p := range strings.Split(t, ",") {
			if s := strings.TrimSpace(p); s != "" {
				codes = append(codes, s)
			}
		}
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}

	// 非管理员：仅公开 或 自己创建/被指派的工单
	if c.GetString("role") != "admin" {
		uid := c.GetUint("user_id")
		q = q.Where("visibility = ? OR created_by = ? OR assigned_to = ?", "public", uid, uid)
	}

	// 查询所有符合条件的工单ID
	var woIDs []uint
	q.Pluck("id", &woIDs)

	if len(woIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"total":                0,
			"by_status":            []gin.H{},
			"by_type":              []gin.H{},
			"by_tag":               []gin.H{},
			"by_priority":          []gin.H{},
			"by_item_kind":         []gin.H{},
			"avg_processing_hours": 0,
		})
		return
	}

	// 按状态统计
	type statusStat struct {
		Status string `json:"status"`
		Count  int    `json:"count"`
	}
	var byStatus []statusStat
	database.DB.Model(&models.WorkOrder{}).
		Select("status, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("status").
		Order("count DESC").
		Find(&byStatus)

	// 按类型统计
	type typeStat struct {
		TypeCode string `json:"type_code"`
		Count    int    `json:"count"`
	}
	var byType []typeStat
	database.DB.Model(&models.WorkOrder{}).
		Select("type_code, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("type_code").
		Order("count DESC").
		Find(&byType)

	// 按优先级统计
	type priorityStat struct {
		Priority string `json:"priority"`
		Count    int    `json:"count"`
	}
	var byPriority []priorityStat
	database.DB.Model(&models.WorkOrder{}).
		Select("priority, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("priority").
		Order("count DESC").
		Find(&byPriority)

	// 按标签统计
	type tagStat struct {
		TagCode string `json:"tag_code"`
		TagName string `json:"tag_name"`
		Count   int    `json:"count"`
	}
	var byTag []tagStat
	database.DB.Model(&models.WorkOrderTagLink{}).
		Select("tag_code, tag_name, COUNT(DISTINCT work_order_id) as count").
		Where("work_order_id IN ?", woIDs).
		Group("tag_code, tag_name").
		Order("count DESC").
		Find(&byTag)

	// 附件统计
	type itemKindStat struct {
		Kind  string `json:"kind"`
		Count int    `json:"count"`
	}
	var byItemKind []itemKindStat
	database.DB.Model(&models.WorkOrderItem{}).
		Select("kind, COUNT(*) as count").
		Where("work_order_id IN ?", woIDs).
		Group("kind").
		Order("count DESC").
		Find(&byItemKind)

	// 计算平均处理耗时（仅已关闭的工单）- 兼容 SQLite 和 MySQL
	var avgHours float64
	var closedWOs []models.WorkOrder
	database.DB.Select("created_at, settled_at, closed_at, archived_at").
		Where("id IN ?", woIDs).
		Where("settled_at IS NOT NULL OR closed_at IS NOT NULL OR archived_at IS NOT NULL").
		Find(&closedWOs)

	if len(closedWOs) > 0 {
		var totalHours float64
		for _, wo := range closedWOs {
			// 终点优先用结算时刻（冻结耗时），其次关闭时刻，再次归档时刻。
			endTime := wo.SettledAt
			if endTime == nil {
				endTime = wo.ClosedAt
			}
			if endTime == nil {
				endTime = wo.ArchivedAt
			}
			if endTime != nil && wo.CreatedAt.Before(*endTime) {
				duration := endTime.Sub(wo.CreatedAt)
				totalHours += duration.Hours()
			}
		}
		avgHours = totalHours / float64(len(closedWOs))
	}

	c.JSON(http.StatusOK, gin.H{
		"total":                len(woIDs),
		"by_status":            byStatus,
		"by_type":              byType,
		"by_tag":               byTag,
		"by_priority":          byPriority,
		"by_item_kind":         byItemKind,
		"avg_processing_hours": avgHours,
	})
}

// ── 工单报告分享 ────────────────────────────────────────────────────────

// generateShareToken 生成随机分享令牌
func generateShareToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// CreateWorkOrderReportShare 创建报告分享链接
func CreateWorkOrderReportShare(c *gin.Context) {
	var req struct {
		Title         string                 `json:"title"`
		Filters       map[string]interface{} `json:"filters"`
		ExpiresIn     int                    `json:"expires_in"`      // 过期时长（小时），兼容旧版
		ExpiresInDays int                    `json:"expires_in_days"` // 过期时长（天数），优先使用
		AuthMode      string                 `json:"auth_mode"`       // 认证模式：public（免登录）| login（需登录）
		Permissions   map[string]interface{} `json:"permissions"`     // 需登录模式的权限配置
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 优先使用天数，如果没有则使用小时数（兼容旧版）
	expiresInHours := req.ExpiresIn
	if req.ExpiresInDays > 0 {
		expiresInHours = req.ExpiresInDays * 24
	}

	if expiresInHours <= 0 {
		expiresInHours = 168 // 默认7天
	}
	if expiresInHours > 8760 { // 最多365天
		expiresInHours = 8760
	}

	// 默认免登录模式
	authMode := req.AuthMode
	if authMode == "" {
		authMode = "public"
	}
	if authMode != "public" && authMode != "login" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid auth_mode"})
		return
	}

	// 需登录模式下，默认权限配置
	var permissionsJSON string
	if authMode == "login" {
		if req.Permissions == nil {
			req.Permissions = map[string]interface{}{
				"can_view":          true,
				"can_comment":       true,
				"can_update_status": false,
				"can_update_fields": false,
			}
		}
		b, _ := json.Marshal(req.Permissions)
		permissionsJSON = string(b)
	}

	filtersJSON, _ := json.Marshal(req.Filters)
	share := models.WorkOrderReportShare{
		Token:       generateShareToken(),
		Title:       req.Title,
		FiltersJSON: string(filtersJSON),
		AuthMode:    authMode,
		Permissions: permissionsJSON,
		CreatedBy:   c.GetUint("user_id"),
		ExpiresAt:   time.Now().Add(time.Duration(expiresInHours) * time.Hour),
	}

	if err := database.DB.Create(&share).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": share})
}

// GetWorkOrderReportShare 获取分享信息（免登录或已登录）
func GetWorkOrderReportShare(c *gin.Context) {
	token := c.Param("token")
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或已失效"})
		return
	}

	// 检查是否过期
	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已过期"})
		return
	}

	// 记录浏览
	go func() {
		view := models.WorkOrderReportShareView{
			ShareID:   share.ID,
			IPAddress: c.ClientIP(),
			UserAgent: c.GetHeader("User-Agent"),
			ViewedAt:  time.Now(),
		}
		database.DB.Create(&view)
		// 更新浏览次数
		database.DB.Model(&models.WorkOrderReportShare{}).Where("id = ?", share.ID).UpdateColumn("view_count", gorm.Expr("view_count + 1"))
	}()

	// 解析filters
	var filters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &filters)
	}

	// 解析permissions
	var permissions map[string]interface{}
	if share.Permissions != "" {
		json.Unmarshal([]byte(share.Permissions), &permissions)
	}

	// 检查登录状态（仅用于前端判断是否已登录）
	userID := c.GetUint("user_id")
	isAuthenticated := userID > 0

	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"id":               share.ID,
			"token":            share.Token,
			"title":            share.Title,
			"filters":          filters,
			"auth_mode":        share.AuthMode,
			"permissions":      permissions,
			"expires_at":       share.ExpiresAt,
			"created_at":       share.CreatedAt,
			"is_authenticated": isAuthenticated,
		},
	})
}

// GetSharedWorkOrders 获取分享的工单列表（免登录或需登录）
func GetSharedWorkOrders(c *gin.Context) {
	token := c.Param("token")
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或已失效"})
		return
	}

	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已过期"})
		return
	}

	// 需登录模式下，检查是否已登录
	if share.AuthMode == "login" {
		userID := c.GetUint("user_id")
		if userID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "此分享链接需要登录才能访问"})
			return
		}
	}

	// 解析保存的查询条件
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 20
	}

	q := database.DB.Model(&models.WorkOrder{})

	// 应用保存的查询条件
	if archived, ok := savedFilters["archived"].(string); ok && archived == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}

	if status, ok := savedFilters["status"].(string); ok && status != "" {
		q = q.Where("status = ?", status)
	}
	if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
		q = q.Where("type_code = ?", typeCode)
	}
	if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
		q = q.Where("device_id = ?", deviceID)
	}
	if tags, ok := savedFilters["tags"].(string); ok && tags != "" {
		codes := strings.Split(tags, ",")
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}
	if createdStart, ok := savedFilters["created_start"].(string); ok && createdStart != "" {
		q = q.Where("created_at >= ?", createdStart)
	}
	if createdEnd, ok := savedFilters["created_end"].(string); ok && createdEnd != "" {
		q = q.Where("created_at <= ?", createdEnd)
	}
	if archivedStart, ok := savedFilters["archived_start"].(string); ok && archivedStart != "" {
		q = q.Where("archived_at >= ?", archivedStart)
	}
	if archivedEnd, ok := savedFilters["archived_end"].(string); ok && archivedEnd != "" {
		q = q.Where("archived_at <= ?", archivedEnd)
	}

	var total int64
	q.Count(&total)

	var rows []models.WorkOrder
	q.Order("id DESC").Offset((page - 1) * limit).Limit(limit).Find(&rows)

	// 补充标签（包含名称）
	ids := make([]uint, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}

	// 获取所有标签定义
	var allTags []models.WorkOrderTag
	database.DB.Find(&allTags)
	tagNameMap := make(map[string]string)
	for _, tag := range allTags {
		tagNameMap[tag.Code] = tag.Name
	}

	// 获取工单标签关联
	tagsByWO := map[uint][]map[string]string{}
	if len(ids) > 0 {
		var links []models.WorkOrderTagLink
		database.DB.Where("work_order_id IN ?", ids).Find(&links)
		for _, l := range links {
			tagInfo := map[string]string{
				"code": l.TagCode,
				"name": tagNameMap[l.TagCode],
			}
			if tagInfo["name"] == "" {
				tagInfo["name"] = l.TagCode
			}
			tagsByWO[l.WorkOrderID] = append(tagsByWO[l.WorkOrderID], tagInfo)
		}
	}

	type listRow struct {
		models.WorkOrder
		Tags []map[string]string `json:"tags"`
	}
	out := make([]listRow, 0, len(rows))
	for i := range rows {
		t := tagsByWO[rows[i].ID]
		if t == nil {
			t = []map[string]string{}
		}
		out = append(out, listRow{WorkOrder: rows[i], Tags: t})
	}

	c.JSON(http.StatusOK, gin.H{"data": out, "total": total, "page": page, "limit": limit})
}

// GetSharedWorkOrderStatistics 获取分享的统计报告（免登录或需登录）
func GetSharedWorkOrderStatistics(c *gin.Context) {
	token := c.Param("token")
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或已失效"})
		return
	}

	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已过期"})
		return
	}

	// 需登录模式下，检查是否已登录
	if share.AuthMode == "login" {
		userID := c.GetUint("user_id")
		if userID == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "此分享链接需要登录才能访问"})
			return
		}
	}

	// 解析保存的查询条件
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})

	// 应用保存的查询条件（与上面相同逻辑）
	if archived, ok := savedFilters["archived"].(string); ok && archived == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}
	if status, ok := savedFilters["status"].(string); ok && status != "" {
		q = q.Where("status = ?", status)
	}
	if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
		q = q.Where("type_code = ?", typeCode)
	}
	if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
		q = q.Where("device_id = ?", deviceID)
	}
	if tags, ok := savedFilters["tags"].(string); ok && tags != "" {
		codes := strings.Split(tags, ",")
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}
	if createdStart, ok := savedFilters["created_start"].(string); ok && createdStart != "" {
		q = q.Where("created_at >= ?", createdStart)
	}
	if createdEnd, ok := savedFilters["created_end"].(string); ok && createdEnd != "" {
		q = q.Where("created_at <= ?", createdEnd)
	}
	if archivedStart, ok := savedFilters["archived_start"].(string); ok && archivedStart != "" {
		q = q.Where("archived_at >= ?", archivedStart)
	}
	if archivedEnd, ok := savedFilters["archived_end"].(string); ok && archivedEnd != "" {
		q = q.Where("archived_at <= ?", archivedEnd)
	}

	var woIDs []uint
	q.Pluck("id", &woIDs)

	if len(woIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"total":                0,
			"by_status":            []gin.H{},
			"by_type":              []gin.H{},
			"by_tag":               []gin.H{},
			"by_priority":          []gin.H{},
			"by_item_kind":         []gin.H{},
			"avg_processing_hours": 0,
		})
		return
	}

	// 执行统计（复用GetWorkOrderStatistics的逻辑）
	type statusStat struct {
		Status string `json:"status"`
		Count  int    `json:"count"`
	}
	var byStatus []statusStat
	database.DB.Model(&models.WorkOrder{}).
		Select("status, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("status").
		Order("count DESC").
		Find(&byStatus)

	type typeStat struct {
		TypeCode string `json:"type_code"`
		Count    int    `json:"count"`
	}
	var byType []typeStat
	database.DB.Model(&models.WorkOrder{}).
		Select("type_code, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("type_code").
		Order("count DESC").
		Find(&byType)

	type priorityStat struct {
		Priority string `json:"priority"`
		Count    int    `json:"count"`
	}
	var byPriority []priorityStat
	database.DB.Model(&models.WorkOrder{}).
		Select("priority, COUNT(*) as count").
		Where("id IN ?", woIDs).
		Group("priority").
		Order("count DESC").
		Find(&byPriority)

	type tagStat struct {
		TagCode string `json:"tag_code"`
		TagName string `json:"tag_name"`
		Count   int    `json:"count"`
	}
	var byTag []tagStat
	database.DB.Model(&models.WorkOrderTagLink{}).
		Select("tag_code, tag_name, COUNT(DISTINCT work_order_id) as count").
		Where("work_order_id IN ?", woIDs).
		Group("tag_code, tag_name").
		Order("count DESC").
		Find(&byTag)

	// 附件统计
	type itemKindStat struct {
		Kind  string `json:"kind"`
		Count int    `json:"count"`
	}
	var byItemKind []itemKindStat
	database.DB.Model(&models.WorkOrderItem{}).
		Select("kind, COUNT(*) as count").
		Where("work_order_id IN ?", woIDs).
		Group("kind").
		Order("count DESC").
		Find(&byItemKind)

	var avgHours float64
	var closedWOs []models.WorkOrder
	database.DB.Select("created_at, settled_at, closed_at, archived_at").
		Where("id IN ?", woIDs).
		Where("settled_at IS NOT NULL OR closed_at IS NOT NULL OR archived_at IS NOT NULL").
		Find(&closedWOs)

	if len(closedWOs) > 0 {
		var totalHours float64
		for _, wo := range closedWOs {
			// 终点优先用结算时刻（冻结耗时），其次关闭时刻，再次归档时刻。
			endTime := wo.SettledAt
			if endTime == nil {
				endTime = wo.ClosedAt
			}
			if endTime == nil {
				endTime = wo.ArchivedAt
			}
			if endTime != nil && wo.CreatedAt.Before(*endTime) {
				duration := endTime.Sub(wo.CreatedAt)
				totalHours += duration.Hours()
			}
		}
		avgHours = totalHours / float64(len(closedWOs))
	}

	c.JSON(http.StatusOK, gin.H{
		"total":                len(woIDs),
		"by_status":            byStatus,
		"by_type":              byType,
		"by_tag":               byTag,
		"by_priority":          byPriority,
		"by_item_kind":         byItemKind,
		"avg_processing_hours": avgHours,
	})
}

// ListWorkOrderReportShares 列出当前用户创建的分享链接
func ListWorkOrderReportShares(c *gin.Context) {
	var shares []models.WorkOrderReportShare
	database.DB.Where("created_by = ?", c.GetUint("user_id")).
		Order("id DESC").
		Find(&shares)
	c.JSON(http.StatusOK, gin.H{"data": shares})
}

// GetWorkOrderReportShareViews 获取分享浏览记录
func GetWorkOrderReportShareViews(c *gin.Context) {
	id := c.Param("id")

	// 验证权限
	var share models.WorkOrderReportShare
	if err := database.DB.Where("id = ? AND created_by = ?", id, c.GetUint("user_id")).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或无权限查看"})
		return
	}

	var views []models.WorkOrderReportShareView
	database.DB.Where("share_id = ?", id).Order("viewed_at DESC").Find(&views)
	c.JSON(http.StatusOK, gin.H{"data": views})
}

// DeleteWorkOrderReportShare 删除分享链接
func DeleteWorkOrderReportShare(c *gin.Context) {
	id := c.Param("id")
	result := database.DB.Where("id = ? AND created_by = ?", id, c.GetUint("user_id")).
		Delete(&models.WorkOrderReportShare{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或无权限删除"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// UpdateWorkOrderReportShare 更新分享链接（标题、有效期）
func UpdateWorkOrderReportShare(c *gin.Context) {
	id := c.Param("id")

	// 验证权限
	var share models.WorkOrderReportShare
	if err := database.DB.Where("id = ? AND created_by = ?", id, c.GetUint("user_id")).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或无权限修改"})
		return
	}

	var req struct {
		Title         *string `json:"title"`
		ExpiresInDays *int    `json:"expires_in_days"` // 从现在开始计算的天数
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := make(map[string]interface{})

	if req.Title != nil {
		updates["title"] = *req.Title
	}

	if req.ExpiresInDays != nil {
		days := *req.ExpiresInDays
		if days <= 0 {
			days = 7 // 默认7天
		}
		if days > 365 { // 最多365天
			days = 365
		}
		updates["expires_at"] = time.Now().Add(time.Duration(days*24) * time.Hour)
	}

	if len(updates) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有需要更新的字段"})
		return
	}

	if err := database.DB.Model(&share).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 重新查询返回最新数据
	database.DB.First(&share, id)
	c.JSON(http.StatusOK, gin.H{"data": share})
}

// GetSharedWorkOrderProgress 获取分享工单的进展列表（免登录，通过 token 验证）
func GetSharedWorkOrderProgress(c *gin.Context) {
	token := c.Param("token")
	woID := c.Param("id")

	// 验证分享 token
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或已失效"})
		return
	}

	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已过期"})
		return
	}

	// 验证工单在分享范围内
	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})

	// 应用保存的查询条件（与 GetSharedWorkOrders 保持一致）
	if savedFilters != nil {
		if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
			q = q.Where("type_code = ?", typeCode)
		}
		if status, ok := savedFilters["status"].(string); ok && status != "" {
			q = q.Where("status = ?", status)
		}
		if priority, ok := savedFilters["priority"].(string); ok && priority != "" {
			q = q.Where("priority = ?", priority)
		}
		if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
			q = q.Where("device_id = ?", deviceID)
		}
		if tagCode, ok := savedFilters["tag_code"].(string); ok && tagCode != "" {
			q = q.Where("EXISTS (SELECT 1 FROM work_order_tag_links WHERE work_order_tag_links.work_order_id = work_orders.id AND work_order_tag_links.tag_code = ?)", tagCode)
		}
		if businessNo, ok := savedFilters["business_no"].(string); ok && businessNo != "" {
			q = q.Where("business_no LIKE ?", "%"+businessNo+"%")
		}
		if externalRef, ok := savedFilters["external_ref"].(string); ok && externalRef != "" {
			q = q.Where("external_ref LIKE ?", "%"+externalRef+"%")
		}
		if startTime, ok := savedFilters["start_time"].(string); ok && startTime != "" {
			q = q.Where("created_at >= ?", startTime)
		}
		if endTime, ok := savedFilters["end_time"].(string); ok && endTime != "" {
			q = q.Where("created_at <= ?", endTime)
		}
	}

	// 验证工单ID是否在分享范围内
	var count int64
	q.Where("id = ?", woID).Count(&count)
	if count == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "该工单不在分享范围内"})
		return
	}

	// 获取进展列表（复用 ListWorkOrderProgress 的逻辑）
	var list []models.WorkOrderProgress
	if err := database.DB.Where("work_order_id = ?", woID).Order("id DESC").Find(&list).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 批量查询所有进展的附件
	progressIDs := make([]uint, 0, len(list))
	for _, p := range list {
		progressIDs = append(progressIDs, p.ID)
	}
	attachmentsByProgress := make(map[uint][]models.WorkOrderProgressAttachment)
	if len(progressIDs) > 0 {
		var attachments []models.WorkOrderProgressAttachment
		database.DB.Where("progress_id IN ?", progressIDs).Order("id ASC").Find(&attachments)
		for _, att := range attachments {
			attachmentsByProgress[att.ProgressID] = append(attachmentsByProgress[att.ProgressID], att)
		}
	}

	type progressRow struct {
		models.WorkOrderProgress
		Attachments []models.WorkOrderProgressAttachment `json:"attachments"`
	}
	out := make([]progressRow, 0, len(list))
	for _, p := range list {
		atts := attachmentsByProgress[p.ID]
		if atts == nil {
			atts = []models.WorkOrderProgressAttachment{}
		}
		out = append(out, progressRow{WorkOrderProgress: p, Attachments: atts})
	}

	c.JSON(http.StatusOK, gin.H{"data": out})
}

// ExportWorkOrders 导出工单列表为 Excel 文件（根据查询条件导出所有符合条件的记录）
func ExportWorkOrders(c *gin.Context) {
	q := database.DB.Model(&models.WorkOrder{})

	// 归档过滤：默认仅未归档
	if c.Query("archived") == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}

	// 应用所有查询条件
	if s := c.Query("status"); s != "" {
		q = q.Where("status = ?", s)
	}
	if t := c.Query("type_code"); t != "" {
		q = q.Where("type_code = ?", t)
	}
	if d := c.Query("device_id"); d != "" {
		q = q.Where("device_id = ?", d)
	}
	if a := c.Query("assigned_to"); a != "" {
		q = q.Where("assigned_to = ?", a)
	}
	if v := c.Query("visibility"); v != "" {
		q = q.Where("visibility = ?", v)
	}
	if bn := strings.TrimSpace(c.Query("business_no")); bn != "" {
		q = q.Where("business_no LIKE ?", "%"+bn+"%")
	}

	// 标签筛选
	if t := strings.TrimSpace(c.Query("tags")); t != "" {
		codes := make([]string, 0)
		for _, p := range strings.Split(t, ",") {
			if s := strings.TrimSpace(p); s != "" {
				codes = append(codes, s)
			}
		}
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}

	// 关键词搜索
	if searchKey := strings.TrimSpace(c.Query("search_key")); searchKey != "" {
		pattern := "%" + searchKey + "%"
		q = q.Where("code LIKE ? OR business_no LIKE ? OR other_codes LIKE ? OR title LIKE ? OR description LIKE ?",
			pattern, pattern, pattern, pattern, pattern)
	}

	// 创建时间范围筛选
	if createdStart := strings.TrimSpace(c.Query("created_start")); createdStart != "" {
		q = q.Where("created_at >= ?", createdStart)
	}
	if createdEnd := strings.TrimSpace(c.Query("created_end")); createdEnd != "" {
		q = q.Where("created_at <= ?", createdEnd)
	}

	// 非管理员权限过滤
	if c.GetString("role") != "admin" {
		uid := c.GetUint("user_id")
		q = q.Where("visibility = ? OR created_by = ? OR assigned_to = ?", "public", uid, uid)
	}

	// 查询所有符合条件的工单（限制最大 10000 条避免内存溢出）
	var rows []models.WorkOrder
	if err := q.Order("id DESC").Limit(10000).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 批量查询标签
	ids := make([]uint, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	tagsByWO := map[uint][]string{}
	if len(ids) > 0 {
		var links []models.WorkOrderTagLink
		database.DB.Where("work_order_id IN ?", ids).Find(&links)
		for _, l := range links {
			tagsByWO[l.WorkOrderID] = append(tagsByWO[l.WorkOrderID], l.TagCode)
		}
	}

	// 创建 Excel 文件
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			// 忽略关闭错误
		}
	}()

	sheetName := "工单列表"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	f.SetActiveSheet(index)
	f.DeleteSheet("Sheet1") // 删除默认工作表

	// 设置表头
	headers := []string{
		"工单号", "标题", "类型", "状态", "优先级", "公开性",
		"设备ID", "设备名称", "业务单号", "其他编码", "标签",
		"描述", "创建时间", "关闭时间", "归档时间",
	}

	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}

	// 设置表头样式
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#E0E0E0"}, Pattern: 1},
	})
	for i := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	// 状态、优先级、公开性映射
	statusMap := map[string]string{
		"open":        "待处理",
		"in_progress": "进行中",
		"resolved":    "已解决",
		"closed":      "已关闭",
		"reopened":    "重新打开",
	}
	priorityMap := map[string]string{
		"normal": "普通",
		"high":   "较高",
		"urgent": "紧急",
	}
	visibilityMap := map[string]string{
		"public":  "公开",
		"private": "私有",
	}

	// 填充数据
	for i, wo := range rows {
		rowNum := i + 2

		tags := tagsByWO[wo.ID]
		tagsStr := ""
		if len(tags) > 0 {
			tagsStr = strings.Join(tags, ", ")
		}

		statusLabel := statusMap[wo.Status]
		if statusLabel == "" {
			statusLabel = wo.Status
		}

		priorityLabel := priorityMap[wo.Priority]
		if priorityLabel == "" {
			priorityLabel = wo.Priority
		}

		visibilityLabel := visibilityMap[wo.Visibility]
		if visibilityLabel == "" {
			visibilityLabel = wo.Visibility
		}

		deviceName := wo.DeviceName

		values := []interface{}{
			wo.Code,
			wo.Title,
			wo.TypeCode,
			statusLabel,
			priorityLabel,
			visibilityLabel,
			wo.DeviceID,
			deviceName,
			wo.BusinessNo,
			wo.OtherCodes,
			tagsStr,
			wo.Description,
			wo.CreatedAt,
			wo.ClosedAt,
			wo.ArchivedAt,
		}

		for j, v := range values {
			cell, _ := excelize.CoordinatesToCellName(j+1, rowNum)
			f.SetCellValue(sheetName, cell, v)
		}
	}

	// 自动调整列宽
	for i := range headers {
		col, _ := excelize.ColumnNumberToName(i + 1)
		f.SetColWidth(sheetName, col, col, 15)
	}

	// 输出文件
	filename := fmt.Sprintf("工单列表_%s.xlsx", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Transfer-Encoding", "binary")

	if err := f.Write(c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
}

// ExportSharedWorkOrders 导出分享工单列表为 Excel（与分享页列表数据一致）
func ExportSharedWorkOrders(c *gin.Context) {
	token := c.Param("token")
	var share models.WorkOrderReportShare
	if err := database.DB.Where("token = ?", token).First(&share).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接不存在或已失效"})
		return
	}
	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已过期"})
		return
	}
	if share.AuthMode == "login" {
		if c.GetUint("user_id") == 0 {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "此分享链接需要登录才能访问"})
			return
		}
	}

	var savedFilters map[string]interface{}
	if share.FiltersJSON != "" {
		json.Unmarshal([]byte(share.FiltersJSON), &savedFilters)
	}

	q := database.DB.Model(&models.WorkOrder{})
	if archived, ok := savedFilters["archived"].(string); ok && archived == "1" {
		q = q.Where("archived = ?", true)
	} else {
		q = q.Where("archived = ? OR archived IS NULL", false)
	}
	if status, ok := savedFilters["status"].(string); ok && status != "" {
		q = q.Where("status = ?", status)
	}
	if typeCode, ok := savedFilters["type_code"].(string); ok && typeCode != "" {
		q = q.Where("type_code = ?", typeCode)
	}
	if deviceID, ok := savedFilters["device_id"].(string); ok && deviceID != "" {
		q = q.Where("device_id = ?", deviceID)
	}
	if tags, ok := savedFilters["tags"].(string); ok && tags != "" {
		codes := strings.Split(tags, ",")
		if len(codes) > 0 {
			sub := database.DB.Model(&models.WorkOrderTagLink{}).
				Select("work_order_id").Where("tag_code IN ?", codes)
			q = q.Where("id IN (?)", sub)
		}
	}
	if createdStart, ok := savedFilters["created_start"].(string); ok && createdStart != "" {
		q = q.Where("created_at >= ?", createdStart)
	}
	if createdEnd, ok := savedFilters["created_end"].(string); ok && createdEnd != "" {
		q = q.Where("created_at <= ?", createdEnd)
	}
	if archivedStart, ok := savedFilters["archived_start"].(string); ok && archivedStart != "" {
		q = q.Where("archived_at >= ?", archivedStart)
	}
	if archivedEnd, ok := savedFilters["archived_end"].(string); ok && archivedEnd != "" {
		q = q.Where("archived_at <= ?", archivedEnd)
	}

	var rows []models.WorkOrder
	if err := q.Order("id DESC").Limit(10000).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 批量查询标签名称
	ids := make([]uint, 0, len(rows))
	for i := range rows {
		ids = append(ids, rows[i].ID)
	}
	var allTags []models.WorkOrderTag
	database.DB.Find(&allTags)
	tagNameMap := make(map[string]string)
	for _, t := range allTags {
		tagNameMap[t.Code] = t.Name
	}
	tagsByWO := map[uint][]string{}
	if len(ids) > 0 {
		var links []models.WorkOrderTagLink
		database.DB.Where("work_order_id IN ?", ids).Find(&links)
		for _, l := range links {
			name := tagNameMap[l.TagCode]
			if name == "" {
				name = l.TagCode
			}
			tagsByWO[l.WorkOrderID] = append(tagsByWO[l.WorkOrderID], name)
		}
	}

	f := excelize.NewFile()
	defer f.Close()

	sheetName := "工单列表"
	index, err := f.NewSheet(sheetName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	f.SetActiveSheet(index)
	f.DeleteSheet("Sheet1")

	headers := []string{
		"工单号", "标题", "类型", "状态", "优先级",
		"设备名称", "业务单号", "其他编码", "标签",
		"描述", "创建时间", "关闭时间",
	}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheetName, cell, h)
	}
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font: &excelize.Font{Bold: true},
		Fill: excelize.Fill{Type: "pattern", Color: []string{"#E0E0E0"}, Pattern: 1},
	})
	for i := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellStyle(sheetName, cell, cell, headerStyle)
	}

	statusMap := map[string]string{
		"open": "待处理", "in_progress": "进行中", "resolved": "已解决",
		"closed": "已关闭", "reopened": "重新打开",
	}
	priorityMap := map[string]string{"normal": "普通", "high": "较高", "urgent": "紧急"}

	for i, wo := range rows {
		rowNum := i + 2
		tags := strings.Join(tagsByWO[wo.ID], ", ")
		sl := statusMap[wo.Status]
		if sl == "" {
			sl = wo.Status
		}
		pl := priorityMap[wo.Priority]
		if pl == "" {
			pl = wo.Priority
		}
		values := []interface{}{
			wo.Code, wo.Title, wo.TypeCode, sl, pl,
			wo.DeviceName, wo.BusinessNo, wo.OtherCodes, tags,
			wo.Description, wo.CreatedAt, wo.ClosedAt,
		}
		for j, v := range values {
			cell, _ := excelize.CoordinatesToCellName(j+1, rowNum)
			f.SetCellValue(sheetName, cell, v)
		}
	}

	for i := range headers {
		col, _ := excelize.ColumnNumberToName(i + 1)
		f.SetColWidth(sheetName, col, col, 15)
	}

	filename := fmt.Sprintf("工单列表_%s.xlsx", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Transfer-Encoding", "binary")
	if err := f.Write(c.Writer); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
