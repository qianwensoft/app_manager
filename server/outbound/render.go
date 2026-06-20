package outbound

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"app-manager/models"
)

// reFuncCall 匹配 {{$funcName(arg1,arg2,...)}} 形式的函数调用占位符。
var reFuncCall = regexp.MustCompile(`\{\{\$(\w+)\(([^)]*)\)\}\}`)

// evalFunctions 求值字符串中的 {{$func(args)}} 占位符，按函数名分派。
// 支持函数：
//
//	$now()             — Unix 秒（字符串）
//	$now_ms()          — Unix 毫秒（字符串）
//	$date()            — 当前日期 YYYY-MM-DD
//	$datetime()        — 当前日期时间 YYYY-MM-DD HH:MM:SS
//	$format_date(fmt)  — 用 Go layout 格式化当前日期（layout 也支持 2006-01-02）
//	$format_datetime(fmt) — 用 Go layout 格式化当前时间
//	$random_str(n)     — n 位随机字母数字（默认 16，最大 256）
//	$random_int(min,max) — [min,max) 随机整数
//	$random_hex(n)     — n 位随机十六进制（默认 32）
//	$uuid()            — 随机 UUID v4
//	$nonce()           — 32 字节随机 hex（alias uuid hex）
func evalFunctions(s string) string {
	return reFuncCall.ReplaceAllStringFunc(s, func(match string) string {
		sub := reFuncCall.FindStringSubmatch(match)
		if len(sub) < 3 {
			return match
		}
		name := strings.ToLower(sub[1])
		rawArgs := sub[2]
		args := splitArgs(rawArgs)
		now := time.Now()
		switch name {
		case "now":
			return strconv.FormatInt(now.Unix(), 10)
		case "now_ms":
			return strconv.FormatInt(now.UnixMilli(), 10)
		case "date":
			return now.Format("2006-01-02")
		case "datetime":
			return now.Format("2006-01-02 15:04:05")
		case "format_date":
			layout := goLayout(argStr(args, 0, "2006-01-02"))
			return now.Format(layout)
		case "format_datetime":
			layout := goLayout(argStr(args, 0, "2006-01-02 15:04:05"))
			return now.Format(layout)
		case "random_str":
			n := argInt(args, 0, 16, 1, 256)
			return randomStr(n)
		case "random_int":
			lo := argInt64(args, 0, 0)
			hi := argInt64(args, 1, 1000000)
			if hi <= lo {
				hi = lo + 1
			}
			return strconv.FormatInt(lo+rand.Int63n(hi-lo), 10)
		case "random_hex":
			n := argInt(args, 0, 32, 1, 512)
			return randomHex(n)
		case "uuid":
			return randomUUID()
		case "nonce":
			return randomHex(32)
		default:
			return match // 未知函数原样保留
		}
	})
}

func splitArgs(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	return parts
}

func argStr(args []string, idx int, def string) string {
	if idx < len(args) && args[idx] != "" {
		return args[idx]
	}
	return def
}

func argInt(args []string, idx, def, min, max int) int {
	s := argStr(args, idx, "")
	n, err := strconv.Atoi(s)
	if err != nil {
		n = def
	}
	if n < min {
		n = min
	}
	if n > max {
		n = max
	}
	return n
}

func argInt64(args []string, idx int, def int64) int64 {
	s := argStr(args, idx, "")
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return def
	}
	return n
}

// goLayout 将常见日期格式字符串转换为 Go time.Format layout。
// 支持 Python/Java 风格（YYYY-MM-DD HH:mm:ss）和 Go 原生 layout 透传。
func goLayout(fmt string) string {
	r := strings.NewReplacer(
		"YYYY", "2006", "YY", "06",
		"MM", "01", "DD", "02",
		"HH", "15", "mm", "04", "ss", "05",
	)
	return r.Replace(fmt)
}

const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const hexset = "0123456789abcdef"

func randomStr(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = charset[rand.Intn(len(charset))]
	}
	return string(b)
}

func randomHex(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = hexset[rand.Intn(16)]
	}
	return string(b)
}

func randomUUID() string {
	var u [16]byte
	rand.Read(u[:]) //nolint:gosec
	u[6] = (u[6] & 0x0f) | 0x40
	u[8] = (u[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", u[0:4], u[4:6], u[6:8], u[8:10], u[10:16])
}

const maxEventDataSubst = 256 * 1024

// maxHTTPResponseContextBody 注入下游模板用的 HTTP 响应体上限（与 device_event.event_data 截断一致思路）。
const maxHTTPResponseContextBody = maxEventDataSubst

// MergeHTTPResponseContext 将最近一次成功 HTTP 响应写入 vars，供同连接器后续步骤 expandTemplate 使用。
// 占位符：
//
//	{{http.last.body}}  {{http.last.status}}
//	{{http.step.<步骤表 id>.body}}  {{http.step.<步骤表 id>.status}}（meta.StepID / 步骤主键）
func MergeHTTPResponseContext(vars map[string]string, stepID uint, httpStatus int, body []byte) {
	if vars == nil {
		return
	}
	bodyStr := string(body)
	if len(bodyStr) > maxHTTPResponseContextBody {
		bodyStr = bodyStr[:maxHTTPResponseContextBody] + "...(truncated)"
	}
	statusStr := fmt.Sprintf("%d", httpStatus)
	vars["{{http.last.status}}"] = statusStr
	vars["{{http.last.body}}"] = bodyStr
	if stepID > 0 {
		vars[fmt.Sprintf("{{http.step.%d.status}}", stepID)] = statusStr
		vars[fmt.Sprintf("{{http.step.%d.body}}", stepID)] = bodyStr
	}
}

// PaginationFieldMap 分页响应字段名映射配置；按顺序尝试候选字段名，先找到即停止。
// 零值时各字段使用内置默认候选列表。
type PaginationFieldMap struct {
	PageNo    []string // 候选字段名，如 ["pageNo","page_no","pageNum","current"]
	PageSize  []string // ["pageSize","page_size","size","limit"]
	Total     []string // ["total","totalCount","total_count","count"]
	TotalPage []string // ["totalPage","pages","total_pages"] 可选
	List      []string // ["list","data","records","rows","items"] 用于探测列表长度
}

var defaultPaginationFieldMap = PaginationFieldMap{
	PageNo:    []string{"pageNo", "page_no", "pageNum", "page_num", "current", "page"},
	PageSize:  []string{"pageSize", "page_size", "size", "limit", "per_page"},
	Total:     []string{"total", "totalCount", "total_count", "count", "totalElements"},
	TotalPage: []string{"totalPage", "totalPages", "total_pages", "pages", "pageCount", "page_count"},
	List:      []string{"list", "data", "records", "rows", "items", "content", "result"},
}

// MergePaginationContext 从 HTTP 响应体（JSON）自动提取分页字段写入 vars，使用默认字段名候选列表。
// 写入以下占位符（均为字符串）：
//
//	{{http.last.page.no}}          — 当前页码
//	{{http.last.page.size}}        — 每页条数
//	{{http.last.page.total}}       — 总条数
//	{{http.last.page.total_pages}} — 总页数
//	{{http.last.page.list_len}}    — 本次返回列表长度
//	{{http.last.page.has_more}}    — "true"/"false"
//
// 字段提取顺序：先尝试 JSON 顶层，找不到再尝试 "data" 子对象；均无则放弃，不报错。
// body 为空或非 JSON 时静默跳过。
func MergePaginationContext(vars map[string]string, body []byte) {
	MergePaginationContextWithMap(vars, body, PaginationFieldMap{})
}

// MergePaginationContextWithMap 同 MergePaginationContext，但使用调用方提供的字段映射（零值字段回退到默认候选列表）。
func MergePaginationContextWithMap(vars map[string]string, body []byte, fm PaginationFieldMap) {
	if vars == nil || len(body) == 0 {
		return
	}
	var root map[string]interface{}
	if err := json.Unmarshal(body, &root); err != nil {
		return
	}

	// 合并默认候选列表（只补充为空的字段）
	if len(fm.PageNo) == 0 {
		fm.PageNo = defaultPaginationFieldMap.PageNo
	}
	if len(fm.PageSize) == 0 {
		fm.PageSize = defaultPaginationFieldMap.PageSize
	}
	if len(fm.Total) == 0 {
		fm.Total = defaultPaginationFieldMap.Total
	}
	if len(fm.TotalPage) == 0 {
		fm.TotalPage = defaultPaginationFieldMap.TotalPage
	}
	if len(fm.List) == 0 {
		fm.List = defaultPaginationFieldMap.List
	}

	// 准备可查询的子对象列表：顶层 + data 子对象（若存在且为 map）
	lookups := []map[string]interface{}{root}
	if sub, ok := root["data"]; ok {
		if subMap, ok := sub.(map[string]interface{}); ok {
			lookups = append(lookups, subMap)
		}
	}

	pickNum := func(candidates []string) (float64, bool) {
		for _, m := range lookups {
			for _, key := range candidates {
				if v, ok := m[key]; ok {
					switch n := v.(type) {
					case float64:
						return n, true
					case json.Number:
						if f, err := n.Float64(); err == nil {
							return f, true
						}
					}
				}
			}
		}
		return 0, false
	}

	pickList := func(candidates []string) ([]interface{}, bool) {
		for _, m := range lookups {
			for _, key := range candidates {
				if v, ok := m[key]; ok {
					if arr, ok := v.([]interface{}); ok {
						return arr, true
					}
				}
			}
		}
		return nil, false
	}

	pageNo, hasPageNo := pickNum(fm.PageNo)
	pageSize, hasPageSize := pickNum(fm.PageSize)
	total, hasTotal := pickNum(fm.Total)
	totalPage, hasTotalPage := pickNum(fm.TotalPage)
	list, hasList := pickList(fm.List)

	if hasPageNo {
		vars["{{http.last.page.no}}"] = strconv.FormatInt(int64(pageNo), 10)
	}
	if hasPageSize {
		vars["{{http.last.page.size}}"] = strconv.FormatInt(int64(pageSize), 10)
	}
	if hasTotal {
		vars["{{http.last.page.total}}"] = strconv.FormatInt(int64(total), 10)
	}

	// 总页数：优先直接取，否则从 total/pageSize 计算
	if hasTotalPage {
		vars["{{http.last.page.total_pages}}"] = strconv.FormatInt(int64(totalPage), 10)
	} else if hasTotal && hasPageSize && pageSize > 0 {
		tp := int64((total + pageSize - 1) / pageSize)
		vars["{{http.last.page.total_pages}}"] = strconv.FormatInt(tp, 10)
		totalPage = float64(tp)
		hasTotalPage = true
	}

	if hasList {
		vars["{{http.last.page.list_len}}"] = strconv.Itoa(len(list))
	}

	// has_more：当前页*每页 < 总数
	if hasPageNo && hasPageSize && hasTotal {
		hasMore := pageNo*pageSize < total
		if hasMore {
			vars["{{http.last.page.has_more}}"] = "true"
		} else {
			vars["{{http.last.page.has_more}}"] = "false"
		}
	} else if hasTotalPage && hasPageNo {
		hasMore := pageNo < totalPage
		if hasMore {
			vars["{{http.last.page.has_more}}"] = "true"
		} else {
			vars["{{http.last.page.has_more}}"] = "false"
		}
	}
}

// DeviceEventJSONPlaceholder 整条设备事件的 JSON，用于 body 模板中的 {{device_event}}（event_data 若能解析为 JSON 则嵌为对象/数组，否则为字符串）。
func DeviceEventJSONPlaceholder(rec models.DeviceEvent) string {
	evRaw := strings.TrimSpace(rec.EventData)
	if len(evRaw) > maxEventDataSubst {
		evRaw = evRaw[:maxEventDataSubst] + "...(truncated)"
	}
	var eventDataField interface{}
	if evRaw == "" {
		eventDataField = ""
	} else {
		if err := json.Unmarshal([]byte(evRaw), &eventDataField); err != nil {
			eventDataField = evRaw
		}
	}
	created := rec.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	payload := map[string]interface{}{
		"id":         rec.ID,
		"device_id":  rec.DeviceID,
		"event_type": rec.EventType,
		"event_data": eventDataField,
		"created_at": created.UTC().Format(time.RFC3339Nano),
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	s := string(b)
	if len(s) > maxEventDataSubst {
		s = s[:maxEventDataSubst] + "...(truncated)"
	}
	return s
}

// TemplateVars 占位符与 expandTemplate 共用。
func TemplateVars(rec models.DeviceEvent, dev *models.Device, def *models.CustomEventDefinition) map[string]string {
	evData := strings.TrimSpace(rec.EventData)
	if len(evData) > maxEventDataSubst {
		evData = evData[:maxEventDataSubst] + "...(truncated)"
	}
	created := rec.CreatedAt
	if created.IsZero() {
		created = time.Now()
	}
	v := map[string]string{
		"{{device_event}}":            DeviceEventJSONPlaceholder(rec),
		"{{device_event.id}}":         fmt.Sprintf("%d", rec.ID),
		"{{device_event.event_type}}": rec.EventType,
		"{{device_event.event_data}}": evData,
		"{{device_event.created_at}}": created.UTC().Format(time.RFC3339Nano),
	}
	if dev != nil {
		v["{{device.id}}"] = fmt.Sprintf("%d", dev.ID)
		v["{{device.name}}"] = strings.TrimSpace(dev.Name)
		v["{{device.serial}}"] = strings.TrimSpace(dev.Serial)
		v["{{device.agent_alias}}"] = strings.TrimSpace(dev.AgentAlias)
		v["{{device.server_alias}}"] = strings.TrimSpace(dev.ServerAlias)
	} else {
		v["{{device.id}}"] = fmt.Sprintf("%d", rec.DeviceID)
	}
	if def != nil {
		v["{{definition.key}}"] = def.Key
		v["{{definition.name}}"] = strings.TrimSpace(def.Name)
	}
	return v
}

func expandTemplate(s string, vars map[string]string) string {
	type kv struct {
		k, v string
	}
	list := make([]kv, 0, len(vars))
	for k, val := range vars {
		list = append(list, kv{k, val})
	}
	sort.Slice(list, func(i, j int) bool {
		if len(list[i].k) != len(list[j].k) {
			return len(list[i].k) > len(list[j].k)
		}
		return list[i].k < list[j].k
	})
	for _, p := range list {
		s = strings.ReplaceAll(s, p.k, p.v)
	}
	// 在静态变量替换之后求值函数调用（{{$func(args)}}）
	s = evalFunctions(s)
	// 处理转义字符（\n、\r\n、\t 等）
	return unescapeString(s)
}

// unescapeString 处理常见转义字符（\n → 换行、\r\n → 回车换行、\t → 制表符、\\ → 反斜杠）
func unescapeString(s string) string {
	// 按顺序处理，避免重复替换
	replacements := []struct{ old, new string }{
		{"\\r\\n", "\r\n"}, // Windows 换行
		{"\\n", "\n"},      // Unix 换行
		{"\\r", "\r"},      // Mac 旧换行
		{"\\t", "\t"},      // 制表符
		{"\\\\", "\\"},     // 反斜杠本身
	}
	result := s
	for _, r := range replacements {
		result = strings.ReplaceAll(result, r.old, r.new)
	}
	return result
}

// ExpandTemplate 与运行时占位符替换规则一致（供连接器编辑预览等 API）。
func ExpandTemplate(s string, vars map[string]string) string {
	return expandTemplate(s, vars)
}

// ExpandJSONStringLeaves 遍历 JSON 解码得到的结构，对所有字符串叶子节点做 ExpandTemplate（用于投递详情调试展示等）。
func ExpandJSONStringLeaves(v interface{}, vars map[string]string) interface{} {
	if vars == nil {
		return v
	}
	switch t := v.(type) {
	case map[string]interface{}:
		out := make(map[string]interface{}, len(t))
		for k, val := range t {
			out[k] = ExpandJSONStringLeaves(val, vars)
		}
		return out
	case []interface{}:
		out := make([]interface{}, len(t))
		for i, val := range t {
			out[i] = ExpandJSONStringLeaves(val, vars)
		}
		return out
	case string:
		return ExpandTemplate(t, vars)
	default:
		return v
	}
}

// TemplateDemoPayload 连接器编辑页：设备事件、设备、定义摘要及完整占位符表（含 http 链式上下文示例键）。
func TemplateDemoPayload() map[string]interface{} {
	vars := DefaultDebugTemplateVars(nil)
	demoBody := []byte(`{"ok":true,"message":"上一步 HTTP 响应示例（步骤表 id=42，多步时由引擎注入）","pageNo":1,"pageSize":20,"total":100,"list":[]}`)
	MergeHTTPResponseContext(vars, 42, 200, demoBody)
	MergePaginationContext(vars, demoBody)
	rec := syntheticDeviceEvent(vars)
	demoStep := models.OutboundConnectorStep{ConfigJSON: `{"context_merge":"event_data_json"}`}
	MergeStepEventDataToContext(vars, demoStep, rec)
	return map[string]interface{}{
		"execution_template": vars,
		"device_event":       rec,
		"device": map[string]interface{}{
			"id":           rec.DeviceID,
			"name":         vars["{{device.name}}"],
			"serial":       vars["{{device.serial}}"],
			"agent_alias":  vars["{{device.agent_alias}}"],
			"server_alias": vars["{{device.server_alias}}"],
		},
		"definition": map[string]interface{}{
			"key":  vars["{{definition.key}}"],
			"name": vars["{{definition.name}}"],
		},
	}
}
