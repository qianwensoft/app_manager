package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"app-manager/database"
	"app-manager/models"

	"github.com/gin-gonic/gin"
)

type aiChatMessage struct {
	Role        string `json:"role"`         // "user" | "assistant"
	Content     string `json:"content"`      // 文本内容
	ImageBase64 string `json:"image_base64"` // 可选，仅 user 消息
	MediaType   string `json:"media_type"`   // image/png | image/jpeg
}

type aiChatReq struct {
	Messages            []aiChatMessage   `json:"messages"`
	SkillIDs            []uint            `json:"skill_ids"`
	CurrentFields       []json.RawMessage `json:"current_fields"`
	CurrentEvents       []json.RawMessage `json:"current_events"`        // 当前页面已有事件（PageEvent[]，可选）
	CurrentPrinters     []json.RawMessage `json:"current_printers"`      // 当前页面已有打印模板（PrinterTemplate[]，可选）
	CurrentDesignSchema json.RawMessage   `json:"current_design_schema"` // 当前页面布局配置（design_schema，可选）
	PageContext         json.RawMessage   `json:"page_context"`          // 应用/页面当前状态上下文（可选）
}

// FormAppAIChat 通过 SSE 流式调用 Claude，辅助生成/修改 FieldDef[] 表单字段。
func FormAppAIChat(c *gin.Context) {
	var req aiChatReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Messages) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "messages 不能为空"})
		return
	}

	// 1) 组装 system：基础 FieldDef 契约 + 勾选的技能 + 当前字段
	system := buildFieldDefSystemPrompt()
	if len(req.SkillIDs) > 0 {
		var skills []models.AISkill
		database.DB.Where("id IN ? AND enabled = ?", req.SkillIDs, true).Find(&skills)
		for _, s := range skills {
			system += "\n\n## 技能：" + s.Name + "\n" + s.SystemPrompt
			if strings.TrimSpace(s.FieldSnippetJSON) != "" {
				system += "\n参考字段片段（FieldDef[]）:\n" + s.FieldSnippetJSON
			}
		}
	}
	if len(req.CurrentFields) > 0 {
		cur, _ := json.Marshal(req.CurrentFields)
		system += "\n\n## 当前页面已有字段（FieldDef[] - 共 " + fmt.Sprintf("%d", len(req.CurrentFields)) + " 个）\n" + string(cur) +
			"\n\n【强制要求】用户可能要求在此基础上增删改字段。你必须遵守以下规则：" +
			"\n1. ✅ 先复制上面的所有字段到你的输出数组中" +
			"\n2. ✅ 然后根据用户要求修改、添加或删除特定字段" +
			"\n3. ✅ 最后输出完整的字段数组（包含所有保留的 + 修改的 + 新增的）" +
			"\n4. ❌ 绝不能只输出被修改/新增的字段，那会导致其他字段丢失" +
			"\n5. ❌ 如果用户未明确说「删除XX字段」或「只保留XX字段」，所有现有字段都必须出现在输出中" +
			"\n\n示例：当前有 [A, B, C]，用户说「将B改为必填」→ 输出 [A(不变), B(必填), C(不变)]，而不是只输出 [B(必填)]"
	}
	if len(req.CurrentEvents) > 0 {
		cur, _ := json.Marshal(req.CurrentEvents)
		system += "\n\n## 当前页面已有事件（PageEvent[] - 共 " + fmt.Sprintf("%d", len(req.CurrentEvents)) + " 个）\n" + string(cur) +
			"\n\n【强制要求】用户可能要求在此基础上增删改事件。你必须遵守以下规则：" +
			"\n1. ✅ 先复制上面的所有事件到你的输出数组中" +
			"\n2. ✅ 然后根据用户要求修改、添加或删除特定事件" +
			"\n3. ✅ 最后在 events 中输出完整的事件数组（包含所有保留的 + 修改的 + 新增的）" +
			"\n4. ❌ 绝不能只输出被修改/新增的事件，那会导致其他事件丢失" +
			"\n5. ❌ 如果用户未明确说「删除XX事件」，所有现有事件都必须出现在输出中"
	}
	if len(req.CurrentPrinters) > 0 {
		cur, _ := json.Marshal(req.CurrentPrinters)
		system += "\n\n## 当前页面已有打印模板（PrinterTemplate[] - 共 " + fmt.Sprintf("%d", len(req.CurrentPrinters)) + " 个）\n" + string(cur) +
			"\n\n【强制要求】用户可能要求在此基础上增删改打印模板。你必须遵守以下规则：" +
			"\n1. ✅ 先复制上面的所有打印模板到你的输出数组中" +
			"\n2. ✅ 然后根据用户要求修改、添加或删除特定模板" +
			"\n3. ✅ 最后在 printers 中输出完整的模板数组（包含所有保留的 + 修改的 + 新增的）" +
			"\n4. ❌ 绝不能只输出被修改/新增的模板，那会导致其他模板丢失" +
			"\n5. ❌ 如果用户未明确说「删除XX模板」，所有现有模板都必须出现在输出中"
	}
	if len(req.CurrentDesignSchema) > 0 && string(req.CurrentDesignSchema) != "null" {
		// 紧凑输出布局配置
		var buf bytes.Buffer
		if json.Compact(&buf, req.CurrentDesignSchema) == nil {
			system += "\n\n## 当前页面布局配置（design_schema - 仅供参考）\n" + buf.String() +
				"\n\n【说明】这是页面的可视化设计器布局结构（Formily Schema），包含字段的排列、分组、栅格、标签页等。" +
				"\n目前你只需关注字段定义（field_definitions）、事件（events）和打印模板（printers）的内容逻辑。" +
				"\n布局结构（如分组、多栏、分割线）由用户在可视化设计器中手动调整，你无需生成或修改 design_schema。" +
				"\n如果用户明确要求调整布局（如\"字段分两栏显示\"、\"添加分组\"），请在回复中说明这需要在可视化设计器中操作，而非通过 AI 生成。"
		}
	}
	// 注入可用接口目录（内部数据接口 / 外部 outbound 接口 / 连接器接口），供 call_interface 动作引用
	if cat := buildInterfaceCatalog(); cat != "" {
		system += cat
	}
	if len(req.PageContext) > 0 && string(req.PageContext) != "null" {
		// 紧凑输出，避免占用过多 token
		var buf bytes.Buffer
		if json.Compact(&buf, req.PageContext) == nil {
			system += "\n\n## 应用与页面上下文（当前状态，供参考）\n" + buf.String() +
				"\n其中包含当前应用的所有页面（page_key/标题/类型/已有字段概览）、页面跳转关系与数据接口。" +
				"\n请结合这些上下文理解用户意图：字段命名风格、与其他页面字段保持一致、避免与跳转参数冲突。" +
				"\n注意：你仍然只为「当前页面」输出完整的 FieldDef[]，不要修改其他页面。"
		}
	}

	// 2) 构造 Anthropic messages（支持图片内容块）
	msgs := make([]claudeStreamMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		content := make([]claudeStreamContent, 0, 2)
		if m.ImageBase64 != "" {
			b64 := m.ImageBase64
			if i := strings.Index(b64, ","); i >= 0 {
				b64 = b64[i+1:] // 去掉 data:image/png;base64, 前缀
			}
			mt := m.MediaType
			if mt == "" {
				mt = "image/png"
			}
			content = append(content, claudeStreamContent{
				Type:   "image",
				Source: &claudeImageSource{Type: "base64", MediaType: mt, Data: b64},
			})
		}
		if m.Content != "" {
			content = append(content, claudeStreamContent{Type: "text", Text: m.Content})
		}
		if len(content) == 0 {
			continue
		}
		role := m.Role
		if role != "assistant" {
			role = "user"
		}
		msgs = append(msgs, claudeStreamMessage{Role: role, Content: content})
	}
	if len(msgs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "没有有效的消息内容"})
		return
	}

	// 3) 设置 SSE 响应头
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no") // 禁用 nginx 缓冲
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "当前环境不支持流式响应"})
		return
	}

	writeSSE := func(event string, data any) {
		b, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, b)
		flusher.Flush()
	}

	// 4) 流式调用，逐 delta 转发
	full, err := CallClaudeStream(c.Request.Context(), system, msgs, func(text string) {
		writeSSE("delta", gin.H{"text": text})
	})
	if err != nil {
		writeSSE("error", gin.H{"message": err.Error()})
		return
	}

	// 5) 结束：解析输出。新契约输出对象 { fields, events, printers, design_schema }；兼容旧的裸 FieldDef[] 数组。
	out := extractAIOutput(full)
	writeSSE("done", gin.H{
		"fields_parsed":        out.FieldsOK,
		"fields":               out.Fields,
		"events_parsed":        out.EventsOK,
		"events":               out.Events,
		"printers_parsed":      out.PrintersOK,
		"printers":             out.Printers,
		"design_schema_parsed": out.DesignSchemaOK,
		"design_schema":        out.DesignSchema,
	})
}

// aiOutput AI 输出解析结果。
type aiOutput struct {
	Fields         string
	FieldsOK       bool
	Events         string
	EventsOK       bool
	Printers       string
	PrintersOK     bool
	DesignSchema   string
	DesignSchemaOK bool
}

// extractAIOutput 解析 AI 输出。
// 优先解析对象 {"fields":[...],"events":[...],"printers":[...],"design_schema":{...}}；失败则回退到裸数组（仅 fields）。
func extractAIOutput(full string) aiOutput {
	var res aiOutput
	// 先尝试对象形式
	if objStr := extractJSONObject(full); objStr != "" {
		var obj struct {
			Fields       json.RawMessage `json:"fields"`
			Events       json.RawMessage `json:"events"`
			Printers     json.RawMessage `json:"printers"`
			DesignSchema json.RawMessage `json:"design_schema"`
		}
		if json.Unmarshal([]byte(objStr), &obj) == nil {
			res.Fields, res.FieldsOK = validJSONArray(obj.Fields)
			res.Events, res.EventsOK = validJSONArray(obj.Events)
			res.Printers, res.PrintersOK = validJSONArray(obj.Printers)
			res.DesignSchema, res.DesignSchemaOK = validJSONObject(obj.DesignSchema)
			// 对象里至少解析出四者之一，才认定为对象形式
			if res.FieldsOK || res.EventsOK || res.PrintersOK || res.DesignSchemaOK {
				return res
			}
		}
	}
	// 回退：裸数组当作 fields
	jsonStr := extractJSONArray(full)
	var fields []json.RawMessage
	if json.Unmarshal([]byte(jsonStr), &fields) == nil {
		res.Fields, res.FieldsOK = jsonStr, true
	}
	return res
}

// validJSONArray 校验 raw 是否为合法 JSON 数组，是则返回其字符串与 true。
func validJSONArray(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}
	var arr []json.RawMessage
	if json.Unmarshal(raw, &arr) == nil {
		return string(raw), true
	}
	return "", false
}

// validJSONObject 校验 raw 是否为合法 JSON 对象，是则返回其字符串与 true。
func validJSONObject(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 {
		return "", false
	}
	var obj map[string]interface{}
	if json.Unmarshal(raw, &obj) == nil {
		return string(raw), true
	}
	return "", false
}

// buildInterfaceCatalog 汇总可用接口目录，注入 system 供 call_interface 动作引用。
// 三类：internal（数据接口 code）、third_party（outbound endpoint id）、connector（连接器 interface_code）。
// 只取必要元信息（code/id/名称/方法/入参概览），控制 token 体积。
func buildInterfaceCatalog() string {
	var sb strings.Builder

	// 1) 内部数据接口
	var ifaces []models.DataInterface
	database.DB.Where("enabled = ?", true).
		Select("id", "code", "name", "kind", "method", "param_contract_json", "param_defaults_json").
		Order("id ASC").Limit(200).Find(&ifaces)
	if len(ifaces) > 0 {
		sb.WriteString("\n\n## 可用接口目录 — 内部数据接口（interface_type=\"internal\"，用 interface_code 引用）\n")
		for _, it := range ifaces {
			sb.WriteString(fmt.Sprintf("- code=%s | 名称=%s | kind=%s | method=%s", it.Code, it.Name, it.Kind, it.Method))
			if p := summarizeParams(it.ParamContractJSON); p != "" {
				sb.WriteString(" | 入参=" + p)
			}
			sb.WriteString("\n")
		}
	}

	// 2) 外部 outbound 接口（第三方）
	var eps []models.OutboundEndpoint
	database.DB.Where("enabled = ?", true).
		Select("id", "name", "method", "path", "param_schema").
		Order("id ASC").Limit(200).Find(&eps)
	if len(eps) > 0 {
		sb.WriteString("\n\n## 可用接口目录 — 外部接口（interface_type=\"third_party\"，用 third_party_endpoint_id 引用，注意是数字 id）\n")
		for _, ep := range eps {
			sb.WriteString(fmt.Sprintf("- id=%d | 名称=%s | %s %s", ep.ID, ep.Name, ep.Method, ep.Path))
			if p := summarizeParams(ep.ParamSchema); p != "" {
				sb.WriteString(" | 入参=" + p)
			}
			sb.WriteString("\n")
		}
	}

	// 3) 连接器接口
	var conns []models.OutboundConnector
	database.DB.Where("interface_mode = ? AND enabled = ?", true, true).
		Select("id", "name", "description", "interface_code").
		Order("id ASC").Limit(200).Find(&conns)
	if len(conns) > 0 {
		sb.WriteString("\n\n## 可用接口目录 — 连接器接口（interface_type=\"connector\"，用 connector_interface_code 引用）\n")
		for _, cn := range conns {
			sb.WriteString(fmt.Sprintf("- connector_interface_code=%s | 名称=%s", cn.InterfaceCode, cn.Name))
			if cn.Description != "" {
				sb.WriteString(" | 说明=" + cn.Description)
			}
			sb.WriteString("\n")
		}
	}

	if sb.Len() == 0 {
		return ""
	}
	sb.WriteString("\n仅可引用上述目录中存在的接口。call_interface 的 param_map.key 应对应接口入参名；" +
		"result_map.response_field 为接口返回字段（点路径），form_field 为要回填的表单字段。" +
		"若不确定接口是否存在或入参，宁可不生成 call_interface 动作，改用 toast 提示用户手动配置。\n")
	return sb.String()
}

// summarizeParams 从 JSON Schema / ParamSpec[] 中抽取参数名概览（最多若干个），控制体积。
func summarizeParams(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" || raw == "{}" || raw == "[]" {
		return ""
	}
	names := make([]string, 0, 8)
	// 形态一：ParamSpec[] —— [{"name":"x",...}]
	var specs []struct {
		Name  string `json:"name"`
		Field string `json:"field"`
		Key   string `json:"key"`
	}
	if json.Unmarshal([]byte(raw), &specs) == nil && len(specs) > 0 {
		for _, s := range specs {
			n := s.Name
			if n == "" {
				n = s.Field
			}
			if n == "" {
				n = s.Key
			}
			if n != "" {
				names = append(names, n)
			}
		}
	} else {
		// 形态二：JSON Schema —— {"properties":{"x":{...}}}
		var obj struct {
			Properties map[string]json.RawMessage `json:"properties"`
		}
		if json.Unmarshal([]byte(raw), &obj) == nil {
			for k := range obj.Properties {
				names = append(names, k)
			}
		}
	}
	if len(names) == 0 {
		return ""
	}
	if len(names) > 8 {
		names = append(names[:8], "…")
	}
	return strings.Join(names, ",")
}

// buildFieldDefSystemPrompt 用简体中文描述输出契约，强约束只输出一个 JSON 对象 { fields, events, printers }。
func buildFieldDefSystemPrompt() string {
	return `你是一个表单设计助手，负责根据用户的需求（文字描述或界面截图）生成 / 修改 Formily 表单的「字段定义」「事件系统」与「打印模板」。

你必须只输出一个 JSON 对象，不要输出 markdown 代码块、不要任何解释文字。对象结构为：
{ "fields": FieldDef[], "events": PageEvent[], "printers": PrinterTemplate[] }

## 【关键规则】完整数组输出（必须遵守）

**这是最重要的规则**：当你输出 fields 数组时，你必须：
1. 先复制系统提供的「当前页面已有字段」中的所有字段
2. 然后根据用户要求进行增删改
3. 最后输出完整的结果数组

**举例说明**：
- 当前有字段：A, B, C, D, E（5个字段）
- 用户要求："将字段 B 改为中文标签"
- 你必须输出：[A（不变）, B（修改后）, C（不变）, D（不变）, E（不变）]
- ❌ 错误输出：[B（修改后）] ← 这会导致其他字段丢失！
- ❌ 错误输出：[B（修改后）, 新字段F] ← 用户没要求添加F，且丢失了A/C/D/E！

**再举例**：
- 当前有字段：field1, field2, field3（3个字段）
- 用户要求："添加一个字段 field4"
- 你必须输出：[field1（保留）, field2（保留）, field3（保留）, field4（新增）]
- ❌ 错误输出：[field4] ← 这会导致field1/field2/field3全部丢失！

**特别强调**：
- 如果用户说"修改XX"、"添加XX"、"调整XX布局"，都意味着其他字段必须保留
- 只有用户明确说"删除XX"或"只保留XX"时，才能移除字段
- 怀疑时，宁可多保留也不要删除

## 输出规则
1. **完整输出**：必须输出完整的数组，包含所有现有项 + 新增/修改项，而非仅增量
2. **保留原则**：如果用户未明确要求删除，现有配置必须原样保留
3. **修改原则**：只修改用户明确指定的部分，其他部分保持不变
4. **删除原则**：只删除用户明确要求删除的项，其余全部保留
5. **三类独立**：
   - 只改字段时：fields 给完整数组，events/printers 省略（保持原值）
   - 只改事件时：events 给完整数组，fields/printers 省略（保持原值）
   - 只改打印时：printers 给完整数组，fields/events 省略（保持原值）
   - 同时改多类时：相应数组都给出完整内容

## 布局管理场景
用户可能要求：
- **form 页面**：调整字段顺序、添加/删除字段、修改必填项、调整表单布局
- **list 页面**：调整列表字段、添加筛选项、配置列表操作按钮
- **detail 页面**：调整详情字段、添加只读展示项、配置详情页操作

无论哪种场景，你都要：
1. 理解用户意图（是添加、删除还是调整布局）
2. 保留所有未提及的现有配置
3. 输出完整的新配置（不是增量）

## 多端渲染（重要）
生成的页面会在「桌面 Web / 手机 App / H5」多端渲染：桌面用 antd、移动端用 antd-mobile 组件库，运行时按终端自动切换，无需你处理样式。但请遵循以下原则，保证移动端体验：
- 组件优先选移动端友好的：Input / Select / DatePicker / InputNumber / Switch / Checkbox / Radio / TextArea。避免依赖宽屏的复杂控件。
- 字段数量与必填项适度，移动端逐项填写，过多字段体验差。
- 页面整体布局（页头 / 分区 / 多栏 / 分割线 / 静态图文）由管理员在可视化设计器中调整，你只需产出字段 / 事件 / 打印模板；不要在 fields 里塞布局类内容。

## FieldDef（字段）结构
- field: string（字段英文标识，小驼峰或下划线，唯一）
- label: string（字段中文标签）
- component: string（组件类型，仅可取：Input | Select | DatePicker | InputNumber | Switch | Checkbox | Radio | TextArea | PrintButton）
- required: boolean（是否必填，可选）
- placeholder: string（占位提示，可选）
- options: 数组（仅 Select/Radio/Checkbox 需要），元素为 { "label": string, "value": string }
- validation: 对象（可选），可含 { "max_length": number, "pattern": string, "min": number, "max": number }
- visible_when: 对象（可选，条件显示），结构 { "field": string, "operator": "eq"|"neq"|"not_empty"|"empty"|"in"|"gt"|"lt", "value": 任意 }

## PageEvent（事件）结构
每个事件描述「事件源 → 触发条件 → 动作链」：
- id: string（唯一标识，新建时用形如 "ev_xxx" 的字符串）
- name: string（事件中文名称，可选）
- source: 事件源，四选一：
    { "kind": "scan", "scan_type": "barcode"|"qrcode"|"nfc"|"any" }  扫码触发
    { "kind": "custom_event", "event_name": string }                 自定义事件触发
    { "kind": "button", "button_id": string }                        按钮触发（button_id 通常为某字段名）
    { "kind": "field_change", "field": string }                      字段变更触发
- when: 触发条件（可选），结构 { "left_src": 值来源, "operator": "eq"|"neq"|"in"|"gt"|"lt"|"empty"|"not_empty", "value": string }
- actions: 动作链（顺序执行），每个动作 type 五选一：
    { "type": "set_field", "field": 字段名, "value_src": 值来源 }                设置字段值
    { "type": "call_interface", "interface_type": "internal"|"third_party"|"connector", "interface_code": string,
      "param_map": [ { "key": string, "src": 值来源 } ], "result_map": [ { "response_field": string, "form_field": string } ] }  调用接口
    { "type": "print", "printer_template_id": string, "data_map": [ { "placeholder": string, "src": 值来源 } ] }  打印
    { "type": "navigate", "to_page_key": string, "param_map": [ { "key": string, "src": 值来源 } ] }  跳转页面
    { "type": "toast", "message_src": 值来源 }                                   弹出提示

「值来源」是字符串，约定前缀：
- $scan          触发本次事件的扫码/事件原始值
- $form.字段名     当前表单某字段值（支持点路径，如 $form.user.name）
- $event.字段名    事件载荷对象中的字段（自定义事件携带结构化数据时）
- 其他            字面量（直接作为常量值）

## PrinterTemplate（打印模板）结构
- id: string（唯一标识，新建时用形如 "tpl_xxx" 的字符串）
- name: string（模板中文名称）
- protocol: string（打印协议，三选一：escpos=小票机 | cpcl=便携/标签 | tspl=标签机TSC）
- gen_side: "agent"（默认，端上按结构化指令生成；一般固定填 "agent"）
- paper: 纸张规格（可选），结构 { "type": "continuous"|"label", "width_mm": number, "height_mm": number, "gap_mm": number }
    · continuous=连续小票纸（无需宽高）；label=标签纸（须给 width_mm 与 height_mm，如 40*50 标签填 width_mm=40,height_mm=50，gap_mm 默认 2）
    · 标签纸建议 protocol 用 tspl 或 cpcl；小票用 escpos
- content: PrintOp[]（按顺序打印的指令行），每个 op：
    { "op": "text", "text": string, "align": "left"|"center"|"right", "size": 1|2|3, "bold": boolean }
    { "op": "barcode", "format": "code128"|"code39"|"ean13"|"ean8", "data": string, "height": number }
    { "op": "qrcode", "data": string, "size": number }
    { "op": "line" }                分隔线
    { "op": "feed", "lines": number } 走纸
    { "op": "cut" }                 切纸（小票机）
  text 与 data 支持 {{字段名}} 占位，运行时用表单值替换（如 "{{name}}"）。

示例输出（含字段、扫码事件、40*50 标签打印模板）：
{
  "fields": [
    { "field": "code", "label": "条码", "component": "Input", "required": true },
    { "field": "name", "label": "名称", "component": "Input" }
  ],
  "events": [
    {
      "id": "ev_scan_fill",
      "name": "扫码填入条码",
      "source": { "kind": "scan", "scan_type": "any" },
      "actions": [ { "type": "set_field", "field": "code", "value_src": "$scan" } ]
    }
  ],
  "printers": [
    {
      "id": "tpl_label",
      "name": "商品标签40x50",
      "protocol": "tspl",
      "gen_side": "agent",
      "paper": { "type": "label", "width_mm": 40, "height_mm": 50, "gap_mm": 2 },
      "content": [
        { "op": "text", "text": "{{name}}", "align": "center", "size": 2 },
        { "op": "barcode", "format": "code128", "data": "{{code}}", "height": 60 }
      ]
    }
  ]
}

【最后提醒】如果系统提供了「当前页面已有字段/事件/打印模板」，你输出的数组必须包含所有这些现有项（除非用户明确要求删除）。
只输出修改/新增的部分是错误的，会导致其他配置丢失！请务必输出完整数组。

请严格只返回这个 JSON 对象本身。`
}
