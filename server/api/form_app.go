package api

import (
	"app-manager/database"
	"app-manager/dbdriver"
	"app-manager/models"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func ListFormApps(c *gin.Context) {
	groupID := c.Query("group_id")
	q := database.DB.Model(&models.FormAppInfo{})
	if groupID != "" {
		q = q.Where("group_id = ?", groupID)
	}
	var rows []models.FormAppInfo
	q.Order("id DESC").Find(&rows)
	for i := range rows {
		_, _ = normalizeFormAppSchemas(&rows[i])
	}
	c.JSON(http.StatusOK, gin.H{"data": rows})
}

func GetFormApp(c *gin.Context) {
	var row models.FormAppInfo
	if err := database.DB.First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, _ = normalizeFormAppSchemas(&row)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func GetFormAppByCode(c *gin.Context) {
	var row models.FormAppInfo
	if err := database.DB.Where("code = ?", c.Param("code")).First(&row).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_, _ = normalizeFormAppSchemas(&row)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func CreateFormApp(c *gin.Context) {
	var body models.FormAppInfo
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// TODO: remove debug logging
	fmt.Printf("[DEBUG] CreateFormApp body: %+v, rawCode=[%s]\n", body, body.Code)
	if strings.TrimSpace(body.Code) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}
	var exist models.FormAppInfo
	if err := database.DB.Where("code = ?", body.Code).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code already exists"})
		return
	}
	if strings.TrimSpace(body.Mode) == "" {
		body.Mode = "form"
	}
	if err := database.DB.Create(&body).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 发布实时事件
	publishFormAppEvent("form_app.created", body)
	c.JSON(http.StatusOK, gin.H{"data": body})
}

func UpdateFormApp(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body models.FormAppInfo
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var cur models.FormAppInfo
	if err := database.DB.First(&cur, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if body.Code != "" && body.Code != cur.Code {
		var clash models.FormAppInfo
		if err := database.DB.Where("code = ? AND id <> ?", body.Code, id).First(&clash).Error; err == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code already exists"})
			return
		}
	}
	update := map[string]interface{}{
		"data_source_id":  body.DataSourceID,
		"name":            body.Name,
		"code":            body.Code,
		"mode":            body.Mode,
		"description":     body.Description,
		"entry_page_key":  body.EntryPageKey,
		"global_config":   body.GlobalConfig,
		"design_schema":   body.DesignSchema,
		"runtime_schema":  body.RuntimeSchema,
		"ui_schema":       body.UISchema,
		"publish_status":  body.PublishStatus,
		"share_token":     body.ShareToken,
		"share_expire_at": body.ShareExpireAt,
	}
	if err := database.DB.Model(&cur).Updates(update).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&cur, id)
	c.JSON(http.StatusOK, gin.H{"data": cur})
}

func DeleteFormApp(c *gin.Context) {
	var row models.FormAppInfo
	if err := database.DB.First(&row, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	database.DB.Delete(&row)
	// 发布实时事件
	publishFormAppEvent("form_app.deleted", row)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func CopyFormApp(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var src models.FormAppInfo
	if err := database.DB.First(&src, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	// 生成新的应用编码（添加 _copy 后缀和时间戳）
	newCode := fmt.Sprintf("%s_copy_%d", src.Code, time.Now().Unix())
	newName := src.Name + " (副本)"

	// 复制应用基本信息
	newApp := models.FormAppInfo{
		Code:            newCode,
		Name:            newName,
		Description:     src.Description,
		Mode:            src.Mode,
		DataSourceID:    src.DataSourceID,
		EntryPageKey:    src.EntryPageKey,
		GlobalConfig:    src.GlobalConfig,
		DesignSchema:    src.DesignSchema,
		RuntimeSchema:   src.RuntimeSchema,
		UISchema:        src.UISchema,
		PublishStatus:   0, // 副本默认为草稿状态
		ShareToken:      "",
		ShareExpireAt:   nil,
		ContentVersion:  1,
	}

	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": tx.Error.Error()})
		return
	}

	if err := tx.Create(&newApp).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 复制关联的页面
	var pages []models.FormAppPage
	if err := database.DB.Where("form_app_id = ?", src.ID).Find(&pages).Error; err == nil {
		for _, page := range pages {
			newPage := models.FormAppPage{
				FormAppID:     newApp.ID,
				PageKey:       page.PageKey,
				PageType:      page.PageType,
				Title:         page.Title,
				DesignSchema:  page.DesignSchema,
				InterfaceCode: page.InterfaceCode,
				ConfigJSON:    page.ConfigJSON,
				SortOrder:     page.SortOrder,
			}
			if err := tx.Create(&newPage).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}
	}

	// 复制页面链接
	var links []models.FormAppPageLink
	if err := database.DB.Where("form_app_id = ?", src.ID).Find(&links).Error; err == nil {
		for _, link := range links {
			newLink := models.FormAppPageLink{
				FormAppID:    newApp.ID,
				FromPageKey:  link.FromPageKey,
				ToPageKey:    link.ToPageKey,
				TriggerType:  link.TriggerType,
				ParamMapping: link.ParamMapping,
			}
			if err := tx.Create(&newLink).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 发布实时事件
	publishFormAppEvent("form_app.created", newApp)

	c.JSON(http.StatusOK, gin.H{"data": newApp})
}

func SaveFormAppSchema(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body struct {
		DesignSchema  string `json:"design_schema"`
		RuntimeSchema string `json:"runtime_schema"`
		UISchema      string `json:"ui_schema"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var row models.FormAppInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	update := map[string]interface{}{
		"design_schema":   body.DesignSchema,
		"runtime_schema":  body.RuntimeSchema,
		"ui_schema":       body.UISchema,
		"content_version": row.ContentVersion + 1,
	}
	if err := database.DB.Model(&row).Updates(update).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&row, id)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func PublishFormApp(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var row models.FormAppInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	token := strings.ReplaceAll(uuid.New().String(), "-", "")
	if err := database.DB.Model(&row).Updates(map[string]interface{}{
		"publish_status":  1,
		"share_token":     token,
		"share_expire_at": nil,
		"content_version": row.ContentVersion + 1,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	database.DB.First(&row, id)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func UnpublishFormApp(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var row models.FormAppInfo
	if err := database.DB.First(&row, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err := database.DB.Model(&models.FormAppInfo{}).Where("id = ?", id).Updates(map[string]interface{}{
		"publish_status":  0,
		"share_token":     "",
		"share_expire_at": nil,
	}).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	row.PublishStatus = 0
	row.ShareToken = ""
	row.ShareExpireAt = nil
	// 发布实时事件
	publishFormAppEvent("form_app.unpublished", row)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func RepairGeneratedFormSchemas(c *gin.Context) {
	var rows []models.FormAppInfo
	if err := database.DB.Order("id DESC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	repaired := 0
	for i := range rows {
		ok, err := normalizeFormAppSchemas(&rows[i])
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "id": rows[i].ID})
			return
		}
		if ok {
			repaired++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":             true,
		"total":          len(rows),
		"repaired_count": repaired,
	})
}

func GetFormAppByShareToken(c *gin.Context) {
	token := c.Param("token")
	var row models.FormAppInfo
	if err := database.DB.Where("share_token = ? AND publish_status = ?", token, 1).First(&row).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "invalid or unpublished share"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if row.ShareExpireAt != nil && time.Now().After(*row.ShareExpireAt) {
		c.JSON(http.StatusNotFound, gin.H{"error": "share expired"})
		return
	}
	_, _ = normalizeFormAppSchemas(&row)
	c.JSON(http.StatusOK, gin.H{"data": row})
}

func defaultRuntimeListPagination() map[string]interface{} {
	return map[string]interface{}{
		"pageParam":       "page",
		"pageSizeParam":   "page_size",
		"limitParam":      "limit",
		"offsetParam":     "offset",
		"defaultPageSize": 10,
	}
}

func defaultPageSchema(pageType string) map[string]interface{} {
	switch pageType {
	case "form":
		return map[string]interface{}{
			"type":   "form",
			"layout": "vertical",
			"sections": []map[string]interface{}{
				{"key": "fields", "title": "表单字段"},
				{"key": "actions", "title": "提交区域"},
			},
		}
	case "list":
		return map[string]interface{}{
			"type":   "list",
			"layout": "table",
			"sections": []map[string]interface{}{
				{"key": "filters", "title": "查询条件"},
				{"key": "table", "title": "数据列表"},
				{"key": "pagination", "title": "分页"},
			},
		}
	case "detail":
		return map[string]interface{}{
			"type":   "detail",
			"layout": "description",
			"sections": []map[string]interface{}{
				{"key": "content", "title": "详情内容"},
			},
		}
	default:
		return map[string]interface{}{"type": pageType}
	}
}

func fillRuntimePageSchemas(runtime map[string]interface{}) bool {
	changed := false
	if runtime == nil {
		return false
	}
	if _, ok := runtime["schema_version"]; !ok {
		runtime["schema_version"] = "1.0.0"
		changed = true
	}
	ds, ok := runtime["datasource"].(map[string]interface{})
	if !ok {
		ds = map[string]interface{}{}
		runtime["datasource"] = ds
		changed = true
	}
	if _, ok := ds["source_query_params"]; !ok {
		ds["source_query_params"] = map[string]interface{}{
			"tenant_id": "$context.tenant_id",
			"org_id":    "$context.org_id",
		}
		changed = true
	}
	pages, ok := runtime["pages"].(map[string]interface{})
	if !ok {
		pages = map[string]interface{}{}
		runtime["pages"] = pages
		changed = true
	}
	ensurePage := func(key string) map[string]interface{} {
		p, ok := pages[key].(map[string]interface{})
		if !ok {
			p = map[string]interface{}{}
			pages[key] = p
			changed = true
		}
		if _, ok := p["page_type"]; !ok {
			p["page_type"] = key
			changed = true
		}
		if _, ok := p["page_schema"]; !ok {
			p["page_schema"] = defaultPageSchema(key)
			changed = true
		}
		return p
	}
	formPage := ensurePage("form")
	_ = formPage
	listPage := ensurePage("list")
	if _, ok := listPage["pagination"]; !ok {
		listPage["pagination"] = defaultRuntimeListPagination()
		changed = true
	}
	if _, ok := listPage["query_conditions"]; !ok {
		listPage["query_conditions"] = []interface{}{}
		changed = true
	}
	ensurePage("detail")
	return changed
}

func defaultFormilyDesignSchema() map[string]interface{} {
	return map[string]interface{}{
		"form": map[string]interface{}{
			"labelCol":   6,
			"wrapperCol": 14,
		},
		"schema": map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"form": map[string]interface{}{
					"type":        "void",
					"x-component": "FormLayout",
					"x-component-props": map[string]interface{}{
						"layout": "vertical",
					},
					"properties": map[string]interface{}{
						"title": map[string]interface{}{
							"type":        "string",
							"title":       "名称",
							"x-decorator": "FormItem",
							"x-component": "Input",
						},
					},
				},
				"submit": map[string]interface{}{
					"type":        "void",
					"x-component": "SubmitButton",
					"x-component-props": map[string]interface{}{
						"text": "提交",
					},
				},
			},
		},
	}
}

func normalizeFormAppSchemas(row *models.FormAppInfo) (bool, error) {
	if row == nil {
		return false, nil
	}
	changed := false
	var runtime map[string]interface{}
	if strings.TrimSpace(row.RuntimeSchema) != "" {
		if err := json.Unmarshal([]byte(row.RuntimeSchema), &runtime); err != nil {
			runtime = map[string]interface{}{}
			changed = true
		}
	} else {
		runtime = map[string]interface{}{}
		changed = true
	}
	if fillRuntimePageSchemas(runtime) {
		changed = true
	}

	var design map[string]interface{}
	if strings.TrimSpace(row.DesignSchema) != "" {
		if err := json.Unmarshal([]byte(row.DesignSchema), &design); err != nil {
			design = defaultFormilyDesignSchema()
			changed = true
		}
	} else {
		design = defaultFormilyDesignSchema()
		changed = true
	}
	if design != nil {
		if _, ok := design["schema"]; !ok {
			design = map[string]interface{}{"form": map[string]interface{}{}, "schema": design}
			changed = true
		}
	}

	var ui map[string]interface{}
	if strings.TrimSpace(row.UISchema) != "" {
		if err := json.Unmarshal([]byte(row.UISchema), &ui); err != nil {
			ui = map[string]interface{}{}
			changed = true
		}
	} else {
		ui = map[string]interface{}{}
		changed = true
	}
	if _, ok := ui["schema_version"]; !ok {
		ui["schema_version"] = "1.0.0"
		changed = true
	}
	if _, ok := ui["mode"]; !ok {
		ui["mode"] = "generated-multi-pages"
		changed = true
	}
	if _, ok := ui["page_order"]; !ok {
		ui["page_order"] = []string{"form", "list", "detail"}
		changed = true
	}

	if !changed {
		return false, nil
	}
	rtBytes, _ := json.Marshal(runtime)
	dsBytes, _ := json.Marshal(design)
	uiBytes, _ := json.Marshal(ui)
	row.RuntimeSchema = string(rtBytes)
	row.DesignSchema = string(dsBytes)
	row.UISchema = string(uiBytes)
	row.ContentVersion += 1
	if err := database.DB.Model(row).Updates(map[string]interface{}{
		"runtime_schema":  row.RuntimeSchema,
		"design_schema":   row.DesignSchema,
		"ui_schema":       row.UISchema,
		"content_version": row.ContentVersion,
	}).Error; err != nil {
		return false, err
	}
	return true, nil
}

type formRuntimeRequest struct {
	InterfaceCode string                 `json:"interface_code"`
	ParamValues   map[string]interface{} `json:"param_values"`
	FormCode      string                 `json:"form_code"`
	PageType      string                 `json:"page_type"`
	QueryFilters  []runtimeQueryFilter   `json:"query_filters"`
}

type runtimeQueryFilter struct {
	Field    string      `json:"field"`
	Operator string      `json:"operator"`
	Value    interface{} `json:"value"`
}

func stringify(v interface{}) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case fmt.Stringer:
		return x.String()
	default:
		return fmt.Sprintf("%v", v)
	}
}

func parseIntFromAny(v interface{}, fallback int) int {
	if v == nil {
		return fallback
	}
	switch x := v.(type) {
	case int:
		return x
	case int32:
		return int(x)
	case int64:
		return int(x)
	case float64:
		return int(x)
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(x))
		if err == nil {
			return i
		}
	}
	return fallback
}

func applyQueryFilterParams(paramValues map[string]interface{}, filters []runtimeQueryFilter) {
	for _, f := range filters {
		field := strings.TrimSpace(f.Field)
		op := strings.ToLower(strings.TrimSpace(f.Operator))
		if field == "" || op == "" {
			continue
		}
		raw := stringify(f.Value)
		if strings.TrimSpace(raw) == "" {
			continue
		}
		// 统一携带原值 + 操作符键，便于数据接口 SQL 按需引用。
		paramValues[field] = raw
		paramValues[field+"__op"] = op
		paramValues[field+"__value"] = raw
		switch op {
		case "contains":
			paramValues[field] = "%" + raw + "%"
		case "starts_with":
			paramValues[field] = raw + "%"
		case "ends_with":
			paramValues[field] = "%" + raw
		case "eq", "gt", "gte", "lt", "lte", "between", "in":
			// 保持原值；具体语义在 DataInterface SQL 中使用 :field / :field__op 判定。
		default:
			// 未识别操作符也保留原值，避免阻断请求。
		}
	}
}

func mergeRuntimeSchemaParams(formCode, pageType string, req *formRuntimeRequest) {
	if req == nil || req.ParamValues == nil {
		return
	}
	code := strings.TrimSpace(formCode)
	if code == "" {
		return
	}
	var app models.FormAppInfo
	if err := database.DB.Where("code = ?", code).First(&app).Error; err != nil {
		return
	}
	rs := strings.TrimSpace(app.RuntimeSchema)
	if rs == "" {
		return
	}
	var schema map[string]interface{}
	if err := json.Unmarshal([]byte(rs), &schema); err != nil {
		return
	}
	// datasource.source_query_params 统一注入（请求参数优先）
	if ds, ok := schema["datasource"].(map[string]interface{}); ok {
		if sqp, ok := ds["source_query_params"].(map[string]interface{}); ok {
			for k, v := range sqp {
				if _, exists := req.ParamValues[k]; !exists {
					req.ParamValues[k] = v
				}
			}
		}
	}
	pt := strings.TrimSpace(pageType)
	if pt == "" {
		pt = strings.TrimSpace(req.PageType)
	}
	if pt != "list" {
		return
	}
	pages, ok := schema["pages"].(map[string]interface{})
	if !ok {
		return
	}
	listCfg, ok := pages["list"].(map[string]interface{})
	if !ok {
		return
	}
	if pg, ok := listCfg["pagination"].(map[string]interface{}); ok {
		pageParam := stringify(pg["pageParam"])
		if pageParam == "" {
			pageParam = "page"
		}
		pageSizeParam := stringify(pg["pageSizeParam"])
		if pageSizeParam == "" {
			pageSizeParam = "page_size"
		}
		limitParam := stringify(pg["limitParam"])
		if limitParam == "" {
			limitParam = "limit"
		}
		offsetParam := stringify(pg["offsetParam"])
		if offsetParam == "" {
			offsetParam = "offset"
		}
		defaultPageSize := parseIntFromAny(pg["defaultPageSize"], 10)
		page := parseIntFromAny(req.ParamValues[pageParam], 1)
		pageSize := parseIntFromAny(req.ParamValues[pageSizeParam], defaultPageSize)
		if page < 1 {
			page = 1
		}
		if pageSize <= 0 {
			pageSize = defaultPageSize
		}
		if _, ok := req.ParamValues[limitParam]; !ok {
			req.ParamValues[limitParam] = pageSize
		}
		if _, ok := req.ParamValues[offsetParam]; !ok {
			req.ParamValues[offsetParam] = (page - 1) * pageSize
		}
	}
	// schema 中定义的 query_conditions 作为默认过滤条件（请求覆盖）
	if qcs, ok := listCfg["query_conditions"].([]interface{}); ok {
		var defaults []runtimeQueryFilter
		for _, item := range qcs {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			defaults = append(defaults, runtimeQueryFilter{
				Field:    stringify(m["field"]),
				Operator: stringify(m["operator"]),
				Value:    m["value"],
			})
		}
		applyQueryFilterParams(req.ParamValues, defaults)
		if len(req.QueryFilters) == 0 {
			req.QueryFilters = defaults
		}
	}
	// 请求级 query_filters 最终覆盖并增强参数
	applyQueryFilterParams(req.ParamValues, req.QueryFilters)
}

func parseTypedValue(v interface{}) interface{} {
	switch t := v.(type) {
	case float64, int64, int32, int, bool, time.Time:
		return t
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return ""
		}
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
		if ts, err := time.Parse(time.RFC3339, s); err == nil {
			return ts
		}
		if ts, err := time.Parse("2006-01-02", s); err == nil {
			return ts
		}
		return s
	default:
		s := strings.TrimSpace(stringify(v))
		if s == "" {
			return ""
		}
		if i, err := strconv.ParseInt(s, 10, 64); err == nil {
			return i
		}
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
		return s
	}
}

func spliceWhereIntoSQL(sqlText, whereExpr string) string {
	base := strings.TrimSpace(sqlText)
	if whereExpr == "" {
		return base
	}
	if strings.Contains(base, "/*__DYNAMIC_WHERE__*/") {
		return strings.Replace(base, "/*__DYNAMIC_WHERE__*/", " "+whereExpr+" ", 1)
	}
	up := strings.ToUpper(base)
	insertAt := len(base)
	for _, kw := range []string{" ORDER BY ", " LIMIT ", " OFFSET "} {
		if idx := strings.LastIndex(up, kw); idx >= 0 && idx < insertAt {
			insertAt = idx
		}
	}
	prefix := strings.TrimSpace(base[:insertAt])
	suffix := strings.TrimSpace(base[insertAt:])
	if strings.Contains(strings.ToUpper(prefix), " WHERE ") {
		if suffix != "" {
			return fmt.Sprintf("%s AND %s %s", prefix, whereExpr, suffix)
		}
		return fmt.Sprintf("%s AND %s", prefix, whereExpr)
	}
	if suffix != "" {
		return fmt.Sprintf("%s WHERE %s %s", prefix, whereExpr, suffix)
	}
	return fmt.Sprintf("%s WHERE %s", prefix, whereExpr)
}

func applyDynamicFiltersToSQL(dsType, sqlText string, filters []runtimeQueryFilter, paramValues map[string]interface{}) string {
	if len(filters) == 0 || strings.TrimSpace(sqlText) == "" {
		return sqlText
	}
	var clauses []string
	for idx, f := range filters {
		field := strings.TrimSpace(f.Field)
		if field == "" || !reSQLTableName.MatchString(field) {
			continue
		}
		op := strings.ToLower(strings.TrimSpace(f.Operator))
		raw := stringify(f.Value)
		if strings.TrimSpace(raw) == "" {
			continue
		}
		typed := parseTypedValue(f.Value)
		col := quoteSQLTableIdent(dsType, field)
		paramKey := fmt.Sprintf("__form_filter_%d", idx)
		switch op {
		case "contains":
			paramValues[paramKey] = "%" + raw + "%"
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, paramKey))
		case "starts_with":
			paramValues[paramKey] = raw + "%"
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, paramKey))
		case "ends_with":
			paramValues[paramKey] = "%" + raw
			clauses = append(clauses, fmt.Sprintf("%s LIKE {{%s}}", col, paramKey))
		case "gt":
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s > {{%s}}", col, paramKey))
		case "gte":
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s >= {{%s}}", col, paramKey))
		case "lt":
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s < {{%s}}", col, paramKey))
		case "lte":
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s <= {{%s}}", col, paramKey))
		case "between":
			parts := strings.Split(raw, ",")
			if len(parts) >= 2 {
				p1 := paramKey + "_from"
				p2 := paramKey + "_to"
				paramValues[p1] = parseTypedValue(strings.TrimSpace(parts[0]))
				paramValues[p2] = parseTypedValue(strings.TrimSpace(parts[1]))
				clauses = append(clauses, fmt.Sprintf("(%s >= {{%s}} AND %s <= {{%s}})", col, p1, col, p2))
			}
		case "in":
			items := strings.Split(raw, ",")
			var holders []string
			for i, it := range items {
				it = strings.TrimSpace(it)
				if it == "" {
					continue
				}
				pk := fmt.Sprintf("%s_%d", paramKey, i)
				paramValues[pk] = parseTypedValue(it)
				holders = append(holders, fmt.Sprintf("{{%s}}", pk))
			}
			if len(holders) > 0 {
				clauses = append(clauses, fmt.Sprintf("%s IN (%s)", col, strings.Join(holders, ", ")))
			}
		case "eq", "":
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s = {{%s}}", col, paramKey))
		default:
			// 未识别操作符降级为等于，避免动态表单筛选失效
			paramValues[paramKey] = typed
			clauses = append(clauses, fmt.Sprintf("%s = {{%s}}", col, paramKey))
		}
	}
	if len(clauses) == 0 {
		return sqlText
	}
	return spliceWhereIntoSQL(sqlText, strings.Join(clauses, " AND "))
}

func executeFormRuntimeInterface(interfaceCode string, paramValues map[string]interface{}, queryFilters []runtimeQueryFilter) (map[string]interface{}, error) {
	code := strings.TrimSpace(interfaceCode)
	if code == "" {
		return nil, fmt.Errorf("interface_code required")
	}
	res, err := Execute(InvokeRequest{
		Code:           code,
		ParamValues:    paramValues,
		DynamicFilters: queryFilters,
		EnabledOnly:    true,
		LimitOverride:  200,
	})
	if err != nil {
		return nil, err
	}
	switch res.Kind {
	case InvokeKindQuery, InvokeKindStaticList:
		rows := res.Rows
		if rows == nil {
			rows = []map[string]interface{}{}
		}
		result := map[string]interface{}{"ok": true, "data": rows, "rows": rows}
		// 如果有 total count，添加到返回结果
		if res.TotalCount != nil {
			result["total"] = *res.TotalCount
		}
		return result, nil
	case InvokeKindQueryOne:
		if res.HasRow {
			return map[string]interface{}{"ok": true, "data": res.Row}, nil
		}
		return map[string]interface{}{"ok": true, "data": nil}, nil
	case InvokeKindTransaction:
		return map[string]interface{}{
			"ok":             true,
			"record_id":      res.LastInsertID,
			"last_insert_id": res.LastInsertID,
		}, nil
	case InvokeKindStaticCrud:
		return nil, fmt.Errorf("static crud interface is not supported in runtime bridge")
	default:
		return nil, fmt.Errorf("unsupported interface kind: %s", res.IfaceKind)
	}
}

func FormRuntimeQuery(c *gin.Context) {
	var body formRuntimeRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.InterfaceCode) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "interface_code required"})
		return
	}
	if body.ParamValues == nil {
		body.ParamValues = map[string]interface{}{}
	}
	mergeRuntimeSchemaParams(body.FormCode, body.PageType, &body)
	out, err := executeFormRuntimeInterface(body.InterfaceCode, body.ParamValues, body.QueryFilters)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

func FormRuntimeSubmit(c *gin.Context) {
	var body formRuntimeRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		log.Printf("[FormRuntimeSubmit] JSON binding error: %v\nRequest body: %s", err, c.Request.Body)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(body.InterfaceCode) == "" {
		log.Printf("[FormRuntimeSubmit] Missing interface_code\nRequest: %+v", body)
		c.JSON(http.StatusBadRequest, gin.H{"error": "interface_code required"})
		return
	}

	// 记录请求信息
	clientIP := c.ClientIP()
	log.Printf("[FormRuntimeSubmit] Request from %s\nInterface: %s\nParams: %+v\nForm: %s\nPageType: %s",
		clientIP, body.InterfaceCode, body.ParamValues, body.FormCode, body.PageType)

	out, err := executeFormRuntimeInterface(body.InterfaceCode, body.ParamValues, nil)
	if err != nil {
		// 打印完整错误上下文（已包含 SQL 和参数）
		log.Printf("[FormRuntimeSubmit] Execution failed from %s\nInterface: %s\nParams: %+v\nError: %v",
			clientIP, body.InterfaceCode, body.ParamValues, err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, out)
}

// FormRuntimeBootstrap Agent WebView 一次加载应用与页面（凭 X-Device-Token 或 JWT）。
func FormRuntimeBootstrap(c *gin.Context) {
	code := strings.TrimSpace(c.Param("code"))
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}
	app, err := formAppByCode(code)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var pages []models.FormAppPage
	if err := database.DB.Where("form_app_id = ?", app.ID).Order("sort_order ASC, id ASC").Find(&pages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var links []models.FormAppPageLink
	database.DB.Where("form_app_id = ?", app.ID).Find(&links)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{"app": app, "pages": pages, "links": links}})
}

// FormRuntimeMatchEvent 运行时扫码/事件路由匹配（Agent 与 Web 共用）。
func FormRuntimeMatchEvent(c *gin.Context) {
	var req struct {
		FormCode  string `json:"form_code" binding:"required"`
		EventType string `json:"event_type" binding:"required"`
		EventData string `json:"event_data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	app, err := formAppByCode(strings.TrimSpace(req.FormCode))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if matched, route := matchFormAppEventRoute(app.ID, req.EventType, req.EventData); matched {
		c.JSON(http.StatusOK, gin.H{
			"matched":         true,
			"target_page_key": route.TargetPageKey,
			"param_mapping":   route.ParamMapping,
			"route_id":        route.ID,
			"priority":        route.Priority,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"matched": false})
}

func inferFormComponentByColumn(col dbdriver.ColumnInfo) string {
	name := strings.ToLower(strings.TrimSpace(col.Name))
	dataType := strings.ToLower(strings.TrimSpace(col.DataType))

	// JSON/JSONB 类型使用 ArrayTable（适用于 PostgreSQL、MySQL 8.0+）
	if strings.Contains(dataType, "json") {
		return "ArrayTable"
	}

	// 根据列名推断
	switch {
	case strings.Contains(name, "time"), strings.Contains(name, "date"):
		return "DatePicker"
	case strings.Contains(name, "count"), strings.Contains(name, "num"), strings.Contains(name, "amount"), strings.Contains(name, "price"):
		return "NumberPicker"
	case strings.HasPrefix(name, "is_"), strings.HasPrefix(name, "has_"), strings.Contains(name, "enabled"):
		return "Switch"
	case strings.Contains(name, "remark"), strings.Contains(name, "desc"), strings.Contains(name, "content"):
		return "Input.TextArea"
	default:
		return "Input"
	}
}

func buildGeneratedDesignSchema(cols []dbdriver.ColumnInfo, pk string) map[string]interface{} {
	props := map[string]interface{}{}
	order := 0
	for _, c := range cols {
		name := strings.TrimSpace(c.Name)
		if name == "" || name == pk {
			continue
		}
		props[name] = map[string]interface{}{
			"type":        "string",
			"title":       strings.ToUpper(name),
			"x-decorator": "FormItem",
			"x-component": inferFormComponentByColumn(c),
			"x-index":     order,
		}
		order++
	}
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"form": map[string]interface{}{
				"type":        "void",
				"x-component": "FormLayout",
				"x-component-props": map[string]interface{}{
					"layout": "vertical",
				},
				"properties": props,
			},
			"submit": map[string]interface{}{
				"type":        "void",
				"x-component": "SubmitButton",
				"x-component-props": map[string]interface{}{
					"text": "提交",
				},
			},
		},
	}
	return map[string]interface{}{
		"form": map[string]interface{}{
			"labelCol":   6,
			"wrapperCol": 14,
		},
		"schema": schema,
	}
}

func buildGeneratedListDesignSchema(cols []dbdriver.ColumnInfo, pk string, platformType string) map[string]interface{} {
	var schema map[string]interface{}

	if platformType == "mobile" {
		// 移动端使用 ArrayCards，需要在 properties 中定义每个字段
		cardProperties := map[string]interface{}{}
		for i, c := range cols {
			name := strings.TrimSpace(c.Name)
			if name == "" {
				continue
			}
			cardProperties[name] = map[string]interface{}{
				"type":              "string",
				"title":             strings.ToUpper(name),
				"x-decorator":       "FormItem",
				"x-component":       "Input",
				"x-component-props": map[string]interface{}{"readOnly": true},
				"x-index":           i,
			}
		}

		schema = map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"list": map[string]interface{}{
					"type":        "array",
					"x-component": "ArrayCards",
					"x-component-props": map[string]interface{}{
						"title": "列表数据",
					},
					"items": map[string]interface{}{
						"type":       "object",
						"properties": cardProperties,
					},
				},
			},
		}
	} else {
		// Web 端使用 ArrayTable
		columns := []map[string]interface{}{}
		for _, c := range cols {
			name := strings.TrimSpace(c.Name)
			if name == "" {
				continue
			}
			columns = append(columns, map[string]interface{}{
				"title":     strings.ToUpper(name),
				"dataIndex": name,
				"key":       name,
			})
		}

		schema = map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"table": map[string]interface{}{
					"type":        "void",
					"x-component": "ArrayTable",
					"x-component-props": map[string]interface{}{
						"columns": columns,
						"rowKey":  pk,
					},
				},
			},
		}
	}

	return map[string]interface{}{
		"schema": schema,
	}
}

func GenerateFormAppPagesFromTable(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var app models.FormAppInfo
	if err := database.DB.First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
		return
	}
	var body struct {
		Mode         string `json:"mode"` // select_schema | create_schema
		DataSourceID uint   `json:"data_source_id"`
		Table        string `json:"table"`
		PrimaryKey   string `json:"primary_key"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.DataSourceID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data_source_id required"})
		return
	}
	tbl := strings.TrimSpace(body.Table)
	if tbl == "" || !reSQLTableName.MatchString(tbl) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid table"})
		return
	}
	pk := strings.TrimSpace(body.PrimaryKey)
	if pk == "" {
		pk = "id"
	}
	if !reSQLTableName.MatchString(pk) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid primary_key"})
		return
	}

	var src models.DataSource
	if err := database.DB.First(&src, body.DataSourceID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "data source not found"})
		return
	}
	sqlDB, err := openSQLDataSource(&src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer sqlDB.Close()
	cols, _ := dbdriver.ListColumns(sqlDB, src.Type, tbl)
	if len(cols) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "目标表未读取到列信息"})
		return
	}

	quotedTable := quoteSQLTableIdent(src.Type, tbl)
	pkCol := quoteSQLTableIdent(src.Type, pk)
	fmt.Printf("[DEBUG] GenerateFormAppPagesFromTable: src.Type=%s, tbl=%s, quotedTable=%s\n", src.Type, tbl, quotedTable)
	allowWrite := !src.IsReadOnly()
	base := app.Code
	if strings.TrimSpace(base) == "" {
		base = fmt.Sprintf("form_%d", app.ID)
	}
	suffix := fmt.Sprintf("%d", time.Now().Unix())
	listCode := fmt.Sprintf("%s_list_%s", base, suffix)
	detailCode := fmt.Sprintf("%s_detail_%s", base, suffix)
	submitCode := fmt.Sprintf("%s_submit_%s", base, suffix)

	listSQL := fmt.Sprintf("SELECT * FROM %s LIMIT {{limit}} OFFSET {{offset}}", quotedTable)
	detailSQL := fmt.Sprintf("SELECT * FROM %s WHERE %s = {{id}} LIMIT 1", quotedTable, pkCol)
	fmt.Printf("[DEBUG] Generated SQL - listSQL: %s\n", listSQL)
	fmt.Printf("[DEBUG] Generated SQL - detailSQL: %s\n", detailSQL)

	var insertCols []string
	var insertParams []string
	for _, c := range cols {
		if c.PrimaryKey || c.Name == pk {
			continue
		}
		insertCols = append(insertCols, quoteSQLTableIdent(src.Type, c.Name))
		insertParams = append(insertParams, fmt.Sprintf("{{%s}}", c.Name))
	}
	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", quotedTable, strings.Join(insertCols, ", "), strings.Join(insertParams, ", "))
	if len(insertCols) == 0 {
		insertSQL = fmt.Sprintf("INSERT INTO %s (%s) VALUES ({{%s}})", quotedTable, pkCol, pk)
	}

	listIfaceMeta := map[string]interface{}{
		"schema_version": "1.0.0",
		"generated_at":   time.Now().Format(time.RFC3339),
		"pagination": map[string]interface{}{
			"pageParam":        "page",
			"pageSizeParam":    "page_size",
			"limitParam":       "limit",
			"offsetParam":      "offset",
			"defaultPageSize":  10,
			"emit_total_count": true,
		},
	}
	listMetaJSONBytes, _ := json.Marshal(listIfaceMeta)

	detailIfaceMeta := map[string]interface{}{
		"schema_version": "1.0.0",
		"generated_at":   time.Now().Format(time.RFC3339),
	}
	detailMetaJSONBytes, _ := json.Marshal(detailIfaceMeta)

	dsList := models.Dataset{
		Code:         fmt.Sprintf("%s_ds_%s", base, suffix),
		DataSourceID: &src.ID,
		Category:     "form_app",
		Name:         fmt.Sprintf("%s_%s_list_auto", app.Name, tbl),
		Kind:         "query",
		Definition:   listSQL,
		StepsJSON:    "[]",
	}
	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": tx.Error.Error()})
		return
	}
	if err := tx.Create(&dsList).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dsDetail := models.Dataset{
		Code:         fmt.Sprintf("%s_ds_detail_%s", base, suffix),
		DataSourceID: &src.ID,
		Category:     "form_app",
		Name:         fmt.Sprintf("%s_%s_detail_auto", app.Name, tbl),
		Kind:         "query",
		Definition:   detailSQL,
		StepsJSON:    "[]",
	}
	if err := tx.Create(&dsDetail).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dsSubmit := models.Dataset{
		Code:         fmt.Sprintf("%s_ds_submit_%s", base, suffix),
		DataSourceID: &src.ID,
		Category:     "form_app",
		Name:         fmt.Sprintf("%s_%s_submit_auto", app.Name, tbl),
		Kind:         "transaction",
		Definition:   "",
		StepsJSON:    fmt.Sprintf(`["%s"]`, strings.ReplaceAll(insertSQL, `"`, `\"`)),
	}
	if allowWrite {
		if err := tx.Create(&dsSubmit).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	listIF := models.DataInterface{
		Category:   "form_app",
		Name:       app.Name + " 列表",
		Code:       listCode,
		Slug:       listCode,
		Kind:       "query",
		DatasetID:  &dsList.ID,
		Method:     "POST",
		Enabled:    true,
		SchemaJSON: string(listMetaJSONBytes),
	}
	detailIF := models.DataInterface{
		Category:   "form_app",
		Name:       app.Name + " 详情",
		Code:       detailCode,
		Slug:       detailCode,
		Kind:       "queryOne",
		DatasetID:  &dsDetail.ID,
		Method:     "POST",
		Enabled:    true,
		SchemaJSON: string(detailMetaJSONBytes),
	}
	submitIF := models.DataInterface{
		Category:   "form_app",
		Name:       app.Name + " 提交",
		Code:       submitCode,
		Slug:       submitCode,
		Kind:       "transaction",
		DatasetID:  &dsSubmit.ID,
		Method:     "POST",
		Enabled:    true,
		StepsJSON:  dsSubmit.StepsJSON,
		SchemaJSON: string(detailMetaJSONBytes),
	}
	if err := tx.Create(&listIF).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Create(&detailIF).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if allowWrite {
		if err := tx.Create(&submitIF).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	conditions := make([]map[string]interface{}, 0, len(cols))
	fieldDefs := make([]map[string]interface{}, 0, len(cols))
	for _, c := range cols {
		name := strings.TrimSpace(c.Name)
		if name == "" || name == pk {
			continue
		}
		comp := inferFormComponentByColumn(c)
		fieldDefs = append(fieldDefs, map[string]interface{}{
			"field":     name,
			"label":     strings.ToUpper(name),
			"component": comp,
			"required":  false,
		})
		if len(conditions) < 6 {
			conditions = append(conditions, map[string]interface{}{
				"field":    name,
				"operator": "contains",
				"label":    strings.ToUpper(name),
				"value":    "",
			})
		}
	}

	designSchema := buildGeneratedDesignSchema(cols, pk)
	designBytes, _ := json.Marshal(designSchema)

	listDesignSchema := buildGeneratedListDesignSchema(cols, pk, "web")
	listDesignBytes, _ := json.Marshal(listDesignSchema)

	listConfig := map[string]interface{}{
		"pagination": map[string]interface{}{
			"enabled":           true,
			"page_param":        "page",
			"page_size_param":   "page_size",
			"limit_param":       "limit",
			"offset_param":      "offset",
			"default_page_size": 10,
		},
		"query_conditions": conditions,
	}
	listConfigBytes, _ := json.Marshal(listConfig)

	formConfig := map[string]interface{}{
		"field_definitions": fieldDefs,
	}
	formConfigBytes, _ := json.Marshal(formConfig)

	detailFields := make([]map[string]interface{}, 0, len(cols))
	for _, c := range cols {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		detailFields = append(detailFields, map[string]interface{}{
			"field": name,
			"label": strings.ToUpper(name),
		})
	}
	detailConfig := map[string]interface{}{
		"fields": detailFields,
	}
	detailConfigBytes, _ := json.Marshal(detailConfig)

	pageForm := models.FormAppPage{
		FormAppID:    app.ID,
		PageKey:      "form",
		PageType:     "form",
		Title:        "Form",
		DesignSchema: string(designBytes),
		InterfaceCode: func() string {
			if allowWrite {
				return submitCode
			}
			return ""
		}(),
		ConfigJSON: string(formConfigBytes),
		SortOrder:  0,
	}
	pageList := models.FormAppPage{
		FormAppID:     app.ID,
		PageKey:       "list",
		PageType:      "list",
		Title:         "List",
		DesignSchema:  string(listDesignBytes),
		InterfaceCode: listCode,
		ConfigJSON:    string(listConfigBytes),
		SortOrder:     1,
	}
	pageDetail := models.FormAppPage{
		FormAppID:     app.ID,
		PageKey:       "detail",
		PageType:      "detail",
		Title:         "Detail",
		DesignSchema:  string(designBytes),
		InterfaceCode: detailCode,
		ConfigJSON:    string(detailConfigBytes),
		SortOrder:     2,
	}

	if err := tx.Create(&pageForm).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Create(&pageList).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Create(&pageDetail).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	linkListToDetail := models.FormAppPageLink{
		FormAppID:    app.ID,
		FromPageKey:  "list",
		ToPageKey:    "detail",
		TriggerType:  "row_click",
		ParamMapping: `{"id":"$row.id"}`,
	}
	linkFormToDetail := models.FormAppPageLink{
		FormAppID:    app.ID,
		FromPageKey:  "form",
		ToPageKey:    "detail",
		TriggerType:  "auto_redirect",
		ParamMapping: `{"id":"$result.record_id"}`,
	}
	if err := tx.Create(&linkListToDetail).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if allowWrite {
		if err := tx.Create(&linkFormToDetail).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}

	// 构建 runtime_schema：将页面级配置提升到应用级，供 mergeRuntimeSchemaParams 读取
	runtimeSchema := map[string]interface{}{
		"pages": map[string]interface{}{
			"list": map[string]interface{}{
				"pagination": map[string]interface{}{
					"enabled":         true,
					"pageParam":       "page",
					"pageSizeParam":   "page_size",
					"limitParam":      "limit",
					"offsetParam":     "offset",
					"defaultPageSize": 10,
				},
				"query_conditions": conditions,
			},
		},
	}
	runtimeSchemaBytes, _ := json.Marshal(runtimeSchema)

	if err := tx.Model(&app).Updates(map[string]interface{}{
		"data_source_id":  body.DataSourceID,
		"entry_page_key":  "form",
		"runtime_schema":  string(runtimeSchemaBytes),
		"content_version": app.ContentVersion + 1,
	}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	warnings := []string{}
	if !allowWrite {
		warnings = append(warnings, "当前数据源为只读，提交接口将无法写入，请切换可写数据源。")
	}
	c.JSON(http.StatusOK, gin.H{
		"data": gin.H{
			"pages": []gin.H{
				{"page_key": "form", "page_id": pageForm.ID, "interface_code": pageForm.InterfaceCode},
				{"page_key": "list", "page_id": pageList.ID, "interface_code": pageList.InterfaceCode},
				{"page_key": "detail", "page_id": pageDetail.ID, "interface_code": pageDetail.InterfaceCode},
			},
			"links": []gin.H{
				{"from": "list", "to": "detail", "trigger": "row_click"},
				{"from": "form", "to": "detail", "trigger": "auto_redirect"},
			},
			"interface_codes": gin.H{
				"list":   listCode,
				"detail": detailCode,
				"submit": submitCode,
			},
		},
		"warnings": warnings,
	})
}

// RegenerateSinglePage regenerates a single page (form/list/detail) from a data source table
func RegenerateSinglePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var app models.FormAppInfo
	if err := database.DB.First(&app, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
		return
	}
	var body struct {
		PageType     string   `json:"page_type"`
		PageTypes    []string `json:"page_types"`
		PlatformType string   `json:"platform_type"` // web | mobile
		DataSourceID uint     `json:"data_source_id"`
		Table        string   `json:"table"`
		PrimaryKey   string   `json:"primary_key"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Support both single page_type and multiple page_types
	var pageTypes []string
	if len(body.PageTypes) > 0 {
		pageTypes = body.PageTypes
	} else if body.PageType != "" {
		pageTypes = []string{body.PageType}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "page_type or page_types is required"})
		return
	}

	// Validate all page types
	for _, pt := range pageTypes {
		if pt != "form" && pt != "list" && pt != "detail" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "page_type must be form, list or detail"})
			return
		}
	}

	platformType := body.PlatformType
	if platformType == "" {
		platformType = "web"
	}
	if platformType != "web" && platformType != "mobile" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform_type must be web or mobile"})
		return
	}

	var src models.DataSource
	var sqlDB *sql.DB
	var cols []dbdriver.ColumnInfo
	var err error

	if body.DataSourceID > 0 && body.Table != "" {
		if err := database.DB.First(&src, body.DataSourceID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "data source not found"})
			return
		}
		sqlDB, err = openSQLDataSource(&src)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer sqlDB.Close()
		cols, _ = dbdriver.ListColumns(sqlDB, src.Type, body.Table)
		if len(cols) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "目标表未读取到列信息"})
			return
		}
	}

	pk := body.PrimaryKey
	if pk == "" {
		pk = "id"
	}
	allowWrite := src.ID > 0 && !src.IsReadOnly()
	base := app.Code
	if strings.TrimSpace(base) == "" {
		base = fmt.Sprintf("form_%d", app.ID)
	}
	suffix := fmt.Sprintf("%d", time.Now().Unix())

	quotedTable := ""
	pkCol := ""
	if body.Table != "" {
		quotedTable = quoteSQLTableIdent(src.Type, body.Table)
		pkCol = quoteSQLTableIdent(src.Type, pk)
	}

	// Begin transaction
	tx := database.DB.Begin()
	if tx.Error != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": tx.Error.Error()})
		return
	}

	createdPages := []gin.H{}

	// Generate each page type
	for _, pageType := range pageTypes {
		var designBytes []byte
		var configBytes []byte
		var interfaceCode string

		switch pageType {
		case "form":
			var insertCols []string
			var insertParams []string
			if len(cols) > 0 {
				for _, c := range cols {
					name := strings.TrimSpace(c.Name)
					if name == "" || name == pk {
						continue
					}
					insertCols = append(insertCols, quoteSQLTableIdent(src.Type, c.Name))
					insertParams = append(insertParams, fmt.Sprintf("{{%s}}", c.Name))
				}
			}
			insertSQL := ""
			if len(insertCols) > 0 {
				insertSQL = fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)", quotedTable, strings.Join(insertCols, ", "), strings.Join(insertParams, ", "))
			} else {
				insertSQL = fmt.Sprintf("INSERT INTO %s (%s) VALUES ({{%s}})", quotedTable, pkCol, pk)
			}
			if !allowWrite {
				insertSQL = ""
			}
			ifaceCode := fmt.Sprintf("%s_submit_%s", base, suffix)
			dsCode := fmt.Sprintf("%s_ds_submit_%s", base, suffix)
			ds := models.Dataset{
				Code:         dsCode,
				DataSourceID: &src.ID,
				Category:     "form_app",
				Name:         fmt.Sprintf("%s_%s_submit_auto", app.Name, body.Table),
				Kind:         "transaction",
				Definition:   "",
				StepsJSON:    fmt.Sprintf(`["%s"]`, strings.ReplaceAll(insertSQL, `"`, `\"`)),
			}
			if err := tx.Create(&ds).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create dataset: " + err.Error()})
				return
			}
			iface := models.DataInterface{
				Category:   "form_app",
				Name:       app.Name + " 提交",
				Code:       ifaceCode,
				Slug:       ifaceCode,
				Kind:       "transaction",
				DatasetID:  &ds.ID,
				Method:     "POST",
				Enabled:    true,
				SchemaJSON: `{"schema_version":"1.0.0"}`,
			}
			if err := tx.Create(&iface).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create interface: " + err.Error()})
				return
			}
			interfaceCode = ifaceCode

			fieldDefs := []map[string]interface{}{}
			for _, c := range cols {
				name := strings.TrimSpace(c.Name)
				if name == "" || name == pk {
					continue
				}
				fieldDefs = append(fieldDefs, map[string]interface{}{
					"field":     name,
					"label":     strings.ToUpper(name),
					"component": inferFormComponentByColumn(c),
					"required":  false,
				})
			}
			cfg := map[string]interface{}{"field_definitions": fieldDefs}
			configBytes, _ = json.Marshal(cfg)
			designBytes, _ = json.Marshal(buildGeneratedDesignSchema(cols, pk))

		case "list":
			ifaceCode := fmt.Sprintf("%s_list_%s", base, suffix)
			dsCode := fmt.Sprintf("%s_ds_%s", base, suffix)
			listSQL := fmt.Sprintf("SELECT * FROM %s LIMIT {{limit}} OFFSET {{offset}}", quotedTable)
			ds := models.Dataset{
				Code:         dsCode,
				DataSourceID: &src.ID,
				Category:     "form_app",
				Name:         fmt.Sprintf("%s_%s_list_auto", app.Name, body.Table),
				Kind:         "query",
				Definition:   listSQL,
				StepsJSON:    "[]",
			}
			if err := tx.Create(&ds).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create dataset: " + err.Error()})
				return
			}
			iface := models.DataInterface{
				Category:   "form_app",
				Name:       app.Name + " 列表",
				Code:       ifaceCode,
				Slug:       ifaceCode,
				Kind:       "query",
				DatasetID:  &ds.ID,
				Method:     "POST",
				Enabled:    true,
				SchemaJSON: `{"schema_version":"1.0.0","pagination":{"pageParam":"page","pageSizeParam":"page_size","limitParam":"limit","offsetParam":"offset","defaultPageSize":10,"emit_total_count":true}}`,
			}
			if err := tx.Create(&iface).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create interface: " + err.Error()})
				return
			}
			interfaceCode = ifaceCode

			// 生成字段定义（用于列表显示）
			fieldDefs := []map[string]interface{}{}
			for _, c := range cols {
				name := strings.TrimSpace(c.Name)
				if name == "" {
					continue
				}
				fieldDefs = append(fieldDefs, map[string]interface{}{
					"field": name,
					"label": strings.ToUpper(name),
				})
			}

			conditions := []map[string]interface{}{}
			for i, c := range cols {
				name := strings.TrimSpace(c.Name)
				if name == "" || name == pk {
					continue
				}
				if i < 6 {
					conditions = append(conditions, map[string]interface{}{
						"field":    name,
						"operator": "contains",
						"label":    strings.ToUpper(name),
						"value":    "",
					})
				}
			}
			cfg := map[string]interface{}{
				"field_definitions": fieldDefs,
				"pagination": map[string]interface{}{
					"enabled":           true,
					"page_param":        "page",
					"page_size_param":   "page_size",
					"limit_param":       "limit",
					"offset_param":      "offset",
					"default_page_size": 10,
				},
				"query_conditions": conditions,
			}
			configBytes, _ = json.Marshal(cfg)
			designBytes, _ = json.Marshal(buildGeneratedListDesignSchema(cols, pk, platformType))

		case "detail":
			ifaceCode := fmt.Sprintf("%s_detail_%s", base, suffix)
			dsCode := fmt.Sprintf("%s_ds_detail_%s", base, suffix)
			detailSQL := fmt.Sprintf("SELECT * FROM %s WHERE %s = {{id}} LIMIT 1", quotedTable, pkCol)
			ds := models.Dataset{
				Code:         dsCode,
				DataSourceID: &src.ID,
				Category:     "form_app",
				Name:         fmt.Sprintf("%s_%s_detail_auto", app.Name, body.Table),
				Kind:         "query",
				Definition:   detailSQL,
				StepsJSON:    "[]",
			}
			if err := tx.Create(&ds).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create dataset: " + err.Error()})
				return
			}
			iface := models.DataInterface{
				Category:   "form_app",
				Name:       app.Name + " 详情",
				Code:       ifaceCode,
				Slug:       ifaceCode,
				Kind:       "queryOne",
				DatasetID:  &ds.ID,
				Method:     "POST",
				Enabled:    true,
				SchemaJSON: `{"schema_version":"1.0.0"}`,
			}
			if err := tx.Create(&iface).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create interface: " + err.Error()})
				return
			}
			interfaceCode = ifaceCode

			cfg := map[string]interface{}{}
			configBytes, _ = json.Marshal(cfg)
			designBytes, _ = json.Marshal(buildGeneratedDetailDesignSchema(cols, pk))
		}

		// Delete existing page with same page_key
		database.DB.Where("form_app_id = ? AND page_key = ?", app.ID, pageType).Delete(&models.FormAppPage{})

		existingCount := int64(0)
		database.DB.Model(&models.FormAppPage{}).Where("form_app_id = ?", app.ID).Count(&existingCount)

		page := models.FormAppPage{
			FormAppID:     app.ID,
			PageKey:       pageType,
			PageType:      pageType,
			Title:         map[string]string{"form": "表单页", "list": "列表页", "detail": "详情页"}[pageType],
			DesignSchema:  string(designBytes),
			InterfaceCode: interfaceCode,
			ConfigJSON:    string(configBytes),
			SortOrder:     int(existingCount),
		}
		if err := tx.Create(&page).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create page: " + err.Error()})
			return
		}

		createdPages = append(createdPages, gin.H{
			"page_key":       page.PageKey,
			"page_id":        page.ID,
			"interface_code": page.InterfaceCode,
		})

		// Create page links based on page type
		switch pageType {
		case "form":
			// form -> list: auto_redirect after submit
			tx.Where("form_app_id = ? AND from_page_key = 'form' AND to_page_key = 'list'", app.ID).
				Delete(&models.FormAppPageLink{})
			linkFormToList := models.FormAppPageLink{
				FormAppID:    app.ID,
				FromPageKey:  "form",
				ToPageKey:    "list",
				TriggerType:  "auto_redirect",
				ParamMapping: `{}`,
			}
			tx.Create(&linkFormToList)

			// form -> detail: auto_redirect after submit (alternative, pass record_id)
			tx.Where("form_app_id = ? AND from_page_key = 'form' AND to_page_key = 'detail'", app.ID).
				Delete(&models.FormAppPageLink{})
			linkFormToDetail := models.FormAppPageLink{
				FormAppID:    app.ID,
				FromPageKey:  "form",
				ToPageKey:    "detail",
				TriggerType:  "auto_redirect",
				ParamMapping: `{"id":"$result.record_id"}`,
			}
			tx.Create(&linkFormToDetail)

		case "detail":
			// list -> detail: row_click
			tx.Where("form_app_id = ? AND from_page_key = 'list' AND to_page_key = 'detail'", app.ID).
				Delete(&models.FormAppPageLink{})
			linkListToDetail := models.FormAppPageLink{
				FormAppID:    app.ID,
				FromPageKey:  "list",
				ToPageKey:    "detail",
				TriggerType:  "row_click",
				ParamMapping: `{"id":"$row.id"}`,
			}
			tx.Create(&linkListToDetail)
		}
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": createdPages,
	})
}

func buildGeneratedDetailDesignSchema(cols []dbdriver.ColumnInfo, pk string) map[string]interface{} {
	props := map[string]interface{}{}
	order := 0
	for _, c := range cols {
		name := strings.TrimSpace(c.Name)
		if name == "" {
			continue
		}
		props[name] = map[string]interface{}{
			"type":        "string",
			"title":       strings.ToUpper(name),
			"x-decorator": "FormItem",
			"x-component": "Input",
			"x-component-props": map[string]interface{}{
				"readOnly": true,
			},
			"x-index": order,
		}
		order++
	}
	schema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"detail": map[string]interface{}{
				"type":        "void",
				"x-component": "FormLayout",
				"x-component-props": map[string]interface{}{
					"layout": "vertical",
				},
				"properties": props,
			},
		},
	}
	return map[string]interface{}{
		"form": map[string]interface{}{
			"labelCol":   6,
			"wrapperCol": 14,
		},
		"schema": schema,
	}
}

type formDraftPutRequest struct {
	FormCode string                 `json:"form_code"`
	PageKey  string                 `json:"page_key"`
	Data     map[string]interface{} `json:"data"`
}

func formAppByCode(code string) (*models.FormAppInfo, error) {
	var app models.FormAppInfo
	if err := database.DB.Where("code = ?", strings.TrimSpace(code)).First(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

func draftUserID(c *gin.Context) uint {
	v, ok := c.Get("user_id")
	if !ok {
		return 0
	}
	uid, _ := v.(uint)
	return uid
}

func FormRuntimeGetDraft(c *gin.Context) {
	formCode := strings.TrimSpace(c.Query("form_code"))
	pageKey := strings.TrimSpace(c.Query("page_key"))
	if formCode == "" || pageKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "form_code and page_key required"})
		return
	}
	app, err := formAppByCode(formCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var draft models.FormAppDraft
	err = database.DB.Where("form_app_id = ? AND user_id = ? AND page_key = ?", app.ID, draftUserID(c), pageKey).First(&draft).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusOK, gin.H{"data": nil})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var data map[string]interface{}
	if draft.DataJSON != "" {
		_ = json.Unmarshal([]byte(draft.DataJSON), &data)
	}
	c.JSON(http.StatusOK, gin.H{"data": data})
}

func FormRuntimePutDraft(c *gin.Context) {
	var body formDraftPutRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	formCode := strings.TrimSpace(body.FormCode)
	pageKey := strings.TrimSpace(body.PageKey)
	if formCode == "" || pageKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "form_code and page_key required"})
		return
	}
	app, err := formAppByCode(formCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if body.Data == nil {
		body.Data = map[string]interface{}{}
	}
	raw, err := json.Marshal(body.Data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	uid := draftUserID(c)
	var draft models.FormAppDraft
	err = database.DB.Where("form_app_id = ? AND user_id = ? AND page_key = ?", app.ID, uid, pageKey).First(&draft).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		draft = models.FormAppDraft{
			FormAppID: app.ID,
			UserID:    uid,
			PageKey:   pageKey,
			DataJSON:  string(raw),
		}
		if err := database.DB.Create(&draft).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	} else {
		if err := database.DB.Model(&draft).Update("data_json", string(raw)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func FormRuntimeDeleteDraft(c *gin.Context) {
	formCode := strings.TrimSpace(c.Query("form_code"))
	pageKey := strings.TrimSpace(c.Query("page_key"))
	if formCode == "" || pageKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "form_code and page_key required"})
		return
	}
	app, err := formAppByCode(formCode)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "form app not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	database.DB.Where("form_app_id = ? AND user_id = ? AND page_key = ?", app.ID, draftUserID(c), pageKey).
		Delete(&models.FormAppDraft{})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
