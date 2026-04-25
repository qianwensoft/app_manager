package api

import (
	"app-manager/database"
	"app-manager/models"
	"encoding/json"
	"strings"
)

// mergeJSONDefaultsInto 将 defaultsJSON 中的键合并到 dst：仅补充 dst 中尚未出现的键。
func mergeJSONDefaultsInto(dst map[string]interface{}, defaultsJSON string) {
	if dst == nil {
		return
	}
	s := strings.TrimSpace(defaultsJSON)
	if s == "" {
		return
	}
	var o map[string]interface{}
	if err := json.Unmarshal([]byte(s), &o); err != nil {
		return
	}
	for k, v := range o {
		if _, ok := dst[k]; !ok {
			dst[k] = v
		}
	}
}

// applyDataInterfaceParamDefaults 将数据结构默认值、接口 param_defaults 合并进参数表（请求体优先）。
func applyDataInterfaceParamDefaults(iface *models.DataInterface, dst map[string]interface{}) {
	if iface == nil {
		return
	}
	if iface.DataStructureID != nil && *iface.DataStructureID != 0 {
		var st models.DataStructure
		if err := database.DB.First(&st, *iface.DataStructureID).Error; err == nil {
			mergeJSONDefaultsInto(dst, st.DefaultParamValues)
		}
	}
	mergeJSONDefaultsInto(dst, iface.ParamDefaultsJSON)
}
