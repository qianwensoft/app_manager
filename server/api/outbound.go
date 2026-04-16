package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"app-manager/database"
	"app-manager/models"
	"app-manager/outbound"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// --- Apps ---

type outboundAppIn struct {
	Name          string                 `json:"name" binding:"required"`
	Description   string                 `json:"description"`
	BaseURL       string                 `json:"base_url" binding:"required"`
	AuthType      string                 `json:"auth_type"`
	AuthConfig    map[string]interface{} `json:"auth_config"`
	TokenProvider json.RawMessage        `json:"token_provider"`
	Enabled       *bool                  `json:"enabled"`
}

func tokenProviderJSONFromRequest(raw json.RawMessage, prev string, isCreate bool) (string, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		if isCreate {
			return "{}", nil
		}
		if strings.TrimSpace(prev) == "" {
			return "{}", nil
		}
		return prev, nil
	}
	var v interface{}
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func outboundAppToJSON(a models.OutboundApp) gin.H {
	var ac interface{}
	_ = json.Unmarshal([]byte(a.AuthConfigJSON), &ac)
	if ac == nil {
		ac = map[string]interface{}{}
	}
	var tp interface{}
	_ = json.Unmarshal([]byte(a.TokenProviderJSON), &tp)
	if tp == nil {
		tp = map[string]interface{}{}
	}
	ts, _ := outbound.TokenStatusForAPI(&a)
	if ts == nil {
		ts = map[string]interface{}{}
	}
	en := a.Enabled
	return gin.H{
		"id":             a.ID,
		"name":           a.Name,
		"description":    a.Description,
		"base_url":       a.BaseURL,
		"auth_type":      a.AuthType,
		"auth_config":    ac,
		"token_provider": tp,
		"token_status":   ts,
		"enabled":        en,
		"created_at":     a.CreatedAt,
		"updated_at":     a.UpdatedAt,
	}
}

func marshalAuthConfig(m map[string]interface{}) (string, error) {
	if m == nil {
		return "{}", nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ListOutboundApps(c *gin.Context) {
	var rows []models.OutboundApp
	if err := database.DB.Order("id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, outboundAppToJSON(r))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundApp(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func CreateOutboundApp(c *gin.Context) {
	var req outboundAppIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	authType := strings.TrimSpace(req.AuthType)
	if authType == "" {
		authType = "none"
	}
	acJSON, err := marshalAuthConfig(req.AuthConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpJSON, err := tokenProviderJSONFromRequest(req.TokenProvider, "", true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token_provider: " + err.Error()})
		return
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	a := models.OutboundApp{
		Name:              strings.TrimSpace(req.Name),
		Description:       req.Description,
		BaseURL:           strings.TrimSpace(req.BaseURL),
		AuthType:          authType,
		AuthConfigJSON:    acJSON,
		TokenProviderJSON: tpJSON,
		Enabled:           en,
	}
	if err := database.DB.Create(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func UpdateOutboundApp(c *gin.Context) {
	var a models.OutboundApp
	if err := database.DB.First(&a, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundAppIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	authType := strings.TrimSpace(req.AuthType)
	if authType == "" {
		authType = a.AuthType
	}
	acJSON, err := marshalAuthConfig(req.AuthConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpJSON, err := tokenProviderJSONFromRequest(req.TokenProvider, a.TokenProviderJSON, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token_provider: " + err.Error()})
		return
	}
	a.Name = strings.TrimSpace(req.Name)
	a.Description = req.Description
	a.BaseURL = strings.TrimSpace(req.BaseURL)
	a.AuthType = authType
	a.AuthConfigJSON = acJSON
	a.TokenProviderJSON = tpJSON
	if req.Enabled != nil {
		a.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&a).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": outboundAppToJSON(a)})
}

func DeleteOutboundApp(c *gin.Context) {
	id := c.Param("id")
	var n int64
	database.DB.Model(&models.OutboundEndpoint{}).Where("app_id = ?", id).Count(&n)
	if n > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请先删除该应用下的接口（Endpoint）"})
		return
	}
	if err := database.DB.Delete(&models.OutboundApp{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Endpoints ---

type outboundEndpointIn struct {
	AppID        uint                   `json:"app_id" binding:"required"`
	Name         string                 `json:"name" binding:"required"`
	Method       string                 `json:"method"`
	Path         string                 `json:"path" binding:"required"`
	Headers      map[string]interface{} `json:"headers"`
	BodyTemplate string                 `json:"body_template"`
	TimeoutMS    int                    `json:"timeout_ms"`
	RetryMax     int                    `json:"retry_max"`
	Enabled      *bool                  `json:"enabled"`
}

func headersToJSON(h map[string]interface{}) (string, error) {
	if h == nil {
		return "{}", nil
	}
	// 扁平化为 string -> string
	m := make(map[string]string)
	for k, v := range h {
		m[k] = strings.TrimSpace(toString(v))
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func toString(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		b, _ := json.Marshal(t)
		return string(b)
	}
}

func endpointToJSON(ep models.OutboundEndpoint) gin.H {
	var hdr map[string]string
	_ = json.Unmarshal([]byte(ep.HeadersJSON), &hdr)
	if hdr == nil {
		hdr = map[string]string{}
	}
	en := ep.Enabled
	appName := ""
	if ep.App != nil {
		appName = ep.App.Name
	}
	return gin.H{
		"id":            ep.ID,
		"app_id":        ep.AppID,
		"app_name":      appName,
		"name":          ep.Name,
		"method":        ep.Method,
		"path":          ep.Path,
		"headers":       hdr,
		"body_template": ep.BodyTemplate,
		"timeout_ms":    ep.TimeoutMS,
		"retry_max":     ep.RetryMax,
		"enabled":       en,
		"created_at":    ep.CreatedAt,
		"updated_at":    ep.UpdatedAt,
	}
}

func ListOutboundEndpoints(c *gin.Context) {
	q := database.DB.Model(&models.OutboundEndpoint{}).Preload("App").Order("app_id ASC, id ASC")
	if aid := strings.TrimSpace(c.Query("app_id")); aid != "" {
		q = q.Where("app_id = ?", aid)
	}
	var rows []models.OutboundEndpoint
	if err := q.Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, endpointToJSON(r))
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundEndpoint(c *gin.Context) {
	var ep models.OutboundEndpoint
	if err := database.DB.Preload("App").First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

func CreateOutboundEndpoint(c *gin.Context) {
	var req outboundEndpointIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var cnt int64
	database.DB.Model(&models.OutboundApp{}).Where("id = ?", req.AppID).Count(&cnt)
	if cnt == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_id 不存在"})
		return
	}
	hj, err := headersToJSON(req.Headers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = "POST"
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	ep := models.OutboundEndpoint{
		AppID:        req.AppID,
		Name:         strings.TrimSpace(req.Name),
		Method:       method,
		Path:         strings.TrimSpace(req.Path),
		HeadersJSON:  hj,
		BodyTemplate: req.BodyTemplate,
		TimeoutMS:    req.TimeoutMS,
		RetryMax:     req.RetryMax,
		Enabled:      en,
	}
	if err := database.DB.Create(&ep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.Preload("App").First(&ep, ep.ID).Error
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

func UpdateOutboundEndpoint(c *gin.Context) {
	var ep models.OutboundEndpoint
	if err := database.DB.First(&ep, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundEndpointIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.AppID != 0 && req.AppID != ep.AppID {
		var cnt int64
		database.DB.Model(&models.OutboundApp{}).Where("id = ?", req.AppID).Count(&cnt)
		if cnt == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "app_id 不存在"})
			return
		}
		ep.AppID = req.AppID
	}
	hj, err := headersToJSON(req.Headers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	method := strings.ToUpper(strings.TrimSpace(req.Method))
	if method == "" {
		method = ep.Method
	}
	ep.Name = strings.TrimSpace(req.Name)
	ep.Method = method
	ep.Path = strings.TrimSpace(req.Path)
	ep.HeadersJSON = hj
	ep.BodyTemplate = req.BodyTemplate
	ep.TimeoutMS = req.TimeoutMS
	ep.RetryMax = req.RetryMax
	if req.Enabled != nil {
		ep.Enabled = *req.Enabled
	}
	if err := database.DB.Save(&ep).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = database.DB.Preload("App").First(&ep, ep.ID).Error
	c.JSON(http.StatusOK, gin.H{"data": endpointToJSON(ep)})
}

func DeleteOutboundEndpoint(c *gin.Context) {
	id := c.Param("id")
	database.DB.Where("endpoint_id = ?", id).Delete(&models.OutboundConnectorEndpoint{})
	database.DB.Where("step_type = ? AND endpoint_id = ?", "http", id).Delete(&models.OutboundConnectorStep{})
	if err := database.DB.Delete(&models.OutboundEndpoint{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Connectors ---

type stepIn struct {
	StepType      string                 `json:"step_type"`
	EndpointID    uint                   `json:"endpoint_id"`
	DelayBeforeMS int                    `json:"delay_before_ms"`
	DelayAfterMS  int                    `json:"delay_after_ms"`
	Config        map[string]interface{} `json:"config"`
}

type phaseIn struct {
	RunMode string   `json:"run_mode"`
	Steps   []stepIn `json:"steps"`
}

func clampStepDelay(ms int) int {
	if ms < 0 {
		return 0
	}
	if ms > 600000 {
		return 600000
	}
	return ms
}

type outboundConnectorIn struct {
	Name                string    `json:"name" binding:"required"`
	Description         string    `json:"description"`
	ConnectorCode       string    `json:"connector_code"`
	DeliveryMode        string    `json:"delivery_mode"`
	DefaultTimeoutMS    int       `json:"default_timeout_ms"`
	DefaultRetryMax     int       `json:"default_retry_max"`
	DebounceSameEventMS int       `json:"debounce_same_event_ms"`
	DebounceDiffEventMS int       `json:"debounce_diff_event_ms"`
	Priority            int       `json:"priority"`
	Enabled             *bool     `json:"enabled"`
	DefinitionIDs       []uint    `json:"definition_ids" binding:"required"`
	DeviceIDs           []uint    `json:"device_ids"`
	Phases              []phaseIn `json:"phases"`
	EndpointIDs         []uint    `json:"endpoint_ids"`
}

func normalizeConnectorPhases(req *outboundConnectorIn) {
	if len(req.Phases) > 0 {
		return
	}
	if len(req.EndpointIDs) == 0 {
		return
	}
	mode := strings.TrimSpace(req.DeliveryMode)
	if mode == "" {
		mode = "parallel"
	}
	if mode != "parallel" && mode != "sequential" && mode != "failover" {
		mode = "parallel"
	}
	steps := make([]stepIn, 0, len(req.EndpointIDs))
	for _, eid := range req.EndpointIDs {
		if eid == 0 {
			continue
		}
		steps = append(steps, stepIn{StepType: "http", EndpointID: eid})
	}
	if len(steps) == 0 {
		return
	}
	req.Phases = []phaseIn{{RunMode: mode, Steps: steps}}
}

func validateConnectorIn(req *outboundConnectorIn) error {
	normalizeConnectorPhases(req)
	if len(req.DefinitionIDs) == 0 {
		return errors.New("definition_ids 不能为空")
	}
	if len(req.Phases) == 0 {
		return errors.New("phases 不能为空（可传 endpoint_ids 作为单阶段兼容）")
	}
	for pi := range req.Phases {
		ph := &req.Phases[pi]
		if len(ph.Steps) == 0 {
			return fmt.Errorf("阶段 %d 至少包含一个步骤", pi)
		}
		rm := strings.TrimSpace(ph.RunMode)
		if rm == "" {
			rm = "parallel"
		}
		if rm != "parallel" && rm != "sequential" && rm != "failover" {
			return fmt.Errorf("阶段 %d run_mode 须为 parallel/sequential/failover", pi)
		}
		ph.RunMode = rm
		for si, st := range ph.Steps {
			typ := outbound.NormalizeOutboundStepType(st.StepType)
			if typ == "" {
				return fmt.Errorf("阶段 %d 步骤 %d：缺少 step_type", pi, si)
			}
			switch typ {
			case "http":
				if st.EndpointID == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：http 须指定 endpoint_id", pi, si)
				}
				var n int64
				database.DB.Model(&models.OutboundEndpoint{}).Where("id = ? AND enabled = ?", st.EndpointID, true).Count(&n)
				if n == 0 {
					return fmt.Errorf("阶段 %d 步骤 %d：endpoint_id=%d 不存在或未启用", pi, si, st.EndpointID)
				}
			case "view_url":
				u, _ := st.Config["url"].(string)
				if st.Config == nil || strings.TrimSpace(u) == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：view_url 须在 config 中提供 url", pi, si)
				}
			case "broadcast_intent":
				a, _ := st.Config["action"].(string)
				if st.Config == nil || strings.TrimSpace(a) == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：broadcast_intent 须在 config 中提供 action", pi, si)
				}
			case "message":
				if st.Config == nil {
					return fmt.Errorf("阶段 %d 步骤 %d：message 须在 config 中提供 body、text 或 message", pi, si)
				}
				body := strings.TrimSpace(fmt.Sprint(st.Config["body"]))
				if body == "" {
					body = strings.TrimSpace(fmt.Sprint(st.Config["text"]))
				}
				if body == "" {
					body = strings.TrimSpace(fmt.Sprint(st.Config["message"]))
				}
				if body == "" {
					return fmt.Errorf("阶段 %d 步骤 %d：message 须在 config 中提供 body、text 或 message 之一", pi, si)
				}
			default:
				return fmt.Errorf("阶段 %d 步骤 %d：未知 step_type %q", pi, si, typ)
			}
			if st.DelayBeforeMS < 0 || st.DelayAfterMS < 0 {
				return fmt.Errorf("阶段 %d 步骤 %d：执行前/后延迟不能为负", pi, si)
			}
			if st.DelayBeforeMS > 600000 || st.DelayAfterMS > 600000 {
				return fmt.Errorf("阶段 %d 步骤 %d：执行前/后延迟不能超过 600000 ms", pi, si)
			}
		}
	}
	return nil
}

func saveConnectorBindings(tx *gorm.DB, connectorID uint, req *outboundConnectorIn) error {
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorDefinition{})
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorDevice{})
	tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorEndpoint{})

	seenDef := map[uint]struct{}{}
	for _, id := range req.DefinitionIDs {
		if id == 0 {
			continue
		}
		if _, ok := seenDef[id]; ok {
			continue
		}
		seenDef[id] = struct{}{}
		if err := tx.Create(&models.OutboundConnectorDefinition{ConnectorID: connectorID, DefinitionID: id}).Error; err != nil {
			return err
		}
	}
	seenDev := map[uint]struct{}{}
	for _, id := range req.DeviceIDs {
		if id == 0 {
			continue
		}
		if _, ok := seenDev[id]; ok {
			continue
		}
		seenDev[id] = struct{}{}
		if err := tx.Create(&models.OutboundConnectorDevice{ConnectorID: connectorID, DeviceID: id}).Error; err != nil {
			return err
		}
	}

	var oldPhaseIDs []uint
	tx.Model(&models.OutboundConnectorPhase{}).Where("connector_id = ?", connectorID).Pluck("id", &oldPhaseIDs)
	if len(oldPhaseIDs) > 0 {
		tx.Where("phase_id IN ?", oldPhaseIDs).Delete(&models.OutboundConnectorStep{})
		tx.Where("connector_id = ?", connectorID).Delete(&models.OutboundConnectorPhase{})
	}

	for pi, ph := range req.Phases {
		rm := strings.TrimSpace(ph.RunMode)
		if rm == "" {
			rm = "parallel"
		}
		p := models.OutboundConnectorPhase{
			ConnectorID: connectorID,
			SortOrder:   pi,
			RunMode:     rm,
		}
		if err := tx.Create(&p).Error; err != nil {
			return err
		}
		for si, st := range ph.Steps {
			typ := outbound.NormalizeOutboundStepType(st.StepType)
			cfg := "{}"
			if typ != "http" && st.Config != nil {
				b, err := json.Marshal(st.Config)
				if err != nil {
					return err
				}
				cfg = string(b)
			}
			row := models.OutboundConnectorStep{
				PhaseID:       p.ID,
				SortOrder:     si,
				StepType:      typ,
				EndpointID:    st.EndpointID,
				DelayBeforeMS: clampStepDelay(st.DelayBeforeMS),
				DelayAfterMS:  clampStepDelay(st.DelayAfterMS),
				ConfigJSON:    cfg,
			}
			if typ == "http" {
				row.ConfigJSON = "{}"
				row.EndpointID = st.EndpointID
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func connectorDetail(id uint) (gin.H, error) {
	var co models.OutboundConnector
	if err := database.DB.First(&co, id).Error; err != nil {
		return nil, err
	}
	var defs []models.OutboundConnectorDefinition
	database.DB.Where("connector_id = ?", id).Find(&defs)
	defIDs := make([]uint, 0, len(defs))
	for _, d := range defs {
		defIDs = append(defIDs, d.DefinitionID)
	}
	var devs []models.OutboundConnectorDevice
	database.DB.Where("connector_id = ?", id).Find(&devs)
	devIDs := make([]uint, 0, len(devs))
	for _, d := range devs {
		devIDs = append(devIDs, d.DeviceID)
	}

	var phases []models.OutboundConnectorPhase
	database.DB.Where("connector_id = ?", id).Order("sort_order ASC, id ASC").Find(&phases)
	phOut := make([]gin.H, 0, len(phases))
	epDedup := make([]uint, 0)
	for _, p := range phases {
		var steps []models.OutboundConnectorStep
		database.DB.Where("phase_id = ?", p.ID).Order("sort_order ASC, id ASC").Find(&steps)
		stOut := make([]gin.H, 0, len(steps))
		for _, s := range steps {
			var cfg interface{}
			_ = json.Unmarshal([]byte(s.ConfigJSON), &cfg)
			if cfg == nil {
				cfg = map[string]interface{}{}
			}
			stOut = append(stOut, gin.H{
				"id":              s.ID,
				"step_type":       s.StepType,
				"endpoint_id":     s.EndpointID,
				"delay_before_ms": s.DelayBeforeMS,
				"delay_after_ms":  s.DelayAfterMS,
				"config":          cfg,
			})
			if s.StepType == "http" && s.EndpointID > 0 {
				epDedup = append(epDedup, s.EndpointID)
			}
		}
		phOut = append(phOut, gin.H{
			"id":         p.ID,
			"run_mode":   p.RunMode,
			"steps":      stOut,
			"sort_order": p.SortOrder,
		})
	}

	en := co.Enabled
	return gin.H{
		"id":                     co.ID,
		"name":                   co.Name,
		"description":            co.Description,
		"connector_code":         co.ConnectorCode,
		"delivery_mode":          co.DeliveryMode,
		"default_timeout_ms":     co.DefaultTimeoutMS,
		"default_retry_max":      co.DefaultRetryMax,
		"debounce_same_event_ms": co.DebounceSameEventMS,
		"debounce_diff_event_ms": co.DebounceDiffEventMS,
		"priority":               co.Priority,
		"enabled":                en,
		"definition_ids":         defIDs,
		"device_ids":             devIDs,
		"phases":                 phOut,
		"endpoint_ids":           epDedup,
		"created_at":             co.CreatedAt,
		"updated_at":             co.UpdatedAt,
	}, nil
}

func ListOutboundConnectors(c *gin.Context) {
	var rows []models.OutboundConnector
	if err := database.DB.Order("priority ASC, id ASC").Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		h, _ := connectorDetail(r.ID)
		out = append(out, h)
	}
	c.JSON(http.StatusOK, gin.H{"data": out})
}

func GetOutboundConnector(c *gin.Context) {
	h, err := connectorDetail(uint(parseUint(c.Param("id"))))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func parseUint(s string) uint64 {
	n, _ := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
	return n
}

func CreateOutboundConnector(c *gin.Context) {
	var req outboundConnectorIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateConnectorIn(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	code := strings.TrimSpace(req.ConnectorCode)
	if code == "" {
		code = "http_webhook"
	}
	dm := strings.TrimSpace(req.Phases[0].RunMode)
	if dm == "" {
		dm = "parallel"
	}
	en := true
	if req.Enabled != nil {
		en = *req.Enabled
	}
	co := models.OutboundConnector{
		Name:                strings.TrimSpace(req.Name),
		Description:         req.Description,
		ConnectorCode:       code,
		DeliveryMode:        dm,
		DefaultTimeoutMS:    req.DefaultTimeoutMS,
		DefaultRetryMax:     req.DefaultRetryMax,
		DebounceSameEventMS: req.DebounceSameEventMS,
		DebounceDiffEventMS: req.DebounceDiffEventMS,
		Priority:            req.Priority,
		Enabled:             en,
	}
	if co.DefaultTimeoutMS <= 0 {
		co.DefaultTimeoutMS = 15000
	}
	if co.DefaultRetryMax < 0 {
		co.DefaultRetryMax = 0
	}
	if co.DebounceSameEventMS < 0 {
		co.DebounceSameEventMS = 0
	}
	if co.DebounceDiffEventMS < 0 {
		co.DebounceDiffEventMS = 0
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&co).Error; err != nil {
			return err
		}
		return saveConnectorBindings(tx, co.ID, &req)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h, _ := connectorDetail(co.ID)
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func UpdateOutboundConnector(c *gin.Context) {
	id := uint(parseUint(c.Param("id")))
	var co models.OutboundConnector
	if err := database.DB.First(&co, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req outboundConnectorIn
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateConnectorIn(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dm := strings.TrimSpace(req.Phases[0].RunMode)
	if dm == "" {
		dm = "parallel"
	}
	code := strings.TrimSpace(req.ConnectorCode)
	if code == "" {
		code = co.ConnectorCode
	}
	co.Name = strings.TrimSpace(req.Name)
	co.Description = req.Description
	co.ConnectorCode = code
	co.DeliveryMode = dm
	if req.DefaultTimeoutMS > 0 {
		co.DefaultTimeoutMS = req.DefaultTimeoutMS
	}
	co.DefaultRetryMax = req.DefaultRetryMax
	co.DebounceSameEventMS = req.DebounceSameEventMS
	co.DebounceDiffEventMS = req.DebounceDiffEventMS
	if co.DebounceSameEventMS < 0 {
		co.DebounceSameEventMS = 0
	}
	if co.DebounceDiffEventMS < 0 {
		co.DebounceDiffEventMS = 0
	}
	co.Priority = req.Priority
	if req.Enabled != nil {
		co.Enabled = *req.Enabled
	}

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Save(&co).Error; err != nil {
			return err
		}
		return saveConnectorBindings(tx, co.ID, &req)
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h, _ := connectorDetail(co.ID)
	c.JSON(http.StatusOK, gin.H{"data": h})
}

func DeleteOutboundConnector(c *gin.Context) {
	id := c.Param("id")
	err := database.DB.Transaction(func(tx *gorm.DB) error {
		var pids []uint
		tx.Model(&models.OutboundConnectorPhase{}).Where("connector_id = ?", id).Pluck("id", &pids)
		if len(pids) > 0 {
			tx.Where("phase_id IN ?", pids).Delete(&models.OutboundConnectorStep{})
		}
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorPhase{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorDefinition{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorDevice{})
		tx.Where("connector_id = ?", id).Delete(&models.OutboundConnectorEndpoint{})
		return tx.Delete(&models.OutboundConnector{}, id).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Deliveries ---

func ListOutboundDeliveries(c *gin.Context) {
	q := database.DB.Model(&models.OutboundDelivery{}).Order("id DESC")
	if s := strings.TrimSpace(c.Query("connector_id")); s != "" {
		q = q.Where("connector_id = ?", s)
	}
	if s := strings.TrimSpace(c.Query("device_event_id")); s != "" {
		q = q.Where("device_event_id = ?", s)
	}
	if s := strings.TrimSpace(c.Query("status")); s != "" {
		q = q.Where("status = ?", s)
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	ps, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if page < 1 {
		page = 1
	}
	if ps < 1 || ps > 200 {
		ps = 20
	}
	var total int64
	q.Count(&total)
	var rows []models.OutboundDelivery
	if err := q.Offset((page - 1) * ps).Limit(ps).Find(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rows, "total": total, "page": page, "page_size": ps})
}
