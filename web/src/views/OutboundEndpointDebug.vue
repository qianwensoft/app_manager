<template>
  <div class="ep-debug" v-loading="loading">
    <el-page-header @back="router.push('/outbound/apps/' + appId)">
      <template #content>
        <span class="title">接口调试</span>
        <el-tag v-if="appName" size="small" style="margin-left: 8px">{{ appName }}</el-tag>
      </template>
    </el-page-header>

    <p class="hint">
      Body 推荐流程：<strong>先写 demo JSON</strong>（可用「插入示例 Demo」）→ <strong>逐个选中</strong>不能写死的值 → <strong>右键</strong>或「参数化助手」换成 <code v-pre>{{...}}</code> 占位符。此处也可新建/修改接口并保存；调试为单次真实 HTTP。Body 留空则与线上一致使用默认 device_event JSON。
      每次调试会执行本应用在「扩展脚本」中配置的 <strong>请求前（before_request）</strong> 与 <strong>响应后（after_response）</strong> 脚本（与真实出站一致）；调试时 <strong>任意 HTTP 状态码</strong>（含 4xx/5xx）都会跑 after_response，便于联调；仅 2xx 时合并 <code v-pre>{{http.last.*}}</code> 链式占位符并将响应 JSON 写入 <code v-pre>{{context.*}}</code>（与连接器「将 HTTP 2xx JSON 写入 context」一致），结果在下方「响应后 context」中列出。
    </p>

    <el-card shadow="never" class="block">
      <template #header>请求配置</template>
      <el-form label-width="140px" style="max-width: 880px">
        <el-form-item label="应用通用 Headers">
          <el-input :model-value="appCommonHeadersDisplay" type="textarea" :rows="5" readonly class="readonly-json" />
          <p class="subhint">只读，来自应用详情「基本与鉴权」页保存的配置；与下方接口 Headers 合并后发送。</p>
        </el-form-item>
        <el-form-item label="已有接口">
          <el-select
            v-model="form.endpoint_id"
            clearable
            placeholder="不选为新建草稿；选后可改 Body 等再保存"
            style="width: 100%"
            filterable
            @change="onEndpointPick"
          >
            <el-option v-for="e in endpointOptions" :key="e.id" :label="`${e.name} (#${e.id})`" :value="e.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="接口名称">
          <el-input v-model="form.name" placeholder="保存到库时必填" />
        </el-form-item>
        <el-form-item label="HTTP 方法">
          <el-select v-model="form.method" style="width: 160px">
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="GET" value="GET" />
            <el-option label="PATCH" value="PATCH" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
        </el-form-item>
        <el-form-item label="Path" required>
          <el-input v-model="form.path" placeholder="相对 Base URL，如 webhook/ingest" />
        </el-form-item>
        <el-form-item label="接口专属 Headers">
          <JsonTemplateEditor v-model="headersJson" :app-params="appParams" :min-height="80" placeholder="{}" />
          <p class="subhint">与通用 Headers 合并，同名键以本处为准。</p>
        </el-form-item>

        <!-- Content-Type -->
        <el-form-item label="Content-Type">
          <el-select v-model="form.content_type" clearable filterable allow-create style="width: 100%; max-width: 440px"
            placeholder="留空则由 Body 类型自动决定">
            <el-option label="application/json（JSON）" value="application/json" />
            <el-option label="application/x-www-form-urlencoded（表单）" value="application/x-www-form-urlencoded" />
            <el-option label="multipart/form-data（文件/多部分）" value="multipart/form-data" />
            <el-option label="text/plain（纯文本）" value="text/plain" />
            <el-option label="application/xml" value="application/xml" />
            <el-option label="无（不发送 Content-Type）" value="none" />
          </el-select>
          <p class="subhint">留空时：JSON 标签页→ application/json；表格/Form 标签页→ application/x-www-form-urlencoded；Raw → text/plain。</p>
        </el-form-item>

        <!-- Body 多标签页 -->
        <el-form-item label="Body 模板">
          <div style="width: 100%">
            <el-tabs v-model="bodyTab" class="body-tabs" @tab-change="onBodyTabChange">
              <!-- JSON 标签页（原始 textarea + 占位符助手） -->
              <el-tab-pane label="JSON" name="json">
                <el-collapse v-model="bodyCollapseActive" class="token-collapse">
                  <el-collapse-item title="① Demo 数据 → 逐项参数化" name="demo">
                    <p class="subhint">
                      与写 Postman 类似：先放<strong>纯 demo</strong> JSON，再把「不能写死」的值逐个换成平台变量。选中数字/字符串后<strong>右键</strong>选占位符，或用助手下拉选「映射到」再点替换。
                    </p>
                    <el-button size="small" type="primary" plain @click="insertDemoBodyJson">插入示例 Demo JSON</el-button>
                    <el-divider content-position="left">参数化助手</el-divider>
                    <div class="assist-row">
                      <span class="assist-label">当前选区</span>
                      <code class="assist-preview">{{ assistPreviewDisplay }}</code>
                    </div>
                    <el-select
                      v-model="assistPick"
                      filterable
                      clearable
                      placeholder="选择映射到的平台传入参数"
                      class="assist-select"
                    >
                      <el-option-group v-for="grp in bodyPlaceholderGroupsMerged" :key="'ag-' + grp.title" :label="grp.title">
                        <el-option
                          v-for="p in grp.items"
                          :key="p.token"
                          :label="p.label + '  ' + p.token"
                          :value="p.token"
                        />
                      </el-option-group>
                    </el-select>
                    <el-button
                      type="primary"
                      size="small"
                      class="assist-btn"
                      :disabled="!assistPick || bodySel.start === bodySel.end"
                      @click="applyAssistParametrize"
                    >
                      替换选区为占位符
                    </el-button>
                  </el-collapse-item>
                  <el-collapse-item title="② 快速插入占位符（光标处插入）" name="tok">
                    <p class="subhint">
                      点击在光标处插入；有选区时则替换选区。<strong>新建占位符</strong>使用命名空间
                      <code v-pre>{{flow.标识}}</code>，与顺序连接器中上一步 HTTP / 扩展脚本写入的变量表对齐；调试时在下方「模板变量覆盖」为同名键赋值。
                    </p>
                    <div class="flow-ph-new">
                      <el-input
                        v-model="customFlowSlugInput"
                        clearable
                        placeholder="标识，如 access_token、step1.body（生成 {{flow.…}}）"
                        class="flow-ph-input"
                        @keyup.enter="insertNewFlowPlaceholder(false)"
                      />
                      <el-button type="primary" size="small" @click="insertNewFlowPlaceholder(false)">插入 flow 占位符</el-button>
                      <el-button size="small" @click="insertNewFlowPlaceholder(true)">插入并加入常用</el-button>
                    </div>
                    <div v-if="customFlowPlaceholders.length" class="flow-ph-fav">
                      <span class="flow-ph-fav-label">本应用常用</span>
                      <el-space wrap size="small">
                        <el-tag
                          v-for="row in customFlowPlaceholders"
                          :key="row.slug"
                          closable
                          type="info"
                          effect="plain"
                          @close="removeFlowFavorite(row.slug)"
                          @click="insertBodyToken(flowTokenFromSlug(row.slug))"
                          style="cursor: pointer"
                          :title="flowTokenFromSlug(row.slug)"
                        >
                          {{ row.label || row.slug }}
                        </el-tag>
                      </el-space>
                    </div>
                    <div v-for="grp in BODY_PLACEHOLDER_GROUPS_STATIC" :key="grp.title" class="ph-group">
                      <span class="ph-group-title">{{ grp.title }}</span>
                      <el-space wrap size="small">
                        <el-button
                          v-for="p in grp.items"
                          :key="p.token"
                          size="small"
                          @click="insertBodyToken(p.token)"
                        >
                          {{ p.label }}
                        </el-button>
                      </el-space>
                    </div>
                  </el-collapse-item>
                </el-collapse>
                <div class="body-editor-shell">
                  <JsonTemplateEditor
                    v-model="form.body_template"
                    :app-params="appParams"
                    :min-height="200"
                    :placeholder="bodyTemplatePlaceholder"
                  />
                </div>
              </el-tab-pane>

              <!-- 表格 Key-Value 标签页 -->
              <el-tab-pane label="表格（KV）" name="kv">
                <p class="subhint" style="margin-bottom: 8px">以键值对方式编辑，值支持 <code v-pre>{{...}}</code> 占位符，切回 JSON 标签页时自动序列化为 JSON。</p>
                <el-table :data="kvRows" border size="small" style="width: 100%">
                  <el-table-column label="Key" width="220">
                    <template #default="{ row, $index }">
                      <el-input v-model="row.key" size="small" placeholder="字段名" @change="syncKvToJson" @blur="cleanEmptyKvRows($index)" />
                    </template>
                  </el-table-column>
                  <el-table-column label="Value">
                    <template #default="{ row }">
                      <el-input v-model="row.value" size="small" placeholder="值或 {{占位符}}" @change="syncKvToJson" />
                    </template>
                  </el-table-column>
                  <el-table-column label="类型" width="120">
                    <template #default="{ row }">
                      <el-select v-model="row.type" size="small" @change="syncKvToJson">
                        <el-option label="字符串" value="string" />
                        <el-option label="数字" value="number" />
                        <el-option label="布尔" value="boolean" />
                        <el-option label="原始" value="raw" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column width="60">
                    <template #default="{ $index }">
                      <el-button size="small" type="danger" plain @click="removeKvRow($index)">删</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-button size="small" style="margin-top: 8px" @click="addKvRow">+ 添加字段</el-button>
              </el-tab-pane>

              <!-- Form 表单（urlencoded）标签页 -->
              <el-tab-pane label="Form（表单）" name="form">
                <p class="subhint" style="margin-bottom: 8px">生成 <code>application/x-www-form-urlencoded</code> 格式 Body，值支持 <code v-pre>{{...}}</code> 占位符。</p>
                <el-table :data="formRows" border size="small" style="width: 100%">
                  <el-table-column label="字段名" width="220">
                    <template #default="{ row, $index }">
                      <el-input v-model="row.key" size="small" placeholder="字段名" @change="syncFormToTemplate" @blur="cleanEmptyFormRows($index)" />
                    </template>
                  </el-table-column>
                  <el-table-column label="值">
                    <template #default="{ row }">
                      <el-input v-model="row.value" size="small" placeholder="值或 {{占位符}}" @change="syncFormToTemplate" />
                    </template>
                  </el-table-column>
                  <el-table-column width="60">
                    <template #default="{ $index }">
                      <el-button size="small" type="danger" plain @click="removeFormRow($index)">删</el-button>
                    </template>
                  </el-table-column>
                </el-table>
                <el-button size="small" style="margin-top: 8px" @click="addFormRow">+ 添加字段</el-button>
              </el-tab-pane>

              <!-- Raw 原始标签页 -->
              <el-tab-pane label="Raw（原始）" name="raw">
                <p class="subhint" style="margin-bottom: 8px">纯文本；支持 <code v-pre>{{...}}</code> 占位符；Content-Type 建议手动指定。</p>
                <el-input
                  v-model="form.body_template"
                  type="textarea"
                  :rows="10"
                  placeholder="原始请求体（XML、文本等）"
                />
              </el-tab-pane>
            </el-tabs>

            <!-- 自动推导参数列表（从 Path 与 body_template 中的 {{...}}；自动忽略服务端托管的 token） -->
            </div>
        </el-form-item>

        <el-form-item label="超时 ms">
          <el-input-number v-model="form.timeout_ms" :min="1000" :max="120000" />
        </el-form-item>
        <el-form-item label="最大重试">
          <el-input-number v-model="form.retry_max" :min="0" :max="10" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="模板变量覆盖">
          <el-input v-model="sampleVarsJson" type="textarea" :rows="6" :placeholder="sampleVarsPlaceholder" />
          <p class="subhint">上方参数列表「一键填入」也会更新此处。保存接口时该 demo 入参一并保存，下次进入自动回填，二次执行无需重填。</p>
        </el-form-item>
        <el-form-item label="接口响应后脚本">
          <EndpointAfterScriptsEditor v-model="endpointAfterScripts" :app-id="appId" />
        </el-form-item>

        <!-- 执行序列编辑区 -->
        <el-form-item label="after_response 序列">
          <div class="script-order-editor" style="width: 100%; max-width: 860px">
            <div class="script-order-header">
              <span class="script-order-hint">拖拽调整执行顺序；全局脚本只读，接口脚本可编辑。序列为空时退化为「全局全部 → 接口全部」。</span>
              <div class="script-order-actions">
                <el-dropdown v-if="appAfterScriptRows.length" trigger="click" @command="addAppScriptToOrder">
                  <el-button size="small" type="primary" plain>+ 添加全局脚本</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        v-for="r in appAfterScriptRows"
                        :key="'add-app-' + r.index"
                        :command="r"
                      >全局 #{{ r.index }} {{ r.name }}{{ r.enabled ? '' : '（未启用）' }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button size="small" type="success" plain style="margin-left: 6px" @click="addEndpointScriptToOrder">+ 添加接口脚本</el-button>
                <el-button v-if="afterScriptOrder.length" size="small" plain style="margin-left: 6px" @click="afterScriptOrder = []">清空（退化默认顺序）</el-button>
              </div>
            </div>
            <div v-if="!afterScriptOrder.length" class="script-order-empty">
              序列为空 — 调试/线上将按「全局脚本全部 → 接口脚本全部」顺序执行
            </div>
            <div v-else class="script-order-list">
              <div
                v-for="(item, idx) in afterScriptOrder"
                :key="item._key || (item.scope + '-' + item.index + '-' + idx)"
                class="script-order-item"
                :class="{ 'script-order-item--app': item.scope === 'app', 'script-order-item--ep': item.scope === 'endpoint' }"
              >
                <div class="script-order-item__drag">
                  <el-icon style="cursor:grab"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 4h2v2H9zm0 4h2v2H9zm0 4h2v2H9zm0 4h2v2H9zm4-12h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z"/></svg></el-icon>
                </div>
                <el-tag :type="item.scope === 'app' ? 'warning' : 'primary'" size="small" style="flex-shrink:0;min-width:56px;text-align:center">
                  {{ item.scope === 'app' ? '全局' : '接口' }} #{{ item.index }}
                </el-tag>
                <span class="script-order-item__name">{{ item.name || '未命名' }}</span>
                <el-tag v-if="!item.enabled" type="info" size="small">未启用</el-tag>
                <div class="script-order-item__btns">
                  <el-button size="small" :disabled="idx === 0" text @click="moveOrderItem(idx, idx - 1)">↑</el-button>
                  <el-button size="small" :disabled="idx === afterScriptOrder.length - 1" text @click="moveOrderItem(idx, idx + 1)">↓</el-button>
                  <el-button size="small" type="danger" text @click="removeOrderItem(idx)">移除</el-button>
                </div>
                <!-- 全局脚本代码只读展示 -->
                <div v-if="item.scope === 'app' && getAppScriptCode(item.index)" class="script-order-item__code">
                  <el-collapse>
                    <el-collapse-item :title="`查看代码（只读）`" :name="'app-code-' + idx">
                      <pre class="trace-pre trace-pre--light">{{ getAppScriptCode(item.index) }}</pre>
                    </el-collapse-item>
                  </el-collapse>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item>
          <div v-if="detectedParams.length" class="detected-params">
            <div class="detected-params__header">
              <span>检测到 <strong>{{ detectedParams.length }}</strong> 个模板参数</span>
              <el-button size="small" @click="fillSampleVarsFromParams">一键填入调试变量</el-button>
            </div>
            <el-table :data="detectedParams" size="small" border style="width: 100%; margin-top: 6px">
              <el-table-column prop="token" label="占位符" min-width="200" show-overflow-tooltip />
              <el-table-column label="分类" width="120">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.category === 'app' ? 'success' : row.category === 'flow' ? 'warning' : 'info'">
                    {{ row.category }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="当前调试值" min-width="200">
                <template #default="{ row }">
                  <el-input
                    size="small"
                    :placeholder="row.defaultVal || '（空）'"
                    :model-value="getSampleVar(row.token)"
                    @input="setSampleVar(row.token, $event)"
                  />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="sending" @click="sendDebug">发送调试请求</el-button>
          <el-button type="success" :loading="savingEp" :disabled="!canSaveEndpoint" @click="saveEndpoint">保存接口</el-button>
          <span v-if="form.endpoint_id" class="save-hint">将更新 #{{ form.endpoint_id }}</span>
          <span v-else class="save-hint">将新建一条接口</span>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="lastResult" shadow="never" class="block">
      <template #header>
        <span>发送与接收（全量）</span>
        <el-tag :type="lastResult.ok ? 'success' : 'danger'" size="small" style="margin-left: 10px">
          {{ lastResult.ok ? '成功' : '失败' }}
        </el-tag>
        <el-tag size="small" style="margin-left: 6px">HTTP {{ lastResult.http_status ?? '—' }}</el-tag>
        <!-- 生成返回参数 Schema 按钮 -->
        <el-button
          v-if="lastResult.ok && lastResult.exchange?.response?.body"
          size="small"
          type="primary"
          plain
          style="margin-left: 16px"
          :loading="generatingSchema"
          @click="generateResponseSchema"
        >生成返回参数 Schema</el-button>
        <el-button
          v-if="generatedResponseSchema"
          size="small"
          type="success"
          plain
          style="margin-left: 8px"
          :loading="savingSchema"
          @click="saveSchemaToEndpoint"
        >保存 Schema 到接口</el-button>
      </template>

      <!-- 生成的 Schema 预览 -->
      <div v-if="generatedResponseSchema" class="schema-preview">
        <div class="schema-preview__header">
          <span>响应参数 Schema（可编辑后保存）</span>
          <el-button size="small" type="danger" plain @click="generatedResponseSchema = null">清除</el-button>
        </div>
        <el-input v-model="generatedResponseSchema" type="textarea" :rows="12" class="schema-editor" />
        <p class="subhint">基于本次响应 JSON 自动推导的 JSON Schema；可手动完善类型/描述后点「保存 Schema 到接口」写入接口记录。</p>
      </div>

      <el-alert v-if="lastResult.error" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
        {{ lastResult.error }}
      </el-alert>
      <el-collapse
        v-if="lastResult.meta && Object.keys(lastResult.meta).length"
        v-model="debugMetaCollapse"
        class="meta-block meta-collapse"
      >
        <el-collapse-item title="体积与截断说明（meta）" name="meta">
          <pre class="trace-pre trace-pre--light trace-pre--tall">{{ prettyJson(lastResult.meta) }}</pre>
        </el-collapse-item>
      </el-collapse>

      <!-- 脚本执行日志 -->
      <el-collapse
        v-if="scriptLogs.length"
        v-model="scriptLogsCollapse"
        class="meta-block script-logs-collapse"
      >
        <el-collapse-item :title="`脚本执行日志（${scriptLogs.length} 条）`" name="scriptLogs">
          <div class="script-logs-list">
            <div v-for="(log, i) in scriptLogs" :key="i" class="script-log-row">
              <el-tag :type="log.scope === 'app' ? 'warning' : 'primary'" size="small" style="flex-shrink:0;min-width:56px;text-align:center">
                {{ log.scope === 'app' ? '全局' : '接口' }} #{{ log.index }}
              </el-tag>
              <span class="script-log-name">{{ log.name || '未命名' }}</span>
              <el-tag :type="scriptLogLevelType(log.level)" size="small" style="flex-shrink:0;width:42px;text-align:center">{{ log.level }}</el-tag>
              <code class="script-log-line">{{ log.line }}</code>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

      <el-collapse
        v-if="lastResult.exchange"
        v-model="debugContextAfterCollapse"
        class="meta-block context-after-collapse"
      >
        <el-collapse-item title="响应后 context（占位符）" name="ctxAfter">
          <p class="subhint" style="margin-top: 0">
            在 HTTP <strong>2xx</strong> 且响应体可解析为 JSON 时，按连接器「执行后 · 将 HTTP 2xx JSON 写入
            <code v-pre>{{context.*}}</code>」规则展平；随后执行 <code>after_response</code>（按上方序列）。表中为当前返回前占位符表内所有
            <code v-pre>{{context.*}}</code> 项（含脚本写入/修改）；非 2xx 或未解析 JSON 时通常为空。
          </p>
          <el-table v-if="contextAfterRows.length" :data="contextAfterRows" border size="small" max-height="360">
            <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
          </el-table>
          <el-empty v-else :description="'暂无 {{context.*}} 项'" :image-size="72" />
        </el-collapse-item>
      </el-collapse>
      <el-collapse v-if="lastResult.vars_used && Object.keys(lastResult.vars_used).length">
        <el-collapse-item title="本次使用的模板变量（vars_used）" name="vars">
          <pre class="trace-pre trace-pre--light trace-pre--tall">{{ prettyJson(lastResult.vars_used) }}</pre>
        </el-collapse-item>
      </el-collapse>
      <template v-if="lastResult.exchange">
        <el-tag size="small" style="margin: 12px 0 10px">{{ phaseLabel(lastResult.exchange.phase) }}</el-tag>
        <el-tabs>
          <el-tab-pane label="请求（分层 + 全量）">
            <div class="trace-block">
              <div class="trace-line"><span class="k">Method</span> {{ lastResult.exchange.request?.method }}</div>
              <div class="trace-line"><span class="k">URL</span> {{ lastResult.exchange.request?.url }}</div>
              <el-collapse class="hdr-collapse">
                <el-collapse-item title="① 应用通用 Headers（模板展开后）" name="h1">
                  <pre class="trace-pre trace-pre--tall">{{ prettyJson(lastResult.header_breakdown?.common_headers) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="② 接口专属 Headers（模板展开后）" name="h2">
                  <pre class="trace-pre trace-pre--tall">{{ prettyJson(lastResult.header_breakdown?.endpoint_headers) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="③ 合并后 + 系统头，鉴权之前（将发往对端的自定义部分）" name="h3">
                  <pre class="trace-pre trace-pre--tall">{{ prettyJson(lastResult.header_breakdown?.merged_before_auth) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="④ 最终请求头（含鉴权，Wire 实际发送）" name="h4">
                  <pre class="trace-pre trace-pre--tall">{{ prettyJson(lastResult.exchange.request?.headers) }}</pre>
                </el-collapse-item>
                <el-collapse-item title="⑤ 请求体（全量，超大时按 meta 截断展示）" name="h5">
                  <el-tag v-if="lastResult.exchange.request?.body_truncated" type="warning" size="small" style="margin-bottom: 8px"
                    >展示已截断</el-tag
                  >
                  <pre class="trace-pre trace-pre--tall">{{ lastResult.exchange.request?.body || '—' }}</pre>
                </el-collapse-item>
              </el-collapse>
            </div>
          </el-tab-pane>
          <el-tab-pane label="响应（全量）">
            <div class="trace-block">
              <div class="trace-line">
                <span class="k">HTTP</span> {{ lastResult.exchange.response?.status ?? '—' }}
              </div>
              <div class="trace-sub">响应头（全量）</div>
              <pre class="trace-pre trace-pre--tall">{{ prettyJson(lastResult.exchange.response?.headers) }}</pre>
              <div class="trace-sub">
                响应体（全量）
                <el-tag v-if="lastResult.exchange.response?.body_truncated" type="warning" size="small" style="margin-left: 6px"
                  >展示已截断</el-tag
                >
              </div>
              <pre class="trace-pre trace-pre--tall">{{ formatMaybeJson(lastResult.exchange.response?.body) }}</pre>
            </div>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-card>

    <Teleport to="body">
      <div
        v-show="bodyCtxMenu.visible"
        class="body-ctx-menu"
        :style="{ left: bodyCtxMenu.x + 'px', top: bodyCtxMenu.y + 'px' }"
        @mousedown.stop
      >
        <div class="body-ctx-menu__title">替换选区为传入参数占位符</div>
        <div class="body-ctx-menu__scroll">
          <template v-for="grp in bodyPlaceholderGroupsMerged" :key="grp.title">
            <div class="body-ctx-menu__group">{{ grp.title }}</div>
            <button
              v-for="p in grp.items"
              :key="p.token"
              type="button"
              class="body-ctx-menu__item"
              @click="replaceSelectionWithToken(p.token)"
            >
              <code>{{ p.token }}</code>
              <span class="body-ctx-menu__hint">{{ p.label }}</span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as ob from '@/api/outbound'
import JsonTemplateEditor from '@/components/JsonTemplateEditor.vue'
import EndpointAfterScriptsEditor from '@/components/EndpointAfterScriptsEditor.vue'

const route = useRoute()
const router = useRouter()
const appId = computed(() => route.params.appId)

const bodyTemplateInputRef = ref(null)
const DEMO_BODY_JSON = `{
  "device_id": 123,
  "device_name": "演示设备",
  "device_serial": "DEMO-SERIAL",
  "event_type": "debug.sample",
  "event_data": "{\\\"demo\\\":true}",
  "occurred_at": "2026-04-16T12:00:00.000000000Z",
  "definition_key": "sample_event",
  "definition_name": "示例事件定义"
}`

const bodyCollapseActive = ref(['demo', 'tok'])
const assistPick = ref('')
const bodySel = reactive({ start: 0, end: 0, text: '' })

const bodyTemplatePlaceholder =
  'JSON 模板；可嵌入 {{device.id}}、{{device_event.event_data}} 等。注意 JSON 语法：动态片段在字符串内需加引号，或整段用字符串模板。留空则与线上一致使用默认 device_event JSON。'

const BODY_PLACEHOLDER_GROUPS_STATIC = [
  {
    title: '设备事件',
    items: [
      { label: 'device_event.id', token: '{{device_event.id}}' },
      { label: 'device_event.event_type', token: '{{device_event.event_type}}' },
      { label: 'device_event.event_data', token: '{{device_event.event_data}}' },
      { label: 'device_event.created_at', token: '{{device_event.created_at}}' }
    ]
  },
  {
    title: '设备',
    items: [
      { label: 'device.id', token: '{{device.id}}' },
      { label: 'device.name', token: '{{device.name}}' },
      { label: 'device.serial', token: '{{device.serial}}' },
      { label: 'device.agent_alias', token: '{{device.agent_alias}}' },
      { label: 'device.server_alias', token: '{{device.server_alias}}' }
    ]
  },
  {
    title: '事件定义',
    items: [
      { label: 'definition.key', token: '{{definition.key}}' },
      { label: 'definition.name', token: '{{definition.name}}' }
    ]
  },
  {
    title: '多步 HTTP 链（仅顺序/失败转移等场景有值）',
    items: [
      { label: 'http.last.status', token: '{{http.last.status}}' },
      { label: 'http.last.body', token: '{{http.last.body}}' }
    ]
  },
  {
    title: 'Token 缓存（app.*）',
    items: [
      { label: 'app.access_token', token: '{{app.access_token}}' },
      { label: 'app.refresh_token', token: '{{app.refresh_token}}' },
      { label: 'app.token_expires_at', token: '{{app.token_expires_at}}' }
    ]
  }
]

const FLOW_PH_NS = 'flow'
const customFlowSlugInput = ref('')
const customFlowPlaceholders = ref([])

function flowPhStorageKey() {
  return `outbound_ep_debug_flow_ph_${appId.value}`
}
function flowTokenFromSlug(slug) {
  return `{{${FLOW_PH_NS}.${slug}}}`
}
function loadFlowPlaceholders() {
  customFlowPlaceholders.value = []
  try {
    const raw = localStorage.getItem(flowPhStorageKey())
    if (!raw) return
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return
    const out = []
    for (const row of arr) {
      if (!row || typeof row.slug !== 'string') continue
      const s = normalizeFlowSlug(row.slug)
      if (!s) continue
      out.push({ slug: s, label: typeof row.label === 'string' ? row.label : '' })
    }
    customFlowPlaceholders.value = out
  } catch {
    customFlowPlaceholders.value = []
  }
}
function persistFlowPlaceholders() {
  try {
    localStorage.setItem(flowPhStorageKey(), JSON.stringify(customFlowPlaceholders.value))
  } catch { /* ignore quota */ }
}
function normalizeFlowSlug(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/\s+/g, '_')
  if (!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,79}$/.test(s)) return ''
  return s
}

const bodyPlaceholderGroupsMerged = computed(() => {
  const base = BODY_PLACEHOLDER_GROUPS_STATIC.map((g) => ({ title: g.title, items: g.items.map((p) => ({ ...p })) }))
  const fav = customFlowPlaceholders.value
  if (fav.length) {
    const items = fav.map((row) => ({ label: row.label || `${FLOW_PH_NS}.${row.slug}`, token: flowTokenFromSlug(row.slug) }))
    base.push({ title: '自定义（多步 / 脚本 ctx.setVar）', items })
  }
  if (appParams.value.length) {
    const items = appParams.value.filter((p) => p.key).map((p) => ({
      label: p.description ? `${p.key}（${p.description}）` : p.key,
      token: `{{app.${p.key}}}`
    }))
    if (items.length) base.push({ title: '应用参数（app.*）', items })
  }
  return base
})

function addFlowFavorite(slug, label) {
  const s = normalizeFlowSlug(slug)
  if (!s) return false
  if (customFlowPlaceholders.value.some((r) => r.slug === s)) return true
  customFlowPlaceholders.value = [...customFlowPlaceholders.value, { slug: s, label: label || '' }]
  persistFlowPlaceholders()
  return true
}
function removeFlowFavorite(slug) {
  customFlowPlaceholders.value = customFlowPlaceholders.value.filter((r) => r.slug !== slug)
  persistFlowPlaceholders()
}

// ─── Body 多标签页 ──────────────────────────────────────
const bodyTab = ref('json')

// KV 表格
const kvRows = ref([{ key: '', value: '', type: 'string' }])
function addKvRow() { kvRows.value.push({ key: '', value: '', type: 'string' }) }
function removeKvRow(i) { kvRows.value.splice(i, 1); if (!kvRows.value.length) addKvRow(); syncKvToJson() }
function cleanEmptyKvRows(idx) {
  if (kvRows.value.length > 1 && !kvRows.value[idx].key && !kvRows.value[idx].value) {
    kvRows.value.splice(idx, 1)
  }
}
function syncKvToJson() {
  const obj = {}
  for (const row of kvRows.value) {
    const k = row.key.trim()
    if (!k) continue
    if (row.type === 'number') obj[k] = Number(row.value) || 0
    else if (row.type === 'boolean') obj[k] = row.value === 'true' || row.value === true
    else if (row.type === 'raw') { try { obj[k] = JSON.parse(row.value) } catch { obj[k] = row.value } }
    else obj[k] = row.value
  }
  form.body_template = JSON.stringify(obj, null, 2)
}
function loadKvFromJson(json) {
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      kvRows.value = Object.entries(obj).map(([k, v]) => {
        const t = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : typeof v === 'object' ? 'raw' : 'string'
        return { key: k, value: t === 'raw' ? JSON.stringify(v) : String(v), type: t }
      })
      if (!kvRows.value.length) kvRows.value = [{ key: '', value: '', type: 'string' }]
    }
  } catch { /* keep existing */ }
}

// Form urlencoded
const formRows = ref([{ key: '', value: '' }])
function addFormRow() { formRows.value.push({ key: '', value: '' }) }
function removeFormRow(i) { formRows.value.splice(i, 1); if (!formRows.value.length) addFormRow(); syncFormToTemplate() }
function cleanEmptyFormRows(idx) {
  if (formRows.value.length > 1 && !formRows.value[idx].key && !formRows.value[idx].value) {
    formRows.value.splice(idx, 1)
  }
}
function syncFormToTemplate() {
  const parts = []
  for (const row of formRows.value) {
    const k = row.key.trim()
    if (!k) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(row.value)}`)
  }
  form.body_template = parts.join('&')
}
function loadFormFromTemplate(tpl) {
  if (!tpl) { formRows.value = [{ key: '', value: '' }]; return }
  try {
    const parts = tpl.split('&').map((p) => {
      const idx = p.indexOf('=')
      if (idx < 0) return { key: decodeURIComponent(p), value: '' }
      return { key: decodeURIComponent(p.slice(0, idx)), value: decodeURIComponent(p.slice(idx + 1)) }
    }).filter((r) => r.key)
    formRows.value = parts.length ? parts : [{ key: '', value: '' }]
  } catch {
    formRows.value = [{ key: '', value: '' }]
  }
}

function onBodyTabChange(tab) {
  if (tab === 'kv') loadKvFromJson(form.body_template)
  else if (tab === 'form') loadFormFromTemplate(form.body_template)
  // raw / json tabs use body_template directly
  // auto-set content_type hint
  if (!form.content_type) {
    if (tab === 'form') form.content_type = 'application/x-www-form-urlencoded'
    else if (tab === 'kv' || tab === 'json') form.content_type = 'application/json'
    else if (tab === 'raw') form.content_type = 'text/plain'
  }
}

// ─── 检测模板参数 ─────────────────────────────────────────
const RE_PLACEHOLDER = /\{\{([^}]+)\}\}/g

// autoInjectedNames 与后端 outbound.AutoInjectedBodyParamNames 对齐：
// dynamic_bearer + token_in=json_body 时，token 字段及其值模板占位符由服务端自动注入，
// 不应作为调用方入参展示/填写（自动忽略 token/key 类参数）。
const autoInjectedNames = computed(() => {
  const set = new Set()
  if (appAuthType.value !== 'dynamic_bearer') return set
  const p = appTokenProvider.value || {}
  if (p.token_in !== 'json_body') return set
  const key = String(p.token_body_key || '').trim() || 'access_token'
  set.add(key)
  const tpl = String(p.token_body_value_template || '{{access_token}}')
  let m
  RE_PLACEHOLDER.lastIndex = 0
  while ((m = RE_PLACEHOLDER.exec(tpl)) !== null) {
    const name = m[1].trim()
    if (name) set.add(name)
  }
  return set
})

const detectedParams = computed(() => {
  // 同时扫描 Path（URL 含 {{占位符}}）与 Body 模板
  const sources = [String(form.path || ''), String(form.body_template || '')]
  const seen = new Set()
  const result = []
  const ignored = autoInjectedNames.value
  for (const tpl of sources) {
    let m
    RE_PLACEHOLDER.lastIndex = 0
    while ((m = RE_PLACEHOLDER.exec(tpl)) !== null) {
      const inner = m[1].trim()
      if (!inner || seen.has(inner)) continue
      seen.add(inner)
      // skip built-in $func() calls
      if (inner.startsWith('$')) continue
      // 自动忽略服务端托管的 token/key 类参数
      if (ignored.has(inner)) continue
      const token = `{{${inner}}}`
      const category = inner.startsWith('app.') ? 'app' : inner.startsWith('flow.') ? 'flow' : inner.startsWith('context.') ? 'context' : 'system'
      // default sample values for well-known tokens
      const defaults = {
        'device_event.id': '999001', 'device.id': '123', 'device.name': '演示设备',
        'device.serial': 'DEMO-SERIAL', 'device_event.event_type': 'debug.sample',
        'device_event.event_data': '{"demo":true}', 'definition.key': 'sample_event'
      }
      result.push({ token, inner, category, defaultVal: defaults[inner] || '' })
    }
  }
  return result
})

function getSampleVar(token) {
  try {
    const obj = JSON.parse(sampleVarsJson.value || '{}')
    return obj[token] ?? ''
  } catch { return '' }
}
function setSampleVar(token, val) {
  let obj = {}
  try { obj = JSON.parse(sampleVarsJson.value || '{}') } catch { /* ignore */ }
  obj[token] = val
  sampleVarsJson.value = JSON.stringify(obj, null, 2)
}
function fillSampleVarsFromParams() {
  let obj = {}
  try { obj = JSON.parse(sampleVarsJson.value || '{}') } catch { /* ignore */ }
  for (const p of detectedParams.value) {
    if (!Object.prototype.hasOwnProperty.call(obj, p.token)) {
      obj[p.token] = p.defaultVal || ''
    }
  }
  sampleVarsJson.value = JSON.stringify(obj, null, 2)
  ElMessage.success('已将检测到的参数填入调试变量（已有键保持不变）')
}

// ─── Schema 生成 ──────────────────────────────────────────
const generatingSchema = ref(false)
const generatedResponseSchema = ref(null)
const savingSchema = ref(false)

function inferJsonSchema(value, depth = 0) {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) {
    const itemSchema = value.length > 0 ? inferJsonSchema(value[0], depth + 1) : {}
    return { type: 'array', items: itemSchema }
  }
  if (typeof value === 'object') {
    if (depth > 4) return { type: 'object' }
    const props = {}
    for (const [k, v] of Object.entries(value)) {
      props[k] = inferJsonSchema(v, depth + 1)
    }
    return { type: 'object', properties: props }
  }
  if (typeof value === 'boolean') return { type: 'boolean' }
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
  return { type: 'string' }
}

function generateResponseSchema() {
  const body = lastResult.value?.exchange?.response?.body
  if (!body) return
  generatingSchema.value = true
  try {
    const parsed = JSON.parse(body)
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '接口返回参数',
      description: '由调试结果自动推导，请根据实际业务补充类型与描述',
      ...inferJsonSchema(parsed)
    }
    generatedResponseSchema.value = JSON.stringify(schema, null, 2)
  } catch {
    ElMessage.error('响应体不是有效 JSON，无法推导 Schema')
  } finally {
    generatingSchema.value = false
  }
}

async function saveSchemaToEndpoint() {
  if (!form.endpoint_id) {
    ElMessage.error('请先选择或保存接口再保存 Schema')
    return
  }
  if (!generatedResponseSchema.value) return
  // validate JSON first
  try { JSON.parse(generatedResponseSchema.value) } catch {
    ElMessage.error('Schema JSON 格式无效')
    return
  }
  // build param_schema from detected params
  const paramSchema = buildParamSchemaFromDetected()
  savingSchema.value = true
  try {
    let headers = {}
    try { headers = JSON.parse(headersJson.value || '{}') } catch { /* ignore */ }
    await ob.updateOutboundEndpoint(form.endpoint_id, {
      app_id: Number(appId.value),
      name: String(form.name).trim() || 'untitled',
      method: form.method,
      path: String(form.path).trim(),
      body_template: form.body_template,
      param_schema: paramSchema,
      response_schema: generatedResponseSchema.value,
      demo_params: String(sampleVarsJson.value || '').trim(),
      content_type: form.content_type || '',
      timeout_ms: form.timeout_ms || 0,
      retry_max: form.retry_max ?? 0,
      enabled: form.enabled !== false,
      headers
    })
    ElMessage.success('Schema 已保存到接口')
    await loadEndpointsList()
  } finally {
    savingSchema.value = false
  }
}

function buildParamSchemaFromDetected() {
  if (!detectedParams.value.length) return ''
  const props = {}
  for (const p of detectedParams.value) {
    props[p.inner] = { type: 'string', description: '' }
  }
  return JSON.stringify({ type: 'object', properties: props }, null, 2)
}

// ─── 通用工具 ─────────────────────────────────────────────
function ensureSampleVarKey(fullToken) {
  const key = String(fullToken || '').trim()
  if (!key.startsWith('{{') || !key.endsWith('}}')) return
  let obj = {}
  const cur = String(sampleVarsJson.value || '').trim()
  if (cur) {
    try {
      obj = JSON.parse(cur)
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) obj = {}
    } catch { return }
  }
  if (Object.prototype.hasOwnProperty.call(obj, key)) return
  obj[key] = ''
  try { sampleVarsJson.value = JSON.stringify(obj, null, 2) } catch { /* ignore */ }
}

function insertNewFlowPlaceholder(andFavorite) {
  const s = normalizeFlowSlug(customFlowSlugInput.value)
  if (!s) {
    ElMessage.error('标识须以字母或下划线开头，仅含字母、数字、_.-，最长 80')
    return
  }
  const token = flowTokenFromSlug(s)
  insertBodyToken(token)
  if (andFavorite) addFlowFavorite(s, '')
  ensureSampleVarKey(token)
  customFlowSlugInput.value = ''
  ElMessage.success(andFavorite ? '已插入并加入本应用常用' : '已插入；调试时请在「模板变量覆盖」为该键赋值')
}

const loading = ref(true)
const sending = ref(false)
const savingEp = ref(false)
const appName = ref('')
const appExtensionScripts = ref(null)
// 接口级响应后脚本，结构 { after_response: [...] }
const endpointAfterScripts = ref({ after_response: [] })
const appCommonHeadersDisplay = ref('{}')
const appParams = ref([])
const endpointOptions = ref([])
const headersJson = ref('{}')
const sampleVarsJson = ref('')
const appAuthType = ref('none')
const appTokenProvider = ref({})
const sampleVarsPlaceholder = '{"{{device.id}}":"99","{{flow.access_token}}":"","{{device_event.event_data}}":"{}"}'

const form = reactive({
  endpoint_id: null,
  name: '',
  method: 'POST',
  path: '',
  body_template: '',
  content_type: '',
  timeout_ms: 15000,
  retry_max: 0,
  enabled: true
})

const lastResult = ref(null)
// 执行序列：[{scope:'app'|'endpoint', index:number, name:string, enabled:boolean}]
const afterScriptOrder = ref([])
const debugMetaCollapse = ref([])
const debugContextAfterCollapse = ref([])
const scriptLogsCollapse = ref([])

// 全局脚本列表（从 appExtensionScripts 提取）
const appAfterScriptRows = computed(() => {
  const ext = appExtensionScripts.value
  if (!ext || typeof ext !== 'object') return []
  let raw = ext.after_response
  if (raw == null) return []
  if (!Array.isArray(raw)) raw = [raw]
  return raw.map((entry, index) => {
    const enabled = entry && entry.enabled !== false
    const name = entry && String(entry.name || '').trim() ? String(entry.name).trim() : '未命名'
    const code = entry && String(entry.code || '').trim()
    return { index, name, enabled, code, scope: 'app' }
  })
})

// 接口脚本列表（从 endpointAfterScripts 提取）
const endpointAfterScriptRows = computed(() => {
  const scripts = endpointAfterScripts.value
  if (!scripts || !Array.isArray(scripts.after_response)) return []
  return scripts.after_response.map((entry, index) => {
    const enabled = entry && entry.enabled !== false
    const name = entry && String(entry.name || '').trim() ? String(entry.name).trim() : '未命名'
    return { index, name, enabled, scope: 'endpoint' }
  })
})

// 构建发送给后端的 after_script_order（过滤掉越界条目）
function buildAfterScriptOrderPayload() {
  if (!afterScriptOrder.value.length) return undefined
  return afterScriptOrder.value.map(e => ({ scope: e.scope, index: e.index }))
}

// 初始化执行序列：从接口数据或默认（全局→接口）
function initAfterScriptOrder(savedOrder) {
  if (Array.isArray(savedOrder) && savedOrder.length) {
    afterScriptOrder.value = savedOrder.map(e => {
      const row = e.scope === 'app'
        ? appAfterScriptRows.value.find(r => r.index === e.index)
        : endpointAfterScriptRows.value.find(r => r.index === e.index)
      return {
        scope: e.scope,
        index: e.index,
        name: row ? row.name : '未命名',
        enabled: row ? row.enabled : true,
        _key: `${e.scope}-${e.index}-${Date.now()}-${Math.random()}`
      }
    })
    return
  }
  // 默认顺序：全局脚本全部 → 接口脚本全部
  const order = []
  for (const r of appAfterScriptRows.value) {
    order.push({ scope: 'app', index: r.index, name: r.name, enabled: r.enabled, _key: `app-${r.index}-${Date.now()}` })
  }
  for (const r of endpointAfterScriptRows.value) {
    order.push({ scope: 'endpoint', index: r.index, name: r.name, enabled: r.enabled, _key: `ep-${r.index}-${Date.now()}` })
  }
  afterScriptOrder.value = order
}

// 执行序列拖拽排序
function moveOrderItem(from, to) {
  const arr = [...afterScriptOrder.value]
  const [item] = arr.splice(from, 1)
  arr.splice(to, 0, item)
  afterScriptOrder.value = arr
}
function removeOrderItem(index) {
  afterScriptOrder.value = afterScriptOrder.value.filter((_, i) => i !== index)
}
function addAppScriptToOrder(row) {
  const already = afterScriptOrder.value.some(e => e.scope === 'app' && e.index === row.index)
  if (already) { ElMessage.warning('该全局脚本已在序列中'); return }
  afterScriptOrder.value = [...afterScriptOrder.value, {
    scope: 'app', index: row.index, name: row.name, enabled: row.enabled,
    _key: `app-${row.index}-${Date.now()}`
  }]
}
function addEndpointScriptToOrder() {
  // 新建一条接口脚本并追加到序列
  const scripts = endpointAfterScripts.value
  if (!Array.isArray(scripts.after_response)) scripts.after_response = []
  const newIdx = scripts.after_response.length
  scripts.after_response.push({ name: '', enabled: true, default: false, code: 'function main(ctx) {\n  \n}', timeout_ms: 800 })
  endpointAfterScripts.value = { ...scripts }
  afterScriptOrder.value = [...afterScriptOrder.value, {
    scope: 'endpoint', index: newIdx, name: '未命名', enabled: true,
    _key: `ep-${newIdx}-${Date.now()}`
  }]
}

// 全局脚本代码（只读展示用）
function getAppScriptCode(index) {
  const ext = appExtensionScripts.value
  if (!ext || !Array.isArray(ext.after_response)) return ''
  return String((ext.after_response[index] || {}).code || '').trim()
}

// 脚本日志 level 颜色
function scriptLogLevelType(level) {
  if (level === 'error') return 'danger'
  if (level === 'warn') return 'warning'
  if (level === 'info') return 'success'
  return ''
}

// 用于展示的脚本日志（从 lastResult 读取）
const scriptLogs = computed(() => {
  const r = lastResult.value
  if (!r || !Array.isArray(r.script_logs)) return []
  return r.script_logs
})

const contextAfterRows = computed(() => {
  const r = lastResult.value
  if (!r) return []
  let x = r.context_after_response
  if (x === undefined && r.meta && Array.isArray(r.meta.context_after_response)) x = r.meta.context_after_response
  return Array.isArray(x) ? x : []
})

const bodyCtxMenu = reactive({ visible: false, x: 0, y: 0, selStart: 0, selEnd: 0 })
const canSaveEndpoint = computed(() => !!(String(form.name || '').trim() && String(form.path || '').trim()))
const assistPreviewDisplay = computed(() => {
  const t = bodySel.text
  if (!t) return '（在 Body 中拖选需参数化的片段）'
  return t.length > 160 ? `${t.slice(0, 160)}…` : t
})

function getBodyTextarea() {
  const comp = bodyTemplateInputRef.value
  if (!comp) return null
  if (typeof comp.textarea === 'object' && comp.textarea) return comp.textarea
  return comp.$el?.querySelector?.('textarea') ?? null
}
function syncBodySelection() {
  const ta = getBodyTextarea()
  if (!ta) { bodySel.start = 0; bodySel.end = 0; bodySel.text = ''; return }
  const s = ta.selectionStart; const e = ta.selectionEnd
  bodySel.start = s; bodySel.end = e
  bodySel.text = s !== e ? String(form.body_template ?? '').slice(s, e) : ''
}
function replaceRangeWithToken(start, end, token) {
  const ta = getBodyTextarea()
  const cur = form.body_template ?? ''
  if (!token) return
  form.body_template = cur.slice(0, start) + token + cur.slice(end)
  bodyCtxMenu.visible = false
  nextTick(() => {
    syncBodySelection()
    if (ta) { ta.focus(); const pos = start + token.length; ta.setSelectionRange(pos, pos) }
  })
}
function insertBodyToken(token) {
  const ta = getBodyTextarea()
  const cur = form.body_template ?? ''
  if (!ta) { form.body_template = cur + token; return }
  const start = ta.selectionStart ?? cur.length; const end = ta.selectionEnd ?? cur.length
  replaceRangeWithToken(start, end, token)
}

async function insertDemoBodyJson() {
  const cur = String(form.body_template || '').trim()
  if (cur) {
    try { await ElMessageBox.confirm('将覆盖当前 Body 模板，是否继续？', '插入 Demo', { type: 'warning' }) } catch { return }
  }
  form.body_template = DEMO_BODY_JSON
  assistPick.value = ''
  nextTick(() => { syncBodySelection(); getBodyTextarea()?.focus() })
}
function applyAssistParametrize() {
  if (!assistPick.value || bodySel.start === bodySel.end) return
  replaceRangeWithToken(bodySel.start, bodySel.end, assistPick.value)
  assistPick.value = ''
}
function onBodyTemplateContextMenu(e) {
  const ta = getBodyTextarea()
  if (!ta || e.target !== ta) return
  const start = ta.selectionStart; const end = ta.selectionEnd
  if (start === end) return
  e.preventDefault(); e.stopPropagation()
  bodyCtxMenu.selStart = start; bodyCtxMenu.selEnd = end
  const mw = 300; const mh = 420
  let x = e.clientX; let y = e.clientY
  if (x + mw > window.innerWidth - 8) x = Math.max(8, window.innerWidth - mw - 8)
  if (y + mh > window.innerHeight - 8) y = Math.max(8, window.innerHeight - mh - 8)
  bodyCtxMenu.x = x; bodyCtxMenu.y = y; bodyCtxMenu.visible = true
}
function replaceSelectionWithToken(token) {
  replaceRangeWithToken(bodyCtxMenu.selStart, bodyCtxMenu.selEnd, token)
}
function onGlobalMouseDownBodyCtx(e) {
  if (!bodyCtxMenu.visible) return
  if (e.target?.closest?.('.body-ctx-menu')) return
  bodyCtxMenu.visible = false
}
watch(() => bodyCtxMenu.visible, (v) => {
  if (v) nextTick(() => window.addEventListener('mousedown', onGlobalMouseDownBodyCtx, true))
  else window.removeEventListener('mousedown', onGlobalMouseDownBodyCtx, true)
})
onUnmounted(() => window.removeEventListener('mousedown', onGlobalMouseDownBodyCtx, true))

function phaseLabel(phase) {
  if (phase === 'http') return '出站 HTTP（调试）'
  if (phase === 'refresh') return '刷新 Token（refresh）'
  if (phase === 'fetch') return '获取 Token（fetch）'
  return phase || '—'
}
function prettyJson(obj) {
  if (obj == null || (typeof obj === 'object' && !Object.keys(obj).length)) return '{}'
  try { return JSON.stringify(typeof obj === 'string' ? JSON.parse(obj) : obj, null, 2) } catch { return String(obj) }
}
function formatMaybeJson(raw) {
  if (raw == null || raw === '') return '—'
  const s = String(raw).trim()
  if (!s) return '—'
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try { return JSON.stringify(JSON.parse(s), null, 2) } catch { /* fallthrough */ }
  }
  return s
}

async function loadEndpointsList() {
  const r = await ob.listOutboundEndpoints({ app_id: appId.value })
  endpointOptions.value = r.data || []
}
async function loadApp() {
  const r = await ob.getOutboundApp(appId.value)
  const a = r.data
  appName.value = a?.name || ''
  if (a?.extension_scripts != null && typeof a.extension_scripts === 'object') {
    try { appExtensionScripts.value = JSON.parse(JSON.stringify(a.extension_scripts)) } catch { appExtensionScripts.value = null }
  } else { appExtensionScripts.value = null }
  try {
    appCommonHeadersDisplay.value = JSON.stringify(
      a?.common_headers && Object.keys(a.common_headers).length ? a.common_headers : {}, null, 2)
  } catch { appCommonHeadersDisplay.value = '{}' }
  appParams.value = Array.isArray(a?.app_params) ? a.app_params : []
  appAuthType.value = a?.auth_type || 'none'
  appTokenProvider.value = (a?.token_provider && typeof a.token_provider === 'object') ? a.token_provider : {}
}

function applyEndpointRow(e) {
  if (!e) return
  form.endpoint_id = e.id
  form.name = e.name || ''
  form.method = e.method || 'POST'
  form.path = e.path || ''
  form.body_template = e.body_template || ''
  form.content_type = e.content_type || ''
  form.timeout_ms = e.timeout_ms > 0 ? e.timeout_ms : 15000
  form.retry_max = e.retry_max ?? 0
  form.enabled = e.enabled !== false
  headersJson.value = e.headers && Object.keys(e.headers).length ? JSON.stringify(e.headers, null, 2) : '{}'
  generatedResponseSchema.value = e.response_schema || null
  // 回填已保存的 demo 入参，供调试 / 二次执行直接复用
  if (e.demo_params && String(e.demo_params).trim()) {
    try {
      const obj = JSON.parse(e.demo_params)
      sampleVarsJson.value = (obj && typeof obj === 'object') ? JSON.stringify(obj, null, 2) : ''
    } catch { sampleVarsJson.value = '' }
  } else {
    sampleVarsJson.value = ''
  }
  endpointAfterScripts.value = (e.after_scripts && Array.isArray(e.after_scripts.after_response))
    ? JSON.parse(JSON.stringify(e.after_scripts))
    : { after_response: [] }
  // 加载执行序列（nextTick 等 computed 更新后初始化）
  nextTick(() => initAfterScriptOrder(e.after_script_order || null))
}
function resetDraftForm() {
  form.endpoint_id = null; form.name = ''; form.method = 'POST'; form.path = ''
  form.body_template = ''; form.content_type = ''; form.timeout_ms = 15000
  form.retry_max = 0; form.enabled = true
  headersJson.value = '{}'
  generatedResponseSchema.value = null
  sampleVarsJson.value = ''
  endpointAfterScripts.value = { after_response: [] }
  afterScriptOrder.value = []
}
async function onEndpointPick(id) {
  if (!id) { resetDraftForm(); return }
  const r = await ob.getOutboundEndpoint(id)
  applyEndpointRow(r.data)
}

async function saveEndpoint() {
  if (!String(form.name || '').trim()) { ElMessage.error('请填写接口名称'); return }
  if (!String(form.path || '').trim()) { ElMessage.error('请填写 Path'); return }
  let headers = {}
  try { headers = JSON.parse(headersJson.value || '{}') } catch { ElMessage.error('Headers JSON 无效'); return }
  const paramSchema = buildParamSchemaFromDetected()
  const body = {
    app_id: Number(appId.value),
    name: String(form.name).trim(),
    method: form.method,
    path: String(form.path).trim(),
    body_template: form.body_template,
    param_schema: paramSchema,
    response_schema: generatedResponseSchema.value || '',
    demo_params: String(sampleVarsJson.value || '').trim(),
    content_type: form.content_type || '',
    timeout_ms: form.timeout_ms || 0,
    retry_max: form.retry_max ?? 0,
    enabled: form.enabled !== false,
    headers,
    after_scripts: endpointAfterScripts.value || { after_response: [] },
    after_script_order: afterScriptOrder.value.length ? afterScriptOrder.value.map(e => ({ scope: e.scope, index: e.index })) : []
  }
  savingEp.value = true
  try {
    if (form.endpoint_id) {
      await ob.updateOutboundEndpoint(form.endpoint_id, body)
      ElMessage.success('已保存修改')
    } else {
      const r = await ob.createOutboundEndpoint(body)
      const newId = r.data?.id
      if (newId) form.endpoint_id = newId
      ElMessage.success('已新建接口')
    }
    await loadEndpointsList()
  } finally { savingEp.value = false }
}

async function boot() {
  loading.value = true; lastResult.value = null; afterScriptOrder.value = []
  try {
    await loadApp()
    loadFlowPlaceholders()
    await loadEndpointsList()
    const qid = route.query.endpoint_id
    if (qid) {
      const id = Number(qid)
      if (!Number.isNaN(id)) { form.endpoint_id = id; await onEndpointPick(id) }
    }
  } finally { loading.value = false }
}

// resolve effective content_type for request
function resolveContentType() {
  if (form.content_type === 'none') return ''
  if (form.content_type) return form.content_type
  if (bodyTab.value === 'form') return 'application/x-www-form-urlencoded'
  if (bodyTab.value === 'raw') return 'text/plain'
  return 'application/json'
}

async function sendDebug() {
  if (!String(form.path || '').trim()) { ElMessage.error('请填写 Path'); return }
  let headers = {}
  let sampleVars = {}
  try { headers = JSON.parse(headersJson.value || '{}') } catch { ElMessage.error('Headers JSON 无效'); return }
  if (String(sampleVarsJson.value || '').trim()) {
    try { sampleVars = JSON.parse(sampleVarsJson.value) } catch { ElMessage.error('sample_vars JSON 无效'); return }
  }
  // inject effective content-type into headers if not already set
  const ct = resolveContentType()
  if (ct && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = ct
  }
  sending.value = true
  try {
    const payload = {
      app_id: Number(appId.value),
      endpoint_id: form.endpoint_id || 0,
      method: form.method,
      path: form.path.trim(),
      headers,
      body_template: form.body_template,
      timeout_ms: form.timeout_ms || 15000,
      sample_vars: sampleVars
    }
    if (appExtensionScripts.value != null) payload.extension_scripts = appExtensionScripts.value
    // 接口级脚本草稿（未保存即可调试）
    if (endpointAfterScripts.value && Array.isArray(endpointAfterScripts.value.after_response) && endpointAfterScripts.value.after_response.length) {
      payload.endpoint_after_scripts = endpointAfterScripts.value
    }
    // 执行序列
    const order = buildAfterScriptOrderPayload()
    if (order !== undefined) payload.after_script_order = order
    const r = await ob.postOutboundEndpointDebug(payload)
    lastResult.value = r
    generatedResponseSchema.value = null
    debugMetaCollapse.value = []
    debugContextAfterCollapse.value = []
    if (r.ok) ElMessage.success('调试完成（对方返回 2xx）')
    else ElMessage.warning(r.error || '调试未成功')
  } finally { sending.value = false }
}

watch(appId, () => boot())
onMounted(() => boot())
</script>

<style scoped>
.ep-debug { max-width: 1080px; }
.subhint { font-size: 12px; color: #64748b; margin: 6px 0 0; line-height: 1.45; }
.readonly-json :deep(textarea) { background: #f8fafc; color: #475569; }
.meta-block { margin-bottom: 12px; }
.ctx-script-picker { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 10px; }
.ctx-script-picker__label { font-size: 13px; font-weight: 600; color: #334155; flex-shrink: 0; }
.meta-collapse :deep(.el-collapse-item__header),
.context-after-collapse :deep(.el-collapse-item__header) { font-weight: 600; color: #334155; }
.hdr-collapse { margin-top: 8px; }
.title { font-weight: 600; }
.block { margin-top: 16px; }
.hint { font-size: 13px; color: #64748b; margin: 12px 0 0; line-height: 1.55; }
.trace-block { font-size: 13px; }
.trace-line { margin-bottom: 8px; word-break: break-all; }
.trace-line .k { color: #64748b; margin-right: 8px; font-weight: 500; }
.trace-sub { margin: 10px 0 4px; font-weight: 600; color: #334155; }
.trace-pre { margin: 0; padding: 10px; background: #0f172a; color: #e2e8f0; border-radius: 6px; font-size: 12px; line-height: 1.45; max-height: 42vh; overflow: auto; white-space: pre-wrap; word-break: break-word; }
.trace-pre--tall { max-height: 78vh; }
.trace-pre--light { background: #f1f5f9; color: #0f172a; }
.token-collapse { margin-bottom: 10px; }
.ph-group { margin-bottom: 12px; }
.ph-group-title { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 6px; }
.assist-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.assist-label { font-size: 12px; color: #64748b; white-space: nowrap; }
.assist-preview { font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.assist-select { flex: 1; max-width: 400px; }
.assist-btn { margin-left: 8px; }
.flow-ph-new { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; align-items: center; }
.flow-ph-input { flex: 1; min-width: 200px; }
/* 执行序列编辑区 */
.script-order-editor { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
.script-order-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.script-order-hint { font-size: 12px; color: #64748b; line-height: 1.5; flex: 1; }
.script-order-actions { display: flex; align-items: center; flex-shrink: 0; }
.script-order-empty { font-size: 12px; color: #94a3b8; padding: 8px 0; text-align: center; }
.script-order-list { display: flex; flex-direction: column; gap: 6px; }
.script-order-item { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; flex-wrap: wrap; }
.script-order-item--app { border-left: 3px solid #f59e0b; }
.script-order-item--ep { border-left: 3px solid #3b82f6; }
.script-order-item__drag { color: #94a3b8; display: flex; align-items: center; }
.script-order-item__name { font-size: 13px; color: #334155; flex: 1; min-width: 80px; }
.script-order-item__btns { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.script-order-item__code { width: 100%; margin-top: 4px; }
/* 脚本执行日志 */
.script-logs-collapse :deep(.el-collapse-item__header) { font-weight: 600; color: #334155; }
.script-logs-list { display: flex; flex-direction: column; gap: 4px; }
.script-log-row { display: flex; align-items: flex-start; gap: 8px; padding: 4px 6px; background: #f8fafc; border-radius: 4px; font-size: 12px; }
.script-log-name { color: #475569; font-size: 12px; flex-shrink: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.script-log-line { font-family: monospace; color: #0f172a; word-break: break-all; flex: 1; background: transparent; font-size: 12px; }
.flow-ph-fav { margin: 8px 0 4px; }
.flow-ph-fav-label { font-size: 12px; color: #64748b; margin-right: 8px; }
.body-editor-shell { width: 100%; }
.body-template-input { width: 100%; }
.save-hint { margin-left: 10px; font-size: 12px; color: #94a3b8; }
.body-ctx-menu { position: fixed; z-index: 9999; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.15); padding: 6px 0; min-width: 260px; max-width: 340px; }
.body-ctx-menu__title { padding: 4px 12px 6px; font-size: 11px; font-weight: 600; color: #64748b; border-bottom: 1px solid #f1f5f9; }
.body-ctx-menu__scroll { max-height: 360px; overflow-y: auto; }
.body-ctx-menu__group { padding: 6px 12px 2px; font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; }
.body-ctx-menu__item { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: transparent; padding: 5px 14px; cursor: pointer; font-size: 12px; text-align: left; }
.body-ctx-menu__item:hover { background: #f1f5f9; }
.body-ctx-menu__item code { font-family: monospace; color: #0f172a; }
.body-ctx-menu__hint { color: #64748b; font-size: 11px; }
/* Body tabs */
.body-tabs { width: 100%; }
.body-tabs :deep(.el-tabs__header) { margin-bottom: 12px; }
/* 检测到的参数 */
.detected-params { margin-top: 12px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; background: #f8fafc; }
.detected-params__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 13px; color: #334155; font-weight: 500; }
/* Schema */
.schema-preview { margin-bottom: 16px; border: 1px solid #dbeafe; border-radius: 6px; padding: 12px; background: #eff6ff; }
.schema-preview__header { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 600; color: #1d4ed8; margin-bottom: 8px; }
.schema-editor { width: 100%; font-family: monospace; font-size: 12px; }
</style>
