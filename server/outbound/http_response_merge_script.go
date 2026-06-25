package outbound

import (
	"fmt"
	"strings"

	"app-manager/models"

	"gorm.io/gorm"
)

// tryLoadOutboundAppForEndpoint 按 outbound_endpoints.id 加载已启用的出站应用；失败或禁用时返回 nil,false（与预览「无脚本」一致）。
func tryLoadOutboundAppForEndpoint(db *gorm.DB, endpointID uint) (*models.OutboundApp, bool) {
	if db == nil || endpointID == 0 {
		return nil, false
	}
	var ep models.OutboundEndpoint
	if err := db.First(&ep, endpointID).Error; err != nil {
		return nil, false
	}
	var app models.OutboundApp
	if err := db.First(&app, ep.AppID).Error; err != nil {
		return nil, false
	}
	if !app.Enabled {
		return nil, false
	}
	return &app, true
}

// mergeHTTPResponseIntoVarsAndRunAfterResponse 与 ExecuteHTTPWebhook 成功分支及接口调试一致：
//   - 2xx：可选 MergeHTTPResponseContext（mergeHTTPStepChain 与真实出站 mergeHTTPResponseIntoVars 一致）、
//     MergeHTTPResponseBodyToContext（connectorStep 决定 context_merge_after），再执行 after_response；
//   - runAfterResponseOnNon2xx 为 true 时（仅接口调试）：非 2xx 不合并 http/context，仍执行 after_response。
//
// after_response 脚本若调用 ctx.setResponseBody / ctx.setResponseStatus，执行完后用新值重新写入 vars
// （覆盖之前 MergeHTTPResponseContext / MergeHTTPResponseBodyToContext 写入的占位符）。
// afterScriptOrder 非空时按指定序列执行（方案 B）；nil 时退化旧行为。
func mergeHTTPResponseIntoVarsAndRunAfterResponse(
	vars map[string]string,
	app *models.OutboundApp,
	connectorStep models.OutboundConnectorStep,
	stepIDForHTTPChain uint,
	httpStatus int,
	body []byte,
	afterScriptOpt *ExtensionScriptRunOptions,
	runAfterResponseOnNon2xx bool,
	mergeHTTPStepChain bool,
	endpointAfterScriptsJSON string,
	afterScriptOrder []AfterScriptOrderEntry,
) error {
	if app == nil {
		return fmt.Errorf("应用为空")
	}
	if httpStatus < 200 || httpStatus >= 300 {
		if !runAfterResponseOnNon2xx {
			return nil
		}
		env := &ScriptEnv{RespStatus: httpStatus, RespBody: clipScriptResponseBody(body)}
		if len(afterScriptOrder) > 0 {
			if err := RunAfterResponseOrdered(afterScriptOrder, app, endpointAfterScriptsJSON, vars, env, nil); err != nil {
				return err
			}
		} else {
			if err := RunAppExtensionScriptWithOptions(AppScriptHookAfterResponse, app, vars, env, afterScriptOpt); err != nil {
				return err
			}
			applyScriptOutResp(vars, stepIDForHTTPChain, env)
			if err := runEndpointAfterScripts(vars, stepIDForHTTPChain, env, httpStatus, body, endpointAfterScriptsJSON); err != nil {
				return err
			}
		}
		applyScriptOutResp(vars, stepIDForHTTPChain, env)
		return nil
	}
	if mergeHTTPStepChain {
		MergeHTTPResponseContext(vars, stepIDForHTTPChain, httpStatus, body)
	}
	MergeHTTPResponseBodyToContext(vars, connectorStep, body)
	MergePaginationContext(vars, body)
	env := &ScriptEnv{RespStatus: httpStatus, RespBody: clipScriptResponseBody(body)}
	if len(afterScriptOrder) > 0 {
		if err := RunAfterResponseOrdered(afterScriptOrder, app, endpointAfterScriptsJSON, vars, env, nil); err != nil {
			return err
		}
	} else {
		if err := RunAppExtensionScriptWithOptions(AppScriptHookAfterResponse, app, vars, env, afterScriptOpt); err != nil {
			return err
		}
		applyScriptOutResp(vars, stepIDForHTTPChain, env)
		if err := runEndpointAfterScripts(vars, stepIDForHTTPChain, env, httpStatus, body, endpointAfterScriptsJSON); err != nil {
			return err
		}
	}
	applyScriptOutResp(vars, stepIDForHTTPChain, env)
	return nil
}

// runEndpointAfterScripts 在应用级 after_response 之后执行接口级 after_response 脚本。
// 接口级脚本看到的状态码/响应体取「应用级脚本改写后的最新值」（appEnv.OutResp* 优先），
// 改写结果同样经 applyScriptOutResp 写回 vars 占位符（覆盖应用级写入）。
func runEndpointAfterScripts(vars map[string]string, stepID uint, appEnv *ScriptEnv, httpStatus int, body []byte, endpointAfterScriptsJSON string) error {
	if strings.TrimSpace(endpointAfterScriptsJSON) == "" {
		return nil
	}
	status := httpStatus
	if appEnv != nil && appEnv.OutRespStatus != nil {
		status = *appEnv.OutRespStatus
	}
	respBody := clipScriptResponseBody(body)
	if appEnv != nil && appEnv.OutRespBody != nil {
		respBody = *appEnv.OutRespBody
	}
	env := &ScriptEnv{RespStatus: status, RespBody: respBody}
	if err := RunAfterResponseScriptsJSON(endpointAfterScriptsJSON, vars, env, nil); err != nil {
		return err
	}
	applyScriptOutResp(vars, stepID, env)
	// 把接口级的改写并入 appEnv，供调用方反映到 trace/最终结果
	if appEnv != nil {
		if env.OutRespStatus != nil {
			appEnv.OutRespStatus = env.OutRespStatus
		}
		if env.OutRespBody != nil {
			appEnv.OutRespBody = env.OutRespBody
		}
	}
	return nil
}

// applyScriptOutResp 若 after_response 脚本调用了 ctx.setResponseBody / ctx.setResponseStatus，
// 用脚本修改后的值重新写入 vars（覆盖之前 MergeHTTPResponseContext 写入的占位符）。
func applyScriptOutResp(vars map[string]string, stepID uint, env *ScriptEnv) {
	if vars == nil || env == nil {
		return
	}
	if env.OutRespStatus != nil {
		statusStr := fmt.Sprintf("%d", *env.OutRespStatus)
		vars["{{http.last.status}}"] = statusStr
		if stepID > 0 {
			vars[fmt.Sprintf("{{http.step.%d.status}}", stepID)] = statusStr
		}
	}
	if env.OutRespBody != nil {
		vars["{{http.last.body}}"] = *env.OutRespBody
		if stepID > 0 {
			vars[fmt.Sprintf("{{http.step.%d.body}}", stepID)] = *env.OutRespBody
		}
	}
}
