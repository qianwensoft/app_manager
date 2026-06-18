<template>
  <div class="app-detail" v-loading="loading">
    <el-page-header @back="router.push('/outbound/apps')">
      <template #content>
        <span class="title">{{ detail.name || '应用详情' }}</span>
        <el-tag size="small" style="margin-left: 8px">#{{ appId }}</el-tag>
        <el-button type="primary" link style="margin-left: 12px" @click="goEndpointDebug">接口调试</el-button>
      </template>
    </el-page-header>

    <el-tabs v-model="mainTab" type="border-card" class="main-tabs">
      <el-tab-pane label="基本与鉴权" name="base">
        <el-card shadow="never" class="inner-card">
          <template #header>基本信息</template>
          <el-form :model="detail" label-width="120px" style="max-width: 720px">
            <el-form-item label="名称" required>
              <el-input v-model="detail.name" />
            </el-form-item>
            <el-form-item label="说明">
              <el-input v-model="detail.description" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="Base URL" required>
              <el-input v-model="detail.base_url" />
            </el-form-item>
            <el-form-item label="鉴权类型">
              <el-select v-model="detail.auth_type" style="width: 100%">
                <el-option label="无" value="none" />
                <el-option label="静态 Header" value="static_header" />
                <el-option label="静态 Cookie" value="static_cookie" />
                <el-option label="动态 Bearer（服务端按配置获取/刷新 Token）" value="dynamic_bearer" />
              </el-select>
            </el-form-item>
            <template v-if="detail.auth_type === 'static_header'">
              <el-form-item label="Header 名">
                <el-input v-model="authHeaderName" placeholder="如 X-Api-Key" />
              </el-form-item>
              <el-form-item label="Header 值">
                <el-input v-model="authHeaderValue" type="password" show-password />
              </el-form-item>
            </template>
            <template v-if="detail.auth_type === 'static_cookie'">
              <el-form-item label="Cookie 值">
                <el-input v-model="authCookieValue" placeholder="如 session=xxx; token={{app.access_token}}" />
                <p class="subhint" style="margin-top:4px">支持 <code>&#123;&#123;app.xxx&#125;&#125;</code> 占位符；多个 cookie 用 <code>; </code> 分隔。</p>
              </el-form-item>
            </template>
            <el-form-item label="通用 Headers">
              <JsonTemplateEditor
                v-model="commonHeadersJson"
                :app-params="appParams"
                :min-height="100"
                placeholder="{}"
              />
              <p class="subhint">
                JSON 对象，键值支持 <code>&#123;&#123;app.xxx&#125;&#125;</code> 应用参数占位符及 <code>&#123;&#123;$func()&#125;&#125;</code> 函数；出站时与「应用接口」里每条接口的 Headers 合并，<strong>同名键以接口为准</strong>。鉴权 Header（静态 / 动态 Bearer）在合并之后追加。
              </p>
            </el-form-item>
            <el-form-item label="应用编码">
              <el-input v-model="detail.app_code" style="width:260px;font-family:monospace" placeholder="自动生成" />
              <el-button size="small" style="margin-left:8px" @click="detail.app_code = randomToken()">随机重置</el-button>
              <p class="subhint" style="margin-top:4px">用于 Webhook 接收地址路径，修改后已有接收地址失效。</p>
            </el-form-item>
            <el-form-item label="启用">
              <el-switch v-model="detail.enabled" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="saveBase">保存本页</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Token" name="token">
        <template v-if="detail.auth_type === 'dynamic_bearer'">
            <p class="subhint">
              服务端缓存 access_token；路径为响应 JSON 中的字段名，支持嵌套如 <code>data.access_token</code>。<code>expires_in</code> 按秒；或配置
              <code>expires_at</code> 路径指向 RFC3339 字符串。
            </p>
            <el-form label-width="120px" style="max-width: 720px">
        <el-collapse v-model="tokenCollapseActive" class="token-collapse">
          <el-collapse-item name="code">
            <template #title>
              <span class="token-collapse-title">获取 Code（可选预请求）</span>
              <el-tag v-if="tp.code.enabled && tp.code.url" size="small" type="success" style="margin-left:8px">已启用</el-tag>
              <el-tag v-else size="small" type="info" style="margin-left:8px">未启用</el-tag>
            </template>
            <el-form-item label="启用">
              <el-switch v-model="tp.code.enabled" active-text="在 fetch/refresh 前先请求此接口获取 Code" />
            </el-form-item>
            <template v-if="tp.code.enabled">
              <el-form-item label="URL">
                <el-input v-model="tp.code.url" placeholder="https://... 或相对路径（自动拼接 Base URL）" @blur="normalizeTokenUrl('code')" />
                <p v-if="tp.code.url && !isAbsUrl(tp.code.url)" class="subhint" style="margin-top:4px">
                  将拼接为：{{ resolvedCodeUrl }}
                </p>
              </el-form-item>
              <el-form-item label="Method">
                <el-select v-model="tp.code.method" style="width: 140px">
                  <el-option label="POST" value="POST" />
                  <el-option label="GET" value="GET" />
                </el-select>
              </el-form-item>
              <el-form-item label="Headers JSON">
                <JsonTemplateEditor v-model="codeHeadersJson" :app-params="appParams" :min-height="60" placeholder="{}" />
              </el-form-item>
              <el-form-item label="Body">
                <div style="width:100%">
                  <el-radio-group v-model="tp.code.body_type" size="small" style="margin-bottom:6px">
                    <el-radio-button value="json">JSON</el-radio-button>
                    <el-radio-button value="form">form-urlencoded</el-radio-button>
                    <el-radio-button value="formdata">form-data</el-radio-button>
                  </el-radio-group>
                  <JsonTemplateEditor v-if="!tp.code.body_type || tp.code.body_type === 'json'" v-model="codeBodyJson" :app-params="appParams" :min-height="100" />
                  <KvParamEditor v-else v-model="codeBodyKv" :app-params="appParams" />                </div>
              </el-form-item>
              <div style="font-size:12px;color:#909399;margin:0 0 12px 120px">
                响应 JSON 的一级字段以 <code>&#123;&#123;code_resp.&lt;key&gt;&#125;&#125;</code> 形式注入到后续 fetch/refresh 的 URL、Headers、Body 中。
              </div>
              <div style="margin:0 0 8px 120px">
                <el-button size="small" :loading="tokenBusy" @click="doCodeStep">执行 Code</el-button>
                <template v-if="codeContextKeys.length">
                  <span style="font-size:12px;color:#7c3aed;margin-left:10px">上次结果：</span>
                  <code v-for="k in codeContextKeys" :key="k" style="font-size:12px;color:#7c3aed;margin-right:8px;cursor:pointer;text-decoration:underline" @click="insertCodeRef(k)">&#123;&#123;code_resp.{{ k }}&#125;&#125;</code>
                </template>
              </div>
            </template>
          </el-collapse-item>

          <el-collapse-item name="fetch">
            <template #title>
              <span class="token-collapse-title">获取 Token（fetch）</span>
              <el-tag v-if="tp.fetch.url" size="small" type="success" style="margin-left:8px">已配置</el-tag>
              <el-tag v-else size="small" type="info" style="margin-left:8px">未配置</el-tag>
            </template>
            <el-form-item label="URL">
              <el-input v-model="tp.fetch.url" placeholder="https://... 或相对路径（自动拼接 Base URL）" @blur="normalizeTokenUrl('fetch')" />
              <p v-if="tp.fetch.url && !isAbsUrl(tp.fetch.url)" class="subhint" style="margin-top:4px">
                将拼接为：{{ resolvedFetchUrl }}
              </p>
            </el-form-item>
            <el-form-item label="Method">
              <el-select v-model="tp.fetch.method" style="width: 140px">
                <el-option label="POST" value="POST" />
                <el-option label="GET" value="GET" />
              </el-select>
            </el-form-item>
            <el-form-item label="Headers JSON">
              <JsonTemplateEditor v-model="fetchHeadersJson" :app-params="appParams" :min-height="60" placeholder="{}" />
            </el-form-item>
            <el-form-item label="Body">
              <div style="width:100%">
                <el-radio-group v-model="tp.fetch.body_type" size="small" style="margin-bottom:6px">
                  <el-radio-button value="json">JSON</el-radio-button>
                  <el-radio-button value="form">form-urlencoded</el-radio-button>
                  <el-radio-button value="formdata">form-data</el-radio-button>
                </el-radio-group>
                <JsonTemplateEditor v-if="!tp.fetch.body_type || tp.fetch.body_type === 'json'" v-model="fetchBodyJson" :app-params="appParams" :min-height="100" />
                <KvParamEditor v-else v-model="fetchBodyKv" :app-params="appParams" :code-context-keys="codeContextKeys" />
                <div v-if="tp.code.enabled && codeContextKeys.length" style="font-size:12px;color:#7c3aed;margin-top:6px">
                  可用 Code 上下文：
                  <code v-for="k in codeContextKeys" :key="k" style="margin-right:8px;cursor:pointer;text-decoration:underline" @click="insertCodeRef(k)">&#123;&#123;code_resp.{{ k }}&#125;&#125;</code>
                </div>
                <div v-else-if="tp.code.enabled" style="font-size:12px;color:#909399;margin-top:4px">
                  启用 Code 步骤后，响应字段可通过 <code>&#123;&#123;code_resp.&lt;key&gt;&#125;&#125;</code> 引用。
                </div>
              </div>
            </el-form-item>
          </el-collapse-item>

          <el-collapse-item name="refresh">
            <template #title>
              <span class="token-collapse-title">刷新 Token（refresh，可选）</span>
              <el-tag v-if="tp.refresh.url" size="small" type="success" style="margin-left:8px">已配置</el-tag>
              <el-tag v-else size="small" type="info" style="margin-left:8px">未配置 · 到期后重新 fetch</el-tag>
            </template>
            <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
              <template #title>如何注入 refresh_token</template>
              <div style="font-size:12px;line-height:1.7">
                在 <strong>Headers</strong> 或 <strong>Body</strong> 中用占位符
                <code>&#123;&#123;refresh_token&#125;&#125;</code> 引用上次保存的刷新令牌，
                同样支持 <code>&#123;&#123;access_token&#125;&#125;</code>（URL 不做替换）。
                例如 Body：<code>{ "grant_type": "refresh_token", "refresh_token": "&#123;&#123;refresh_token&#125;&#125;" }</code>。<br />
                refresh_token 的来源：fetch / refresh 响应中由下方「<strong>refresh_token 路径</strong>」解析并缓存；
                <span v-if="tp.paths && tp.paths.refresh_token">当前路径 <code>{{ tp.paths.refresh_token }}</code>。</span>
                <span v-else style="color:#e6a23c">当前未配置路径，刷新后将无法获得新的 refresh_token。</span>
                <span v-if="!tokenStatus.has_refresh_token" style="color:#e6a23c">（暂无已缓存的 refresh_token，请先执行 fetch 获取）</span>
              </div>
            </el-alert>
            <el-form-item label="URL">
              <el-input v-model="tp.refresh.url" placeholder="留空则每次过期后重新 fetch；或相对路径（自动拼接 Base URL）" @blur="normalizeTokenUrl('refresh')" @input="onRefreshUrlInput" />
              <p v-if="tp.refresh.url && !isAbsUrl(tp.refresh.url)" class="subhint" style="margin-top:4px">
                将拼接为：{{ resolvedRefreshUrl }}
              </p>
            </el-form-item>
            <el-form-item label="Method">
              <el-select v-model="tp.refresh.method" style="width: 140px">
                <el-option label="POST" value="POST" />
                <el-option label="GET" value="GET" />
              </el-select>
            </el-form-item>
            <el-form-item label="Headers JSON">
              <JsonTemplateEditor v-model="refreshHeadersJson" :app-params="appParams" :min-height="60" placeholder="{}" />
            </el-form-item>
            <el-form-item label="Body">
              <div style="width:100%">
                <el-radio-group v-model="tp.refresh.body_type" size="small" style="margin-bottom:6px">
                  <el-radio-button value="json">JSON</el-radio-button>
                  <el-radio-button value="form">form-urlencoded</el-radio-button>
                  <el-radio-button value="formdata">form-data</el-radio-button>
                </el-radio-group>
                <JsonTemplateEditor v-if="!tp.refresh.body_type || tp.refresh.body_type === 'json'" v-model="refreshBodyJson" :app-params="appParams" :min-height="80" placeholder='可使用占位符 {{refresh_token}}、{{access_token}}' />
                <KvParamEditor v-else v-model="refreshBodyKv" :app-params="appParams" :code-context-keys="codeContextKeys" />
              </div>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>

        <el-divider content-position="left">解析与请求头</el-divider>
        <el-form-item label="access_token 路径">
          <el-input v-model="tp.paths.access_token" placeholder="默认 access_token" />
        </el-form-item>
        <el-form-item label="expires_in 模式">
          <el-radio-group v-model="tp.paths.expires_in_mode" @change="tp.paths.expires_in = ''">
            <el-radio-button value="path">JSON 路径</el-radio-button>
            <el-radio-button value="fixed">固定值</el-radio-button>
            <el-radio-button value="expr">表达式</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="expires_in 值">
          <el-input-number
            v-if="tp.paths.expires_in_mode === 'fixed'"
            v-model="tp.paths.expires_in"
            :min="1"
            :max="86400 * 365"
            placeholder="秒数，如 7200"
            style="width: 100%"
          />
          <el-input
            v-else
            v-model="tp.paths.expires_in"
            :placeholder="tp.paths.expires_in_mode === 'expr' ? '如 {{data.exp}} - {{now}}' : '如 expires_in 或 data.expires_in'"
          />
        </el-form-item>
        <el-form-item label="expires_at 路径">
          <el-input v-model="tp.paths.expires_at" placeholder="可选，RFC3339" />
        </el-form-item>
        <el-form-item label="refresh_token 路径">
          <el-input v-model="tp.paths.refresh_token" placeholder="可选" />
        </el-form-item>
        <el-form-item label="提前刷新(秒)">
          <el-input-number v-model="tp.skew_seconds" :min="10" :max="3600" />
        </el-form-item>
        <el-form-item label="Token 参数位置">
          <el-radio-group v-model="tp.token_in">
            <el-radio-button value="header">Header</el-radio-button>
            <el-radio-button value="json_body">JSON Body</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="tp.token_in !== 'json_body'">
          <el-form-item label="鉴权 Header 名">
            <el-input v-model="tp.auth_header_name" placeholder="Authorization" />
          </el-form-item>
          <el-form-item label="Header 模板">
            <el-input v-model="tp.auth_header_template" placeholder="Bearer {{access_token}}" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="Body 字段名">
            <el-input v-model="tp.token_body_key" placeholder="access_token" />
          </el-form-item>
          <el-form-item label="Body 值模板">
            <el-input v-model="tp.token_body_value_template" placeholder="{{access_token}}" />
          </el-form-item>
          <el-form-item label=" ">
            <el-alert type="info" :closable="false" show-icon>
              <div style="font-size:12px;line-height:1.7">
                调用业务接口时，会在<strong>请求发出前</strong>把「Body 值模板」注入到业务请求 JSON body 的「Body 字段名」字段中（不再写鉴权 Header）。
                值模板支持 <code>&#123;&#123;access_token&#125;&#125;</code> / <code>&#123;&#123;refresh_token&#125;&#125;</code> 占位符。
                要求该接口请求体为 JSON 对象（空体将自动以 <code>{}</code> 处理）。
              </div>
            </el-alert>
          </el-form-item>
        </template>
              <el-form-item>
                <el-button type="primary" :loading="savingTp" @click="saveTokenProvider">保存 Token 配置</el-button>
              </el-form-item>
            </el-form>

          <el-card shadow="never" class="inner-card block-tight">
            <template #header>Token 状态（服务端缓存）</template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="已有 Token">{{ tokenStatus.has_token ? '是' : '否' }}</el-descriptions-item>
              <el-descriptions-item label="脱敏预览">{{ tokenStatus.access_token_preview || '—' }}</el-descriptions-item>
              <el-descriptions-item label="过期时间(UTC)">{{ tokenStatus.expires_at || '—' }}</el-descriptions-item>
              <el-descriptions-item label="剩余(秒)">
                <span v-if="countdownSec != null" :style="countdownSec < 60 ? 'color:#f56c6c;font-weight:600' : ''">
                  {{ countdownSec }}
                </span>
                <span v-else>—</span>
              </el-descriptions-item>
            </el-descriptions>
            <div class="token-actions">
              <el-button type="primary" :loading="tokenBusy" @click="doFetch">获取 Token</el-button>
              <el-button :loading="tokenBusy" @click="doRefresh">刷新 Token</el-button>
              <el-button @click="loadTokenStatus">刷新状态</el-button>
              <el-switch v-model="autoRefreshEnabled" active-text="到期前自动刷新" style="margin-left: 12px" @change="onAutoToggle" />
            </div>
          </el-card>
        </template>
        <el-empty v-else description="当前鉴权不是「动态 Bearer」，无需在此配置 Token" />
      </el-tab-pane>

      <el-tab-pane label="扩展脚本" name="scripts">
        <el-card shadow="never" class="inner-card">
          <template #header>扩展脚本（ECMAScript 5，多条）</template>
          <p class="subhint">
            同一阶段内<strong>按列表顺序</strong>依次执行已启用的脚本；勾选<strong>默认</strong>的条目会<strong>先于同阶段其它条目</strong>执行（便于公共准备逻辑）。须定义
            <code>function main(ctx) { ... }</code>。ctx：<code>getVar</code>/<code>setVar</code>（键为完整占位符）；请求前另有
            <code>getBodyTemplate</code>/<code>setBodyTemplate</code>；响应后有 <code>getResponseStatus</code>/<code>getResponseBody</code>。若对方返回
            <code>{"code":0,"data":{...}}</code> 形态，可在响应后使用「解析 JSON.data」示例把 <code>data</code> 写入
            <code v-pre>{{context.*}}</code>。编辑器为 JavaScript 语法高亮；输入 <code>ctx.</code>、<code>console.</code>、<code>JSON.</code> 时列出 API 补全，亦可按
            <strong>Ctrl+Space</strong> 手动唤起（与系统快捷键冲突时请改用编辑器菜单或系统输入法设置）。
          </p>
          <div class="ext-scripts-page">
            <el-divider content-position="left">请求前（before_request）</el-divider>
            <div class="ext-scripts-toolbar">
              <el-button size="small" type="primary" plain @click="addExtScript('before')">添加脚本</el-button>
              <el-button size="small" @click="fillEmptyExtCodeFromDefault('before')">空代码行填入默认脚本</el-button>
            </div>
            <div v-for="(row, idx) in extScripts.before_list" :key="row._key" class="ext-script-block">
              <div class="ext-script-head">
                <span class="ext-script-idx">#{{ idx + 1 }}</span>
                <el-input v-model="row.name" placeholder="名称（可选）" class="ext-script-name" clearable />
                <el-checkbox v-model="row.enabled">启用</el-checkbox>
                <el-checkbox :model-value="row.default" @change="(v) => setExtDefaultFlag('before', idx, v)">默认（最优先）</el-checkbox>
                <span class="ext-script-timeout-label">超时 ms</span>
                <el-input-number v-model="row.timeout_ms" :min="100" :max="5000" :step="100" size="small" />
                <el-button size="small" :disabled="idx === 0" @click="moveExtScript('before', idx, -1)">上移</el-button>
                <el-button size="small" :disabled="idx >= extScripts.before_list.length - 1" @click="moveExtScript('before', idx, 1)">下移</el-button>
                <el-button
                  size="small"
                  type="danger"
                  link
                  :disabled="extScripts.before_list.length <= 1"
                  @click="removeExtScript('before', idx)"
                >
                  删除
                </el-button>
                <el-button v-if="row._aiPrev != null" size="small" type="warning" link @click="undoAICode('before', idx)">撤销 AI</el-button>
              </div>
              <ExtensionScriptEditor
                v-model="row.code"
                phase="before"
                placeholder="function main(ctx) { ... }"
                :min-height="220"
              />
              <ExtScriptAIAssistant
                phase="before"
                :app-id="appId"
                :current-code="row.code"
                @apply="(code) => applyAICode('before', idx, code)"
              />
            </div>

            <el-divider content-position="left">响应后（after_response）</el-divider>
            <p class="subhint">
              线上仅在 HTTP <strong>2xx</strong> 时执行本阶段脚本。示例脚本在 2xx 下解析响应体 JSON 的 <code>data</code>：把
              <code>data</code> 的<strong>一级键</strong>映射为 <code v-pre>{{context.键名}}</code>（值为对象/数组时写入 JSON 字符串）。
            </p>
            <div class="ext-scripts-toolbar">
              <el-button size="small" type="primary" plain @click="addExtScript('after')">添加脚本</el-button>
              <el-button size="small" @click="fillEmptyExtCodeFromDefault('after')">空代码行填入默认脚本</el-button>
              <el-button size="small" type="primary" @click="fillEmptyExtCodeDataJsonDemo">空代码行填入「解析 JSON.data」示例</el-button>
            </div>
            <div v-for="(row, idx) in extScripts.after_list" :key="row._key" class="ext-script-block">
              <div class="ext-script-head">
                <span class="ext-script-idx">#{{ idx + 1 }}</span>
                <el-input v-model="row.name" placeholder="名称（可选）" class="ext-script-name" clearable />
                <el-checkbox v-model="row.enabled">启用</el-checkbox>
                <el-checkbox :model-value="row.default" @change="(v) => setExtDefaultFlag('after', idx, v)">默认（最优先）</el-checkbox>
                <span class="ext-script-timeout-label">超时 ms</span>
                <el-input-number v-model="row.timeout_ms" :min="100" :max="5000" :step="100" size="small" />
                <el-button size="small" :disabled="idx === 0" @click="moveExtScript('after', idx, -1)">上移</el-button>
                <el-button size="small" :disabled="idx >= extScripts.after_list.length - 1" @click="moveExtScript('after', idx, 1)">下移</el-button>
                <el-button
                  size="small"
                  type="danger"
                  link
                  :disabled="extScripts.after_list.length <= 1"
                  @click="removeExtScript('after', idx)"
                >
                  删除
                </el-button>
                <el-button v-if="row._aiPrev != null" size="small" type="warning" link @click="undoAICode('after', idx)">撤销 AI</el-button>
              </div>
              <ExtensionScriptEditor
                v-model="row.code"
                phase="after"
                placeholder="function main(ctx) { ... }"
                :min-height="220"
              />
              <ExtScriptAIAssistant
                phase="after"
                :app-id="appId"
                :current-code="row.code"
                @apply="(code) => applyAICode('after', idx, code)"
              />
            </div>

            <el-form-item style="margin-top: 16px">
              <el-button type="primary" :loading="savingExt" @click="saveExtensionScripts">保存扩展脚本</el-button>
            </el-form-item>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="应用接口" name="endpoints">
        <el-card shadow="never" class="inner-card">
          <template #header>应用接口</template>
          <div class="toolbar">
            <el-button type="primary" @click="openEpDlg()">新建接口</el-button>
            <el-button type="warning" plain @click="epAiDlg = true">AI 助手</el-button>
            <el-button @click="loadEndpoints">刷新列表</el-button>
            <el-button @click="goEndpointDebug">打开调试页</el-button>
          </div>
          <el-table :data="endpoints" border size="small" v-loading="epLoading">
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" min-width="100" />
            <el-table-column prop="method" label="方法" width="80" />
            <el-table-column prop="path" label="Path" min-width="160" show-overflow-tooltip />
            <el-table-column label="启用" width="70">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openEpDlg(row)">编辑</el-button>
                <el-button link type="primary" size="small" @click="openEpDlg(row, { asCopy: true })">复制</el-button>
                <el-button link type="primary" size="small" @click="goDebugEndpoint(row)">调试</el-button>
                <el-button link type="danger" size="small" @click="removeEp(row)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Webhook 接口" name="webhooks">
        <el-card shadow="never" class="inner-card">
          <template #header>Webhook 接口（入站）</template>
          <p class="subhint">
            每条 Webhook 接口对应一个独立的入站端点，可配置独立的鉴权与解密方式。
            配置中的敏感字段（secret / key / token / password）在列表中脱敏显示；
            可通过 <code v-pre>{{app.key_name}}</code> 引用「应用参数」中的值。
          </p>
          <div class="toolbar">
            <el-button type="primary" @click="openWhDlg()">新建 Webhook</el-button>
            <el-button @click="loadWebhooks">刷新列表</el-button>
          </div>
          <el-table :data="webhooks" border size="small" v-loading="whLoading" @selection-change="whSelection = $event">
            <el-table-column type="selection" width="40" />
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column prop="name" label="名称" min-width="120" />
            <el-table-column label="接收地址" min-width="240">
              <template #default="{ row }">
                <span style="font-family:monospace;font-size:12px;color:#555;word-break:break-all">
                  {{ webhookReceiveUrl(row) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="方法" width="80">
              <template #default="{ row }">
                <el-tag size="small" type="warning">{{ row.method || 'POST' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="70">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '是' : '否' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="最后接收" width="170">
              <template #default="{ row }">
                <span v-if="row.last_received_at" style="font-size:12px">{{ fmtDateTime(row.last_received_at) }}</span>
                <span v-else style="color:#c0c4cc;font-size:12px">—</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="240">
              <template #header>
                <span>操作</span>
                <el-button v-if="whSelection.length === 1" link size="small" type="primary" style="margin-left:8px" @click="copyReceiveUrl(whSelection[0])">复制地址</el-button>
              </template>
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openWhDlg(row)">编辑</el-button>
                <el-button link type="success" size="small" @click="debugWh(row)">调试</el-button>
                <el-button link type="info" size="small" @click="logsWh(row)">历史记录</el-button>
                <el-button link type="danger" size="small" @click="removeWh(row)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="应用参数" name="params">
        <el-card shadow="never" class="inner-card">
          <template #header>应用参数</template>
          <p class="subhint">
            参数以 <code v-pre>{{app.key_name}}</code> 形式在 Webhook 鉴权、解密配置等处引用。敏感参数（如密钥）勾选「敏感」后，值在 API 响应中脱敏显示。
          </p>
          <div class="params-toolbar">
            <el-button type="primary" size="small" @click="addParam">添加参数</el-button>
          </div>
          <el-table :data="appParams" border size="small" style="margin-top: 10px">
            <el-table-column label="Key" min-width="140">
              <template #default="{ row }">
                <el-input v-model="row.key" placeholder="param_key" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="Value" min-width="200">
              <template #default="{ row }">
                <el-input
                  v-model="row.value"
                  :type="row.sensitive ? 'password' : 'text'"
                  placeholder="参数值"
                  size="small"
                  show-password
                />
              </template>
            </el-table-column>
            <el-table-column label="敏感" width="70" align="center">
              <template #default="{ row }">
                <el-checkbox v-model="row.sensitive" />
              </template>
            </el-table-column>
            <el-table-column label="说明" min-width="140">
              <template #default="{ row }">
                <el-input v-model="row.description" placeholder="可选说明" size="small" />
              </template>
            </el-table-column>
            <el-table-column label="引用" width="80" align="center">
              <template #default="{ row }">
                <el-button link size="small" @click="copyParamRef(row.key)">复制</el-button>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="70" align="center">
              <template #default="{ row, $index }">
                <el-button link type="danger" size="small" @click="removeParam($index)">删</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div style="margin-top: 14px">
            <el-button type="primary" :loading="savingParams" @click="saveParams">保存参数</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="tokenExchangeDlg.visible"
      title="第三方 Token 接口 — 请求与响应"
      width="720px"
      destroy-on-close
      class="token-exchange-dlg"
    >
      <template v-if="tokenExchangeDlg.result">
        <!-- Code pre-step trace -->
        <template v-if="tokenExchangeDlg.result.code_exchange">
          <div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:6px">
            第一步：获取 Code（预请求）
          </div>
          <el-tabs style="margin-bottom:16px">
            <el-tab-pane label="请求">
              <div class="trace-block">
                <div class="trace-line"><span class="k">Method</span> {{ tokenExchangeDlg.result.code_exchange.request?.method }}</div>
                <div class="trace-line"><span class="k">URL</span> {{ tokenExchangeDlg.result.code_exchange.request?.url }}</div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.code_exchange.request?.headers) }}</pre>
                <div class="trace-sub">Body</div>
                <pre class="trace-pre">{{ tokenExchangeDlg.result.code_exchange.request?.body || '—' }}</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="响应">
              <div class="trace-block">
                <div class="trace-line"><span class="k">HTTP</span> {{ tokenExchangeDlg.result.code_exchange.response?.status ?? '—' }}</div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.code_exchange.response?.headers) }}</pre>
                <div class="trace-sub">Body</div>
                <pre class="trace-pre">{{ formatMaybeJson(tokenExchangeDlg.result.code_exchange.response?.body) }}</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="注入上下文">
              <div class="trace-block">
                <p style="font-size:12px;color:#64748b;margin:0 0 8px">
                  以下字段已注入为 <code>&#123;&#123;code_resp.&lt;key&gt;&#125;&#125;</code>，可在 fetch/refresh 的 URL、Headers、Body 中引用。
                </p>
                <template v-if="tokenExchangeDlg.result.code_context && Object.keys(tokenExchangeDlg.result.code_context).length">
                  <div v-for="(val, key) in tokenExchangeDlg.result.code_context" :key="key" class="trace-line" style="display:flex;gap:8px;align-items:baseline">
                    <code style="color:#7c3aed;min-width:200px">&#123;&#123;code_resp.{{ key }}&#125;&#125;</code>
                    <span style="color:#64748b;font-size:12px;word-break:break-all">{{ val }}</span>
                  </div>
                </template>
                <span v-else style="color:#909399;font-size:12px">无（响应非 JSON 或为空）</span>
              </div>
            </el-tab-pane>
          </el-tabs>
          <el-divider style="margin:0 0 16px" />
          <div style="font-weight:600;font-size:13px;color:#334155;margin-bottom:6px">
            第二步：获取 Token（{{ phaseLabel(tokenExchangeDlg.result.token_exchange?.phase) }}）
          </div>
        </template>

        <!-- Token trace -->
        <template v-if="tokenExchangeDlg.result.token_exchange">
          <el-tag size="small" style="margin-bottom:10px" v-if="!tokenExchangeDlg.result.code_exchange">
            {{ phaseLabel(tokenExchangeDlg.result.token_exchange.phase) }}
          </el-tag>
          <el-tabs>
            <el-tab-pane label="请求">
              <div class="trace-block">
                <div class="trace-line"><span class="k">Method</span> {{ tokenExchangeDlg.result.token_exchange.request?.method }}</div>
                <div class="trace-line"><span class="k">URL</span> {{ tokenExchangeDlg.result.token_exchange.request?.url }}</div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.token_exchange.request?.headers) }}</pre>
                <div class="trace-sub">
                  Body
                  <el-tag v-if="tokenExchangeDlg.result.token_exchange.request?.body_truncated" type="warning" size="small" style="margin-left:6px">已截断</el-tag>
                </div>
                <pre class="trace-pre">{{ tokenExchangeDlg.result.token_exchange.request?.body || '—' }}</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="响应">
              <div class="trace-block">
                <div class="trace-line">
                  <span class="k">HTTP</span> {{ tokenExchangeDlg.result.token_exchange.response?.status ?? '—' }}
                </div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.token_exchange.response?.headers) }}</pre>
                <div class="trace-sub">
                  Body
                  <el-tag v-if="tokenExchangeDlg.result.token_exchange.response?.body_truncated" type="warning" size="small" style="margin-left:6px">已截断</el-tag>
                </div>
                <pre class="trace-pre">{{ formatMaybeJson(tokenExchangeDlg.result.token_exchange.response?.body) }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>

        <!-- Fallback: old single-trace format -->
        <template v-if="!tokenExchangeDlg.result.token_exchange && !tokenExchangeDlg.result.code_exchange">
          <el-tag size="small" style="margin-bottom:10px">{{ phaseLabel(tokenExchangeDlg.result.phase) }}</el-tag>
          <el-tabs>
            <el-tab-pane label="请求">
              <div class="trace-block">
                <div class="trace-line"><span class="k">Method</span> {{ tokenExchangeDlg.result.request?.method }}</div>
                <div class="trace-line"><span class="k">URL</span> {{ tokenExchangeDlg.result.request?.url }}</div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.request?.headers) }}</pre>
                <div class="trace-sub">Body</div>
                <pre class="trace-pre">{{ tokenExchangeDlg.result.request?.body || '—' }}</pre>
              </div>
            </el-tab-pane>
            <el-tab-pane label="响应">
              <div class="trace-block">
                <div class="trace-line"><span class="k">HTTP</span> {{ tokenExchangeDlg.result.response?.status ?? '—' }}</div>
                <div class="trace-sub">Headers</div>
                <pre class="trace-pre">{{ prettyJson(tokenExchangeDlg.result.response?.headers) }}</pre>
                <div class="trace-sub">Body</div>
                <pre class="trace-pre">{{ formatMaybeJson(tokenExchangeDlg.result.response?.body) }}</pre>
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </template>
      <template #footer>
        <el-button type="primary" @click="tokenExchangeDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="whDlg.visible" :title="whDlg.editId ? '编辑 Webhook' : '新建 Webhook'" width="560px" destroy-on-close>
      <el-form :model="whDlg.form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="whDlg.form.name" />
        </el-form-item>
        <el-form-item label="HTTP 方法">
          <el-select v-model="whDlg.form.method" style="width: 160px">
            <el-option label="POST" value="POST" />
            <el-option label="GET" value="GET" />
            <el-option label="PUT" value="PUT" />
            <el-option label="PATCH" value="PATCH" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="whDlg.editId" label="接收编码">
          <el-input v-model="whDlg.receiveToken" style="width:260px;font-family:monospace" />
          <el-button size="small" style="margin-left:8px" @click="whDlg.receiveToken = randomToken()">随机重置</el-button>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="whDlg.form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="鉴权方式">
          <el-select v-model="whDlg.form.auth_method" style="width: 100%">
            <el-option label="无" value="none" />
            <el-option label="HMAC-SHA256 签名" value="hmac_sha256" />
            <el-option label="Token Header" value="token_header" />
            <el-option label="Token Query 参数" value="token_query" />
          </el-select>
        </el-form-item>
        <el-form-item label="解密方式">
          <el-select v-model="whDlg.form.decrypt_method" style="width: 100%">
            <el-option label="无" value="none" />
            <el-option label="AES-CBC PKCS7" value="aes_cbc_pkcs7" />
            <el-option label="AES-ECB PKCS7" value="aes_ecb_pkcs7" />
          </el-select>
        </el-form-item>
        <el-form-item label="配置 JSON">
          <el-input v-model="whDlg.configJson" type="textarea" :rows="5" placeholder="{}" />
          <p class="subhint" style="margin-top:4px">
            鉴权/解密所需参数，如 <code v-pre>{"secret":"{{param.wh_secret}}"}</code>。
            敏感字段（secret/key/token/password）保存后脱敏显示。
          </p>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="whDlg.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="whDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="whDlg.saving" @click="saveWh">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="whConfigDlg.visible" title="Webhook 配置（原始）" width="480px" destroy-on-close>
      <pre class="trace-pre" style="max-height:360px;overflow:auto">{{ prettyJson(whConfigDlg.config) }}</pre>
      <template #footer>
        <el-button type="primary" @click="whConfigDlg.visible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="epDlg.visible" :title="epDlgTitle" width="620px" destroy-on-close>
      <el-form :model="epDlg.form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="epDlg.form.name" />
        </el-form-item>
        <el-form-item label="HTTP 方法">
          <el-select v-model="epDlg.form.method" style="width: 160px">
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="GET" value="GET" />
            <el-option label="PATCH" value="PATCH" />
          </el-select>
        </el-form-item>
        <el-form-item label="Path" required>
          <el-input v-model="epDlg.form.path" placeholder="如 webhook/ingest，支持 {{app.xxx}} 占位符" />
          <div style="font-size:12px;color:#909399;margin-top:4px">
            支持 <code>&#123;&#123;app.&lt;key&gt;&#125;&#125;</code> 应用参数占位符，如 <code>&#123;&#123;app.corp_id&#125;&#125;</code>
          </div>
        </el-form-item>
        <el-form-item label="接口 Headers">
          <JsonTemplateEditor v-model="epDlg.headersJson" :app-params="appParams" :min-height="60" placeholder="{}" />
        </el-form-item>
        <el-form-item label="Body 模板">
          <JsonTemplateEditor v-model="epDlg.form.body_template" :app-params="appParams" :min-height="120" />
        </el-form-item>
        <el-form-item label="超时 ms">
          <el-input-number v-model="epDlg.form.timeout_ms" :min="0" :max="120000" />
        </el-form-item>
        <el-form-item label="最大重试">
          <el-input-number v-model="epDlg.form.retry_max" :min="0" :max="10" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="epDlg.form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="epDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="epDlg.saving" @click="saveEp">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="epAiDlg" title="AI 助手 · 按接口文档追加应用接口" width="780px" destroy-on-close top="6vh">
      <p class="subhint" style="margin-top:0">粘贴第三方接口文档地址，AI 会抓取并探测下级链接，自动推断接口（含入参/返回 Schema），预览确认后追加到当前应用。</p>
      <InterfaceImportAIAssistant :app-id="Number(appId)" @created="onEpAiCreated" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as ob from '@/api/outbound'
import ExtensionScriptEditor from '@/components/ExtensionScriptEditor.vue'
import ExtScriptAIAssistant from '@/components/ExtScriptAIAssistant.vue'
import InterfaceImportAIAssistant from '@/components/InterfaceImportAIAssistant.vue'
import { copyText } from '@/utils/clipboard'
import JsonTemplateEditor from '@/components/JsonTemplateEditor.vue'
import KvParamEditor from '@/components/KvParamEditor.vue'
import { createWebhookListStomp } from '@/utils/outboundWebhookListStomp'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const appId = computed(() => route.params.id)
const receiveBase = window.location.origin

function randomToken() {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

function webhookReceiveUrl(row) {
  return `${receiveBase}/api/open/v1/outbound/webhooks/receive/${detail.app_code}/${row.receive_token}`
}

function copyReceiveUrl(row) {
  copyText(webhookReceiveUrl(row))
  ElMessage.success('已复制')
}

function goEndpointDebug() {
  router.push(`/outbound/apps/${appId.value}/endpoints/debug`)
}

function goDebugEndpoint(row) {
  router.push({ path: `/outbound/apps/${appId.value}/endpoints/debug`, query: { endpoint_id: String(row.id) } })
}

const loading = ref(true)
const saving = ref(false)
const savingExt = ref(false)
const savingTp = ref(false)
const tokenBusy = ref(false)
const epLoading = ref(false)
const autoRefreshEnabled = ref(true)
let autoTimer = null
const countdownSec = ref(null)
let countdownInterval = null

function startCountdown(sec) {
  if (countdownInterval) clearInterval(countdownInterval)
  countdownSec.value = (sec != null && !Number.isNaN(Number(sec))) ? Math.max(0, Math.floor(Number(sec))) : null
  if (countdownSec.value == null) return
  countdownInterval = setInterval(() => {
    if (countdownSec.value > 0) {
      countdownSec.value--
    } else {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }, 1000)
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null }
  countdownSec.value = null
}

const detail = reactive({
  name: '',
  description: '',
  base_url: '',
  auth_type: 'none',
  app_code: '',
  enabled: true
})
const authHeaderName = ref('')
const authHeaderValue = ref('')
const authCookieValue = ref('')
const commonHeadersJson = ref('{}')
const VALID_TABS = ['base', 'token', 'scripts', 'endpoints', 'webhooks', 'params']
const mainTab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'base')

watch(mainTab, (tab) => {
  router.replace({ query: { ...route.query, tab } })
})

const EXT_MAIN_BODY_DEFAULT = 'function main(ctx) {\n  \n}\n'

/** 响应后：解析 body 为 JSON，将根上的 data 一级字段写入 {{context.*}}（2xx 且 JSON 合法时） */
const EXT_AFTER_RESPONSE_PARSE_DATA_DEMO = `function main(ctx) {
  var st = ctx.getResponseStatus();
  if (st < 200 || st >= 300) return;
  var raw = ctx.getResponseBody();
  if (!raw) return;
  var root;
  try {
    root = JSON.parse(raw);
  } catch (e) {
    return;
  }
  var data = root.data;
  if (typeof data === 'undefined' || data === null) return;
  if (typeof data !== 'object') {
    ctx.setVar('{{context.data}}', String(data));
    return;
  }
  for (var k in data) {
    if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
    var v = data[k];
    var key = '{{context.' + k + '}}';
    if (v !== null && typeof v === 'object') {
      ctx.setVar(key, JSON.stringify(v));
    } else if (v === null || typeof v === 'undefined') {
      ctx.setVar(key, '');
    } else {
      ctx.setVar(key, String(v));
    }
  }
}
`

function extScriptRowKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function blankExtScriptRow() {
  return {
    _key: extScriptRowKey(),
    name: '',
    enabled: false,
    default: false,
    timeout_ms: 800,
    code: EXT_MAIN_BODY_DEFAULT
  }
}

const extScripts = reactive({
  before_list: [blankExtScriptRow()],
  after_list: [blankExtScriptRow()]
})

function extList(phase) {
  return phase === 'before' ? extScripts.before_list : extScripts.after_list
}

function setExtDefaultFlag(phase, idx, on) {
  const list = extList(phase)
  const row = list[idx]
  if (!row) return
  if (on) {
    list.forEach((r, i) => {
      r.default = i === idx
    })
  } else {
    row.default = false
  }
}

function addExtScript(phase) {
  const list = extList(phase)
  const tpl = list.find((x) => x.default && String(x.code || '').trim())
  const row = blankExtScriptRow()
  if (tpl) row.code = String(tpl.code)
  list.push(row)
}

function moveExtScript(phase, idx, delta) {
  const list = extList(phase)
  const j = idx + delta
  if (j < 0 || j >= list.length) return
  const t = list[idx]
  list[idx] = list[j]
  list[j] = t
}

function removeExtScript(phase, idx) {
  const list = extList(phase)
  if (list.length <= 1) {
    ElMessage.warning('至少保留一条脚本')
    return
  }
  list.splice(idx, 1)
}

// 应用 AI 生成的代码：若该行已有非空代码，先二次确认；旧值暂存到 _aiPrev 以便撤销。
async function applyAICode(phase, idx, code) {
  const list = extList(phase)
  const row = list[idx]
  if (!row) return
  const prev = String(row.code || '')
  if (prev.trim()) {
    try {
      await ElMessageBox.confirm('将用 AI 生成的代码替换当前脚本内容，是否继续？（可点「撤销 AI」恢复）', '确认替换', {
        type: 'warning',
        confirmButtonText: '替换',
        cancelButtonText: '取消'
      })
    } catch (e) {
      return // 用户取消
    }
  }
  row._aiPrev = prev
  row.code = code
  ElMessage.success('已应用 AI 脚本，可点「撤销 AI」恢复')
}

// 撤销最近一次 AI 应用，恢复旧代码。
function undoAICode(phase, idx) {
  const list = extList(phase)
  const row = list[idx]
  if (!row || row._aiPrev == null) return
  row.code = row._aiPrev
  row._aiPrev = null
  ElMessage.success('已恢复为应用前的脚本')
}

function fillEmptyExtCodeFromDefault(phase) {
  const list = extList(phase)
  const src = list.find((r) => r.default && String(r.code || '').trim())
  const fill = src ? String(src.code) : EXT_MAIN_BODY_DEFAULT
  let n = 0
  for (const r of list) {
    if (!String(r.code || '').trim()) {
      r.code = fill
      n++
    }
  }
  if (n) ElMessage.success(`已填充 ${n} 处空代码`)
  else ElMessage.info('没有空代码行')
}

/** 将「解析响应 JSON 中 data」示例写入响应后阶段中所有空代码行 */
function fillEmptyExtCodeDataJsonDemo() {
  const list = extScripts.after_list
  const fill = EXT_AFTER_RESPONSE_PARSE_DATA_DEMO
  let n = 0
  for (const r of list) {
    if (!String(r.code || '').trim()) {
      r.code = fill
      if (!String(r.name || '').trim()) r.name = '解析 JSON.data 示例'
      n++
    }
  }
  if (n) ElMessage.success(`已填充 ${n} 处空代码（解析 data）`)
  else ElMessage.info('没有空代码行；可先点「添加脚本」再试')
}

function mapApiRowToExtRow(item) {
  return {
    _key: extScriptRowKey(),
    name: typeof item.name === 'string' ? item.name : '',
    enabled: !!item.enabled,
    default: !!item.default,
    timeout_ms: item.timeout_ms != null ? Number(item.timeout_ms) || 800 : 800,
    code: typeof item.code === 'string' ? item.code : EXT_MAIN_BODY_DEFAULT
  }
}

function applyExtensionScriptsFromApi(raw) {
  extScripts.before_list = []
  extScripts.after_list = []
  if (!raw || typeof raw !== 'object') {
    extScripts.before_list.push(blankExtScriptRow())
    extScripts.after_list.push(blankExtScriptRow())
    return
  }
  const ingest = (val, target) => {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (!item || typeof item !== 'object') continue
        target.push(mapApiRowToExtRow(item))
      }
    } else if (val && typeof val === 'object') {
      target.push(
        mapApiRowToExtRow({
          name: val.name,
          enabled: val.enabled,
          default: true,
          timeout_ms: val.timeout_ms,
          code: val.code
        })
      )
    }
  }
  ingest(raw.before_request, extScripts.before_list)
  ingest(raw.after_response, extScripts.after_list)
  if (!extScripts.before_list.length) extScripts.before_list.push(blankExtScriptRow())
  if (!extScripts.after_list.length) extScripts.after_list.push(blankExtScriptRow())
}

function buildExtensionScriptsPayload() {
  const mapRow = (row) => ({
    name: String(row.name || '').trim(),
    enabled: !!row.enabled,
    default: !!row.default,
    timeout_ms: Number(row.timeout_ms) || 800,
    code: String(row.code || '')
  })
  return {
    version: 2,
    before_request: extScripts.before_list.map(mapRow),
    after_response: extScripts.after_list.map(mapRow)
  }
}

const tokenStatus = reactive({
  has_token: false,
  access_token_preview: '',
  expires_at: '',
  seconds_until_expiry: null,
  has_refresh_token: false
})

const tokenExchangeDlg = reactive({
  visible: false,
  result: null
})

function phaseLabel(phase) {
  if (phase === 'http') return '出站 HTTP（调试）'
  if (phase === 'refresh') return '刷新 Token（refresh）'
  if (phase === 'fetch') return '获取 Token（fetch）'
  if (phase === 'code') return '获取 Code（预请求）'
  return phase || '—'
}

function prettyJson(obj) {
  if (obj == null || (typeof obj === 'object' && !Object.keys(obj).length)) return '{}'
  try {
    return JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj, null, 2)
  } catch {
    return String(obj)
  }
}

function formatMaybeJson(raw) {
  if (raw == null || raw === '') return '—'
  const s = String(raw).trim()
  if (!s) return '—'
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
      /* fallthrough */
    }
  }
  return s
}

function openTokenExchangeDlg(ex) {
  if (!ex) return
  tokenExchangeDlg.result = ex
  tokenExchangeDlg.visible = true
}

function defaultTp() {
  return {
    code: { enabled: false, url: '', method: 'POST', headers: {}, body: {}, body_type: 'json' },
    fetch: { url: '', method: 'POST', headers: {}, body: {}, body_type: 'json' },
    refresh: { url: '', method: 'POST', headers: {}, body: {}, body_type: 'json' },
    paths: { access_token: 'access_token', expires_in: 'expires_in', expires_in_mode: 'path', expires_at: '', refresh_token: '' },
    skew_seconds: 60,
    token_in: 'header',
    token_body_key: 'access_token',
    token_body_value_template: '{{access_token}}',
    auth_header_name: 'Authorization',
    auth_header_template: 'Bearer {{access_token}}'
  }
}

const tp = reactive(defaultTp())
const codeContextKeys = ref([]) // keys from last successful code step response
const codeContext = ref({}) // key→value from last successful code step, passed to fetch/refresh
const codeHeadersJson = ref('{}')
const codeBodyJson = ref('{}')
const codeBodyKv = ref([])
const fetchHeadersJson = ref('{}')
const fetchBodyJson = ref('{}')
const fetchBodyKv = ref([])
const refreshHeadersJson = ref('{}')
const refreshBodyJson = ref('{}')
const refreshBodyKv = ref([])

// 手风琴展开状态：fetch 默认展开，refresh 有 URL 时展开
const tokenCollapseActive = ref(['fetch'])

function isAbsUrl(url) {
  return /^https?:\/\//i.test(url || '')
}

function resolveUrl(base, path) {
  if (!path) return ''
  if (isAbsUrl(path)) return path
  const b = (base || '').replace(/\/+$/, '')
  const p = path.replace(/^\/+/, '')
  return b ? `${b}/${p}` : path
}

const resolvedCodeUrl = computed(() => resolveUrl(detail.base_url, tp.code.url))
const resolvedFetchUrl = computed(() => resolveUrl(detail.base_url, tp.fetch.url))
const resolvedRefreshUrl = computed(() => resolveUrl(detail.base_url, tp.refresh.url))

function normalizeTokenUrl(phase) {
  const key = phase === 'fetch' ? tp.fetch : phase === 'code' ? tp.code : tp.refresh
  if (key.url && !isAbsUrl(key.url) && detail.base_url) {
    key.url = resolveUrl(detail.base_url, key.url)
  }
}

// 用户在刷新 URL 输入框键入内容时，自动展开 refresh 面板
function onRefreshUrlInput(val) {
  if (val && !tokenCollapseActive.value.includes('refresh')) {
    tokenCollapseActive.value = [...tokenCollapseActive.value, 'refresh']
  }
}

function mergeTp(raw) {
  const d = defaultTp()
  if (!raw || typeof raw !== 'object') return d
  if (raw.code) Object.assign(d.code, raw.code)
  Object.assign(d.fetch, raw.fetch || {})
  Object.assign(d.refresh, raw.refresh || {})
  Object.assign(d.paths, raw.paths || {})
  if (!d.paths.expires_in_mode) d.paths.expires_in_mode = 'path'
  if (raw.skew_seconds != null) d.skew_seconds = raw.skew_seconds
  if (raw.token_in) d.token_in = raw.token_in
  if (raw.token_body_key) d.token_body_key = raw.token_body_key
  if (raw.token_body_value_template) d.token_body_value_template = raw.token_body_value_template
  if (raw.auth_header_name) d.auth_header_name = raw.auth_header_name
  if (raw.auth_header_template) d.auth_header_template = raw.auth_header_template
  return d
}

function applyTpToReactive(src) {
  const d = mergeTp(src)
  Object.assign(tp, defaultTp())
  Object.assign(tp.code, d.code)
  Object.assign(tp.fetch, d.fetch)
  Object.assign(tp.refresh, d.refresh)
  Object.assign(tp.paths, d.paths)
  tp.skew_seconds = d.skew_seconds
  tp.token_in = d.token_in
  tp.token_body_key = d.token_body_key
  tp.token_body_value_template = d.token_body_value_template
  tp.auth_header_name = d.auth_header_name
  tp.auth_header_template = d.auth_header_template
  try {
    codeHeadersJson.value = JSON.stringify(d.code.headers && Object.keys(d.code.headers).length ? d.code.headers : {}, null, 0)
  } catch {
    codeHeadersJson.value = '{}'
  }
  try {
    codeBodyJson.value =
      typeof d.code.body === 'string' ? d.code.body : JSON.stringify(d.code.body && Object.keys(d.code.body).length ? d.code.body : {}, null, 2)
    codeBodyKv.value = kvFromObj(d.code.body)
  } catch {
    codeBodyJson.value = '{}'
    codeBodyKv.value = []
  }
  try {
    fetchHeadersJson.value = JSON.stringify(d.fetch.headers && Object.keys(d.fetch.headers).length ? d.fetch.headers : {}, null, 0)
  } catch {
    fetchHeadersJson.value = '{}'
  }
  try {
    fetchBodyJson.value =
      typeof d.fetch.body === 'string' ? d.fetch.body : JSON.stringify(d.fetch.body && Object.keys(d.fetch.body).length ? d.fetch.body : {}, null, 2)
    fetchBodyKv.value = kvFromObj(d.fetch.body)
  } catch {
    fetchBodyJson.value = '{}'
    fetchBodyKv.value = []
  }
  try {
    refreshHeadersJson.value = JSON.stringify(d.refresh.headers && Object.keys(d.refresh.headers).length ? d.refresh.headers : {}, null, 0)
  } catch {
    refreshHeadersJson.value = '{}'
  }
  try {
    refreshBodyJson.value =
      typeof d.refresh.body === 'string'
        ? d.refresh.body
        : JSON.stringify(d.refresh.body && Object.keys(d.refresh.body).length ? d.refresh.body : {}, null, 2)
    refreshBodyKv.value = kvFromObj(d.refresh.body)
  } catch {
    refreshBodyJson.value = '{}'
    refreshBodyKv.value = []
  }
  // auto-expand panels that have content
  const active = ['fetch']
  if (d.code.enabled && String(d.code.url || '').trim()) active.unshift('code')
  if (d.refresh.url && String(d.refresh.url).trim()) active.push('refresh')
  tokenCollapseActive.value = active
}

function kvFromObj(obj) {
  if (!obj || typeof obj !== 'object') return []
  return Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }))
}

function kvToObj(kv) {
  const o = {}
  for (const { key, value } of kv) {
    if (key.trim()) o[key] = value
  }
  return o
}

function buildTokenProviderPayload() {
  let ch = {}
  let cb = {}
  let fh = {}
  let fb = {}
  let rh = {}
  let rb = {}
  try {
    ch = JSON.parse(codeHeadersJson.value || '{}')
  } catch {
    throw new Error('获取 Code Headers 不是合法 JSON')
  }
  try {
    cb = JSON.parse(codeBodyJson.value || '{}')
  } catch {
    throw new Error('获取 Code Body 不是合法 JSON')
  }
  try {
    fh = JSON.parse(fetchHeadersJson.value || '{}')
  } catch {
    throw new Error('获取 Token Headers 不是合法 JSON')
  }
  try {
    fb = JSON.parse(fetchBodyJson.value || '{}')
  } catch {
    throw new Error('获取 Token Body 不是合法 JSON')
  }
  try {
    rh = JSON.parse(refreshHeadersJson.value || '{}')
  } catch {
    throw new Error('刷新 Token Headers 不是合法 JSON')
  }
  try {
    rb = JSON.parse(refreshBodyJson.value || '{}')
  } catch {
    throw new Error('刷新 Token Body 不是合法 JSON')
  }
  return {
    code: { ...tp.code, headers: ch, body: cb },
    fetch: { ...tp.fetch, headers: fh, body: fb },
    refresh: { ...tp.refresh, headers: rh, body: rb },
    paths: { ...tp.paths },
    skew_seconds: tp.skew_seconds,
    token_in: tp.token_in,
    token_body_key: tp.token_body_key,
    token_body_value_template: tp.token_body_value_template,
    auth_header_name: tp.auth_header_name,
    auth_header_template: tp.auth_header_template
  }
}

function applyTokenStatus(src) {
  if (!src) return
  tokenStatus.has_token = !!src.has_token
  tokenStatus.access_token_preview = src.access_token_preview || ''
  tokenStatus.expires_at = src.expires_at || ''
  tokenStatus.seconds_until_expiry = src.seconds_until_expiry
  tokenStatus.has_refresh_token = !!src.has_refresh_token
  startCountdown(src.seconds_until_expiry)
}

async function loadApp() {
  loading.value = true
  try {
    const r = await ob.getOutboundApp(appId.value)
    const a = r.data
    if (!a) {
      ElMessage.error('应用不存在')
      router.push('/outbound/apps')
      return
    }
    detail.name = a.name
    detail.description = a.description || ''
    detail.base_url = a.base_url
    detail.auth_type = a.auth_type || 'none'
    detail.app_code = a.app_code || ''
    detail.enabled = a.enabled !== false
    const ac = a.auth_config || {}
    authHeaderName.value = ac.header_name || ''
    authHeaderValue.value = ac.header_value || ''
    authCookieValue.value = ac.cookie_value || ''
    applyTpToReactive(a.token_provider)
    applyTokenStatus(a.token_status)
    try {
      commonHeadersJson.value = JSON.stringify(
        a.common_headers && Object.keys(a.common_headers).length ? a.common_headers : {},
        null,
        2
      )
    } catch {
      commonHeadersJson.value = '{}'
    }
    applyExtensionScriptsFromApi(a.extension_scripts)
    applyAppParamsFromApi(a.app_params || [])
    if (autoRefreshEnabled.value) scheduleAutoRefresh()
  } finally {
    loading.value = false
  }
}

async function loadTokenStatus() {
  try {
    const r = await ob.getOutboundAppTokenStatus(appId.value)
    applyTokenStatus(r.data)
  } catch {
    /* ignore */
  }
}

function clearAutoTimer() {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}

function scheduleAutoRefresh() {
  clearAutoTimer()
  if (!autoRefreshEnabled.value || detail.auth_type !== 'dynamic_bearer') return
  const skew = Number(tp.skew_seconds) || 60
  const sec = Number(tokenStatus.seconds_until_expiry)
  if (!tokenStatus.has_token || Number.isNaN(sec) || sec <= skew) {
    autoTimer = setTimeout(async () => {
      if (!autoRefreshEnabled.value) return
      try {
        if (tokenStatus.has_refresh_token) await ob.postOutboundAppTokenRefresh(appId.value)
        else await ob.postOutboundAppTokenFetch(appId.value)
        await loadApp()
      } catch {
        /* ElMessage from interceptor */
      }
      scheduleAutoRefresh()
    }, 15000)
    return
  }
  const ms = Math.max((sec - skew) * 1000, 8000)
  autoTimer = setTimeout(async () => {
    if (!autoRefreshEnabled.value) return
    try {
      await ob.postOutboundAppTokenRefresh(appId.value)
      await loadApp()
    } catch {
      try {
        await ob.postOutboundAppTokenFetch(appId.value)
        await loadApp()
      } catch {
        /* */
      }
    }
    scheduleAutoRefresh()
  }, ms)
}

function onAutoToggle() {
  if (autoRefreshEnabled.value) scheduleAutoRefresh()
  else clearAutoTimer()
}

async function saveExtensionScripts() {
  const auth_config = {}
  if (detail.auth_type === 'static_header') {
    auth_config.header_name = authHeaderName.value
    auth_config.header_value = authHeaderValue.value
  } else if (detail.auth_type === 'static_cookie') {
    auth_config.cookie_value = authCookieValue.value
  }
  let common_headers
  try {
    common_headers = JSON.parse(commonHeadersJson.value || '{}')
  } catch {
    ElMessage.error('通用 Headers JSON 无效')
    return
  }
  let token_provider
  try {
    token_provider = buildTokenProviderPayload()
  } catch (e) {
    ElMessage.error(e.message || String(e))
    return
  }
  savingExt.value = true
  try {
    await ob.updateOutboundApp(appId.value, {
      name: detail.name,
      description: detail.description,
      base_url: detail.base_url,
      auth_type: detail.auth_type,
      auth_config,
      common_headers,
      enabled: detail.enabled,
      token_provider,
      extension_scripts: buildExtensionScriptsPayload()
    })
    ElMessage.success('扩展脚本已保存')
    await loadApp()
  } finally {
    savingExt.value = false
  }
}

async function saveBase() {
  const auth_config = {}
  if (detail.auth_type === 'static_header') {
    auth_config.header_name = authHeaderName.value
    auth_config.header_value = authHeaderValue.value
  } else if (detail.auth_type === 'static_cookie') {
    auth_config.cookie_value = authCookieValue.value
  }
  let common_headers
  try {
    common_headers = JSON.parse(commonHeadersJson.value || '{}')
  } catch {
    ElMessage.error('通用 Headers JSON 无效')
    return
  }
  saving.value = true
  try {
    let token_provider
    try {
      token_provider = buildTokenProviderPayload()
    } catch (e) {
      ElMessage.error(e.message || String(e))
      return
    }
    await ob.updateOutboundApp(appId.value, {
      name: detail.name,
      description: detail.description,
      base_url: detail.base_url,
      auth_type: detail.auth_type,
      auth_config,
      common_headers,
      app_code: detail.app_code,
      enabled: detail.enabled,
      token_provider,
      extension_scripts: buildExtensionScriptsPayload()
    })
    ElMessage.success('已保存')
    await loadApp()
  } finally {
    saving.value = false
  }
}

async function saveTokenProvider() {
  let token_provider
  try {
    token_provider = buildTokenProviderPayload()
  } catch (e) {
    ElMessage.error(e.message || String(e))
    return
  }
  let common_headers
  try {
    common_headers = JSON.parse(commonHeadersJson.value || '{}')
  } catch {
    ElMessage.error('通用 Headers JSON 无效')
    return
  }
  savingTp.value = true
  try {
    await ob.updateOutboundApp(appId.value, {
      name: detail.name,
      description: detail.description,
      base_url: detail.base_url,
      auth_type: detail.auth_type,
      auth_config:
        detail.auth_type === 'static_header'
          ? { header_name: authHeaderName.value, header_value: authHeaderValue.value }
          : detail.auth_type === 'static_cookie'
            ? { cookie_value: authCookieValue.value }
            : {},
      common_headers,
      enabled: detail.enabled,
      token_provider,
      extension_scripts: buildExtensionScriptsPayload()
    })
    ElMessage.success('Token 配置已保存')
    await loadApp()
  } finally {
    savingTp.value = false
  }
}

function insertCodeRef(key) {
  const ref = `{{code_resp.${key}}}`
  navigator.clipboard?.writeText(ref).then(() => ElMessage.success(`已复制 ${ref}`)).catch(() => ElMessage.info(ref))
}

async function doCodeStep() {
  tokenBusy.value = true
  try {
    const r = await ob.postOutboundAppTokenCode(appId.value)
    if (r.token_exchange?.code_context) {
      codeContext.value = r.token_exchange.code_context
      codeContextKeys.value = Object.keys(r.token_exchange.code_context)
    }
    openTokenExchangeDlg(r.token_exchange)
  } catch (e) {
    const ex = e?.response?.data?.token_exchange
    if (ex) openTokenExchangeDlg(ex)
  } finally {
    tokenBusy.value = false
  }
}

async function doFetch() {
  tokenBusy.value = true
  try {
    const r = await ob.postOutboundAppTokenFetch(appId.value)
    // 先展示请求/响应日志，避免后续 loadApp 等步骤出错时日志丢失
    openTokenExchangeDlg(r.token_exchange)
    if (r.token_status) applyTokenStatus(r.token_status)
    if (r.token_exchange?.code_context) {
      codeContext.value = r.token_exchange.code_context
      codeContextKeys.value = Object.keys(r.token_exchange.code_context)
    }
    ElMessage.success('已获取 Token')
    await loadApp()
  } catch (e) {
    const ex = e?.response?.data?.token_exchange
    if (ex) openTokenExchangeDlg(ex)
  } finally {
    tokenBusy.value = false
  }
}

async function doRefresh() {
  tokenBusy.value = true
  try {
    const r = await ob.postOutboundAppTokenRefresh(appId.value)
    // 先展示请求/响应日志，避免后续 loadApp 等步骤出错时日志丢失
    openTokenExchangeDlg(r.token_exchange)
    if (r.token_status) applyTokenStatus(r.token_status)
    if (r.token_exchange?.code_context) {
      codeContext.value = r.token_exchange.code_context
      codeContextKeys.value = Object.keys(r.token_exchange.code_context)
    }
    ElMessage.success('已刷新')
    await loadApp()
  } catch (e) {
    const ex = e?.response?.data?.token_exchange
    if (ex) openTokenExchangeDlg(ex)
  } finally {
    tokenBusy.value = false
  }
}

const endpoints = ref([])

async function loadEndpoints() {
  epLoading.value = true
  try {
    const r = await ob.listOutboundEndpoints({ app_id: appId.value })
    endpoints.value = r.data || []
  } finally {
    epLoading.value = false
  }
}

const epDlg = reactive({
  visible: false,
  editId: null,
  isCopy: false,
  saving: false,
  headersJson: '',
  form: {
    name: '',
    method: 'POST',
    path: '',
    body_template: '',
    timeout_ms: 0,
    retry_max: 0,
    enabled: true
  }
})

const epAiDlg = ref(false)

async function onEpAiCreated() {
  epAiDlg.value = false
  await loadEndpoints()
}

const epDlgTitle = computed(() => {
  if (epDlg.editId) return '编辑接口'
  if (epDlg.isCopy) return '复制接口'
  return '新建接口'
})

function openEpDlg(row, opts = {}) {
  const asCopy = !!(row && opts.asCopy)
  epDlg.isCopy = asCopy
  epDlg.editId = row && !asCopy ? row.id : null
  if (row) {
    epDlg.form = {
      name: asCopy ? `${row.name} 副本` : row.name,
      method: row.method || 'POST',
      path: row.path,
      body_template: row.body_template || '',
      timeout_ms: row.timeout_ms || 0,
      retry_max: row.retry_max ?? 0,
      enabled: row.enabled !== false
    }
    epDlg.headersJson = row.headers && Object.keys(row.headers).length ? JSON.stringify(row.headers, null, 0) : ''
  } else {
    epDlg.isCopy = false
    epDlg.form = {
      name: '',
      method: 'POST',
      path: '',
      body_template: '',
      timeout_ms: 0,
      retry_max: 0,
      enabled: true
    }
    epDlg.headersJson = ''
  }
  epDlg.visible = true
}

async function saveEp() {
  let headers = {}
  if (epDlg.headersJson.trim()) {
    try {
      headers = JSON.parse(epDlg.headersJson)
    } catch {
      ElMessage.error('Headers JSON 无效')
      return
    }
  }
  const body = { ...epDlg.form, app_id: Number(appId.value), headers }
  epDlg.saving = true
  try {
    if (epDlg.editId) await ob.updateOutboundEndpoint(epDlg.editId, body)
    else await ob.createOutboundEndpoint(body)
    const wasCopy = epDlg.isCopy
    epDlg.visible = false
    await loadEndpoints()
    ElMessage.success(wasCopy ? '已创建接口副本' : '已保存')
  } finally {
    epDlg.saving = false
  }
}

async function removeEp(row) {
  await ElMessageBox.confirm(`删除接口「${row.name}」？`, '确认', { type: 'warning' })
  await ob.deleteOutboundEndpoint(row.id)
  await loadEndpoints()
}

// --- App Params ---
const savingParams = ref(false)
const appParams = ref([]) // [{key, value, sensitive, description, _isNew}]

function addParam() {
  appParams.value.push({ key: '', value: '', sensitive: false, description: '', _isNew: true })
}

function removeParam(idx) {
  appParams.value.splice(idx, 1)
}

function copyParamRef(key) {
  if (!key) { ElMessage.warning('请先填写 Key'); return }
  const ref = `{{param.${key}}}`
  navigator.clipboard?.writeText(ref).then(() => ElMessage.success(`已复制 ${ref}`)).catch(() => ElMessage.info(ref))
}

function applyAppParamsFromApi(raw) {
  if (!Array.isArray(raw)) { appParams.value = []; return }
  appParams.value = raw.map((p) => ({
    key: String(p.key || ''),
    value: String(p.value || ''),
    sensitive: !!p.sensitive,
    description: String(p.description || ''),
    _isNew: false
  }))
}

async function saveParams() {
  for (const p of appParams.value) {
    if (!p.key.trim()) { ElMessage.error('参数 Key 不能为空'); return }
  }
  savingParams.value = true
  try {
    const payload = appParams.value.map((p) => ({
      key: p.key.trim(),
      value: p.value,
      sensitive: !!p.sensitive,
      description: p.description || ''
    }))
    await ob.putOutboundAppParams(appId.value, { app_params: payload })
    ElMessage.success('参数已保存')
    await loadApp()
  } finally {
    savingParams.value = false
  }
}

// --- Webhooks ---
const webhooks = ref([])
const whLoading = ref(false)

let whListStomp = null

function fmtDateTime(val) {
  if (!val) return '—'
  const d = new Date(val)
  if (isNaN(d.getTime())) return String(val)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const whSelection = ref([])

const whDlg = reactive({
  visible: false,
  editId: null,
  saving: false,
  configJson: '{}',
  receiveToken: '',
  form: { name: '', description: '', method: 'POST', auth_method: 'none', decrypt_method: 'none', enabled: true }
})

const whConfigDlg = reactive({ visible: false, config: null })

function authMethodLabel(v) {
  return { none: '无', hmac_sha256: 'HMAC-SHA256', token_header: 'Token Header', token_query: 'Token Query' }[v] || v || '无'
}
function decryptMethodLabel(v) {
  return { none: '无', aes_cbc_pkcs7: 'AES-CBC', aes_ecb_pkcs7: 'AES-ECB' }[v] || v || '无'
}

async function loadWebhooks() {
  whLoading.value = true
  try {
    const r = await ob.listOutboundWebhooks({ app_id: appId.value })
    webhooks.value = r.data || []
  } finally {
    whLoading.value = false
  }
}

function openWhDlg(row) {
  whDlg.editId = row ? row.id : null
  if (row) {
    whDlg.form = { name: row.name, description: row.description || '', method: row.method || 'POST', auth_method: row.auth_method || 'none', decrypt_method: row.decrypt_method || 'none', enabled: row.enabled !== false }
    whDlg.configJson = row.config && Object.keys(row.config).length ? JSON.stringify(row.config, null, 2) : '{}'
    whDlg.receiveToken = row.receive_token || ''
  } else {
    whDlg.form = { name: '', description: '', method: 'POST', auth_method: 'none', decrypt_method: 'none', enabled: true }
    whDlg.configJson = '{}'
    whDlg.receiveToken = ''
  }
  whDlg.visible = true
}

async function saveWh() {
  if (!whDlg.form.name.trim()) { ElMessage.error('名称不能为空'); return }
  let config = {}
  try { config = JSON.parse(whDlg.configJson || '{}') } catch { ElMessage.error('配置 JSON 无效'); return }
  const body = { ...whDlg.form, app_id: Number(appId.value), config, receive_token: whDlg.receiveToken || undefined }
  whDlg.saving = true
  try {
    if (whDlg.editId) await ob.updateOutboundWebhook(whDlg.editId, body)
    else await ob.createOutboundWebhook(body)
    whDlg.visible = false
    await loadWebhooks()
    ElMessage.success('已保存')
  } finally {
    whDlg.saving = false
  }
}

async function removeWh(row) {
  await ElMessageBox.confirm(`删除 Webhook「${row.name}」？`, '确认', { type: 'warning' })
  await ob.deleteOutboundWebhook(row.id)
  await loadWebhooks()
}

function debugWh(row) {
  router.push(`/outbound/apps/${appId.value}/webhooks/${row.id}/debug`)
}

function logsWh(row) {
  router.push(`/outbound/apps/${appId.value}/webhooks/${row.id}/logs`)
}

async function viewWhConfig(row) {
  try {
    const r = await ob.getOutboundWebhookConfig(row.id)
    whConfigDlg.config = r.data
    whConfigDlg.visible = true
  } catch { ElMessage.error('获取配置失败') }
}

watch(appId, async () => {
  clearAutoTimer()
  await loadApp()
  await loadEndpoints()
  await loadWebhooks()
})

onMounted(async () => {
  await loadApp()
  await loadEndpoints()
  await loadWebhooks()
  // 订阅 webhook 列表刷新 STOMP 主题（last_received_at 实时更新）
  whListStomp = createWebhookListStomp(() => auth.token, (msg) => {
    const wid = msg?.webhook_id
    const ts = msg?.last_received_at
    if (!wid || !ts) return
    const item = webhooks.value.find((w) => Number(w.id) === Number(wid))
    if (item) {
      item.last_received_at = new Date(ts).toISOString()
    }
  })
  whListStomp.start()
})

onUnmounted(() => {
  clearAutoTimer()
  stopCountdown()
  whListStomp?.stop()
  whListStomp = null
})
</script>

<style scoped>
.app-detail {
  max-width: 1040px;
}
.main-tabs {
  margin-top: 16px;
}
.inner-card {
  margin-bottom: 0;
}
.block-tight {
  margin-top: 16px;
}
.title {
  font-weight: 600;
}
.block {
  margin-top: 16px;
}
.subhint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 12px;
  line-height: 1.5;
}
.ext-scripts-page {
  max-width: 920px;
}
.ext-scripts-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.ext-script-block {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.ext-script-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-bottom: 8px;
}
.ext-script-idx {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  min-width: 2em;
}
.ext-script-name {
  width: 200px;
  max-width: 100%;
}
.ext-script-timeout-label {
  font-size: 12px;
  color: #64748b;
}
.token-collapse {
  border: none;
  margin-bottom: 4px;
}
.token-collapse :deep(.el-collapse-item__header) {
  font-weight: 600;
  font-size: 13px;
  color: #334155;
  background: var(--el-fill-color-lighter);
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 2px;
}
.token-collapse :deep(.el-collapse-item__wrap) {
  border: none;
}
.token-collapse :deep(.el-collapse-item__content) {
  padding: 16px 4px 8px;
}
.token-collapse :deep(.el-collapse-item) {
  border: none;
  margin-bottom: 6px;
}
.token-collapse-title {
  font-weight: 600;
}
.token-actions {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}
.token-exchange-dlg :deep(.el-dialog__body) {
  padding-top: 8px;
}
.trace-block {
  font-size: 13px;
}
.trace-line {
  margin-bottom: 8px;
  word-break: break-all;
}
.trace-line .k {
  color: #64748b;
  margin-right: 8px;
  font-weight: 500;
}
.trace-sub {
  margin: 10px 0 4px;
  font-weight: 600;
  color: #334155;
}
.trace-pre {
  margin: 0;
  padding: 10px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  max-height: 42vh;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.params-toolbar {
  margin-bottom: 8px;
}
</style>
