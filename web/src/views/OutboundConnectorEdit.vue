<template>
  <div class="conn-edit-page" v-loading="pageLoading">
    <div class="page-head">
      <el-button text type="primary" @click="goBack">← 返回连接器</el-button>
      <h2 class="title">{{ pageTitle }}</h2>
    </div>

    <el-alert type="info" :closable="false" show-icon class="top-alert" title="连接器配置">
      <template #description>
        <span v-pre>
          按阶段顺序执行；阶段内可选并行 / 顺序 / 主备。每步分为<strong>执行前</strong>（用占位符拼接口/消息等入参，可选把 event_data 展平到 context）与<strong>执行后</strong>（HTTP 可选把 2xx JSON 响应写入 context 供下游使用）。「调试」页可串联查看；Demo 区可预览模板替换，并支持<strong>自定义测试输入框</strong>任意试写占位符。
        </span>
      </template>
    </el-alert>

    <el-tabs v-model="mainTab">
      <el-tab-pane label="表单配置" name="form">
      
        <el-form :model="form" label-width="120px" class="conn-form">
          <el-form-item label="名称" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item label="说明">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="连接器类型">
            <el-input v-model="form.connector_code" disabled />
          </el-form-item>
          <el-form-item label="默认超时 ms">
            <el-input-number v-model="form.default_timeout_ms" :min="1000" :max="120000" />
          </el-form-item>
          <el-form-item label="默认额外重试">
            <el-input-number v-model="form.default_retry_max" :min="0" :max="10" />
            <span class="hint">仅作用于 HTTP 步骤</span>
          </el-form-item>

          <!-- 运行模式选择：接口模式 vs 触发模式 -->
          <el-divider content-position="left">运行模式</el-divider>
          <el-form-item label="运行模式" required>
            <el-radio-group v-model="form.interface_mode" @change="onRunModeChange">
              <el-radio :label="false">触发模式（被动触发）</el-radio>
              <el-radio :label="true">接口模式（主动调用）</el-radio>
            </el-radio-group>
            <div class="hint" style="margin-top: 8px">
              <span v-if="!form.interface_mode">触发模式：连接器被设备事件、Webhook、定时任务等触发执行</span>
              <span v-else>接口模式：连接器作为接口供外部主动调用，无需配置触发器</span>
            </div>
          </el-form-item>

          <!-- 接口模式配置 -->
          <template v-if="form.interface_mode">
            <el-form-item label="接口编码" required>
              <el-input v-model="form.interface_code" placeholder="如：check_employee_status（全局唯一）" style="width: 400px" />
              <span class="hint">用于调用此连接器接口，必须全局唯一</span>
            </el-form-item>

            <el-form-item label="输入参数">
              <ParamSchemaEditor v-model="form.input_params_json" />
            </el-form-item>

            <el-form-item label="输出结构 Schema">
              <el-input
                v-model="form.output_schema_json"
                type="textarea"
                :rows="6"
                placeholder='JSON Schema 格式，如：{"type":"object","properties":{"status":{"type":"string"},"name":{"type":"string"}}}'
              />
              <span class="hint">定义接口返回的数据结构（JSON Schema 格式）</span>
            </el-form-item>

            <el-form-item label="输出参数映射">
              <p style="color: #606266; font-size: 13px; margin: 0 0 8px 0">
                配置如何从连接器执行后的 context 映射到最终返回的 JSON 结构。留空则返回完整的 context。
              </p>
              <div v-for="(mp, mi) in form.output_mappings" :key="mi" class="param-mapping-row">
                <el-input
                  v-model="mp.output_key"
                  placeholder="输出字段名（支持 a.b.c 点路径）"
                  style="width: 180px"
                  size="small"
                />
                <el-select v-model="mp.source" style="width: 110px" size="small">
                  <el-option label="context" value="context" />
                  <el-option label="var" value="var" />
                  <el-option label="fixed" value="fixed" />
                </el-select>
                <el-autocomplete
                  v-if="mp.source === 'context' || mp.source === 'var'"
                  v-model="mp.value"
                  :fetch-suggestions="(q, cb) => cb(availableContextKeys.filter(k => !q || k.toLowerCase().includes(q.toLowerCase())).map(k => ({ value: mp.source === 'var' ? '{{' + k + '}}' : k })))"
                  :placeholder="mp.source === 'context' ? 'employee_name' : '{{context.employee_name}}'"
                  style="flex: 1; min-width: 140px"
                  size="small"
                  clearable
                />
                <el-input
                  v-else
                  v-model="mp.value"
                  placeholder="固定值"
                  style="flex: 1; min-width: 140px"
                  size="small"
                />
                <el-button link type="danger" size="small" @click="form.output_mappings.splice(mi, 1)">删</el-button>
              </div>
              <el-space style="margin-top: 4px">
                <el-button size="small" plain @click="form.output_mappings.push({ output_key: '', source: 'context', value: '' })">+ 加字段</el-button>
                <el-button size="small" type="primary" plain @click="autoMatchOutputParams" title="根据输出 Schema 自动补全映射">一键匹配</el-button>
              </el-space>
              <el-alert type="info" :closable="false" style="margin-top: 8px">
                <template #default>
                  <div style="font-size: 12px">
                    <strong>示例：</strong>假设连接器执行后 context 包含 <code>employee_name: "张三"</code>，
                    配置映射 <code>name</code> → <code>context</code> → <code>employee_name</code>，
                    则最终返回 <code>{"name": "张三"}</code>
                  </div>
                </template>
              </el-alert>
            </el-form-item>

            <el-form-item label="返回值脚本">
              <p style="color: #606266; font-size: 13px; margin: 0 0 8px 0">
                在<strong>所有阶段步骤与输出参数映射之后</strong>执行，可对接口模式的<strong>整体返回值</strong>做最终加工。
                脚本中 <code>ctx.getResponseBody()</code> 读到当前返回 JSON 字符串，<code>ctx.setResponseBody(JSON.stringify(obj))</code> 整体替换返回值；
                也可用 <code>ctx.getContext/setContext</code> 读写 context。ES5，须定义 <code>function main(ctx)</code>。
              </p>
              <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px">
                <el-switch v-model="form.custom_script.result.enabled" active-text="启用返回值脚本" />
                <span style="font-size: 12px; color: #909399">超时 ms</span>
                <el-input-number v-model="form.custom_script.result.timeout_ms" :min="100" :max="5000" :step="100" size="small" />
              </div>
              <template v-if="form.custom_script.result.enabled">
                <ExtensionScriptEditor
                  v-model="form.custom_script.result.code"
                  phase="after"
                  placeholder="function main(ctx) { var o = JSON.parse(ctx.getResponseBody()||'{}'); ctx.setResponseBody(JSON.stringify({code:0,data:o})); }"
                  :min-height="180"
                />
                <ExtScriptAIAssistant
                  phase="after"
                  endpoint="/api/outbound/connectors/script-ai"
                  :current-code="form.custom_script.result.code || ''"
                  @apply="(code) => { form.custom_script.result.code = code }"
                />
              </template>
            </el-form-item>
            <el-alert type="info" :closable="false" show-icon>
              <template #title>接口模式下的 Context 占位符</template>
              <template #description>
                <div style="margin-bottom: 12px">
                  接口入参会自动作为 context 的初始值，在步骤中可通过占位符引用。支持两种引用方式：
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px">
                  <thead>
                    <tr style="background: #f5f7fa">
                      <th style="padding: 6px; border: 1px solid #dcdfe6; text-align: left">类别</th>
                      <th style="padding: 6px; border: 1px solid #dcdfe6; text-align: left">占位符</th>
                      <th style="padding: 6px; border: 1px solid #dcdfe6; text-align: left">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6" rowspan="2"><strong>接口入参</strong></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{param_name}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">直接引用参数名</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{context.param_name}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">通过 context 命名空间引用</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6" rowspan="3"><strong>HTTP 信息</strong></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{http.method}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">HTTP 方法（GET/POST/PUT/DELETE）</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{http.path}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">请求路径</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{http.query}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">Query string 原始字符串</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6" rowspan="2"><strong>系统变量</strong></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{timestamp}}</code> / <code v-pre>{{timestamp_ms}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">Unix 时间戳（秒 / 毫秒）</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px; border: 1px solid #dcdfe6"><code v-pre>{{userid}}</code> / <code v-pre>{{deviceid}}</code></td>
                      <td style="padding: 6px; border: 1px solid #dcdfe6">调用用户 ID / 设备 ID（可选）</td>
                    </tr>
                  </tbody>
                </table>
                <div style="color: #909399; font-size: 12px">
                  💡 示例：假设接口入参为 <code>{"employee_id": "E001", "department": "IT"}</code>，则可在步骤中使用
                  <code v-pre>{{employee_id}}</code> 或 <code v-pre>{{context.employee_id}}</code> 引用值 "E001"
                </div>
              </template>
            </el-alert>

            <el-divider content-position="left">接口调用方式</el-divider>
            <el-alert type="success" :closable="false" show-icon title="接口调用方式">
              <template #description>
                <div style="margin-bottom: 8px"><strong>方式一：通用调用（推荐）</strong></div>
                <div>支持 GET、POST、PUT、DELETE 等多种 HTTP 方法</div>
                <div style="margin: 4px 0">
                  API 端点：<code>GET/POST /api/outbound/connector-interfaces/{{ form.interface_code || '{code}' }}/invoke</code>
                </div>
                <div>URL 参数：<code>?param1=value1&amp;param2=value2</code>（GET 方法）</div>
                <div>请求体：<code>{"param1": "value1", "param2": "value2"}</code>（POST/PUT 方法）</div>
                <div style="margin-top: 8px"><strong>方式二：POST 调用</strong></div>
                <div>API 端点：<code>POST /api/outbound/connector-interfaces/call</code></div>
                <div>请求体：<code>{"connector_code": "{{ form.interface_code || 'your_code' }}", "params": {...}}</code></div>
                <div style="margin-top: 8px"><strong>返回格式</strong></div>
                <div><code>{"success": true, "data": {...}, "duration_ms": 100, "step_count": 5}</code></div>
              </template>
            </el-alert>

            <el-form-item label="测试接口" v-if="!isNew && form.interface_code">
              <el-button type="primary" @click="openInterfaceTest">测试调用与 Context 预览</el-button>
              <el-button type="success" plain @click="openInterfaceDebug">全流程调试（逐步 Context）</el-button>
              <span class="hint">保存后可测试接口调用，查看 context 占位符实际值</span>
            </el-form-item>
            <el-form-item label="调试" v-else-if="form.interface_mode">
              <el-button type="success" plain @click="openInterfaceDebug">全流程调试（逐步 Context）</el-button>
              <span class="hint">无需保存，输入参数即可端到端执行并观察 context 演变</span>
            </el-form-item>
          </template>

          <!-- 触发模式配置 -->
          <template v-else>
            <el-divider content-position="left">触发配置</el-divider>
            <el-form-item label="触发方式">
            <el-select v-model="form.trigger_type" style="width: 220px" @change="onTriggerTypeChange">
              <el-option label="设备事件（内部）" value="device_event" />
              <el-option label="外部 Webhook（入站 HTTP）" value="http_webhook" />
              <el-option label="WebSocket 订阅" value="websocket" />
              <el-option label="STOMP 订阅" value="stomp" />
              <el-option label="HTTP 轮询" value="http_poll" />
              <el-option label="数据接口轮询" value="data_poll" />
              <el-option label="MQTT / Kafka 订阅" value="channel" />
              <el-option label="Cron 定时" value="cron" />
              <el-option label="系统事件" value="system_event" />
            </el-select>
          </el-form-item>

          <!-- WebSocket 触发器配置 -->
          <template v-if="form.trigger_type === 'websocket'">
            <el-form-item label="WS URL" required>
              <el-input v-model="form.trigger_config.url" placeholder="ws://host:port/path" />
            </el-form-item>
            <el-form-item label="消息类型字段">
              <el-input v-model="form.trigger_config.type_field" placeholder="如 type 或 data.eventType（空=匹配全部）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="空=接收所有类型；支持 order.* 前缀">
              </el-select>
            </el-form-item>
            <el-form-item label="Ping 间隔 ms">
              <el-input-number v-model="form.trigger_config.ping_interval_ms" :min="5000" :max="300000" :step="5000" />
            </el-form-item>
            <el-form-item label="重连延迟 ms">
              <el-input-number v-model="form.trigger_config.reconnect_delay_ms" :min="1000" :max="60000" :step="1000" />
            </el-form-item>
          </template>

          <!-- STOMP 触发器配置 -->
          <template v-if="form.trigger_type === 'stomp'">
            <el-form-item label="STOMP WS URL" required>
              <el-input v-model="form.trigger_config.url" placeholder="ws://host:15674/ws" />
            </el-form-item>
            <el-form-item label="Login">
              <el-input v-model="form.trigger_config.login" placeholder="账号（可选）" />
            </el-form-item>
            <el-form-item label="Passcode">
              <el-input v-model="form.trigger_config.passcode" type="password" show-password placeholder="密码（可选）" />
            </el-form-item>
            <el-form-item label="Destination" required>
              <el-input v-model="form.trigger_config.destination" placeholder="/topic/events 或 /queue/xxx" />
            </el-form-item>
            <el-form-item label="消息类型字段">
              <el-input v-model="form.trigger_config.type_field" placeholder="如 eventType（空=匹配全部）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="空=接收所有类型">
              </el-select>
            </el-form-item>
            <el-form-item label="重连延迟 ms">
              <el-input-number v-model="form.trigger_config.reconnect_delay_ms" :min="1000" :max="60000" :step="1000" />
            </el-form-item>
          </template>

          <!-- Webhook 触发器配置 -->
          <template v-if="form.trigger_type === 'http_webhook'">
            <el-form-item label="绑定 Webhook">
              <el-select v-model="form.webhook_id" filterable clearable placeholder="选择触发该连接器的 Webhook 接口" style="width:100%">
                <el-option :value="0" label="— 不绑定（使用 Token 路径触发）" />
                <el-option v-for="wh in webhooks" :key="wh.id" :value="wh.id" :label="wh.name" />
              </el-select>
              <div class="hint" v-if="form.webhook_id">该 Webhook 收到数据后将自动触发本连接器执行。</div>
            </el-form-item>
            <el-form-item label="事件类型">
              <el-select
                v-model="form.trigger_config.match_values"
                multiple
                filterable
                :allow-create="!webhookEventTypes.length"
                default-first-option
                style="width:100%"
                placeholder="空=接收所有类型"
              >
                <el-option
                  v-for="et in webhookEventTypes"
                  :key="et.event_type"
                  :value="et.event_type"
                  :label="et.label ? `${et.label}（${et.event_type}）` : et.event_type"
                />
              </el-select>
              <div v-if="webhookSchemaContext.length" class="hint" style="margin-top:4px">
                已从 {{ (form.trigger_config.match_values || []).length }} 个事件类型聚合 {{ webhookSchemaContext.length }} 个 context 字段
              </div>
            </el-form-item>
          </template>

          <!-- HTTP 轮询触发器配置 -->
          <template v-if="form.trigger_type === 'http_poll'">
            <el-form-item label="轮询 URL" required>
              <el-input v-model="form.trigger_config.url" placeholder="https://api.example.com/events" />
            </el-form-item>
            <el-form-item label="请求方法">
              <el-select v-model="form.trigger_config.poll_method" style="width:120px">
                <el-option label="GET" value="GET" />
                <el-option label="POST" value="POST" />
              </el-select>
            </el-form-item>
            <el-form-item label="轮询间隔 ms">
              <el-input-number v-model="form.trigger_config.poll_interval_ms" :min="5000" :max="3600000" :step="5000" />
            </el-form-item>
            <el-form-item label="数组字段路径">
              <el-input v-model="form.trigger_config.poll_result_field" placeholder="如 data.items（空=整体作为一条消息）" />
            </el-form-item>
            <el-form-item label="消息类型字段">
              <el-input v-model="form.trigger_config.type_field" placeholder="如 type（空=匹配全部）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="空=接收所有类型">
              </el-select>
            </el-form-item>
          </template>

          <!-- 数据接口轮询触发器配置 -->
          <template v-if="form.trigger_type === 'data_poll'">
            <el-form-item label="数据接口" required>
              <el-select v-model="form.trigger_config.data_interface_code" filterable style="width:100%" placeholder="选择已启用的数据接口">
                <el-option
                  v-for="iface in dataInterfaces.filter(i => i.enabled && (i.kind === 'query' || i.kind === 'queryOne'))"
                  :key="iface.id"
                  :label="`${iface.name}（${iface.code || iface.slug}）`"
                  :value="iface.code || iface.slug"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="轮询间隔 ms">
              <el-input-number v-model="form.trigger_config.data_poll_interval_ms" :min="5000" :max="3600000" :step="5000" />
            </el-form-item>
            <el-form-item label="结果字段路径">
              <el-input v-model="form.trigger_config.data_poll_result_field" placeholder="如 items（空=整个结果数组作为一条消息）" />
            </el-form-item>
            <el-form-item label="消息类型字段">
              <el-input v-model="form.trigger_config.type_field" placeholder="如 type（空=匹配全部）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="空=接收所有类型">
              </el-select>
            </el-form-item>
          </template>

          <!-- MQTT / Kafka 订阅触发器配置 -->
          <template v-if="form.trigger_type === 'channel'">
            <el-form-item label="Channel 类型" required>
              <el-select v-model="form.trigger_config.channel_type" style="width:160px">
                <el-option label="MQTT" value="mqtt" />
                <el-option label="Kafka" value="kafka" />
              </el-select>
            </el-form-item>
            <el-form-item label="Topic" required>
              <el-input v-model="form.trigger_config.channel_topic" placeholder="如 sensors/# 或 my-kafka-topic" />
            </el-form-item>
            <!-- MQTT 专属 -->
            <template v-if="form.trigger_config.channel_type === 'mqtt'">
              <el-form-item label="Broker URL" required>
                <el-input v-model="form.trigger_config.mqtt_broker" placeholder="tcp://host:1883" />
              </el-form-item>
              <el-form-item label="Client ID">
                <el-input v-model="form.trigger_config.mqtt_client_id" placeholder="空=自动生成" />
              </el-form-item>
              <el-form-item label="Username">
                <el-input v-model="form.trigger_config.mqtt_username" />
              </el-form-item>
              <el-form-item label="Password">
                <el-input v-model="form.trigger_config.mqtt_password" type="password" show-password />
              </el-form-item>
              <el-form-item label="QoS">
                <el-select v-model="form.trigger_config.mqtt_qos" style="width:100px">
                  <el-option label="0" :value="0" />
                  <el-option label="1" :value="1" />
                  <el-option label="2" :value="2" />
                </el-select>
              </el-form-item>
            </template>
            <!-- Kafka 专属 -->
            <template v-if="form.trigger_config.channel_type === 'kafka'">
              <el-form-item label="REST Proxy URL" required>
                <el-input v-model="form.trigger_config.kafka_rest_proxy_url" placeholder="http://kafka-rest:8082" />
              </el-form-item>
              <el-form-item label="Group ID">
                <el-input v-model="form.trigger_config.kafka_group_id" placeholder="空=自动生成" />
              </el-form-item>
              <el-form-item label="轮询间隔 ms">
                <el-input-number v-model="form.trigger_config.kafka_poll_ms" :min="100" :max="10000" :step="100" />
              </el-form-item>
            </template>
            <el-form-item label="消息类型字段">
              <el-input v-model="form.trigger_config.type_field" placeholder="如 type（空=匹配全部）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="空=接收所有类型">
              </el-select>
            </el-form-item>
          </template>

          <!-- Cron 定时触发器 -->
          <template v-if="form.trigger_type === 'cron'">
            <el-form-item label="Cron 表达式" required>
              <el-input v-model="form.trigger_config.cron_expression" placeholder="0 9 * * MON-FRI（分 时 日 月 周）" />
            </el-form-item>
            <el-form-item label="时区">
              <el-input v-model="form.trigger_config.cron_timezone" placeholder="Asia/Shanghai（空=服务器本地）" />
            </el-form-item>
            <el-form-item label="事件类型">
              <el-input v-model="form.trigger_config.cron_event_type" placeholder="cron.tick（默认）" />
            </el-form-item>
            <el-form-item label="类型字段路径">
              <el-input v-model="form.trigger_config.type_field" placeholder="event_type（默认）" />
            </el-form-item>
            <el-form-item label="匹配值">
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="如 cron.tick">
                <el-option value="cron.tick" label="cron.tick" />
              </el-select>
            </el-form-item>
          </template>

          <!-- 系统事件触发器 -->
          <template v-if="form.trigger_type === 'system_event'">
            <el-form-item label="订阅事件" required>
              <el-select v-model="form.trigger_config.match_values" multiple filterable allow-create default-first-option style="width:100%" placeholder="至少一项">
                <el-option value="device.online" label="device.online — 设备上线" />
                <el-option value="device.offline" label="device.offline — 设备离线" />
                <el-option value="install.completed" label="install.completed — 安装完成" />
                <el-option value="install.*" label="install.* — 安装相关（前缀）" />
              </el-select>
            </el-form-item>
            <div class="hint" style="margin: -8px 0 12px 100px">Agent WS 连接/断开触发 online/offline；安装任务成功触发 install.completed。</div>
          </template>

          <!-- 运行状态 -->
          <el-form-item v-if="!isNew && form.trigger_type !== 'device_event'" label="触发器状态">
            <span :class="['trigger-status', triggerStatus.status]">{{ triggerStatusLabel }}</span>
            <el-button size="small" style="margin-left:8px" @click="loadTriggerStatus">刷新</el-button>
          </el-form-item>

          <el-form-item label="事件定义" v-if="form.trigger_type === 'device_event'">
            <el-select v-model="form.definition_ids" multiple filterable collapse-tags style="width: 100%" placeholder="必选，至少一项">
              <el-option v-for="d in definitions" :key="d.id" :label="`${d.key} — ${d.name}`" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="前台应用包名过滤" v-if="form.trigger_type === 'device_event'">
            <el-select
              v-model="form.trigger_config.foreground_packages"
              multiple
              filterable
              allow-create
              default-first-option
              clearable
              style="width: 100%"
              placeholder="留空表示全局生效，任何前台应用都触发"
            >
            </el-select>
            <div class="hint" style="margin-top: 4px">
              配置后，只有当设备前台应用在此列表中时才触发连接器。例如：com.example.scanner、com.example.reader
            </div>
          </el-form-item>
          <el-form-item label="设备范围" v-if="form.trigger_type !== 'http_webhook'">
            <el-select v-model="form.device_ids" multiple filterable collapse-tags clearable style="width: 100%" placeholder="不选表示全部设备">
              <el-option v-for="dv in devices" :key="dv.id" :label="`#${dv.id} ${dv.name || dv.serial || '-'}`" :value="dv.id" />
            </el-select>
          </el-form-item>

          <!-- 触发高级设置 -->
          <el-divider content-position="left">高级设置</el-divider>
          <el-form-item label="优先级">
            <el-input-number v-model="form.priority" :min="0" :max="9999" />
            <span class="hint">数值越小越靠前</span>
          </el-form-item>
          <el-form-item label="相同事件码防抖 ms">
            <el-input-number v-model="form.debounce_same_event_ms" :min="0" :max="600000" :step="100" />
            <span class="hint">同一设备上同一事件类型重复触发时，间隔小于此值则跳过（0 关闭）</span>
          </el-form-item>
          <el-form-item label="不同事件码防抖 ms">
            <el-input-number v-model="form.debounce_diff_event_ms" :min="0" :max="600000" :step="100" />
            <span class="hint">事件类型切换后，距上次执行不足此值则跳过（0 关闭）</span>
          </el-form-item>
          <el-form-item label="相同扫码防抖 ms">
            <el-input-number v-model="form.debounce_same_scan_ms" :min="0" :max="600000" :step="100" />
            <span class="hint">同一设备、相同 event_data.value（条码）重复上报时跳过（0 关闭）</span>
          </el-form-item>
          <el-form-item label="广播后冷却 ms">
            <el-input-number v-model="form.loop_cooldown_ms" :min="0" :max="600000" :step="100" />
            <span class="hint">本连接器 broadcast_intent 成功后，同设备在冷却期内不再触发（建议 1500–3000；0 关闭）</span>
          </el-form-item>
          <el-alert type="info" :closable="false" show-icon class="loop-guard-alert" title="防扫码回环">
            <template #description>
              出站广播会自动带 extra <code>_appmanager_outbound</code>，Agent 监听会忽略该标记；若模拟广播仍被业务 App 转成扫码，请开启「相同扫码防抖」与「广播后冷却」。
            </template>
          </el-alert>
          </template>
          <!-- 触发模式配置结束 -->

          <el-divider content-position="left">执行流程</el-divider>
          <el-form-item label="执行阶段">
            <div class="phases-wrap">
              <div v-for="(ph, pi) in form.phases" :key="pi" class="phase-block">
                <div class="phase-hdr">
                  <span>阶段 {{ pi + 1 }}（完成后才进入下一阶段）</span>
                  <el-select v-model="ph.run_mode" style="width: 200px; margin-left: 12px">
                    <el-option label="阶段内并行" value="parallel" />
                    <el-option label="阶段内顺序" value="sequential" />
                    <el-option label="阶段内主备(HTTP)" value="failover" />
                  </el-select>
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    :loading="phaseTestDlg.loading && phaseTestDlg.phaseIndex === pi"
                    @click="openPhaseTest(pi)"
                  >
                    测试
                  </el-button>
                  <el-button v-if="form.phases.length > 1" link type="danger" size="small" @click="removeConnPhase(pi)">删阶段</el-button>
                </div>
                <div class="phase-params-block">
                  <div class="phase-params-title">阶段默认占位符（可选）</div>
                  <p class="phase-params-desc">
                    JSON 对象，键为<strong>完整</strong>占位符（如 <code v-pre>{{mes.base_url}}</code>），值为字符串；在本阶段<strong>任一步</strong>执行前写入公共变量表，供 URL/Body/消息等模板替换；可被本步「执行前 event_data」或上步 HTTP 返回值覆盖同名键。
                  </p>
                  <el-input v-model="ph._defaultParamsText" type="textarea" :rows="2" placeholder='例如 {"{{flow.api}}":"https://api.example.com"}' />
                </div>
                <div v-for="(st, si) in ph.steps" :key="si" class="step-block">
                  <div class="step-row">
                  <el-select v-model="st.step_type" style="width: 150px" @change="onConnStepTypeChange(ph, si)">
                    <el-option label="HTTP 接口" value="http" />
                    <el-option label="数据接口" value="data_interface" />
                    <el-option label="应用脚本" value="app_script" />
                    <el-option label="连接器脚本" value="connector_script" />
                    <el-option label="打开网页" value="view_url" />
                    <el-option label="广播 Intent" value="broadcast_intent" />
                    <el-option label="消息提醒" value="message" />
                    <el-option label="键盘HID输出" value="keyboard_hid" />
                    <el-option label="蓝牙打印" value="print" />
                  </el-select>
                  <template v-if="st.step_type === 'http'">
                    <el-select v-model="st.endpoint_id" filterable placeholder="选择应用接口" style="flex: 1; min-width: 220px" @change="onEndpointSelect(st, pi, si)">
                      <el-option-group v-for="a in apps" :key="a.id" :label="`${a.name} (#${a.id})`">
                        <el-option
                          v-for="e in endpointsForApp(a.id)"
                          :key="e.id"
                          :label="`${e.name} — ${e.method} ${e.path}`"
                          :value="e.id"
                        />
                      </el-option-group>
                    </el-select>
                  </template>
                  <template v-else-if="st.step_type === 'data_interface'">
                    <el-select v-model="st.config.interface_id" filterable placeholder="选择数据接口" style="flex: 1; min-width: 220px" @change="onDataIfaceSelect(st, pi, si)">
                      <el-option v-for="iface in dataInterfaces" :key="iface.id" :label="`${iface.name} (#${iface.id})`" :value="iface.id" />
                    </el-select>
                    <el-switch v-model="st.config.merge_result_to_context" active-text="结果→context" style="margin-left: 8px" />
                  </template>
                  <template v-else-if="st.step_type === 'app_script'">
                    <el-switch v-model="st.config.inline" active-text="内联代码" inactive-text="引用应用" style="margin-right: 8px" />
                    <template v-if="!st.config.inline">
                      <el-select v-model="st.config.app_id" filterable placeholder="外部应用" style="width: 200px">
                        <el-option v-for="a in apps" :key="a.id" :label="`${a.name} (#${a.id})`" :value="a.id" />
                      </el-select>
                      <el-select v-model="st.config.hook" style="width: 200px; margin-left: 8px">
                        <el-option label="请求前脚本" value="before_request" />
                        <el-option label="响应后脚本" value="after_response" />
                      </el-select>
                      <span class="step-app-script-hint" title="执行该应用在详情页配置的对应扩展脚本，不发起 HTTP">仅脚本</span>
                    </template>
                    <span v-else class="step-app-script-hint" title="直接编写 ES5 脚本，下方编辑">内联脚本（见下方编辑器）</span>
                  </template>
                  <template v-else-if="st.step_type === 'connector_script'">
                    <span class="step-app-script-hint" title="连接器内联 ES5 脚本，function main(ctx)，可读写 context">连接器脚本（见下方编辑器）</span>
                  </template>
                  <template v-else-if="st.step_type === 'view_url'">
                    <el-input v-model="st.config.url" placeholder="https://... 支持占位符" style="flex: 1" />
                  </template>
                  <template v-else-if="st.step_type === 'message'">
                    <el-input v-model="st.config.title" placeholder="标题（可选）" style="width: 160px" />
                    <JsonTemplateEditor v-model="st.config.body" placeholder="正文 body，支持占位符" :min-height="60" style="flex: 1; min-width: 200px" />
                    <el-input-number
                      v-model="st.config.duration_ms"
                      :min="1500"
                      :max="600000"
                      :step="500"
                      controls-position="right"
                      style="width: 140px"
                      title="展示时长（毫秒），默认 8000"
                    />
                  </template>
                  <template v-else-if="st.step_type === 'broadcast_intent'">
                    <el-input v-model="st._action" placeholder="Intent action" style="width: 200px" />
                    <el-input v-model="st._pkg" placeholder="包名(可选)" style="width: 140px" />
                    <span class="broadcast-extras-summary" :title="broadcastExtrasSummary(st, true)">
                      {{ broadcastExtrasSummary(st) }}
                    </span>
                  </template>
                  <template v-else-if="st.step_type === 'keyboard_hid'">
                    <el-select v-model="st.config.input_method" style="width: 140px" size="small">
                      <el-option label="文本输入" value="text" />
                      <el-option label="按键序列" value="keys" />
                      <el-option label="混合模式" value="mixed" />
                    </el-select>

                    <template v-if="st.config.input_method === 'text' || st.config.input_method === 'mixed'">
                      <el-input
                        v-model="st.config.text"
                        placeholder="输入文本，支持占位符 {{context.value}}"
                        style="flex: 1; min-width: 200px"
                        size="small"
                      />
                    </template>

                    <template v-if="st.config.input_method === 'keys' || st.config.input_method === 'mixed'">
                      <el-select
                        v-model="st.config.keys"
                        multiple
                        filterable
                        allow-create
                        default-first-option
                        placeholder="选择按键（如ENTER, TAB）"
                        style="flex: 1; min-width: 180px"
                        size="small"
                      >
                        <el-option label="ENTER（回车）" value="ENTER" />
                        <el-option label="TAB（制表符）" value="TAB" />
                        <el-option label="BACK（返回）" value="BACK" />
                        <el-option label="DELETE（删除）" value="DELETE" />
                        <el-option label="HOME（主页）" value="HOME" />
                        <el-option label="SPACE（空格）" value="SPACE" />
                        <el-option label="CLEAR（清空）" value="CLEAR" />
                      </el-select>
                    </template>

                    <el-input-number
                      v-model="st.config.delay_ms"
                      :min="0"
                      :max="5000"
                      :step="10"
                      controls-position="right"
                      placeholder="间隔ms"
                      style="width: 130px"
                      size="small"
                      title="按键/字符间延迟（毫秒），0表示无延迟"
                    />

                    <el-input
                      v-model="st.config.target_app"
                      placeholder="目标应用包名（可选）"
                      style="width: 200px"
                      size="small"
                      clearable
                      title="可选：验证前台应用包名，不匹配则跳过输入"
                    />
                  </template>
                  <template v-else-if="st.step_type === 'print'">
                    <el-select v-model="st.config.protocol" style="width: 140px" size="small" placeholder="协议">
                      <el-option label="ESC/POS" value="escpos" />
                      <el-option label="CPCL" value="cpcl" />
                      <el-option label="TSPL" value="tspl" />
                    </el-select>
                    <el-select v-model="st.config.transport" style="width: 110px" size="small" placeholder="传输">
                      <el-option label="SPP" value="spp" />
                      <el-option label="BLE" value="ble" />
                    </el-select>
                    <el-input
                      v-model="st.config.mac"
                      placeholder="打印机MAC(留空=默认)"
                      style="width: 180px"
                      size="small"
                      clearable
                    />
                    <JsonTemplateEditor
                      v-model="st.config._content_json"
                      placeholder='打印内容 JSON 数组，如 [{"op":"text","text":"{{context.name}}"},{"op":"cut"}]'
                      :min-height="80"
                      style="flex: 1; min-width: 220px"
                    />
                  </template>
                  <div class="step-delays" title="本步骤执行前、执行完成后各自等待的毫秒数">
                    <span class="delay-lbl">前(ms)</span>
                    <el-input-number
                      v-model="st.delay_before_ms"
                      :min="0"
                      :max="600000"
                      :step="100"
                      size="small"
                      controls-position="right"
                      style="width: 118px"
                    />
                    <span class="delay-lbl">后(ms)</span>
                    <el-input-number
                      v-model="st.delay_after_ms"
                      :min="0"
                      :max="600000"
                      :step="100"
                      size="small"
                      controls-position="right"
                      style="width: 118px"
                    />
                  </div>
                  <el-button link type="danger" size="small" @click="removeConnStep(pi, si)">删步</el-button>
                  </div>
                  <div
                    v-if="st.step_type === 'connector_script' || (st.step_type === 'app_script' && st.config.inline)"
                    class="step-script-wrap"
                  >
                    <div class="step-cx-title">脚本代码（ES5，function main(ctx)）</div>
                    <ExtensionScriptEditor
                      v-model="st.config.code"
                      phase="after"
                      placeholder="function main(ctx) { /* ctx.getContext/setContext, ctx.getResponseBody/setResponseBody ... */ }"
                      :min-height="160"
                    />
                    <ExtScriptAIAssistant
                      phase="after"
                      endpoint="/api/outbound/connectors/script-ai"
                      :current-code="st.config.code || ''"
                      @apply="(code) => { st.config.code = code }"
                    />
                  </div>
                  <div class="step-cx-wrap">
                    <div class="step-cx-block">
                      <div class="step-cx-title">执行前 · 入参 / 模板</div>
                      <p class="step-cx-desc" v-if="form.interface_mode">
                        <strong>接口模式：</strong>接口入参自动作为 context 初始值。本步执行前，将占位符展开进 URL、HTTP Body、消息正文等。
                        合并顺序为：<strong>接口入参（context.*）</strong> → <strong>阶段默认占位符</strong> → <strong>本步专属占位符默认值</strong>；
                        再与<strong>上阶段 HTTP 执行后</strong>已写入的 context、以及 <code v-pre>{{http.last.*}}</code> 等一起作为本步入参。
                        <br/>
                        可用占位符示例：<code v-pre>{{context.employee_id}}</code>、<code v-pre>{{http.method}}</code>、<code v-pre>{{timestamp}}</code>
                        <br/>
                        <strong v-if="st.step_type === 'broadcast_intent' || st.step_type === 'message' || st.step_type === 'view_url'" style="color: #E6A23C">
                          ⚠️ 注意：「{{ st.step_type === 'broadcast_intent' ? '广播 Intent' : st.step_type === 'message' ? '消息提醒' : '打开网页' }}」步骤需要指定目标设备。
                          接口模式下没有设备事件上下文，请在上方选择目标设备。
                        </strong>
                      </p>
                      <p class="step-cx-desc" v-else>
                        <strong>触发模式：</strong>本步执行前，将占位符展开进 URL、HTTP Body、消息正文等。合并顺序为：<strong>阶段默认占位符</strong> → 可选的
                        <strong>event_data→context</strong>（见下方下拉）→ <strong>本步专属占位符默认值</strong>；再与<strong>上阶段 HTTP 执行后</strong>已写入的 context、以及
                        <code v-pre>{{http.last.*}}</code> 等一起作为本步入参。
                      </p>
                      <el-select v-if="!form.interface_mode" v-model="st.config.context_merge_before" size="small" style="width: 100%; max-width: 420px">
                        <el-option label="不合并 event_data（仅用全局变量与上游已写入的 context / http.last）" value="off" />
                        <el-option label="合并 device_event.event_data → context（本步请求或展示前生效）" value="event_data_json" />
                      </el-select>
                      <el-alert v-else type="info" :closable="false" style="margin-top: 8px">
                        <template #default>
                          接口模式下，event_data 不可用。Context 完全基于接口入参，无需配置合并选项。
                        </template>
                      </el-alert>
                    </div>
                    <div v-if="st.step_type === 'broadcast_intent'" class="step-cx-block">
                      <div class="step-cx-title">模拟数据标签 (extras)</div>
                      <p class="step-cx-desc">
                        键名为目标 App / 扫码枪约定的 Intent extra；值为条码或占位符。常用：
                        <code v-pre>{{context.value}}</code>（原始扫码）、上游 HTTP 写入的 <code v-pre>{{context.xxx}}</code>。
                      </p>
                      <div v-for="(row, ri) in st._extrasRows" :key="ri" class="param-mapping-row">
                        <el-select
                          v-model="row.key"
                          filterable
                          allow-create
                          default-first-option
                          placeholder="数据标签"
                          style="width: 168px"
                          size="small"
                          @change="onBroadcastExtraRowChange(st)"
                        >
                          <el-option v-for="k in broadcastExtraKeySuggestions" :key="k" :label="k" :value="k" />
                        </el-select>
                        <el-autocomplete
                          v-model="row.value"
                          :fetch-suggestions="broadcastExtraValueSuggest"
                          placeholder="{{context.value}}"
                          style="flex: 1; min-width: 180px"
                          size="small"
                          clearable
                          @change="onBroadcastExtraRowChange(st)"
                          @select="onBroadcastExtraRowChange(st)"
                        />
                        <el-button link type="danger" size="small" @click="removeBroadcastExtraRow(st, ri)">删</el-button>
                      </div>
                      <el-space wrap style="margin-top: 4px">
                        <el-button size="small" plain @click="addBroadcastExtraRow(st)">+ 加标签</el-button>
                        <el-button size="small" plain @click="fillBroadcastExtrasContextValue(st)">填入扫码值</el-button>
                        <el-button size="small" type="primary" plain @click="importBroadcastKeysFromDefinitions(st)">从绑定事件导入</el-button>
                        <el-button size="small" link type="primary" @click="st._extrasAdvanced = !st._extrasAdvanced">
                          {{ st._extrasAdvanced ? '收起 JSON' : '高级 JSON' }}
                        </el-button>
                      </el-space>
                      <el-input
                        v-if="st._extrasAdvanced"
                        v-model="st._extrasJson"
                        type="textarea"
                        :rows="3"
                        class="broadcast-extras-json"
                        placeholder='{"se4500":"{{context.value}}"}'
                        style="margin-top: 8px"
                        @blur="syncExtrasRowsFromJson(st)"
                      />
                    </div>
                    <div v-if="form.interface_mode && (st.step_type === 'broadcast_intent' || st.step_type === 'message' || st.step_type === 'view_url')" class="step-cx-block">
                      <div class="step-cx-title">目标设备配置（接口模式）</div>
                      <p class="step-cx-desc">
                        接口模式下，「{{ st.step_type === 'broadcast_intent' ? '广播 Intent' : st.step_type === 'message' ? '消息提醒' : '打开网页' }}」步骤需要明确指定目标设备。
                        支持三种方式：指定设备、条件筛选、占位符动态指定。
                      </p>
                      <el-radio-group v-model="st.config.target_device_mode" size="small" style="margin-bottom: 8px">
                        <el-radio-button label="specific">指定设备</el-radio-button>
                        <el-radio-button label="filter">条件筛选</el-radio-button>
                        <el-radio-button label="placeholder">占位符</el-radio-button>
                      </el-radio-group>

                      <!-- 指定设备模式 -->
                      <div v-if="st.config.target_device_mode === 'specific'">
                        <el-select
                          v-model="st.config.target_device_ids"
                          multiple
                          filterable
                          placeholder="选择一个或多个设备"
                          style="width: 100%"
                          size="small">
                          <el-option
                            v-for="d in devices"
                            :key="d.id"
                            :label="`${d.name || d.id} (${d.serial || d.agent_alias})`"
                            :value="d.id" />
                        </el-select>
                        <span class="hint" style="font-size: 12px; color: #909399">
                          已选 {{ (st.config.target_device_ids || []).length }} 个设备
                        </span>
                      </div>

                      <!-- 条件筛选模式 -->
                      <div v-else-if="st.config.target_device_mode === 'filter'">
                        <div style="margin-bottom: 8px">
                          <el-input
                            v-model="st.config.device_filter_serial"
                            placeholder="设备序列号（支持 * 通配符，如 ABC*）"
                            size="small"
                            clearable
                            style="width: 100%; margin-bottom: 4px" />
                          <el-input
                            v-model="st.config.device_filter_name"
                            placeholder="设备名称（支持 * 通配符，如 *仓库*）"
                            size="small"
                            clearable
                            style="width: 100%; margin-bottom: 4px" />
                          <el-input
                            v-model="st.config.device_filter_alias"
                            placeholder="设备别名（支持 * 通配符）"
                            size="small"
                            clearable
                            style="width: 100%" />
                        </div>
                        <el-alert type="info" :closable="false" style="font-size: 12px">
                          <template #default>
                            条件之间为 AND 关系。支持占位符，如 <code v-pre>{{context.warehouse_name}}*</code>
                          </template>
                        </el-alert>
                      </div>

                      <!-- 占位符模式 -->
                      <div v-else-if="st.config.target_device_mode === 'placeholder'">
                        <el-input
                          v-model="st.config.device_placeholder"
                          placeholder="如 {{context.device_id}} 或 {{device_serial}}"
                          size="small"
                          style="width: 100%; margin-bottom: 4px" />
                        <el-alert type="info" :closable="false" style="font-size: 12px">
                          <template #default>
                            占位符值可以是：<strong>设备 ID</strong>（数字）、<strong>设备序列号</strong>、<strong>设备别名</strong>。
                            支持多个设备（逗号分隔），如 <code v-pre>{{context.device_ids}}</code> = "1,2,3"
                          </template>
                        </el-alert>
                      </div>
                    </div>
                    <div v-if="st.step_type === 'http'" class="step-cx-block">
                      <div class="step-cx-title">参数映射（可选）</div>
                      <p class="step-cx-desc">
                        将 context / 占位符 / 固定值映射到 HTTP 接口参数（适用于接口模式或需要动态构建请求参数的场景）。
                        Source：<code>context</code>（填路径如 <code>employee_id</code>）、<code>var</code>（填完整 <code v-pre>{{...}}</code>）、<code>fixed</code>（固定字符串）。
                        映射的参数会作为查询参数或 Body 参数传递。
                      </p>
                      <div v-for="(mp, mi) in (st.config.param_mappings || [])" :key="mi" class="param-mapping-row">
                        <el-select
                          v-if="`${pi}-${si}` in stepParamSchemas"
                          v-model="mp.param"
                          filterable
                          allow-create
                          placeholder="参数名"
                          style="width: 160px"
                          size="small"
                        >
                          <el-option
                            v-for="p in stepParamSchemas[`${pi}-${si}`]"
                            :key="p.name"
                            :label="p.required ? p.name + ' *' : p.name"
                            :value="p.name"
                          >
                            <span>{{ p.name }}</span>
                            <span v-if="p.required" style="color: #f56c6c; margin-left: 4px">*</span>
                            <span v-if="p.type" style="color: #909399; margin-left: 6px; font-size: 11px">{{ p.type }}</span>
                          </el-option>
                        </el-select>
                        <el-input v-else v-model="mp.param" placeholder="参数名" style="width: 140px" size="small" />
                        <el-select v-model="mp.source" style="width: 110px" size="small">
                          <el-option label="context" value="context" />
                          <el-option label="var" value="var" />
                          <el-option label="fixed" value="fixed" />
                        </el-select>
                        <el-autocomplete
                          v-if="mp.source === 'context' || mp.source === 'var'"
                          v-model="mp.value"
                          :fetch-suggestions="(q, cb) => cb(availableContextKeys.filter(k => !q || k.toLowerCase().includes(q.toLowerCase())).map(k => ({ value: mp.source === 'var' ? '{{' + k + '}}' : k })))"
                          :placeholder="mp.source === 'context' ? 'employee_id' : '{{context.employee_id}}'"
                          style="flex: 1; min-width: 140px"
                          size="small"
                          clearable
                        />
                        <template v-else>
                          <el-select
                            v-if="stepParamSchemas[`${pi}-${si}`]?.find(p => p.name === mp.param)?.enum?.length"
                            v-model="mp.value"
                            filterable
                            allow-create
                            placeholder="选择固定值"
                            style="flex: 1; min-width: 140px"
                            size="small"
                            clearable
                          >
                            <el-option
                              v-for="ev in stepParamSchemas[`${pi}-${si}`].find(p => p.name === mp.param).enum"
                              :key="ev"
                              :label="ev"
                              :value="ev"
                            />
                          </el-select>
                          <el-input
                            v-else
                            v-model="mp.value"
                            placeholder="固定值"
                            style="flex: 1; min-width: 140px"
                            size="small"
                          />
                        </template>
                        <el-button link type="danger" size="small" @click="(st.config.param_mappings || []).splice(mi, 1)">删</el-button>
                      </div>
                      <el-space style="margin-top: 4px">
                        <el-button size="small" plain @click="if (!st.config.param_mappings) st.config.param_mappings = []; st.config.param_mappings.push({ param: '', source: 'context', value: '' })">+ 加参数</el-button>
                        <el-button size="small" type="primary" plain @click="autoMatchParams(st, pi, si)" title="按参数名自动匹配 context 键（有 schema 时自动补全所有参数行）">一键匹配</el-button>
                      </el-space>
                    </div>
                    <div v-if="st.step_type === 'http'" class="step-cx-block">
                      <div class="step-cx-title">执行后 · 返回值 → 上下文</div>
                      <p class="step-cx-desc">
                        本步 HTTP 返回 2xx 且 body 为 JSON 时，将字段展平写入 <code v-pre>{{context.*}}</code>，供<strong>同连接器后续步骤或后续阶段</strong>使用（与阶段运行方式「顺序 / 单步并行」等配合）。
                      </p>
                      <el-select v-model="st.config.context_merge_after" size="small" style="width: 100%; max-width: 420px">
                        <el-option label="不把响应 body 写入 context" value="off" />
                        <el-option label="将 HTTP 2xx JSON 响应 body 写入 context" value="http_response_json" />
                      </el-select>
                    </div>
                    <div v-else-if="st.step_type === 'data_interface'" class="step-cx-block">
                      <div class="step-cx-title">参数映射</div>
                      <p class="step-cx-desc">将 context / 占位符 / 固定值映射到接口参数。Source：<code>context</code>（填路径如 <code>device.serial</code>）、<code>var</code>（填完整 <code v-pre>{{...}}</code>）、<code>fixed</code>（固定字符串）。参数名支持 <code>a.b.c</code> 点路径，自动展开为嵌套 JSON。</p>
                      <div v-for="(mp, mi) in (st.config.param_mappings || [])" :key="mi" class="param-mapping-row">
                        <el-select
                          v-if="`${pi}-${si}` in stepParamSchemas"
                          v-model="mp.param"
                          filterable
                          allow-create
                          placeholder="参数名"
                          style="width: 160px"
                          size="small"
                        >
                          <el-option
                            v-for="p in stepParamSchemas[`${pi}-${si}`]"
                            :key="p.name"
                            :label="p.required ? p.name + ' *' : p.name"
                            :value="p.name"
                          >
                            <span>{{ p.name }}</span>
                            <span v-if="p.required" style="color: #f56c6c; margin-left: 4px">*</span>
                            <span v-if="p.type" style="color: #909399; margin-left: 6px; font-size: 11px">{{ p.type }}</span>
                          </el-option>
                        </el-select>
                        <el-input v-else v-model="mp.param" placeholder="参数名" style="width: 140px" size="small" />
                        <el-select v-model="mp.source" style="width: 110px" size="small">
                          <el-option label="context" value="context" />
                          <el-option label="var" value="var" />
                          <el-option label="fixed" value="fixed" />
                        </el-select>
                        <el-autocomplete
                          v-if="mp.source === 'context' || mp.source === 'var'"
                          v-model="mp.value"
                          :fetch-suggestions="(q, cb) => cb(availableContextKeys.filter(k => !q || k.toLowerCase().includes(q.toLowerCase())).map(k => ({ value: mp.source === 'var' ? '{{' + k + '}}' : k })))"
                          :placeholder="mp.source === 'context' ? 'device.serial' : '{{deviceid}}'"
                          style="flex: 1; min-width: 140px"
                          size="small"
                          clearable
                        />
                        <template v-else>
                          <el-select
                            v-if="stepParamSchemas[`${pi}-${si}`]?.find(p => p.name === mp.param)?.enum?.length"
                            v-model="mp.value"
                            filterable
                            allow-create
                            placeholder="选择固定值"
                            style="flex: 1; min-width: 140px"
                            size="small"
                            clearable
                          >
                            <el-option
                              v-for="ev in stepParamSchemas[`${pi}-${si}`].find(p => p.name === mp.param).enum"
                              :key="ev"
                              :label="ev"
                              :value="ev"
                            />
                          </el-select>
                          <el-input
                            v-else
                            v-model="mp.value"
                            placeholder="固定值"
                            style="flex: 1; min-width: 140px"
                            size="small"
                          />
                        </template>
                        <el-button link type="danger" size="small" @click="st.config.param_mappings.splice(mi, 1)">删</el-button>
                      </div>
                      <el-space style="margin-top: 4px">
                        <el-button size="small" plain @click="st.config.param_mappings = [...(st.config.param_mappings || []), { param: '', source: 'context', value: '' }]">+ 加参数</el-button>
                        <el-button size="small" type="primary" plain @click="autoMatchParams(st, pi, si)" title="按参数名自动匹配 context 键（有 schema 时自动补全所有参数行）">一键匹配</el-button>
                      </el-space>
                    </div>
                    <div v-else class="step-cx-block step-cx-block--muted">
                      <div class="step-cx-title">执行后 · 返回值 → 上下文</div>
                      <p class="step-cx-desc">非 HTTP 步骤无远程 JSON 响应；若需把业务数据写入 context，请在前序阶段使用 HTTP 步并开启「执行后」注入，或使用应用脚本扩展。</p>
                    </div>
                    <div v-if="st.step_type === 'data_interface'" class="step-cx-block">
                      <div class="step-cx-title">执行前脚本（可选）</div>
                      <p class="step-cx-desc">JS 脚本，入口 <code>function main(ctx){}</code> 或直接写语句。可用 <code>ctx.getVar(key)</code>、<code>ctx.setParam(key, val)</code>、<code>ctx.getParam(key)</code> 动态调整参数。</p>
                      <el-input v-model="st.config.pre_script" type="textarea" :rows="4" placeholder="// 例：ctx.setParam('device_id', ctx.getVar('deviceid'))" style="font-family: monospace; font-size: 12px" />
                    </div>
                    <div class="step-cx-block">
                      <div class="step-cx-title">本步专属占位符默认值（可选）</div>
                      <p class="step-cx-desc">
                        JSON 对象写入 config.template_params；键为完整 <code v-pre>{{...}}</code>。在本步「执行前」阶段默认占位符与 event_data→context <strong>之后</strong>、发起请求/下发 Agent
                        <strong>之前</strong>合并，便于为单步单独指定常量或覆盖。
                      </p>
                      <JsonTemplateEditor v-model="st._stepTemplateParamsText" placeholder='例如 {"{{context.mes_path}}":"/mes/scan"}' :min-height="60" />
                    </div>
                  </div>
                </div>
                <el-button size="small" @click="addConnStep(pi)">本阶段加一步</el-button>
              </div>
              <el-button type="primary" plain size="small" @click="addConnPhase">加阶段</el-button>
            </div>
          </el-form-item>
          <el-form-item label="启用">
            <el-switch v-model="form.enabled" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="saveConn">保存</el-button>
            <el-button @click="goBack">取消</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="拓扑图" name="graph">
        <p class="graph-hint">拓扑由表单中的阶段与步骤自动生成；阶段间虚线表示执行顺序。</p>
        <ConnectorFlowGraph flow-id="conn-editor-topology" :phases="form.phases" :height="420" />
      </el-tab-pane>

      <el-tab-pane label="调试" name="debug">
        <el-alert
          v-if="!numericConnectorId"
          type="warning"
          :closable="false"
          show-icon
          title="请先保存连接器"
          description="新建连接器保存获得 ID 后，可在此按设备串联调试上下文，并查看节点执行统计。"
        />
        <template v-else>
          <el-tabs v-model="debugInnerTab" class="debug-inner">
            <el-tab-pane label="上下文串联" name="flow">
              <p class="debug-flow-intro">
                从本连接器的最近投递中选一条，按顺序查看：<strong>设备事件</strong> → <strong>进入本步时的占位符</strong> → <strong>本步结束后的下游占位符</strong> → <strong>当前步骤</strong> → <strong>接口与执行结果</strong>。可选设备以缩小列表。下方可按<strong>同一次设备事件</strong>串联整次执行，并对照本阶段<strong>运行方式</strong>与步骤参数（延迟、上下文合并）理解占位符如何传递。
              </p>
              <el-collapse class="run-mode-doc-collapse">
                <el-collapse-item title="运行方式（并行 / 顺序 / 主备）与占位符传递 — 说明" name="rm">
                  <ul class="run-mode-doc-list">
                    <li>
                      <strong>顺序（sequential）</strong>：阶段内依次执行；上一步 HTTP 成功后的响应会合并进<strong>同一条公共占位符表</strong>，下一步与本连接器后续阶段都使用该表。
                    </li>
                    <li>
                      <strong>主备（failover）</strong>：阶段内依次尝试，<strong>首个 HTTP 成功</strong>即停止；仅成功那一步把 HTTP 上下文写回公共表；前面失败步骤不写入响应体。
                    </li>
                    <li>
                      <strong>并行（parallel）</strong>：多步同时跑时各步使用<strong>克隆的变量表</strong>，避免并发写同一 map；因此<strong>同阶段内</strong>多步并行时不要在模板里互相依赖 <code>http.last</code>。若该阶段<strong>只有一步</strong>，引擎会把该步 HTTP 响应写回公共表，供<strong>后续阶段</strong>使用。
                    </li>
                    <li>
                      HTTP 步在表单中分为<strong>执行前</strong>（<code>context_merge_before</code>：event_data→context）与<strong>执行后</strong>（<code>context_merge_after</code>：2xx JSON
                      body→context），二者可同时开启；与「接口调试」里模板变量覆盖用法一致。
                    </li>
                  </ul>
                </el-collapse-item>
              </el-collapse>
              <div class="toolbar">
                <el-select v-model="traceDeviceId" filterable clearable placeholder="设备（可选，过滤投递列表）" style="width: 300px">
                  <el-option v-for="dv in devices" :key="dv.id" :label="`#${dv.id} ${dv.name || dv.serial || '-'}`" :value="dv.id" />
                </el-select>
                <el-button type="primary" :loading="loadingDeliveries" @click="loadDebugDeliveries">刷新投递列表</el-button>
              </div>
              <div v-if="sameEventDeliveryChain.length" class="event-chain-bar">
                <div class="event-chain-head">
                  <span class="event-chain-title">同一次设备事件 · 串联</span>
                  <el-tag size="small" type="info">事件 ID {{ sameEventDeliveryChain[0]?.device_event_id }}</el-tag>
                  <span class="event-chain-sub">点击切换各步上下文；与下方「本步所在阶段」中的运行方式、步骤延迟与 context_merge 逐项对照，可核对是否与表单配置一致。</span>
                </div>
                <div class="event-chain-btns">
                  <el-button
                    v-for="(d, idx) in sameEventDeliveryChain"
                    :key="d.id"
                    size="small"
                    :type="Number(d.id) === Number(selectedDeliveryId) ? 'primary' : 'default'"
                    @click="loadDebugContextForDelivery(d)"
                  >
                    {{ idx + 1 }}. 阶段#{{ d.phase_id }} 步骤#{{ d.step_id }} · {{ d.step_type || '—' }}
                    <el-tag :type="d.status === 'success' ? 'success' : 'danger'" size="small" effect="plain" class="event-chain-status">
                      {{ d.status || '—' }}
                    </el-tag>
                  </el-button>
                </div>
              </div>
              <div class="ctx-split">
                <div class="ctx-left">
                  <el-table
                    :data="debugDeliveries"
                    border
                    size="small"
                    v-loading="loadingDeliveries"
                    row-key="id"
                    highlight-current-row
                    :current-row-key="selectedDeliveryId"
                    max-height="420"
                    @row-click="onDebugDeliveryRow"
                  >
                    <el-table-column prop="id" label="投递ID" width="80" />
                    <el-table-column prop="device_event_id" label="事件ID" width="88" />
                    <el-table-column prop="phase_id" label="阶段" width="70" />
                    <el-table-column prop="step_id" label="步骤" width="70" />
                    <el-table-column prop="step_type" label="类型" width="100" show-overflow-tooltip />
                    <el-table-column prop="status" label="状态" width="80" />
                    <el-table-column prop="created_at" label="时间" width="168" />
                  </el-table>
                </div>
                <div class="ctx-right" v-loading="loadingContext">
                  <template v-if="debugContext">
                    <div v-if="currentDebugPhase" class="ctx-step ctx-step--phase-meta">
                      <div class="ctx-step-title">ⓐ 本步所在阶段 · 运行方式与步骤参数（与表单配置对齐）</div>
                      <el-descriptions :column="2" border size="small">
                        <el-descriptions-item label="阶段 ID">{{ currentDebugPhase.id }}</el-descriptions-item>
                        <el-descriptions-item label="运行方式（run_mode）">
                          <el-tag size="small">{{ currentDebugPhase.run_mode || '—' }}</el-tag>
                        </el-descriptions-item>
                        <el-descriptions-item label="占位符传递" :span="2">{{ runModeContextHint(currentDebugPhase.run_mode) }}</el-descriptions-item>
                      </el-descriptions>
                      <p v-if="currentDebugStepRow" class="ctx-hint">当前步骤在配置中的延迟与合并（与执行引擎读取一致）：</p>
                      <el-descriptions v-if="currentDebugStepRow" :column="2" border size="small" class="ctx-step-desc-tight">
                        <el-descriptions-item label="步骤 ID">{{ currentDebugStepRow.id }}</el-descriptions-item>
                        <el-descriptions-item label="类型">{{ currentDebugStepRow.step_type }}</el-descriptions-item>
                        <el-descriptions-item label="执行前延迟 ms">{{ currentDebugStepRow.delay_before_ms ?? 0 }}</el-descriptions-item>
                        <el-descriptions-item label="执行后延迟 ms">{{ currentDebugStepRow.delay_after_ms ?? 0 }}</el-descriptions-item>
                        <el-descriptions-item label="执行前 context_merge_before">
                          {{ currentDebugStepRow.config?.context_merge_before ?? currentDebugStepRow.config?.context_merge ?? '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="执行后 context_merge_after">
                          {{ currentDebugStepRow.config?.context_merge_after ?? '—' }}
                        </el-descriptions-item>
                        <el-descriptions-item label="兼容字段 context_merge" :span="2">
                          {{ currentDebugStepRow.config?.context_merge ?? '—' }}
                        </el-descriptions-item>
                      </el-descriptions>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">① 设备事件</div>
                      <pre class="ctx-pre">{{ fmtJson(debugContext.device_event) }}</pre>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">② 设备</div>
                      <el-descriptions :column="2" border size="small">
                        <el-descriptions-item label="ID">{{ debugContext.device?.id ?? '—' }}</el-descriptions-item>
                        <el-descriptions-item label="名称">{{ debugContext.device?.name || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="序列号">{{ debugContext.device?.serial || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="状态">{{ debugContext.device?.status || '—' }}</el-descriptions-item>
                      </el-descriptions>
                    </div>
                    <div v-if="debugContext.definition" class="ctx-step">
                      <div class="ctx-step-title">③ 事件定义</div>
                      <el-descriptions :column="2" border size="small">
                        <el-descriptions-item label="key">{{ debugContext.definition.key }}</el-descriptions-item>
                        <el-descriptions-item label="名称">{{ debugContext.definition.name }}</el-descriptions-item>
                      </el-descriptions>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '④' : '③' }} 进入本步时的占位符上下文</div>
                      <p class="ctx-hint">展开本步请求 URL、Body 等模板时使用的变量表（含本步执行前写入的 event_data→context 等）。</p>
                      <el-table :data="templateVariableRows" border size="small" max-height="240">
                        <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
                        <el-table-column prop="value" label="展开值" min-width="200" show-overflow-tooltip />
                      </el-table>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '⑤' : '④' }} 本步结束后的占位符（向下游传递）</div>
                      <p class="ctx-hint">
                        HTTP 且本投递为成功时，在上一表基础上合并本步响应（如 http.last.*、http.step.&lt;步骤id&gt;.*）及本步「HTTP 响应→context」配置；其它步骤与上一表相同。不含
                        after_response 扩展脚本对变量的改写。
                      </p>
                      <el-table :data="downstreamTemplateRows" border size="small" max-height="280">
                        <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
                        <el-table-column prop="value" label="展开值" min-width="200" show-overflow-tooltip />
                      </el-table>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '⑥' : '⑤' }} 当前投递与步骤</div>
                      <el-descriptions :column="2" border size="small">
                        <el-descriptions-item label="投递 ID">{{ debugContext.delivery?.id }}</el-descriptions-item>
                        <el-descriptions-item label="状态">{{ debugContext.delivery?.status }}</el-descriptions-item>
                        <el-descriptions-item label="阶段 ID">{{ debugContext.current_step?.phase_id ?? '—' }}</el-descriptions-item>
                        <el-descriptions-item label="步骤 ID">{{ debugContext.current_step?.step_id ?? '—' }}</el-descriptions-item>
                        <el-descriptions-item label="步骤类型">{{ debugContext.current_step?.step_type ?? '—' }}</el-descriptions-item>
                        <el-descriptions-item label="接口 ID">{{ debugContext.current_step?.endpoint_id ?? '—' }}</el-descriptions-item>
                        <el-descriptions-item label="URL" :span="2">{{ debugContext.delivery?.request_url || '—' }}</el-descriptions-item>
                        <el-descriptions-item label="错误" :span="2">{{ debugContext.delivery?.error || '—' }}</el-descriptions-item>
                      </el-descriptions>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '⑦' : '⑥' }} 连接器阶段（本行高亮）</div>
                      <div
                        v-for="(ph, pi) in debugContext.connector?.phases || []"
                        :key="ph.id"
                        class="ctx-phase"
                        :class="{ 'ctx-phase--hi': isCtxPhaseHi(ph) }"
                      >
                        <div class="ctx-phase-hdr">
                          <el-tag size="small">阶段 {{ pi + 1 }}</el-tag>
                          <span class="ctx-phase-meta">#{{ ph.id }} · {{ ph.run_mode }}</span>
                        </div>
                        <ul class="ctx-step-list">
                          <li
                            v-for="(st, si) in ph.steps || []"
                            :key="st.id"
                            class="ctx-step-li"
                            :class="{ 'ctx-step-li--hi': isCtxStepHi(st) }"
                          >
                            <span class="ctx-step-idx">{{ si + 1 }}.</span>
                            <el-tag type="info" size="small">{{ st.step_type }}</el-tag>
                            <span v-if="st.step_type === 'http' && st.endpoint_id">接口 #{{ st.endpoint_id }}</span>
                            <span v-else-if="st.step_type === 'app_script' && st.config?.app_id">应用 #{{ st.config.app_id }} · {{ st.config.hook || 'before_request' }}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                    <div v-if="debugContext.endpoint && Object.keys(debugContext.endpoint).length" class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '⑧' : '⑦' }} 调用的应用接口</div>
                      <pre class="ctx-pre sm">{{ fmtJson(debugContext.endpoint) }}</pre>
                    </div>
                    <div class="ctx-step">
                      <div class="ctx-step-title">{{ debugContext.definition ? '⑨' : '⑧' }} 执行详情（请求/响应等）</div>
                      <pre class="ctx-pre">{{ fmtJson(debugContext.delivery?.detail) }}</pre>
                    </div>
                  </template>
                  <el-empty v-else-if="!loadingContext && !debugDeliveries.length" description="暂无投递记录，可先触发一次事件" />
                  <el-empty v-else-if="!loadingContext" description="点击左侧表格一行加载串联数据" />
                </div>
              </div>
            </el-tab-pane>
            <el-tab-pane label="节点统计" name="stats">
              <div class="toolbar">
                <el-select v-model="traceDeviceId" filterable clearable placeholder="全部设备（统计范围）" style="width: 300px">
                  <el-option v-for="dv in devices" :key="dv.id" :label="`#${dv.id} ${dv.name || dv.serial || '-'}`" :value="dv.id" />
                </el-select>
                <el-button type="primary" :loading="loadingTrace" @click="loadTrace">加载拓扑与统计</el-button>
              </div>
              <p class="trace-stomp-hint">有新投递经过某步骤时，服务端经 STOMP 推送增量，拓扑节点旁次数会实时累加（与下方表格一致）。</p>
              <template v-if="traceData">
                <ConnectorFlowGraph
                  flow-id="outbound-exec-trace-edit"
                  :phases="traceData.connector.phases || []"
                  :node-stats="traceData.node_stats"
                  :height="460"
                  trace-mode
                />
                <el-table :data="traceData.node_stats" border size="small" style="margin-top: 12px" max-height="360">
                  <el-table-column prop="label" label="执行节点" min-width="160" show-overflow-tooltip />
                  <el-table-column prop="phase_id" label="阶段" width="80" />
                  <el-table-column prop="step_id" label="步骤" width="80" />
                  <el-table-column prop="step_type" label="类型" width="120" />
                  <el-table-column prop="total" label="次数" width="80" />
                  <el-table-column prop="success" label="成功" width="70" />
                  <el-table-column prop="failed" label="失败" width="70" />
                  <el-table-column label="成功率" width="90">
                    <template #default="{ row }">
                      {{ row.total ? Math.round((100 * row.success) / row.total) : 0 }}%
                    </template>
                  </el-table-column>
                  <el-table-column prop="last_run" label="最近执行" width="180" />
                </el-table>
              </template>
              <el-empty v-else description="点击「加载拓扑与统计」" />
            </el-tab-pane>
          </el-tabs>
        </template>
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="phaseTestDlg.visible"
      :title="`阶段 ${phaseTestDlg.phaseIndex + 1} · 占位符与 context 预览`"
      width="min(920px, 96vw)"
      destroy-on-close
      class="phase-test-dlg"
    >
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 10px">
        <template #title>
          已选择<strong>应用接口</strong>的 HTTP 步骤会发起<strong>真实 HTTP 请求</strong>（不写投递日志）；未选接口的步骤仍为模拟 JSON。请确认 Body/URL 与目标环境可安全重试。
        </template>
      </el-alert>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>
          <span>{{ phaseTestDlg.note }}</span>
        </template>
      </el-alert>
      <el-tabs v-model="phaseTestDlg.innerTab">
        <el-tab-pane label="本阶段执行结果" name="steps">
          <p class="phase-test-tab-hint">
            已选接口的 HTTP 为<strong>真实请求</strong>；未选接口的 HTTP 仍为模拟 2xx。若可加载应用，模拟路径与<strong>接口调试</strong>共用合并与 after_response。failover 时在首个 HTTP 步后即停止（与引擎一致）。
          </p>
          <el-table v-if="phaseTestDlg.stepResults.length" :data="phaseTestDlg.stepResults" border size="small" max-height="420">
            <el-table-column prop="step_index" label="#" width="52" align="center" />
            <el-table-column label="HTTP" width="72" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.live_http" type="warning" size="small">真实</el-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column prop="step_type" label="类型" width="120" show-overflow-tooltip />
            <el-table-column label="接口" width="88" align="center">
              <template #default="{ row }">
                {{ row.endpoint_id ? `#${row.endpoint_id}` : '—' }}
              </template>
            </el-table-column>
            <el-table-column prop="context_merge_before" label="执行前合并" width="120" show-overflow-tooltip />
            <el-table-column prop="context_merge_after" label="执行后合并" width="120" show-overflow-tooltip />
            <el-table-column label="预览步 id" width="110" align="center">
              <template #default="{ row }">
                {{ row.preview_step_table_id ? row.preview_step_table_id : '—' }}
              </template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip />
            <el-table-column label="模拟响应体" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="phase-test-mono">{{ row.simulated_response_body || '—' }}</span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="本阶段无步骤" />
        </el-tab-pane>
        <el-tab-pane label="执行后 context" name="ctxAfter">
          <p class="phase-test-tab-hint">本阶段执行结束后，可供下游引用的 <code>context.*</code> 占位符（表格为过滤视图）。</p>
          <el-table v-if="phaseTestDlg.contextAfter.length" :data="phaseTestDlg.contextAfter" border size="small" max-height="360">
            <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
          </el-table>
          <el-empty v-else description="本阶段结束后尚无 context.* 键（或未开启 HTTP 响应写入 context）" />
          <div v-if="phaseTestDlg.contextAddedKeys.length" class="phase-test-added">
            <span class="phase-test-added-lbl">本阶段新增 context 键：</span>
            <el-tag v-for="k in phaseTestDlg.contextAddedKeys" :key="k" size="small" class="phase-test-tag">{{ k }}</el-tag>
          </div>
        </el-tab-pane>
        <el-tab-pane label="进入本阶段前 · context" name="ctxBefore">
          <p class="phase-test-tab-hint">已完成前面各阶段后、进入本阶段前一刻的 <code>context.*</code>。</p>
          <el-table v-if="phaseTestDlg.contextBefore.length" :data="phaseTestDlg.contextBefore" border size="small" max-height="360">
            <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
          </el-table>
          <el-empty v-else description="进入本阶段前尚无 context.* 键" />
        </el-tab-pane>
        <el-tab-pane label="进入本阶段前 · 全文" name="fullBefore">
          <pre class="ctx-pre sm">{{ fmtJson(phaseTestDlg.beforeFull) }}</pre>
        </el-tab-pane>
        <el-tab-pane label="本阶段结束后 · 全文" name="fullAfter">
          <pre class="ctx-pre sm">{{ fmtJson(phaseTestDlg.afterFull) }}</pre>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 接口测试对话框 -->
    <el-dialog
      v-model="interfaceTestDlg.visible"
      title="接口测试与 Context 预览"
      width="min(920px, 96vw)"
      destroy-on-close
      class="interface-test-dlg"
    >
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>
          测试接口调用，查看接口入参如何映射到 context 占位符，并预览各步骤执行后的 context 变化
        </template>
      </el-alert>

      <el-form label-width="100px" size="small">
        <el-form-item label="HTTP 方法">
          <el-select v-model="interfaceTestDlg.method" style="width: 150px">
            <el-option label="GET" value="GET" />
            <el-option label="POST" value="POST" />
            <el-option label="PUT" value="PUT" />
            <el-option label="DELETE" value="DELETE" />
          </el-select>
        </el-form-item>

        <el-form-item label="接口入参">
          <el-input
            v-model="interfaceTestDlg.paramsJson"
            type="textarea"
            :rows="6"
            placeholder='JSON 格式，如：{"employee_id": "E001", "department": "IT"}'
            style="font-family: monospace"
          />
          <span class="hint">这些参数将自动映射到 context 占位符</span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="interfaceTestDlg.loading" @click="runInterfaceTest">
            执行测试
          </el-button>
          <el-button @click="fillInterfaceTestParams">填充示例参数</el-button>
        </el-form-item>
      </el-form>

      <el-tabs v-model="interfaceTestDlg.innerTab" v-if="interfaceTestDlg.result">
        <el-tab-pane label="Context 映射" name="context">
          <p class="phase-test-tab-hint">
            接口入参自动映射到 context 命名空间，可通过 <code v-pre>{{param_name}}</code> 或 <code v-pre>{{context.param_name}}</code> 引用
          </p>
          <el-table :data="interfaceTestDlg.contextRows" border size="small" max-height="360">
            <el-table-column prop="key" label="占位符" min-width="220" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
            <el-table-column prop="source" label="来源" width="120" />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="执行结果" name="result">
          <el-descriptions :column="2" border size="small" style="margin-bottom: 12px">
            <el-descriptions-item label="执行状态">
              <el-tag :type="interfaceTestDlg.result.success ? 'success' : 'danger'">
                {{ interfaceTestDlg.result.success ? '成功' : '失败' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="耗时">{{ interfaceTestDlg.result.duration_ms }} ms</el-descriptions-item>
            <el-descriptions-item label="步骤数">{{ interfaceTestDlg.result.step_count }}</el-descriptions-item>
            <el-descriptions-item label="错误信息">{{ interfaceTestDlg.result.error || '—' }}</el-descriptions-item>
          </el-descriptions>
          <div class="step-cx-title">返回数据（data）</div>
          <pre class="ctx-pre">{{ fmtJson(interfaceTestDlg.result.data) }}</pre>
        </el-tab-pane>

        <el-tab-pane label="完整响应" name="full">
          <pre class="ctx-pre">{{ fmtJson(interfaceTestDlg.result) }}</pre>
        </el-tab-pane>
      </el-tabs>

      <el-empty v-else description="填写参数后点击「执行测试」查看结果" />
    </el-dialog>

    <!-- 接口模式全流程调试对话框 -->
    <el-dialog
      v-model="interfaceDebugDlg.visible"
      title="接口全流程调试 · 逐步 Context 演变"
      width="min(960px, 96vw)"
      destroy-on-close
      class="interface-test-dlg"
    >
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>
          输入接口入参后端到端执行所有阶段步骤，逐步查看 <code>context.*</code> 的演变与最终输出。当前表单（含未保存改动）即时生效，无需先保存。
        </template>
      </el-alert>

      <el-form label-width="100px" size="small">
        <el-form-item label="接口入参">
          <el-input
            v-model="interfaceDebugDlg.paramsJson"
            type="textarea"
            :rows="5"
            placeholder='JSON 格式，如：{"employee_id": "E001", "department": "IT"}'
            style="font-family: monospace"
          />
          <span class="hint">这些参数将以 <code v-pre>{{param}}</code> 与 <code v-pre>{{context.param}}</code> 双写注入初始 context</span>
        </el-form-item>
        <el-form-item label="真实请求">
          <el-switch v-model="interfaceDebugDlg.executeLiveHTTP" />
          <span class="hint" style="margin-left: 8px">
            开启后，已选接口的 HTTP 步骤将发起<strong>真实 HTTP 请求</strong>（不写投递日志）；关闭则全部使用固定模拟 2xx JSON。
          </span>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="interfaceDebugDlg.loading" @click="runInterfaceDebug">
            执行调试
          </el-button>
          <el-button @click="fillInterfaceDebugParams">填充示例参数</el-button>
        </el-form-item>
      </el-form>

      <el-tabs v-model="interfaceDebugDlg.innerTab" v-if="interfaceDebugDlg.result">
        <el-tab-pane label="逐步 Context 演变" name="steps">
          <p class="phase-test-tab-hint">
            按执行顺序列出每个步骤，<strong>新增/变化的 context 键</strong>高亮显示；点击行可展开该步执行后的完整 context。
          </p>
          <el-table
            v-if="interfaceDebugDlg.result.steps && interfaceDebugDlg.result.steps.length"
            :data="interfaceDebugDlg.result.steps"
            border
            size="small"
            max-height="460"
            row-key="rowKey"
          >
            <el-table-column type="expand">
              <template #default="{ row }">
                <div style="padding: 8px 16px">
                  <div class="step-cx-title">该步执行后 context.*</div>
                  <el-table :data="row.context_after" border size="small" max-height="260">
                    <el-table-column prop="key" label="占位符" min-width="240" show-overflow-tooltip />
                    <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
                  </el-table>
                  <div v-if="row.response_body" style="margin-top: 8px">
                    <div class="step-cx-title">响应/摘要</div>
                    <pre class="ctx-pre">{{ row.response_body }}</pre>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="阶段" width="64" align="center">
              <template #default="{ row }">{{ row.phase_index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="step_index" label="步骤" width="64" align="center" />
            <el-table-column prop="step_type" label="类型" width="118" show-overflow-tooltip />
            <el-table-column label="HTTP" width="64" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.live_http" type="warning" size="small">真实</el-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag :type="row.status && row.status.includes('fail') ? 'danger' : 'success'" size="small">
                  {{ row.status || '—' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="新增 context 键" min-width="240">
              <template #default="{ row }">
                <template v-if="row.added_keys && row.added_keys.length">
                  <el-tag
                    v-for="k in row.added_keys"
                    :key="k"
                    size="small"
                    class="phase-test-tag"
                    type="success"
                  >{{ k }}</el-tag>
                </template>
                <span v-else style="color: #909399">—</span>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="无步骤可执行（请确认已配置阶段与步骤）" />
        </el-tab-pane>

        <el-tab-pane label="最终输出" name="output">
          <p class="phase-test-tab-hint">应用<strong>输出参数映射</strong>后的最终返回（未配置映射时为完整 context）。</p>
          <pre class="ctx-pre">{{ fmtJson(interfaceDebugDlg.result.output) }}</pre>
        </el-tab-pane>

        <el-tab-pane label="初始 / 最终 Context" name="ctx">
          <div class="step-cx-title">初始 context（入参 seed 后、执行前）</div>
          <el-table :data="interfaceDebugDlg.result.initial_context" border size="small" max-height="240">
            <el-table-column prop="key" label="占位符" min-width="240" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
          </el-table>
          <div class="step-cx-title" style="margin-top: 12px">最终 context（全部执行后）</div>
          <el-table :data="interfaceDebugDlg.result.final_context" border size="small" max-height="240">
            <el-table-column prop="key" label="占位符" min-width="240" show-overflow-tooltip />
            <el-table-column prop="value" label="值" min-width="200" show-overflow-tooltip />
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="说明" name="note">
          <el-alert type="info" :closable="false">
            <template #default>
              <div style="font-size: 13px; line-height: 1.7">{{ interfaceDebugDlg.result.note }}</div>
            </template>
          </el-alert>
        </el-tab-pane>
      </el-tabs>

      <el-empty v-else description="填写参数后点击「执行调试」查看逐步 context 演变" />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import * as ob from '@/api/outbound'
import * as cfgApi from '@/api/customEventConfig'
import { getDevices } from '@/api/device'
import { listDataInterfaces, mockParamsInterface, getInterfaceParamSchema } from '@/api/dataStack'
import { getEndpointParamSchema } from '@/api/outbound'
import { useAuthStore } from '@/stores/auth'
import { createOutboundConnectorTraceStomp } from '@/utils/outboundTraceStomp'
import { mergeOutboundTraceNodeTick, traceTickFiltersDevice } from '@/utils/outboundTraceMerge'
import ConnectorFlowGraph from '@/components/outbound/ConnectorFlowGraph.vue'
import JsonTemplateEditor from '@/components/JsonTemplateEditor.vue'
import ExtensionScriptEditor from '@/components/ExtensionScriptEditor.vue'
import ExtScriptAIAssistant from '@/components/ExtScriptAIAssistant.vue'
import TemplateVarsPanel from '@/components/outbound/TemplateVarsPanel.vue'
import ParamSchemaEditor from '@/components/ParamSchemaEditor.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

/** 节点统计页 STOMP 订阅 */
let traceStompCtl = null

const mainTab = ref('form')
const saving = ref(false)
const pageLoading = ref(false)
const loadingTrace = ref(false)
const apps = ref([])
const webhooks = ref([])
const webhookEventTypes = ref([])  // event types for currently selected webhook
const allEndpoints = ref([])
const dataInterfaces = ref([])
const definitions = ref([])
const devices = ref([])
const triggerStatus = ref({ status: 'stopped' })
const traceDeviceId = ref(null)
const traceData = ref(null)

const demoCollapse = ref(['demo'])
const templateDemo = ref(null)
const stepParamSchemas = reactive({}) // key: `${pi}-${si}`, value: [{name, type, required, description}]
const loadingTemplateDemo = ref(false)
const templateExpandPreview = ref([])
/** Demo 区「自定义测试输入」：任意字符串占位符预览 */
const templateTestInput = ref('')
const templateTestExpandResult = ref('')
const templateTestExpandRan = ref(false)
const loadingTemplateTestExpand = ref(false)
const loadingTemplateExpand = ref(false)

/** 阶段「测试」弹窗：模拟 Demo 事件走占位符与执行后 context */
const phaseTestDlg = reactive({
  visible: false,
  loading: false,
  phaseIndex: 0,
  note: '',
  innerTab: 'steps',
  stepResults: [],
  contextAfter: [],
  contextBefore: [],
  contextAddedKeys: [],
  beforeFull: null,
  afterFull: null
})

/** 接口测试对话框 */
const interfaceTestDlg = reactive({
  visible: false,
  loading: false,
  method: 'POST',
  paramsJson: '',
  innerTab: 'context',
  result: null,
  contextRows: []
})

/** 接口模式全流程调试对话框 */
const interfaceDebugDlg = reactive({
  visible: false,
  loading: false,
  paramsJson: '',
  executeLiveHTTP: true,
  innerTab: 'steps',
  result: null
})

const debugInnerTab = ref('flow')
const debugDeliveries = ref([])
const loadingDeliveries = ref(false)
const debugContext = ref(null)
const loadingContext = ref(false)
const selectedDeliveryId = ref(null)

const templateVariableRows = computed(() => {
  const o = debugContext.value?.execution_template
  if (!o || typeof o !== 'object') return []
  return Object.keys(o)
    .sort()
    .map((k) => ({ key: k, value: String(o[k] ?? '') }))
})

const downstreamTemplateRows = computed(() => {
  const o = debugContext.value?.execution_template_downstream
  if (!o || typeof o !== 'object') return []
  return Object.keys(o)
    .sort()
    .map((k) => ({ key: k, value: String(o[k] ?? '') }))
})

function sortDeliveriesForChain(rows) {
  if (!rows?.length) return []
  return [...rows].sort((a, b) => {
    const pa = Number(a.phase_id) || 0
    const pb = Number(b.phase_id) || 0
    if (pa !== pb) return pa - pb
    const sa = Number(a.step_id) || 0
    const sb = Number(b.step_id) || 0
    if (sa !== sb) return sa - sb
    const ta = new Date(a.created_at).getTime() || 0
    const tb = new Date(b.created_at).getTime() || 0
    return ta - tb
  })
}

/** 与 phased_runner 行为对齐的简短说明，便于与表单 run_mode 对照 */
function runModeContextHint(mode) {
  const m = String(mode || '').toLowerCase()
  if (m === 'sequential') {
    return '阶段内依次执行；每步 HTTP 成功后响应写入公共占位符表，后续步与后续阶段共用。'
  }
  if (m === 'failover') {
    return '阶段内依次尝试，首个 HTTP 成功即停；仅成功步写回 HTTP 上下文；失败步不写响应。'
  }
  if (m === 'parallel') {
    return '多步并行时每步用克隆变量表；同阶段勿依赖 http.last。单步阶段会把 HTTP 响应写回公共表供后续阶段使用。'
  }
  return '请对照表单中该阶段的运行方式。'
}

/** 当前选中投递所属设备事件在本页列表中的全部投递（按阶段/步骤排序），用于整体串联调试 */
const sameEventDeliveryChain = computed(() => {
  const id = selectedDeliveryId.value
  if (!id || !debugDeliveries.value?.length) return []
  const row = debugDeliveries.value.find((d) => Number(d.id) === Number(id))
  if (!row || row.device_event_id == null) return []
  const ev = row.device_event_id
  const same = debugDeliveries.value.filter((d) => Number(d.device_event_id) === Number(ev))
  return sortDeliveriesForChain(same)
})

const currentDebugPhase = computed(() => {
  const pid = debugContext.value?.current_step?.phase_id
  if (pid == null || pid === '') return null
  const phases = debugContext.value?.connector?.phases || []
  return phases.find((p) => Number(p.id) === Number(pid)) || null
})

const currentDebugStepRow = computed(() => {
  const sid = debugContext.value?.current_step?.step_id
  if (sid == null || sid === '') return null
  const steps = currentDebugPhase.value?.steps || []
  return steps.find((s) => Number(s.id) === Number(sid)) || null
})

const demoTemplateRows = computed(() => {
  const o = templateDemo.value?.execution_template
  const base = (!o || typeof o !== 'object') ? [] : Object.keys(o).sort().map((k) => ({ key: k, value: String(o[k] ?? ''), fromSchema: false }))
  const schemaRows = webhookSchemaContext.value.map((item) => ({ key: item.key, value: item.value, fromSchema: true }))
  // 去重：schema 条目若 key 已存在则跳过
  const existing = new Set(base.map((r) => r.key))
  return [...base, ...schemaRows.filter((r) => !existing.has(r.key))]
})

/** webhook 事件类型 schema 推导出的 context 占位符 */
const webhookSchemaContext = ref([])

function flattenSchemaProps(schema, prefix, out) {
  if (!schema || typeof schema !== 'object') return
  const props = schema.properties || {}
  for (const [k, v] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && v.type === 'object' && v.properties) {
      flattenSchemaProps(v, path, out)
    } else {
      const sample = v?.examples?.[0] ?? v?.default ?? (v?.type === 'number' || v?.type === 'integer' ? 0 : '')
      out.push({ key: `{{context.${path}}}`, value: String(sample) })
    }
  }
}

async function loadWebhookSchemaContext() {
  webhookSchemaContext.value = []
  const wid = form.webhook_id
  if (!wid) {
    webhookEventTypes.value = []
    return
  }
  try {
    const r = await ob.listWebhookEventTypes(wid)
    webhookEventTypes.value = r.data || []
  } catch {
    webhookEventTypes.value = []
  }
  const matchValues = form.trigger_config?.match_values || []
  if (!matchValues.length) return
  const seen = new Set()
  const results = []
  for (const mv of matchValues) {
    const et = webhookEventTypes.value.find((t) => t.event_type === mv)
    if (!et?.schema_json) continue
    let schema
    try { schema = JSON.parse(et.schema_json) } catch { continue }
    const entries = []
    flattenSchemaProps(schema, '', entries)
    for (const e of entries) {
      if (!seen.has(e.key)) {
        seen.add(e.key)
        results.push(e)
      }
    }
  }
  webhookSchemaContext.value = results
}

const form = reactive({
  name: '',
  description: '',
  connector_code: 'http_webhook',
  default_timeout_ms: 15000,
  default_retry_max: 2,
  debounce_same_event_ms: 0,
  debounce_diff_event_ms: 0,
  debounce_same_scan_ms: 0,
  loop_cooldown_ms: 0,
  priority: 0,
  enabled: true,
  trigger_type: 'device_event',
  webhook_id: 0,
  trigger_config: {},
  definition_ids: [],
  device_ids: [],
  phases: [],
  // 接口模式相关字段
  interface_mode: false,
  interface_code: '',
  input_params_json: '',
  output_schema_json: '',
  output_mappings: [],
  // 连接器全局自定义脚本：{ result: { enabled, code, timeout_ms } }
  custom_script: { result: { enabled: false, code: '', timeout_ms: 800 } }
})

const routeId = computed(() => String(route.params.id || ''))
const isNew = computed(() => routeId.value === 'new')
const numericConnectorId = computed(() => {
  if (isNew.value) return null
  const n = Number(routeId.value)
  return Number.isFinite(n) && n > 0 ? n : null
})

const pageTitle = computed(() => {
  if (isNew.value) return '新建连接器'
  const name = form.name?.trim()
  return name ? `编辑：${name}` : `编辑连接器 #${routeId.value}`
})

const triggerStatusLabel = computed(() => {
  const s = triggerStatus.value?.status
  const map = { running: '运行中', listening: '监听中', stopped: '已停止', error: '错误', manager_not_started: '未启动' }
  return map[s] || s || '未知'
})

function fmtJson(v) {
  if (v == null || v === '') return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

/** 写入接口的 context 相关字段（含兼容用 context_merge） */
function stepContextMergePayload(st) {
  const typ = st.step_type
  const before = st.config?.context_merge_before === 'event_data_json' ? 'event_data_json' : 'off'
  const after = typ === 'http' && st.config?.context_merge_after === 'http_response_json' ? 'http_response_json' : 'off'
  let legacy = 'off'
  if (after === 'http_response_json') legacy = 'http_response_json'
  else if (before === 'event_data_json') legacy = 'event_data_json'
  return {
    context_merge_before: before,
    context_merge_after: after,
    context_merge: legacy
  }
}

function ensureStepContextMerge(st, apiCfg) {
  const typ = st.step_type
  const cfg = apiCfg || {}
  let before = 'off'
  let after = 'off'

  const b = cfg.context_merge_before
  const a = cfg.context_merge_after
  if (b === 'event_data_json') before = 'event_data_json'
  if (typ === 'http' && a === 'http_response_json') after = 'http_response_json'

  const dualPresent = cfg.context_merge_before != null || cfg.context_merge_after != null
  if (!dualPresent) {
    const leg = cfg.context_merge
    if (leg === 'event_data_json') {
      before = 'event_data_json'
      after = 'off'
    } else if (leg === 'http_response_json' && typ === 'http') {
      before = 'off'
      after = 'http_response_json'
    } else if (leg === 'off') {
      before = 'off'
      after = 'off'
    } else if (!leg && typ === 'http') {
      before = 'off'
      after = 'http_response_json'
    } else if (!leg && typ !== 'http') {
      before = 'event_data_json'
      after = 'off'
    }
  }

  if (typ !== 'http') after = 'off'

  if (!st.config) st.config = {}
  st.config.context_merge_before = before
  st.config.context_merge_after = after
  st.config.context_merge =
    after === 'http_response_json' ? 'http_response_json' : before === 'event_data_json' ? 'event_data_json' : 'off'
}

/** Demo 预览：模拟上一阶段已写入的 context，便于测消息里的 {{context.value}} 等 */
const CHAIN_CONTEXT_DEMO_OVERRIDES = {
  '{{context.value}}': '【Demo】模拟上一阶段 HTTP 写入的 context.value',
  '{{context.token}}': 'demo-token'
}

/** 常见 PDA / 扫码枪 Intent extra 键名 */
const COMMON_BROADCAST_EXTRA_KEYS = [
  'data', 'barcode_string', 'barcode', 'SCAN_DATA', 'scannerdata',
  'se4500', 'decode_data', 'BARCODE', 'SCAN_BARCODE1', 'barcodeData', 'decodeData'
]

function parseExtrasToRows(extras) {
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) return []
  return Object.entries(extras).map(([key, value]) => ({
    key: String(key),
    value: value == null ? '' : String(value)
  }))
}

function rowsToExtrasObject(rows) {
  const out = {}
  for (const row of rows || []) {
    const k = String(row?.key || '').trim()
    if (!k) continue
    out[k] = String(row?.value ?? '')
  }
  return out
}

function syncExtrasJsonFromRows(st) {
  try {
    st._extrasJson = JSON.stringify(rowsToExtrasObject(st._extrasRows), null, 0)
  } catch {
    st._extrasJson = '{}'
  }
}

function ensureBroadcastExtrasRows(st) {
  if (!Array.isArray(st._extrasRows)) {
    try {
      st._extrasRows = parseExtrasToRows(JSON.parse(st._extrasJson || '{}'))
    } catch {
      st._extrasRows = []
    }
  }
}

function syncExtrasRowsFromJson(st) {
  try {
    const o = JSON.parse(st._extrasJson || '{}')
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return
    st._extrasRows = parseExtrasToRows(o)
  } catch {
    ElMessage.warning('extras JSON 格式无效，已保留当前行编辑内容')
  }
}

function addBroadcastExtraRow(st) {
  ensureBroadcastExtrasRows(st)
  st._extrasRows.push({ key: '', value: '{{context.value}}' })
  syncExtrasJsonFromRows(st)
}

function removeBroadcastExtraRow(st, ri) {
  ensureBroadcastExtrasRows(st)
  st._extrasRows.splice(ri, 1)
  syncExtrasJsonFromRows(st)
}

function onBroadcastExtraRowChange(st) {
  syncExtrasJsonFromRows(st)
}

function fillBroadcastExtrasContextValue(st) {
  ensureBroadcastExtrasRows(st)
  if (!st._extrasRows.length) {
    st._extrasRows.push({ key: '', value: '{{context.value}}' })
  } else {
    for (const row of st._extrasRows) {
      if (!String(row.value || '').trim()) row.value = '{{context.value}}'
    }
  }
  syncExtrasJsonFromRows(st)
}

function importBroadcastKeysFromDefinitions(st) {
  const keys = broadcastExtraKeySuggestions.value
  if (!keys.length) {
    ElMessage.info('暂无可用数据标签（请先绑定事件定义或手动添加）')
    return
  }
  ensureBroadcastExtrasRows(st)
  const existing = new Set(st._extrasRows.map((r) => String(r.key || '').trim()).filter(Boolean))
  let added = 0
  for (const k of keys) {
    if (existing.has(k)) continue
    st._extrasRows.push({ key: k, value: '{{context.value}}' })
    existing.add(k)
    added++
  }
  if (!added) {
    ElMessage.info('绑定事件中的数据标签已全部添加')
    return
  }
  syncExtrasJsonFromRows(st)
  ElMessage.success(`已导入 ${added} 个数据标签`)
}

function broadcastExtrasSummary(st, full = false) {
  ensureBroadcastExtrasRows(st)
  const rows = (st._extrasRows || []).filter((r) => String(r.key || '').trim())
  if (!rows.length) return full ? '未配置模拟数据标签' : '未配置 extras'
  if (full) {
    return rows.map((r) => `${r.key}=${r.value || '（空）'}`).join(' · ')
  }
  const preview = rows.slice(0, 2).map((r) => r.key).join(', ')
  const more = rows.length > 2 ? ` 等${rows.length}个` : ''
  return `${rows.length} 个标签：${preview}${more}`
}

function broadcastExtraValueSuggest(q, cb) {
  const presets = ['{{context.value}}', '{{device_event.event_data}}']
  for (const k of availableContextKeys.value) {
    if (k.startsWith('context.')) presets.push(`{{${k}}}`)
  }
  const uniq = [...new Set(presets)]
  const qn = String(q || '').trim().toLowerCase()
  cb(uniq.filter((v) => !qn || v.toLowerCase().includes(qn)).map((v) => ({ value: v })))
}

const broadcastExtraKeySuggestions = computed(() => {
  const seen = new Set()
  const out = []
  const add = (k) => {
    const s = String(k || '').trim()
    if (!s || seen.has(s)) return
    seen.add(s)
    out.push(s)
  }
  const linked = new Set(form.definition_ids || [])
  const pool = linked.size
    ? definitions.value.filter((d) => linked.has(d.id))
    : definitions.value
  for (const d of pool) {
    for (const k of d.extra_keys || []) add(k)
  }
  for (const k of COMMON_BROADCAST_EXTRA_KEYS) add(k)
  return out.sort()
})

async function loadTemplateDemo() {
  loadingTemplateDemo.value = true
  try {
    const r = await ob.getOutboundTemplateDemo()
    templateDemo.value = r.data
  } catch {
    templateDemo.value = null
  } finally {
    loadingTemplateDemo.value = false
  }
}

function collectConnectorTemplateSamples() {
  const labels = []
  const strings = []
  for (const ph of form.phases || []) {
    for (const st of ph.steps || []) {
      const typ = st.step_type
      if (typ === 'view_url') {
        const u = (st.config?.url || '').trim()
        if (u) {
          labels.push('打开网页 · URL')
          strings.push(u)
        }
      }
      if (typ === 'message') {
        const t = (st.config?.title || '').trim()
        if (t) {
          labels.push('消息提醒 · 标题')
          strings.push(t)
        }
        const b = (st.config?.body ?? '').toString().trim()
        if (b) {
          labels.push('消息提醒 · 正文')
          strings.push(b)
        }
      }
      if (typ === 'broadcast_intent') {
        ensureBroadcastExtrasRows(st)
        syncExtrasJsonFromRows(st)
        const ex = (st._extrasJson || '').trim()
        if (ex && ex !== '{}') {
          labels.push('广播 Intent · extras')
          strings.push(ex)
        }
        const act = (st._action || '').trim()
        if (act.includes('{{')) {
          labels.push('广播 Intent · action')
          strings.push(act)
        }
      }
      if (typ === 'http' && st.endpoint_id) {
        const ep = allEndpoints.value.find((e) => e.id === st.endpoint_id)
        if (ep) {
          const bt = (ep.body_template ?? '').toString().trim()
          if (bt) {
            labels.push(`HTTP · ${ep.name || ep.path} · Body 模板`)
            strings.push(bt)
          }
          const p = (ep.path ?? '').toString().trim()
          if (p.includes('{{')) {
            labels.push(`HTTP · ${ep.name || ep.path} · Path`)
            strings.push(p)
          }
        }
      }
    }
  }
  return { labels, strings }
}

async function runTemplateExpandPreview(withChainContextDemo) {
  const { labels, strings } = collectConnectorTemplateSamples()
  if (!strings.length) {
    ElMessage.info('当前无可预览的模板（请先填写 URL/消息/广播或选择带 Body/Path 占位符的接口）')
    return
  }
  loadingTemplateExpand.value = true
  try {
    const overrides = withChainContextDemo ? { ...CHAIN_CONTEXT_DEMO_OVERRIDES } : {}
    // 合并 webhook schema 推导的 context 占位符作为预览 demo 值
    for (const { key, value } of webhookSchemaContext.value) {
      if (!(key in overrides)) overrides[key] = value
    }
    const r = await ob.postOutboundTemplateExpand({ strings, overrides })
    const exp = r.data?.expanded || []
    templateExpandPreview.value = labels.map((label, i) => ({
      label,
      raw: strings[i] ?? '',
      expanded: exp[i] ?? ''
    }))
    if (withChainContextDemo) {
      ElMessage.success('已合并链式 context Demo 覆盖值')
    }
  } finally {
    loadingTemplateExpand.value = false
  }
}

async function runTemplateTestExpand(withChainContextDemo) {
  const s = templateTestInput.value.trim()
  if (!s) {
    ElMessage.info('请输入要测试的文本')
    return
  }
  loadingTemplateTestExpand.value = true
  try {
    const overrides = withChainContextDemo ? { ...CHAIN_CONTEXT_DEMO_OVERRIDES } : {}
    for (const { key, value } of webhookSchemaContext.value) {
      if (!(key in overrides)) overrides[key] = value
    }
    const r = await ob.postOutboundTemplateExpand({ strings: [s], overrides })
    const exp = r.data?.expanded
    templateTestExpandResult.value = Array.isArray(exp) ? String(exp[0] ?? '') : ''
    templateTestExpandRan.value = true
    if (withChainContextDemo) {
      ElMessage.success('已合并链式 context Demo 覆盖值')
    }
  } finally {
    loadingTemplateTestExpand.value = false
  }
}

async function loadDebugDeliveries() {
  if (!numericConnectorId.value) return
  loadingDeliveries.value = true
  try {
    const params = { connector_id: numericConnectorId.value, page: 1, page_size: 100 }
    if (traceDeviceId.value) params.device_id = traceDeviceId.value
    const r = await ob.listOutboundDeliveries(params)
    debugDeliveries.value = r.data || []
    if (debugDeliveries.value.length) {
      await loadDebugContextForDelivery(debugDeliveries.value[0])
    } else {
      debugContext.value = null
      selectedDeliveryId.value = null
    }
  } catch {
    debugDeliveries.value = []
    debugContext.value = null
    selectedDeliveryId.value = null
  } finally {
    loadingDeliveries.value = false
  }
}

async function loadDebugContextForDelivery(row) {
  if (!row?.id) return
  selectedDeliveryId.value = row.id
  loadingContext.value = true
  debugContext.value = null
  try {
    const r = await ob.getOutboundDelivery(row.id)
    debugContext.value = r.data
  } catch {
    ElMessage.error('加载投递上下文失败')
    debugContext.value = null
  } finally {
    loadingContext.value = false
  }
}

function onDebugDeliveryRow(row) {
  loadDebugContextForDelivery(row)
}

function isCtxPhaseHi(ph) {
  const h = debugContext.value?.highlight
  if (!h) return false
  return Number(ph?.id) === Number(h.phase_id)
}

function isCtxStepHi(st) {
  const h = debugContext.value?.highlight
  if (!h) return false
  return Number(st?.id) === Number(h.step_id)
}

function endpointsForApp(aid) {
  return allEndpoints.value.filter((e) => e.app_id === aid)
}

function defaultDataIfaceConfig() {
  return {
    interface_id: null,
    param_mappings: [],
    pre_script: '',
    merge_result_to_context: false,
    context_merge_before: 'off',
    context_merge_after: 'off',
    context_merge: 'off'
  }
}

function defaultConnStep() {
  return {
    step_type: 'http',
    endpoint_id: null,
    delay_before_ms: 0,
    delay_after_ms: 0,
    config: {
      context_merge_before: 'off',
      context_merge_after: 'http_response_json',
      context_merge: 'http_response_json',
      param_mappings: [],
      // 接口模式设备配置
      target_device_mode: 'specific',
      target_device_ids: [],
      device_filter_serial: '',
      device_filter_name: '',
      device_filter_alias: '',
      device_placeholder: ''
    },
    _stepTemplateParamsText: '',
    _action: '',
    _pkg: '',
    _extrasJson: '{}',
    _extrasRows: [],
    _extrasAdvanced: false
  }
}

function defaultConnPhase() {
  return { run_mode: 'parallel', steps: [defaultConnStep()], _defaultParamsText: '{}' }
}

function mapPhaseFromApi(ph) {
  const steps = (ph.steps || []).map((s) => {
    const cfg = { ...(s.config || {}) }
    const st = {
      step_type: s.step_type || 'http',
      endpoint_id: s.endpoint_id || null,
      delay_before_ms: s.delay_before_ms != null ? Number(s.delay_before_ms) : 0,
      delay_after_ms: s.delay_after_ms != null ? Number(s.delay_after_ms) : 0,
      config: cfg,
      _action: cfg.action || '',
      _pkg: cfg.package || '',
      _extrasJson: '{}'
    }
    if (s.step_type === 'http') {
      // 确保 HTTP 步骤的 param_mappings 被正确初始化
      if (!st.config.param_mappings) {
        st.config.param_mappings = []
      }
    }
    if (s.step_type === 'broadcast_intent') {
      st._extrasRows = parseExtrasToRows(cfg.extras || {})
      if (!st._extrasRows.length) {
        st._extrasRows = [{ key: '', value: '{{context.value}}' }]
      }
      st._extrasAdvanced = false
      syncExtrasJsonFromRows(st)
    }
    if (s.step_type === 'data_interface') {
      const di = cfg.data_interface || {}
      st.config = {
        interface_id: di.interface_id || null,
        param_mappings: Array.isArray(di.param_mappings) ? di.param_mappings : [],
        pre_script: di.pre_script || '',
        merge_result_to_context: !!di.merge_result_to_context,
        context_merge_before: cfg.context_merge_before || 'off',
        context_merge_after: 'off',
        context_merge: 'off'
      }
    }
    if (s.step_type === 'message') {
      st.config = {
        title: cfg.title || '',
        body: cfg.body || cfg.text || cfg.message || '',
        duration_ms: cfg.duration_ms != null ? Number(cfg.duration_ms) : 8000
      }
    }
    if (s.step_type === 'app_script') {
      st.config = {
        app_id: cfg.app_id != null ? Number(cfg.app_id) : null,
        hook: cfg.hook || 'before_request'
      }
    }
    if (s.step_type === 'print') {
      let contentText = '[]'
      try {
        if (Array.isArray(cfg.content)) contentText = JSON.stringify(cfg.content, null, 2)
      } catch { contentText = '[]' }
      st.config = {
        protocol: cfg.protocol || 'escpos',
        transport: cfg.transport || 'spp',
        mac: cfg.mac || '',
        gen_side: cfg.gen_side || 'agent',
        _content_json: contentText
      }
    }
    ensureStepContextMerge(st, s.config)
    const tp = (s.config || {}).template_params
    if (tp && typeof tp === 'object' && !Array.isArray(tp)) {
      try {
        st._stepTemplateParamsText = JSON.stringify(tp, null, 2)
      } catch {
        st._stepTemplateParamsText = ''
      }
    } else {
      st._stepTemplateParamsText = ''
    }
    return st
  })
  const dp =
    ph.default_params && typeof ph.default_params === 'object' && !Array.isArray(ph.default_params)
      ? { ...ph.default_params }
      : {}
  let defaultText = '{}'
  try {
    defaultText = JSON.stringify(dp, null, 2)
  } catch {
    defaultText = '{}'
  }
  return {
    run_mode: ph.run_mode || 'parallel',
    steps: steps.length ? steps : [defaultConnStep()],
    _defaultParamsText: defaultText
  }
}

function resetFormNew() {
  form.name = ''
  form.description = ''
  form.connector_code = 'http_webhook'
  form.default_timeout_ms = 15000
  form.default_retry_max = 2
  form.debounce_same_event_ms = 0
  form.debounce_diff_event_ms = 0
  form.debounce_same_scan_ms = 0
  form.loop_cooldown_ms = 0
  form.priority = 0
  form.enabled = true
  form.trigger_type = 'device_event'
  form.trigger_config = { foreground_packages: [] }
  form.definition_ids = []
  form.device_ids = []
  form.phases = [defaultConnPhase()]
  // 接口模式字段
  form.interface_mode = false
  form.interface_code = ''
  form.input_params_json = ''
  form.output_schema_json = ''
  form.output_mappings = []
  form.custom_script = { result: { enabled: false, code: '', timeout_ms: 800 } }
}

function applyRowToForm(row) {
  const phases =
    row.phases && row.phases.length > 0 ? row.phases.map(mapPhaseFromApi) : [defaultConnPhase()]
  form.name = row.name
  form.description = row.description || ''
  form.connector_code = row.connector_code || 'http_webhook'
  form.default_timeout_ms = row.default_timeout_ms || 15000
  form.default_retry_max = row.default_retry_max ?? 0
  form.debounce_same_event_ms = row.debounce_same_event_ms ?? 0
  form.debounce_diff_event_ms = row.debounce_diff_event_ms ?? 0
  form.debounce_same_scan_ms = row.debounce_same_scan_ms ?? 0
  form.loop_cooldown_ms = row.loop_cooldown_ms ?? 0
  form.priority = row.priority ?? 0
  form.enabled = row.enabled !== false
  form.trigger_type = row.trigger_type || 'device_event'
  form.webhook_id = row.webhook_id || 0
  form.trigger_config = row.trigger_config ? { ...row.trigger_config } : {}
  // 确保 foreground_packages 是数组
  if (!Array.isArray(form.trigger_config.foreground_packages)) {
    form.trigger_config.foreground_packages = []
  }
  form.definition_ids = [...(row.definition_ids || [])]
  form.device_ids = [...(row.device_ids || [])]
  form.phases = phases
  // 接口模式字段
  form.interface_mode = row.interface_mode || false
  form.interface_code = row.interface_code || ''
  form.input_params_json = row.input_params_json || ''
  form.output_schema_json = row.output_schema_json || ''

  // 解析输出映射
  if (row.output_mappings_json) {
    try {
      form.output_mappings = JSON.parse(row.output_mappings_json)
    } catch {
      form.output_mappings = []
    }
  } else {
    form.output_mappings = []
  }

  // 连接器全局自定义脚本（含返回值 result 脚本）
  {
    const cs = (row.custom_script && typeof row.custom_script === 'object') ? row.custom_script : {}
    const r = (cs.result && typeof cs.result === 'object') ? cs.result : {}
    form.custom_script = {
      result: {
        enabled: !!r.enabled,
        code: typeof r.code === 'string' ? r.code : '',
        timeout_ms: r.timeout_ms != null ? Number(r.timeout_ms) || 800 : 800
      }
    }
  }

  preloadStepSchemas(phases)
}

async function preloadStepSchemas(phases) {
  for (let pi = 0; pi < phases.length; pi++) {
    const ph = phases[pi]
    for (let si = 0; si < (ph.steps || []).length; si++) {
      const st = ph.steps[si]
      const key = `${pi}-${si}`
      try {
        if (st.step_type === 'data_interface' && st.config?.interface_id) {
          const r = await getInterfaceParamSchema(st.config.interface_id)
          stepParamSchemas[key] = r.params || []
        } else if (st.step_type === 'http' && st.endpoint_id) {
          const r = await getEndpointParamSchema(st.endpoint_id)
          stepParamSchemas[key] = r.params || []
        }
      } catch (e) {
        console.warn('preloadStepSchemas error', key, e)
      }
    }
  }
}

async function loadApps() {
  try {
    const r = await ob.listOutboundApps()
    apps.value = r.data || []
  } catch {
    apps.value = []
  }
}

async function loadWebhooks() {
  try {
    const r = await ob.listOutboundWebhooks()
    webhooks.value = r.data || []
  } catch {
    webhooks.value = []
  }
}

async function loadTriggerStatus() {
  if (!numericConnectorId.value) return
  try {
    const r = await ob.getOutboundConnectorTriggerStatus(numericConnectorId.value)
    triggerStatus.value = r.data || { status: 'stopped' }
  } catch {
    triggerStatus.value = { status: 'error' }
  }
}

function onTriggerTypeChange(val) {
  // 切换触发类型时，保留已填 URL 等通用字段，清掉特有字段
  const keep = {
    url: form.trigger_config.url || '',
    type_field: form.trigger_config.type_field || '',
    match_values: form.trigger_config.match_values || []
  }
  form.trigger_config = { ...keep }
  if (val === 'cron') {
    if (!form.trigger_config.type_field) form.trigger_config.type_field = 'event_type'
    if (!form.trigger_config.cron_event_type) form.trigger_config.cron_event_type = 'cron.tick'
    if (!form.trigger_config.match_values?.length) form.trigger_config.match_values = ['cron.tick']
    if (!form.trigger_config.cron_expression) form.trigger_config.cron_expression = '0 * * * *'
  }
  if (val === 'system_event') {
    if (!form.trigger_config.match_values?.length) form.trigger_config.match_values = ['device.online']
  }
}

function onRunModeChange(isInterfaceMode) {
  if (isInterfaceMode) {
    // 切换到接口模式：清空触发配置
    form.trigger_type = 'device_event'
    form.webhook_id = 0
    form.trigger_config = {}
    form.definition_ids = []
    form.device_ids = []
  } else {
    // 切换到触发模式：清空接口配置
    form.interface_code = ''
    form.input_params_json = ''
    form.output_schema_json = ''
  }
}

async function loadAllEndpoints() {
  try {
    const r = await ob.listOutboundEndpoints({})
    allEndpoints.value = r.data || []
  } catch {
    allEndpoints.value = []
  }
}

async function loadDataInterfaces() {
  try {
    const r = await listDataInterfaces({ page_size: 500 })
    dataInterfaces.value = r.data || []
  } catch {
    dataInterfaces.value = []
  }
}

async function onDataIfaceSelect(st, pi, si) {
  if (!st.config.interface_id) return
  const key = `${pi}-${si}`
  try {
    const r = await getInterfaceParamSchema(st.config.interface_id)
    const params = r.params || []
    stepParamSchemas[key] = params
    if (st.config.param_mappings?.length) return
    if (params.length) {
      st.config.param_mappings = params.map((p) => ({ param: p.name, source: 'context', value: '' }))
    } else {
      // fallback to mock-params
      const r2 = await mockParamsInterface(st.config.interface_id)
      const paramValues = r2.param_values || {}
      const paramNames = Object.keys(paramValues)
      st.config.param_mappings = paramNames.map((p) => ({ param: p, source: 'context', value: '' }))
    }
  } catch {
    // ignore
  }
}

async function onEndpointSelect(st, pi, si) {
  if (!st.endpoint_id) return
  const key = `${pi}-${si}`
  try {
    const r = await getEndpointParamSchema(st.endpoint_id)
    stepParamSchemas[key] = r.params || []
  } catch {
    // ignore
  }
}

/** 从 templateDemo.execution_template 提取所有可用占位符键（去掉双大括号） */
const availableContextKeys = computed(() => {
  let keys = []

  // 接口模式下的特殊处理
  if (form.interface_mode) {
    // 1. 添加全局入参 schema 中定义的参数
    if (form.input_params_json) {
      try {
        const schema = JSON.parse(form.input_params_json)
        if (schema.properties) {
          for (const paramName of Object.keys(schema.properties)) {
            // 添加 context.xxx 格式
            keys.push(`context.${paramName}`)
            // 添加 xxx 格式（直接引用）
            keys.push(paramName)
          }
        }
      } catch (e) {
        console.warn('Failed to parse input_params_json:', e)
      }
    }

    // 2. 添加 HTTP 系统变量
    keys.push('http.method', 'http.path', 'http.query')
    keys.push('http.last.body', 'http.last.status', 'http.last.headers')
    keys.push('http.last.page.has_more', 'http.last.page.list_len')

    // 3. 添加时间戳变量
    keys.push('timestamp', 'timestamp_ms')

    // 4. 添加用户和设备 ID（可选）
    keys.push('userid', 'deviceid')

    // 去重并排序
    keys = Array.from(new Set(keys)).sort()
  } else {
    // 触发模式：从 templateDemo 获取
    const tpl = templateDemo.value?.execution_template
    if (tpl && typeof tpl === 'object') {
      keys = Object.keys(tpl)
        .map((k) => k.replace(/^\{\{|\}\}$/g, ''))
        .sort()
    }
  }

  return keys
})

/** 一键匹配：加载 schema（若未加载），把所有接口参数填入 param_mappings，并按名自动匹配 context 键 */
async function autoMatchParams(st, pi, si) {
  const keys = availableContextKeys.value
  const schemaKey = `${pi}-${si}`

  // 确保 schema 已加载
  let schema = stepParamSchemas[schemaKey]
  if (!schema && st.config?.interface_id) {
    try {
      const r = await getInterfaceParamSchema(st.config.interface_id)
      schema = r.params || []
      stepParamSchemas[schemaKey] = schema
    } catch {
      schema = []
    }
  }
  schema = schema || []

  if (schema.length) {
    const existing = new Map((st.config.param_mappings || []).map((m) => [m.param, m]))
    const merged = schema.map((p) => {
      const mp = existing.get(p.name) || { param: p.name, source: 'context', value: '' }
      if (!mp.value) {
        const name = p.name.toLowerCase()
        const exact = keys.find((k) => k.toLowerCase() === name)
        const partial = !exact && keys.find((k) => k.toLowerCase().endsWith('.' + name))
        if (exact || partial) {
          mp.source = 'context'
          mp.value = exact || partial
        }
      }
      return mp
    })
    // 保留手动添加的不在 schema 里的行
    for (const mp of (st.config.param_mappings || [])) {
      if (!schema.find((p) => p.name === mp.param)) merged.push(mp)
    }
    st.config.param_mappings = merged
    return
  }

  // fallback: 无 schema，只填空值行
  if (!keys.length || !st.config.param_mappings?.length) return
  for (const mp of st.config.param_mappings) {
    if (mp.value) continue
    const name = mp.param.toLowerCase()
    const exact = keys.find((k) => k.toLowerCase() === name)
    if (exact) { mp.source = 'context'; mp.value = exact; continue }
    const partial = keys.find((k) => k.toLowerCase().endsWith('.' + name))
    if (partial) { mp.source = 'context'; mp.value = partial }
  }
}

/** 输出参数一键匹配：根据输出 Schema 自动补全映射 */
function autoMatchOutputParams() {
  if (!form.output_schema_json) {
    ElMessage.warning('请先定义输出结构 Schema')
    return
  }

  try {
    const schema = JSON.parse(form.output_schema_json)
    if (!schema.properties || typeof schema.properties !== 'object') {
      ElMessage.warning('输出 Schema 必须包含 properties 字段')
      return
    }

    const keys = availableContextKeys.value
    const existing = new Map(form.output_mappings.map((m) => [m.output_key, m]))
    const merged = []

    // 遍历 schema 中的所有输出字段
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const mp = existing.get(fieldName) || { output_key: fieldName, source: 'context', value: '' }

      // 如果还没有配置值，尝试自动匹配
      if (!mp.value) {
        const name = fieldName.toLowerCase()
        // 1. 精确匹配（不区分大小写）
        const exact = keys.find((k) => k.toLowerCase() === name)
        if (exact) {
          mp.source = 'context'
          mp.value = exact
        } else {
          // 2. 后缀匹配（如 employee_name 匹配 context.employee_name）
          const partial = keys.find((k) => k.toLowerCase().endsWith('.' + name))
          if (partial) {
            mp.source = 'context'
            mp.value = partial
          } else {
            // 3. 包含匹配（如 name 匹配 employee_name）
            const contains = keys.find((k) => k.toLowerCase().includes(name))
            if (contains) {
              mp.source = 'context'
              mp.value = contains
            }
          }
        }
      }

      merged.push(mp)
    }

    // 保留手动添加的不在 schema 里的字段
    for (const mp of form.output_mappings) {
      if (!schema.properties[mp.output_key]) {
        merged.push(mp)
      }
    }

    form.output_mappings = merged
    ElMessage.success(`已匹配 ${merged.length} 个输出字段`)
  } catch (e) {
    ElMessage.error('解析输出 Schema 失败：' + e.message)
  }
}

async function loadDefinitions() {
  const r = await cfgApi.listCustomEventDefinitions({ enabled: '1' })
  definitions.value = r.data || []
}

async function loadDevices() {
  const r = await getDevices()
  devices.value = r.data || []
}

async function loadConnectorFromServer() {
  if (!numericConnectorId.value) {
    resetFormNew()
    return
  }
  pageLoading.value = true
  try {
    const r = await ob.getOutboundConnector(numericConnectorId.value)
    if (r.data) applyRowToForm(r.data)
    loadTriggerStatus()
  } catch {
    ElMessage.error('加载连接器失败')
    router.replace('/outbound')
  } finally {
    pageLoading.value = false
  }
}

function onConnStepTypeChange(ph, si) {
  const st = ph.steps[si]
  const prevLeg = st.config?.context_merge
  const prevBefore = st.config?.context_merge_before === 'event_data_json'
  const prevAfter = st.config?.context_merge_after === 'http_response_json'
  if (st.step_type === 'http') {
    let before = 'off'
    let after = 'http_response_json'
    if (prevBefore || prevLeg === 'event_data_json') before = 'event_data_json'
    if (prevLeg === 'off' && !prevAfter) after = 'off'
    let legacy = 'off'
    if (after === 'http_response_json') legacy = 'http_response_json'
    else if (before === 'event_data_json') legacy = 'event_data_json'
    st.config = {
      context_merge_before: before,
      context_merge_after: after,
      context_merge: legacy
    }
    if (!st.endpoint_id) st.endpoint_id = null
  } else if (st.step_type === 'data_interface') {
    st.endpoint_id = null
    st.config = defaultDataIfaceConfig()
  } else if (st.step_type === 'app_script') {
    st.endpoint_id = null
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      inline: st.config?.inline || false,
      code: st.config?.code || '',
      timeout_ms: st.config?.timeout_ms != null ? Number(st.config.timeout_ms) : 800,
      app_id: st.config?.app_id || null,
      hook: st.config?.hook || 'before_request',
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'connector_script') {
    st.endpoint_id = null
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      code: st.config?.code || '',
      timeout_ms: st.config?.timeout_ms != null ? Number(st.config.timeout_ms) : 800,
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'view_url') {
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      url: st.config?.url || '',
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'message') {
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      title: st.config?.title || '',
      body: st.config?.body || '',
      duration_ms: st.config?.duration_ms != null ? Number(st.config.duration_ms) : 8000,
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'broadcast_intent') {
    st._action = st._action || ''
    st._pkg = st._pkg || ''
    ensureBroadcastExtrasRows(st)
    if (!st._extrasRows.length) {
      st._extrasRows.push({ key: '', value: '{{context.value}}' })
    }
    syncExtrasJsonFromRows(st)
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      ...(st.config || {}),
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'keyboard_hid') {
    st.endpoint_id = null
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      input_method: st.config?.input_method || 'text',
      text: st.config?.text || '',
      keys: st.config?.keys || [],
      delay_ms: st.config?.delay_ms != null ? Number(st.config.delay_ms) : 50,
      target_app: st.config?.target_app || '',
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  } else if (st.step_type === 'print') {
    st.endpoint_id = null
    const off = prevLeg === 'off' && !prevBefore
    st.config = {
      protocol: st.config?.protocol || 'escpos',
      transport: st.config?.transport || 'spp',
      mac: st.config?.mac || '',
      gen_side: st.config?.gen_side || 'agent',
      _content_json: st.config?._content_json || '[]',
      context_merge_before: off ? 'off' : 'event_data_json',
      context_merge_after: 'off',
      context_merge: off ? 'off' : 'event_data_json'
    }
  }
}

function addConnPhase() {
  form.phases.push(defaultConnPhase())
}

function removeConnPhase(pi) {
  form.phases.splice(pi, 1)
  if (!form.phases.length) form.phases.push(defaultConnPhase())
}

function addConnStep(pi) {
  form.phases[pi].steps.push(defaultConnStep())
}

function removeConnStep(pi, si) {
  const ph = form.phases[pi]
  ph.steps.splice(si, 1)
  if (!ph.steps.length) ph.steps.push(defaultConnStep())
}

function goBack() {
  router.push('/outbound')
}

/** 打开接口测试对话框 */
function openInterfaceTest() {
  interfaceTestDlg.visible = true
  interfaceTestDlg.result = null
  interfaceTestDlg.contextRows = []
  interfaceTestDlg.innerTab = 'context'
  interfaceTestDlg.method = 'POST'
  // 尝试从 input_params_json 生成示例参数
  if (!interfaceTestDlg.paramsJson) {
    fillInterfaceTestParams()
  }
}

/** 填充示例参数 */
function fillInterfaceTestParams() {
  try {
    if (form.input_params_json) {
      const schema = JSON.parse(form.input_params_json)
      const example = {}
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          if (prop.examples && prop.examples.length > 0) {
            example[key] = prop.examples[0]
          } else if (prop.default !== undefined) {
            example[key] = prop.default
          } else if (prop.type === 'string') {
            example[key] = prop.description ? `示例_${key}` : 'example'
          } else if (prop.type === 'number' || prop.type === 'integer') {
            example[key] = 123
          } else if (prop.type === 'boolean') {
            example[key] = true
          }
        }
      }
      interfaceTestDlg.paramsJson = JSON.stringify(example, null, 2)
    } else {
      interfaceTestDlg.paramsJson = JSON.stringify({ param1: 'value1', param2: 'value2' }, null, 2)
    }
  } catch {
    interfaceTestDlg.paramsJson = JSON.stringify({ param1: 'value1', param2: 'value2' }, null, 2)
  }
}

/** 执行接口测试 */
async function runInterfaceTest() {
  if (!form.interface_code) {
    ElMessage.warning('请先设置接口编码')
    return
  }

  let params = {}
  try {
    params = JSON.parse(interfaceTestDlg.paramsJson || '{}')
  } catch {
    ElMessage.error('参数 JSON 格式错误')
    return
  }

  interfaceTestDlg.loading = true
  interfaceTestDlg.result = null
  interfaceTestDlg.contextRows = []

  try {
    const res = await ob.callConnectorInterface({
      connector_code: form.interface_code,
      params: params
    })

    interfaceTestDlg.result = res

    // 构建 context 映射表
    const contextRows = []

    // 1. 接口入参
    for (const [key, value] of Object.entries(params)) {
      contextRows.push({
        key: `{{${key}}}`,
        value: String(value ?? ''),
        source: '接口入参'
      })
      contextRows.push({
        key: `{{context.${key}}}`,
        value: String(value ?? ''),
        source: '接口入参'
      })
    }

    // 2. HTTP 变量
    contextRows.push({
      key: '{{http.method}}',
      value: interfaceTestDlg.method,
      source: 'HTTP 信息'
    })

    // 3. 系统变量
    contextRows.push({
      key: '{{timestamp}}',
      value: String(Math.floor(Date.now() / 1000)),
      source: '系统变量'
    })
    contextRows.push({
      key: '{{timestamp_ms}}',
      value: String(Date.now()),
      source: '系统变量'
    })

    // 4. 返回结果中的数据
    if (res.data && typeof res.data === 'object') {
      for (const [key, value] of Object.entries(res.data)) {
        if (!params.hasOwnProperty(key)) {
          contextRows.push({
            key: `{{context.${key}}}`,
            value: String(value ?? ''),
            source: '执行结果'
          })
        }
      }
    }

    interfaceTestDlg.contextRows = contextRows
    interfaceTestDlg.innerTab = 'context'

    if (res.success) {
      ElMessage.success('接口调用成功')
    } else {
      ElMessage.warning('接口调用失败：' + (res.error || '未知错误'))
    }
  } catch (e) {
    ElMessage.error('调用失败：' + (e.message || e))
    interfaceTestDlg.result = {
      success: false,
      error: e.message || String(e),
      duration_ms: 0,
      step_count: 0
    }
  } finally {
    interfaceTestDlg.loading = false
  }
}

/** 打开全流程调试对话框 */
function openInterfaceDebug() {
  interfaceDebugDlg.visible = true
  interfaceDebugDlg.result = null
  interfaceDebugDlg.innerTab = 'steps'
  if (!interfaceDebugDlg.paramsJson) {
    fillInterfaceDebugParams()
  }
}

/** 依据 input_params_json 填充调试示例参数 */
function fillInterfaceDebugParams() {
  try {
    if (form.input_params_json) {
      const schema = JSON.parse(form.input_params_json)
      const example = {}
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          if (prop.examples && prop.examples.length > 0) {
            example[key] = prop.examples[0]
          } else if (prop.default !== undefined) {
            example[key] = prop.default
          } else if (prop.type === 'string') {
            example[key] = prop.description ? `示例_${key}` : 'example'
          } else if (prop.type === 'number' || prop.type === 'integer') {
            example[key] = 123
          } else if (prop.type === 'boolean') {
            example[key] = true
          }
        }
      }
      interfaceDebugDlg.paramsJson = JSON.stringify(example, null, 2)
    } else {
      interfaceDebugDlg.paramsJson = JSON.stringify({ param1: 'value1', param2: 'value2' }, null, 2)
    }
  } catch {
    interfaceDebugDlg.paramsJson = JSON.stringify({ param1: 'value1', param2: 'value2' }, null, 2)
  }
}

/** 执行全流程调试：端到端跑当前表单各阶段，返回逐步 context 演变 */
async function runInterfaceDebug() {
  const built = buildPhasesArray({ forSave: false })
  if (built.error) {
    if (built.error !== '__handled') ElMessage.warning(built.error)
    return
  }

  let params = {}
  try {
    params = JSON.parse(interfaceDebugDlg.paramsJson || '{}')
  } catch {
    ElMessage.error('参数 JSON 格式错误')
    return
  }

  interfaceDebugDlg.loading = true
  interfaceDebugDlg.result = null
  try {
    const r = await ob.postOutboundInterfaceDebug({
      connector_id: Number(numericConnectorId.value) || 0,
      interface_code: form.interface_code || '',
      phases: built.phases,
      output_mappings: (form.output_mappings || []).filter((m) => m.output_key?.trim()),
      input_params_json: form.input_params_json || '',
      custom_script: form.custom_script || {},
      params,
      execute_live_http: interfaceDebugDlg.executeLiveHTTP
    })
    const d = r.data || {}
    // 为可展开行补一个稳定 rowKey
    if (Array.isArray(d.steps)) {
      d.steps.forEach((s, i) => {
        s.rowKey = `${s.phase_index}-${s.step_index}-${i}`
      })
    }
    interfaceDebugDlg.result = d
    interfaceDebugDlg.innerTab = 'steps'
    ElMessage.success('调试执行完成')
  } catch (e) {
    ElMessage.error('调试失败：' + (e.message || e))
  } finally {
    interfaceDebugDlg.loading = false
  }
}

/** 将步骤表单中的 template_params 文本合并进即将提交的 config；失败时返回 false 并已提示。 */
function attachStepTemplateParamsToConfig(st, cfg) {
  const raw = (st._stepTemplateParamsText || '').trim()
  if (!raw) return true
  try {
    const o = JSON.parse(raw)
    if (typeof o !== 'object' || o === null || Array.isArray(o)) {
      ElMessage.error('「本步专属占位符默认值」须为 JSON 对象（键为完整占位符）')
      return false
    }
    const norm = {}
    for (const [k, v] of Object.entries(o)) {
      norm[String(k)] = String(v ?? '')
    }
    cfg.template_params = norm
    return true
  } catch {
    ElMessage.error('「本步专属占位符默认值」须为合法 JSON')
    return false
  }
}

/**
 * 从当前表单构建 phases 数组（与保存接口一致）。
 * @param {{ forSave?: boolean }} opts forSave 为 false 时放宽校验（供阶段测试预览，允许 HTTP 未选接口等）。
 */
function buildPhasesArray(opts = {}) {
  const forSave = opts.forSave !== false
  if (forSave && !form.interface_mode && form.trigger_type === 'device_event' && !form.definition_ids?.length) {
    return { error: '请至少选择一个事件定义' }
  }
  const phases = []
  for (let pi = 0; pi < form.phases.length; pi++) {
    const ph = form.phases[pi]
    let defaultParams = {}
    const ptxt = (ph._defaultParamsText || '').trim()
    if (ptxt && ptxt !== '{}') {
      try {
        const o = JSON.parse(ptxt)
        if (typeof o !== 'object' || o === null || Array.isArray(o)) {
          return { error: `阶段 ${pi + 1}：阶段默认占位符须为 JSON 对象` }
        }
        for (const [k, v] of Object.entries(o)) {
          defaultParams[String(k)] = String(v ?? '')
        }
      } catch {
        return { error: `阶段 ${pi + 1}：阶段默认占位符须为合法 JSON` }
      }
    }
    const steps = []
    for (const st of ph.steps) {
      const typ = st.step_type
      if (typ === 'http') {
        if (forSave && !st.endpoint_id) {
          return { error: '每个 HTTP 步骤需选择应用接口' }
        }
        const mappings = (st.config?.param_mappings || []).filter((m) => m.param?.trim())
        const cfg = {
          ...stepContextMergePayload(st),
          param_mappings: mappings
        }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'http',
          endpoint_id: st.endpoint_id || null,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0,
          config: cfg
        })
      } else if (typ === 'app_script') {
        const inline = !!st.config?.inline
        const appId = st.config?.app_id != null ? Number(st.config.app_id) : 0
        const code = (st.config?.code || '').trim()
        if (forSave && inline && !code) {
          return { error: '「应用脚本」内联模式需填写脚本代码' }
        }
        if (forSave && !inline && !appId) {
          return { error: '「应用脚本」步骤需选择外部应用，或切换为内联代码' }
        }
        const hook = String(st.config?.hook || 'before_request').trim() || 'before_request'
        const cfg = inline
          ? { code, timeout_ms: Number(st.config?.timeout_ms) || 800, ...stepContextMergePayload(st) }
          : { app_id: appId || null, hook, ...stepContextMergePayload(st) }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'app_script',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'connector_script') {
        const code = (st.config?.code || '').trim()
        if (forSave && !code) {
          return { error: '「连接器脚本」步骤需填写脚本代码' }
        }
        const cfg = { code, timeout_ms: Number(st.config?.timeout_ms) || 800, ...stepContextMergePayload(st) }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'connector_script',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'data_interface') {
        const ifaceId = st.config?.interface_id ? Number(st.config.interface_id) : 0
        if (forSave && !ifaceId) {
          return { error: '「数据接口」步骤需选择数据接口' }
        }
        const mappings = (st.config?.param_mappings || []).filter((m) => m.param?.trim())
        const cfg = {
          ...stepContextMergePayload(st),
          data_interface: {
            interface_id: ifaceId || null,
            param_mappings: mappings,
            pre_script: (st.config?.pre_script || '').trim(),
            merge_result_to_context: !!st.config?.merge_result_to_context
          }
        }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'data_interface',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'view_url') {
        const url = (st.config && st.config.url) || ''
        if (forSave && !url.trim()) {
          return { error: '「打开网页」步骤需填写 URL' }
        }
        // 接口模式下需要配置目标设备
        if (forSave && form.interface_mode) {
          const mode = st.config?.target_device_mode || 'specific'
          if (mode === 'specific' && (!st.config?.target_device_ids || !st.config.target_device_ids.length)) {
            return { error: '接口模式下「打开网页」步骤需选择至少一个目标设备' }
          }
          if (mode === 'filter' && !st.config?.device_filter_serial && !st.config?.device_filter_name && !st.config?.device_filter_alias) {
            return { error: '接口模式下「打开网页」步骤需配置至少一个设备筛选条件' }
          }
          if (mode === 'placeholder' && !st.config?.device_placeholder?.trim()) {
            return { error: '接口模式下「打开网页」步骤需填写设备占位符' }
          }
        }
        const cfg = {
          url: url.trim(),
          target_device_mode: st.config?.target_device_mode || null,
          target_device_ids: st.config?.target_device_ids || [],
          device_filter_serial: st.config?.device_filter_serial || '',
          device_filter_name: st.config?.device_filter_name || '',
          device_filter_alias: st.config?.device_filter_alias || '',
          device_placeholder: st.config?.device_placeholder || '',
          ...stepContextMergePayload(st)
        }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'view_url',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'message') {
        const body = ((st.config && st.config.body) || '').trim()
        if (forSave && !body) {
          return { error: '「消息提醒」步骤需填写正文' }
        }
        // 接口模式下需要配置目标设备
        if (forSave && form.interface_mode) {
          const mode = st.config?.target_device_mode || 'specific'
          if (mode === 'specific' && (!st.config?.target_device_ids || !st.config.target_device_ids.length)) {
            return { error: '接口模式下「消息提醒」步骤需选择至少一个目标设备' }
          }
          if (mode === 'filter' && !st.config?.device_filter_serial && !st.config?.device_filter_name && !st.config?.device_filter_alias) {
            return { error: '接口模式下「消息提醒」步骤需配置至少一个设备筛选条件' }
          }
          if (mode === 'placeholder' && !st.config?.device_placeholder?.trim()) {
            return { error: '接口模式下「消息提醒」步骤需填写设备占位符' }
          }
        }
        const cfg = {
          title: ((st.config && st.config.title) || '').trim(),
          body: body || '',
          duration_ms: st.config?.duration_ms != null ? Number(st.config.duration_ms) : 8000,
          target_device_mode: st.config?.target_device_mode || null,
          target_device_ids: st.config?.target_device_ids || [],
          device_filter_serial: st.config?.device_filter_serial || '',
          device_filter_name: st.config?.device_filter_name || '',
          device_filter_alias: st.config?.device_filter_alias || '',
          device_placeholder: st.config?.device_placeholder || '',
          ...stepContextMergePayload(st)
        }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'message',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'keyboard_hid') {
        const method = (st.config?.input_method || 'text').trim() || 'text'
        const text = (st.config?.text || '').trim()
        const keys = Array.isArray(st.config?.keys) ? st.config.keys.filter(k => String(k).trim()) : []
        if (forSave) {
          if ((method === 'text' || method === 'mixed') && !text && !keys.length) {
            return { error: '「键盘输入」步骤的文本与按键不能同时为空' }
          }
          if (method === 'keys' && !keys.length) {
            return { error: '「键盘输入」按键序列模式下需至少选择一个按键' }
          }
        }
        let delayMs = st.config?.delay_ms != null ? Number(st.config.delay_ms) : 50
        if (!Number.isFinite(delayMs) || delayMs < 0) delayMs = 50
        if (delayMs > 5000) delayMs = 5000
        const cfg = {
          input_method: method,
          text: st.config?.text || '',
          keys,
          delay_ms: delayMs,
          target_app: (st.config?.target_app || '').trim(),
          ...stepContextMergePayload(st)
        }
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'keyboard_hid',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else if (typ === 'print') {
        let content = []
        const rawContent = (st.config?._content_json || '').trim()
        if (rawContent) {
          try {
            content = JSON.parse(rawContent)
            if (!Array.isArray(content)) return { error: '「蓝牙打印」内容须为 JSON 数组' }
          } catch {
            return { error: '「蓝牙打印」内容须为合法 JSON 数组' }
          }
        }
        if (forSave && !content.length) {
          return { error: '「蓝牙打印」步骤需配置至少一条打印内容' }
        }
        const cfg = {
          protocol: st.config?.protocol || 'escpos',
          transport: st.config?.transport || 'spp',
          gen_side: st.config?.gen_side || 'agent',
          content,
          ...stepContextMergePayload(st)
        }
        const mac = (st.config?.mac || '').trim()
        if (mac) cfg.mac = mac
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'print',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      } else {
        const action = (st._action || '').trim()
        if (forSave && !action) {
          return { error: '「广播 Intent」步骤需填写 action' }
        }
        // 接口模式下需要配置目标设备
        if (forSave && form.interface_mode) {
          const mode = st.config?.target_device_mode || 'specific'
          if (mode === 'specific' && (!st.config?.target_device_ids || !st.config.target_device_ids.length)) {
            return { error: '接口模式下「广播 Intent」步骤需选择至少一个目标设备' }
          }
          if (mode === 'filter' && !st.config?.device_filter_serial && !st.config?.device_filter_name && !st.config?.device_filter_alias) {
            return { error: '接口模式下「广播 Intent」步骤需配置至少一个设备筛选条件' }
          }
          if (mode === 'placeholder' && !st.config?.device_placeholder?.trim()) {
            return { error: '接口模式下「广播 Intent」步骤需填写设备占位符' }
          }
        }
        ensureBroadcastExtrasRows(st)
        if (st._extrasAdvanced) syncExtrasRowsFromJson(st)
        syncExtrasJsonFromRows(st)
        let extras = rowsToExtrasObject(st._extrasRows)
        if (st._extrasAdvanced) {
          try {
            extras = JSON.parse(st._extrasJson || '{}')
            if (typeof extras !== 'object' || extras === null || Array.isArray(extras)) {
              return { error: '广播步骤 extras 须为合法 JSON 对象' }
            }
          } catch {
            return { error: '广播步骤 extras 须为合法 JSON 对象' }
          }
        }
        if (forSave && !Object.keys(extras).length) {
          return { error: '「广播 Intent」请至少配置一个模拟数据标签（extras 键值）' }
        }
        const cfg = {
          action: action || '',
          extras: extras || {},
          target_device_mode: st.config?.target_device_mode || null,
          target_device_ids: st.config?.target_device_ids || [],
          device_filter_serial: st.config?.device_filter_serial || '',
          device_filter_name: st.config?.device_filter_name || '',
          device_filter_alias: st.config?.device_filter_alias || '',
          device_placeholder: st.config?.device_placeholder || '',
          ...stepContextMergePayload(st)
        }
        const pkg = (st._pkg || '').trim()
        if (pkg) cfg.package = pkg
        if (!attachStepTemplateParamsToConfig(st, cfg)) return { error: '__handled' }
        steps.push({
          step_type: 'broadcast_intent',
          config: cfg,
          delay_before_ms: st.delay_before_ms ?? 0,
          delay_after_ms: st.delay_after_ms ?? 0
        })
      }
    }
    phases.push({
      run_mode: ph.run_mode || 'parallel',
      steps,
      default_params: defaultParams
    })
  }
  return { phases }
}

async function openPhaseTest(pi) {
  const built = buildPhasesArray({ forSave: false })
  if (built.error) {
    if (built.error !== '__handled') ElMessage.warning(built.error)
    return
  }
  phaseTestDlg.phaseIndex = pi
  phaseTestDlg.loading = true
  phaseTestDlg.visible = true
  phaseTestDlg.innerTab = 'steps'
  phaseTestDlg.note = ''
  phaseTestDlg.stepResults = []
  phaseTestDlg.contextAfter = []
  phaseTestDlg.contextBefore = []
  phaseTestDlg.contextAddedKeys = []
  phaseTestDlg.beforeFull = null
  phaseTestDlg.afterFull = null

  // 准备 overrides：接口模式下从 input_params_json 提取示例参数作为初始 context
  const overrides = {}
  if (form.interface_mode && form.input_params_json) {
    try {
      const schema = JSON.parse(form.input_params_json)
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
          let exampleValue = ''
          if (prop.examples && prop.examples.length > 0) {
            exampleValue = prop.examples[0]
          } else if (prop.default !== undefined) {
            exampleValue = prop.default
          } else if (prop.type === 'string') {
            exampleValue = `示例_${key}`
          } else if (prop.type === 'number' || prop.type === 'integer') {
            exampleValue = 123
          } else if (prop.type === 'boolean') {
            exampleValue = true
          }
          // 同时支持 {{param}} 和 {{context.param}}
          overrides[`{{${key}}}`] = String(exampleValue)
          overrides[`{{context.${key}}}`] = String(exampleValue)
        }
      }
      // 添加 HTTP 和系统变量
      overrides['{{http.method}}'] = 'POST'
      overrides['{{http.path}}'] = `/api/outbound/connector-interfaces/${form.interface_code || 'test'}/invoke`
      overrides['{{http.query}}'] = ''
      overrides['{{timestamp}}'] = String(Math.floor(Date.now() / 1000))
      overrides['{{timestamp_ms}}'] = String(Date.now())
    } catch (e) {
      console.warn('Failed to parse input_params_json:', e)
    }
  }

  try {
    const r = await ob.postOutboundPhasePreview({
      phase_index: pi,
      phases: built.phases,
      overrides: overrides,
      connector_id: Number(numericConnectorId.value) || 0,
      execute_live_http: true
    })
    const d = r.data || {}
    phaseTestDlg.note = d.note || ''
    phaseTestDlg.stepResults = Array.isArray(d.step_results) ? d.step_results : []
    phaseTestDlg.contextAfter = Array.isArray(d.context_after) ? d.context_after : []
    phaseTestDlg.contextBefore = Array.isArray(d.context_before) ? d.context_before : []
    phaseTestDlg.contextAddedKeys = Array.isArray(d.context_added_keys) ? d.context_added_keys : []
    phaseTestDlg.beforeFull = d.execution_template_before_phase ?? null
    phaseTestDlg.afterFull = d.execution_template_after_phase ?? null
  } catch {
    phaseTestDlg.visible = false
  } finally {
    phaseTestDlg.loading = false
  }
}

async function saveConn() {
  const built = buildPhasesArray({ forSave: true })
  if (built.error) {
    if (built.error !== '__handled') {
      if (built.error.includes('须为') || built.error.includes('extras')) {
        ElMessage.error(built.error)
      } else {
        ElMessage.warning(built.error)
      }
    }
    return
  }
  const phases = built.phases
  const body = {
    name: form.name,
    description: form.description,
    connector_code: form.connector_code,
    default_timeout_ms: form.default_timeout_ms,
    default_retry_max: form.default_retry_max,
    debounce_same_event_ms: form.debounce_same_event_ms ?? 0,
    debounce_diff_event_ms: form.debounce_diff_event_ms ?? 0,
    debounce_same_scan_ms: form.debounce_same_scan_ms ?? 0,
    loop_cooldown_ms: form.loop_cooldown_ms ?? 0,
    priority: form.priority,
    enabled: form.enabled,
    trigger_type: form.trigger_type || 'device_event',
    webhook_id: form.trigger_type === 'http_webhook' ? (form.webhook_id || 0) : 0,
    trigger_config: form.trigger_config || {},
    definition_ids: form.definition_ids,
    device_ids: form.device_ids,
    phases,
    // 接口模式字段
    interface_mode: form.interface_mode || false,
    interface_code: form.interface_mode ? (form.interface_code || '') : '',
    input_params_json: form.interface_mode ? (form.input_params_json || '') : '',
    output_schema_json: form.interface_mode ? (form.output_schema_json || '') : '',
    output_mappings_json: form.interface_mode && form.output_mappings.length > 0
      ? JSON.stringify(form.output_mappings)
      : '',
    custom_script: form.custom_script || { result: { enabled: false, code: '', timeout_ms: 800 } }
  }
  saving.value = true
  try {
    if (numericConnectorId.value) {
      await ob.updateOutboundConnector(numericConnectorId.value, body)
      ElMessage.success('已保存')
      await loadConnectorFromServer()
    } else {
      const r = await ob.createOutboundConnector(body)
      const newId = r.data?.id
      if (newId) {
        ElMessage.success('已创建')
        await router.replace(`/outbound/connectors/${newId}`)
      } else {
        ElMessage.success('已创建')
        router.push('/outbound')
      }
    }
  } finally {
    saving.value = false
  }
}

function stopTraceStomp() {
  traceStompCtl?.stop()
  traceStompCtl = null
}

function restartTraceStomp() {
  stopTraceStomp()
  if (mainTab.value !== 'debug' || debugInnerTab.value !== 'stats' || !numericConnectorId.value || !traceData.value) {
    return
  }
  const cid = numericConnectorId.value
  traceStompCtl = createOutboundConnectorTraceStomp(
    cid,
    () => auth.token,
    (tick) => {
      if (!traceData.value?.node_stats) return
      if (!traceTickFiltersDevice(tick, traceDeviceId.value)) return
      traceData.value = {
        ...traceData.value,
        node_stats: mergeOutboundTraceNodeTick(traceData.value.node_stats, tick)
      }
    }
  )
  traceStompCtl.start()
}

async function loadTrace() {
  if (!numericConnectorId.value) return
  loadingTrace.value = true
  try {
    const params = {}
    if (traceDeviceId.value) params.device_id = traceDeviceId.value
    const r = await ob.getConnectorExecutionTrace(numericConnectorId.value, params)
    traceData.value = { connector: r.connector || {}, node_stats: r.node_stats || [] }
  } finally {
    loadingTrace.value = false
  }
  restartTraceStomp()
}

watch(
  () => [mainTab.value, debugInnerTab.value, numericConnectorId.value, traceDeviceId.value],
  async () => {
    stopTraceStomp()
    if (mainTab.value === 'debug' && debugInnerTab.value === 'stats' && numericConnectorId.value) {
      await loadTrace()
    }
  }
)

watch(
  () => route.params.id,
  async () => {
    traceData.value = null
    debugContext.value = null
    debugDeliveries.value = []
    selectedDeliveryId.value = null
    if (isNew.value) {
      resetFormNew()
    } else {
      await loadConnectorFromServer()
    }
    if (mainTab.value === 'debug' && !isNew.value) {
      loadDebugDeliveries()
    }
  }
)

watch(mainTab, (t) => {
  if (t === 'debug' && numericConnectorId.value) {
    loadDebugDeliveries()
  }
})

watch(
  () => form.webhook_id,
  (newId, oldId) => {
    if (form.trigger_type !== 'http_webhook') return
    // Clear match_values only when user actively switches between two real webhooks
    if (newId !== oldId && oldId && newId) {
      if (form.trigger_config) form.trigger_config.match_values = []
    }
    loadWebhookSchemaContext()
  }
)

watch(
  () => form.trigger_config?.match_values,
  () => {
    if (form.trigger_type === 'http_webhook') loadWebhookSchemaContext()
  },
  { deep: true }
)

onMounted(async () => {
  if (!form.phases.length) form.phases.push(defaultConnPhase())
  await Promise.all([loadApps(), loadWebhooks(), loadDefinitions(), loadDevices(), loadAllEndpoints(), loadDataInterfaces(), loadTemplateDemo()])
  if (!isNew.value) await loadConnectorFromServer()
  else resetFormNew()
})

onUnmounted(() => {
  stopTraceStomp()
})
</script>

<style scoped>
.conn-edit-page {
  padding: 0 4px 24px;
}
.page-head {
  margin-bottom: 12px;
}
.title {
  margin: 8px 0 0;
  font-size: 20px;
  font-weight: 600;
}
.top-alert {
  margin-bottom: 16px;
}
.conn-form {
  max-width: 960px;
}
.toolbar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.step-app-script-hint {
  margin-left: 8px;
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}
.phases-wrap {
  width: 100%;
}
.phase-block {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fafafa;
}
.phase-hdr {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  font-weight: 500;
}
.phase-params-block {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.phase-params-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}
.phase-params-desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
}
.phase-params-desc code {
  font-size: 11px;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.step-block {
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #e2e8f0;
}
.step-block:last-of-type {
  border-bottom: none;
}
.step-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.step-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-left: 2px;
  margin-bottom: 4px;
}
.step-cx-wrap {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.step-cx-block {
  padding-bottom: 10px;
  border-bottom: 1px dashed #e2e8f0;
}
.step-cx-block:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.step-cx-block--muted {
  opacity: 0.92;
}
.step-cx-title {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 6px;
}
.step-cx-desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.55;
}
.step-cx-desc code {
  font-size: 11px;
  background: #fff;
  padding: 0 4px;
  border-radius: 3px;
  border: 1px solid #e2e8f0;
}
.step-delays {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 4px 8px;
  background: #f1f5f9;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}
.delay-lbl {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
}
.trace-stomp-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.graph-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0 0 10px;
  line-height: 1.5;
}
.demo-collapse {
  margin-bottom: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}
.demo-lead {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}
.demo-lead code {
  font-size: 12px;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.demo-body {
  min-height: 80px;
}
.template-test-input,
.template-test-result-wrap {
  width: 100%;
  max-width: 960px;
}
.phase-test-dlg .phase-test-tab-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
.phase-test-dlg .phase-test-tab-hint code {
  font-size: 11px;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.phase-test-added {
  margin-top: 12px;
  font-size: 12px;
  color: #475569;
}
.phase-test-added-lbl {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
}
.phase-test-tag {
  margin: 0 6px 6px 0;
}
.phase-test-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #475569;
}
.demo-h4 {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}
.demo-h4:first-of-type {
  margin-top: 8px;
}
.demo-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
}
.demo-table {
  width: 100%;
}
.demo-expanded :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.debug-inner {
  margin-top: 4px;
}
.debug-flow-intro {
  margin: 0 0 12px;
  font-size: 13px;
  color: #475569;
  line-height: 1.55;
}
.run-mode-doc-collapse {
  margin-bottom: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}
.run-mode-doc-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 13px;
  color: #475569;
  line-height: 1.65;
}
.run-mode-doc-list li {
  margin-bottom: 8px;
}
.event-chain-bar {
  margin-bottom: 14px;
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}
.event-chain-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.event-chain-title {
  font-weight: 600;
  font-size: 13px;
  color: #334155;
}
.event-chain-sub {
  font-size: 12px;
  color: #64748b;
  flex: 1 1 200px;
  line-height: 1.45;
}
.event-chain-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.event-chain-status {
  margin-left: 6px;
  vertical-align: middle;
}
.ctx-step--phase-meta {
  background: #f8fafc;
  border-radius: 8px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
}
.ctx-step-desc-tight {
  margin-top: 8px;
}
.ctx-split {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.ctx-left {
  flex: 0 0 440px;
  min-width: 260px;
}
.ctx-right {
  flex: 1;
  min-width: 280px;
}
.ctx-step {
  margin-bottom: 18px;
}
.ctx-step-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #334155;
  font-size: 14px;
}
.ctx-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}
.ctx-hint code {
  font-size: 11px;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 4px;
}
.ctx-pre {
  margin: 0;
  padding: 10px 12px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  overflow: auto;
  max-height: 240px;
}
.ctx-pre.sm {
  max-height: 180px;
}
.ctx-phase {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.ctx-phase--hi {
  border-color: #409eff;
  background: #ecf5ff;
}
.ctx-phase-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.ctx-phase-meta {
  font-size: 12px;
  color: #64748b;
}
.ctx-step-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: #475569;
}
.ctx-step-li {
  margin-bottom: 6px;
}
.ctx-step-li--hi {
  font-weight: 600;
  color: #409eff;
}
.ctx-step-idx {
  margin-right: 6px;
  color: #94a3b8;
}
.param-mapping-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.broadcast-extras-summary {
  font-size: 12px;
  color: #64748b;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.broadcast-extras-json :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.trigger-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}
.trigger-status.running { background: #e6f4ea; color: #2e7d32; }
.trigger-status.stopped { background: #f5f5f5; color: #888; }
.trigger-status.error { background: #fdecea; color: #b71c1c; }
</style>
