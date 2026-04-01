package auth

import (
	"encoding/json"
	"strings"
)

// 开放 API（X-API-Key）授权范围
const (
	OpenDevicesList = "open:devices:list"
	OpenDeviceInfo  = "open:devices:info"
	OpenDeviceApps  = "open:devices:apps"
	OpenAppsUpload  = "open:apps:upload"
	OpenAppsInstall = "open:apps:install"
	OpenTasksGet    = "open:tasks:get"
	OpenEventsList  = "open:events:list"
)

// 屏幕分享链接授权范围
const (
	ScreenView  = "screen:view"
	ScreenTouch = "screen:touch"
	ScreenStop  = "screen:stop"
)

// OpenScopeDescriptions 用于前端展示
var OpenScopeDescriptions = []struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}{
	{OpenDevicesList, "设备列表"},
	{OpenDeviceInfo, "设备详情/信息"},
	{OpenDeviceApps, "设备已安装应用"},
	{OpenAppsUpload, "上传 APK"},
	{OpenAppsInstall, "安装 APK 到设备"},
	{OpenTasksGet, "查询安装任务"},
	{OpenEventsList, "设备自定义事件列表（扫码等）"},
}

// ScreenShareScopeDescriptions 屏幕分享可选能力
var ScreenShareScopeDescriptions = []struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}{
	{ScreenView, "查看画面（必选）"},
	{ScreenTouch, "远程触摸 / 滑动 / 滚轮"},
	{ScreenStop, "停止投屏（释放手机录屏授权）"},
}

// ParseScopeSet 解析 JSON 数组 ["a","b"]；空串或仅空白表示「未配置」——对 API Key 视为兼容旧版全部权限。
func ParseScopeSet(permissionsJSON string) map[string]struct{} {
	s := strings.TrimSpace(permissionsJSON)
	if s == "" {
		return nil
	}
	var arr []string
	if err := json.Unmarshal([]byte(s), &arr); err != nil {
		return nil
	}
	out := make(map[string]struct{}, len(arr))
	for _, x := range arr {
		x = strings.TrimSpace(x)
		if x != "" {
			out[x] = struct{}{}
		}
	}
	return out
}

func ScopeSetAllows(set map[string]struct{}, scope string) bool {
	if set == nil {
		return true
	}
	_, ok := set[scope]
	return ok
}

// MarshalScopes 将范围列表序列化为存库 JSON
func MarshalScopes(scopes []string) (string, error) {
	arr := make([]string, 0, len(scopes))
	for _, s := range scopes {
		s = strings.TrimSpace(s)
		if s != "" {
			arr = append(arr, s)
		}
	}
	b, err := json.Marshal(arr)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func ScopesSlice(set map[string]struct{}) []string {
	if set == nil {
		return nil
	}
	out := make([]string, 0, len(set))
	for s := range set {
		out = append(out, s)
	}
	return out
}

// ParseShareScopesJSON 屏幕分享存库的 scopes_json：始终得到 map（可空），不用 nil 表示「全部权限」。
func ParseShareScopesJSON(s string) map[string]struct{} {
	var arr []string
	_ = json.Unmarshal([]byte(strings.TrimSpace(s)), &arr)
	out := make(map[string]struct{}, len(arr))
	for _, x := range arr {
		x = strings.TrimSpace(x)
		if x != "" {
			out[x] = struct{}{}
		}
	}
	return out
}
