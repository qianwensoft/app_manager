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
	"app-manager/database"
	"app-manager/models"
	"app-manager/storage"
	"app-manager/workflow"

	"github.com/gin-gonic/gin"
)

// ── 工单（问题反馈）API ────────────────────────────────────────────────────

var workOrderStatuses = map[string]bool{
	"open": true, "in_progress": true, "resolved": true, "closed": true, "reopened": true,
}

func genWorkOrderCode() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return fmt.Sprintf("WO-%s-%s", time.Now().Format("20060102"), hex.EncodeToString(b))
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
		TypeCode    string `json:"type_code"`
		DeviceID    uint   `json:"device_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
		DataJSON    string `json:"data_json"`
		OtherCodes  string `json:"other_codes"`
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
		Code:        genWorkOrderCode(),
		TypeCode:    req.TypeCode,
		DeviceID:    deviceID,
		Title:       strings.TrimSpace(req.Title),
		Description: req.Description,
		Status:      "open",
		Priority:    priority,
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
	addWorkOrderActivity(wo.ID, "create", "", "open", c.GetUint("user_id"), actorLabel(c), wo.Title)
	dispatchWorkOrderEvent("work_order.created", &wo, actorLabel(c))
	c.JSON(http.StatusOK, gin.H{"data": wo})
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
			detail := "修改了工单描述"
			if wo.Description == "" {
				detail = "添加了工单描述"
			} else if newDesc == "" {
				detail = "清空了工单描述"
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
	// 优先级变更
	if req.Priority != nil {
		if *req.Priority != wo.Priority {
			updates["priority"] = *req.Priority
			addWorkOrderActivity(wo.ID, "update", wo.Status, wo.Status, uid, actor, fmt.Sprintf("优先级：%s → %s", wo.Priority, *req.Priority))
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
		dispatchWorkOrderEvent("work_order.updated", &wo, actor)
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
	updates := map[string]interface{}{"status": status}
	action := "status_change"
	if status == "closed" {
		now := time.Now()
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
	database.DB.Model(wo).Updates(updates)
	wo.Status = status
	addWorkOrderActivity(wo.ID, action, from, status, actorUserID, actor, comment)

	evt := "work_order.status_changed"
	if status == "closed" {
		evt = "work_order.closed"
	}
	dispatchWorkOrderEvent(evt, wo, actor)

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
		addWorkOrderActivity(wo.ID, "archive", wo.Status, wo.Status, uid, actor, "")
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
		"name":          req.Name,
		"description":   req.Description,
		"form_app_code": req.FormAppCode,
		"form_page_key": req.FormPageKey,
		"default_title": req.DefaultTitle,
		"board_card_template": req.BoardCardTemplate,
		"enabled":       req.Enabled,
		"sort_order":    req.SortOrder,
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

