<template>
  <div>
    <el-page-header content="工单工作流" @back="$router.push('/work-orders/settings')" style="margin-bottom:16px" />

    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" @click="openCreate">新建工作流</el-button>
        <el-button @click="$router.push('/work-orders/workflow-logs')">查看执行日志</el-button>
      </div>

      <el-table :data="workflows" stripe :row-key="row => row.id">
        <el-table-column label="ID" prop="id" width="60" />
        <el-table-column label="名称" prop="name" min-width="150" />
        <el-table-column label="工单类型">
          <template #default="{row}">
            {{ row.type_code || '全局（所有类型）' }}
          </template>
        </el-table-column>
        <el-table-column label="监听事件" min-width="200">
          <template #default="{row}">
            <span v-if="!row.events || getRowEvents(row).length === 0">全部事件</span>
            <el-tag v-else v-for="e in getRowEvents(row)" :key="e" size="small" style="margin-right:4px">
              {{ eventLabel(e) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="动作数">
          <template #default="{row}">{{ getRowActionsCount(row) }}</template>
        </el-table-column>
        <el-table-column label="启用">
          <template #default="{row}">
            <el-switch v-model="row.enabled" @change="toggleEnabled(row)" />
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sort_order" width="80" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{row}">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="primary" size="small" @click="copyWorkflow(row)">复制</el-button>
            <el-button text type="primary" size="small" @click="openTest(row)">测试</el-button>
            <el-button text type="danger" size="small" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialog" :title="form.id ? '编辑工作流' : '新建工作流'" width="800px" @opened="onDialogOpened" @closed="onDialogClosed">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="工作流名称" />
        </el-form-item>
        <el-form-item label="工单类型">
          <el-select v-model="form.type_code" placeholder="留空表示全局（所有类型）" clearable style="width:100%">
            <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="监听事件">
          <el-select v-model="eventList" multiple placeholder="留空监听所有事件" style="width:100%">
            <el-option v-for="e in availableEvents" :key="e.value" :label="e.label" :value="e.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-divider />

        <!-- Context Variables Section -->
        <div class="section-title">
          上下文变量（Context）
          <el-tooltip content="定义可在所有动作中引用的变量，格式：{{ctx.变量名}}">
            <el-icon style="margin-left:4px"><QuestionFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="context-section">
          <div v-if="contextVars.length === 0" class="empty-hint">
            暂无上下文变量，可在动作配置中定义
          </div>
          <el-tag
            v-for="(ctx, idx) in contextVars"
            :key="idx"
            closable
            @close="removeContextVar(idx)"
            style="margin-right:8px;margin-bottom:8px"
          >
            {{ctx.name}}: {{ctx.defaultValue || '(无默认值)'}}
          </el-tag>
          <el-button text type="primary" size="small" @click="openContextDialog">
            <el-icon><Plus /></el-icon> 添加变量
          </el-button>
        </div>

        <el-divider />
        <div class="section-title">
          动作配置
          <el-button text type="primary" size="small" @click="addAction">添加动作</el-button>
        </div>
        <div v-for="(action, idx) in actions" :key="idx" class="action-item">
          <div class="action-head" @click="toggleActionCollapse(idx)" :style="action.enabled === false ? 'opacity:0.55' : ''">
            <div class="action-head-left">
              <el-icon class="collapse-icon" :class="{ collapsed: action.collapsed }">
                <ArrowDown />
              </el-icon>
              <span>动作 {{ idx + 1 }}</span>
              <el-tag v-if="action.type" size="small" style="margin-left:8px">{{ actionTypeLabel(action.type) }}</el-tag>
              <el-tag v-if="action.enabled === false" type="info" size="small" style="margin-left:6px">已停用</el-tag>
              <span v-if="action.collapsed && action.condition" class="condition-preview">
                <el-icon style="margin-left:8px;margin-right:4px"><Filter /></el-icon>
                <code>{{ action.condition }}</code>
              </span>
            </div>
            <div @click.stop class="action-head-buttons">
              <el-switch
                v-model="action.enabled"
                size="small"
                style="margin-right:8px"
                :active-value="true"
                :inactive-value="false"
                title="启用 / 停用此动作"
              />
              <el-button text type="primary" size="small" @click="insertAction(idx, 'before')">
                <el-icon><Top /></el-icon> 向前添加
              </el-button>
              <el-button text type="primary" size="small" @click="insertAction(idx, 'after')">
                <el-icon><Bottom /></el-icon> 向后添加
              </el-button>
              <el-button text type="primary" size="small" @click="moveAction(idx, -1)" :disabled="idx === 0">
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button text type="primary" size="small" @click="moveAction(idx, 1)" :disabled="idx === actions.length - 1">
                <el-icon><ArrowDown /></el-icon>
              </el-button>
              <el-button text type="danger" size="small" @click="removeAction(idx)">删除</el-button>
            </div>
          </div>
          <div v-show="!action.collapsed" class="action-content">
          <el-form-item label="动作类型">
            <el-select v-model="action.type" placeholder="选择动作类型" style="width:100%" @change="onActionTypeChange(idx)">
              <el-option label="调用第三方接口" value="call_endpoint" />
              <el-option label="调用连接器" value="call_connector" />
              <el-option label="调用数据接口" value="call_data_interface" />
              <el-option label="执行 JavaScript" value="execute_js" />
              <el-option label="更新工单" value="update_work_order" />
              <el-option label="创建工单" value="create_work_order" />
              <el-option label="查询工单" value="query_work_orders" />
            </el-select>
          </el-form-item>

          <el-form-item label="执行条件">
            <el-input
              v-model="action.condition"
              placeholder="可选，如：{{ctx.count}} > 0 或 {{workOrder.status}} == 'pending'"
              clearable
            >
              <template #prepend>
                <el-tooltip content="条件为空或为 true 时执行此动作，支持 JavaScript 表达式和模板变量">
                  <el-icon><QuestionFilled /></el-icon>
                </el-tooltip>
              </template>
              <template #append>
                <el-dropdown @command="cmd => insertConditionTemplate(idx, cmd)" trigger="click">
                  <el-button>
                    <el-icon><More /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item disabled>常用条件</el-dropdown-item>
                      <el-dropdown-item command="{{workOrder.status}} == 'open'">状态为 open</el-dropdown-item>
                      <el-dropdown-item command="{{workOrder.priority}} == 'high'">优先级为 high</el-dropdown-item>
                      <el-dropdown-item command="{{ctx.count}} > 0">ctx.count 大于 0</el-dropdown-item>
                      <el-dropdown-item command="{{ctx.enabled}} == true">ctx.enabled 为 true</el-dropdown-item>
                      <el-dropdown-item divided disabled v-if="contextVars.length > 0">上下文变量</el-dropdown-item>
                      <el-dropdown-item
                        v-for="ctx in contextVars"
                        :key="ctx.name"
                        :command="ctxTemplate(ctx.name)"
                      >
                        {{ ctxTemplateLabel(ctx) }}
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-input>
            <div class="hint">
              示例：
              <code>{{'{{'}}ctx.count}} &gt; 0</code>、
              <code>{{'{{'}}workOrder.status}} == &quot;pending&quot;</code>、
              <code>{{'{{'}}ctx.enabled}} == true &amp;&amp; {{'{{'}}workOrder.priority}} == &quot;high&quot;</code>
            </div>
          </el-form-item>

          <!-- Visual builder for call_endpoint -->
          <template v-if="action.type === 'call_endpoint'">
            <el-tabs v-model="action.activeTab" type="card" style="margin-top: 12px;">
              <el-tab-pane label="可视化配置" name="visual">
                <el-form-item label="选择第三方接口">
                  <el-select
                    v-model="action.builder.endpointId"
                    placeholder="选择第三方接口"
                    style="width:100%"
                    filterable
                    @change="onEndpointSelected(idx)"
                  >
                    <el-option
                      v-for="endpoint in outboundEndpoints"
                      :key="endpoint.id"
                      :label="`${endpoint.name}`"
                      :value="endpoint.id"
                    />
                  </el-select>
                </el-form-item>

                <el-form-item v-if="action.builder.endpointId" label="参数映射">
                  <div class="param-mapping">
                    <div v-if="action.builder.paramList === null" class="no-params">
                      <el-icon class="is-loading"><Loading /></el-icon> 加载参数中...
                    </div>
                    <div v-else-if="!action.builder.paramList || action.builder.paramList.length === 0" class="no-params">
                      该接口无需参数
                    </div>
                    <div v-else>
                      <div v-for="param in action.builder.paramList" :key="param.name" class="param-row">
                        <div class="param-label">
                          <span class="param-name">{{ param.name }}</span>
                          <el-tag v-if="param.required" type="danger" size="small">必填</el-tag>
                          <span class="param-type">{{ param.type || 'string' }}</span>
                          <span v-if="param.description" class="param-desc">{{ param.description }}</span>
                        </div>
                        <el-input
                          v-model="action.builder.params[param.name]"
                          placeholder="输入值或模板变量 {{field}}"
                          @input="updateEndpointBuilderJSON(idx)"
                        >
                          <template #append>
                            <el-dropdown @command="cmd => insertTemplate(idx, param.name, cmd)" trigger="click">
                              <el-button>
                                <el-icon><More /></el-icon>
                              </el-button>
                              <template #dropdown>
                                <el-dropdown-menu>
                                  <el-dropdown-item disabled>工单字段</el-dropdown-item>
                                  <el-dropdown-item command="{{code}}">{{code}} - 工单编号</el-dropdown-item>
                                  <el-dropdown-item command="{{title}}">{{title}} - 工单标题</el-dropdown-item>
                                  <el-dropdown-item command="{{description}}">{{description}} - 工单描述</el-dropdown-item>
                                  <el-dropdown-item command="{{device_id}}">{{device_id}} - 设备ID</el-dropdown-item>
                                  <el-dropdown-item command="{{status}}">{{status}} - 工单状态</el-dropdown-item>
                                  <el-dropdown-item command="{{priority}}">{{priority}} - 优先级</el-dropdown-item>
                                  <el-dropdown-item command="{{assignee_id}}">{{assignee_id}} - 指派人ID</el-dropdown-item>
                                  <el-dropdown-item command="{{business_no}}">{{business_no}} - 业务编码</el-dropdown-item>
                                  <el-dropdown-item command="{{other_codes}}">{{other_codes}} - 其他编码</el-dropdown-item>
                                  <el-dropdown-item divided disabled v-if="contextVars.length > 0">上下文变量</el-dropdown-item>
                                  <el-dropdown-item
                                    v-for="ctx in contextVars"
                                    :key="ctx.name"
                                    :command="ctxTemplate(ctx.name)"
                                  >
                                    {{ ctxTemplateLabel(ctx) }}
                                  </el-dropdown-item>
                                  <el-dropdown-item divided disabled v-if="idx > 0">前序动作结果</el-dropdown-item>
                                  <el-dropdown-item
                                    v-for="prevIdx in idx"
                                    :key="prevIdx"
                                    :command="actionResultTemplate(prevIdx)"
                                  >
                                    {{ actionResultLabel(prevIdx) }}
                                  </el-dropdown-item>
                                </el-dropdown-menu>
                              </template>
                            </el-dropdown>
                          </template>
                        </el-input>
                      </div>
                    </div>
                  </div>
                </el-form-item>

                <!-- Context variable to store result -->
                <el-form-item label="结果保存到上下文">
                  <el-input
                    v-model="action.builder.saveToContext"
                    placeholder="变量名，如：api_response"
                    @input="updateEndpointBuilderJSON(idx)"
                  >
                    <template #prepend>ctx.</template>
                  </el-input>
                  <div class="hint">可选，将接口响应保存到上下文变量中供后续动作使用</div>
                </el-form-item>
              </el-tab-pane>

              <el-tab-pane label="JSON 配置" name="json">
                <el-form-item label="配置（JSON）" style="margin-top: 8px;">
                  <el-input v-model="action.configJSON" type="textarea" :rows="10" placeholder="动作配置（JSON 对象）" />
                  <div class="hint" style="margin-top: 8px;">
                    格式：{"endpoint_id": 1, "params": {"key": "{{code}}"}, "save_to_context": "变量名"}
                  </div>
                </el-form-item>
              </el-tab-pane>
            </el-tabs>
          </template>

          <!-- Visual builder for call_data_interface -->
          <template v-if="action.type === 'call_data_interface' && action.useBuilder">
            <el-form-item label="选择数据接口">
              <el-select
                v-model="action.builder.interfaceId"
                placeholder="选择数据接口"
                style="width:100%"
                filterable
                @change="onInterfaceSelected(idx)"
              >
                <el-option
                  v-for="iface in dataInterfaces"
                  :key="iface.id"
                  :label="`${iface.name} (${iface.code})`"
                  :value="iface.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item v-if="action.builder.interfaceId" label="参数映射">
              <div class="param-mapping">
                <div v-if="action.builder.paramList === null" class="no-params">
                  <el-icon class="is-loading"><Loading /></el-icon> 加载参数中...
                </div>
                <div v-else-if="!action.builder.paramList || action.builder.paramList.length === 0" class="no-params">
                  该接口无需参数
                </div>
                <div v-else>
                  <div v-for="param in action.builder.paramList" :key="param.name" class="param-row">
                    <div class="param-label">
                      <span class="param-name">{{ param.name }}</span>
                      <el-tag v-if="param.required" type="danger" size="small">必填</el-tag>
                      <span class="param-type">{{ param.type || 'string' }}</span>
                      <span v-if="param.description" class="param-desc">{{ param.description }}</span>
                    </div>
                    <el-input
                      v-if="!param.enum || param.enum.length === 0"
                      v-model="action.builder.params[param.name]"
                      placeholder="输入值或模板变量 {{field}}"
                      @input="updateBuilderJSON(idx)"
                    >
                      <template #append>
                        <el-dropdown @command="cmd => insertTemplate(idx, param.name, cmd)">
                          <el-button>
                            <el-icon><More /></el-icon>
                          </el-button>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item command="{{code}}">{{code}}</el-dropdown-item>
                              <el-dropdown-item command="{{title}}">{{title}}</el-dropdown-item>
                              <el-dropdown-item command="{{description}}">{{description}}</el-dropdown-item>
                              <el-dropdown-item command="{{device_id}}">{{device_id}}</el-dropdown-item>
                              <el-dropdown-item command="{{status}}">{{status}}</el-dropdown-item>
                              <el-dropdown-item command="{{priority}}">{{priority}}</el-dropdown-item>
                              <el-dropdown-item command="{{assignee_id}}">{{assignee_id}}</el-dropdown-item>
                              <el-dropdown-item command="{{other_codes}}">{{other_codes}}</el-dropdown-item>
                              <el-dropdown-item command="{{created_at}}">{{created_at}}</el-dropdown-item>
                              <el-dropdown-item command="{{updated_at}}">{{updated_at}}</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                      </template>
                    </el-input>
                    <el-select
                      v-else
                      v-model="action.builder.params[param.name]"
                      placeholder="选择枚举值"
                      clearable
                      @change="updateBuilderJSON(idx)"
                    >
                      <el-option v-for="opt in param.enum" :key="opt" :label="opt" :value="opt" />
                    </el-select>
                  </div>
                </div>
              </div>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
              <div class="hint">自动从上方配置生成，也可切换到手动模式直接编辑 JSON</div>
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Visual builder for execute_js -->
          <template v-if="action.type === 'execute_js' && action.useBuilder">
            <el-form-item label="JavaScript 代码">
              <div class="monaco-editor-wrapper">
                <div :id="`monaco-editor-${idx}`" class="monaco-container"></div>
              </div>
              <div class="hint">
                可用变量：workOrder（工单对象）、ctx（上下文）、actions（前序动作结果数组）
              </div>
            </el-form-item>

            <el-form-item label="可用字段参考">
              <el-collapse>
                <el-collapse-item title="工单字段 (workOrder)" name="1">
                  <div class="code-hint">
                    <div>workOrder.code - 工单编号</div>
                    <div>workOrder.title - 标题</div>
                    <div>workOrder.description - 描述</div>
                    <div>workOrder.device_id - 设备ID</div>
                    <div>workOrder.status - 状态</div>
                    <div>workOrder.priority - 优先级</div>
                    <div>workOrder.assignee_id - 指派人</div>
                    <div>workOrder.other_codes - 其他编码</div>
                  </div>
                </el-collapse-item>
                <el-collapse-item title="上下文变量 (ctx)" name="2" v-if="contextVars.length > 0">
                  <div class="code-hint">
                    <div v-for="ctx in contextVars" :key="ctx.name">
                      ctx.{{ ctx.name }} - {{ ctx.description || ctx.name }}
                    </div>
                  </div>
                </el-collapse-item>
                <el-collapse-item title="前序动作结果 (actions)" name="3" v-if="idx > 0">
                  <div class="code-hint">
                    <div v-for="prevIdx in idx" :key="prevIdx">
                      actions[{{ prevIdx }}].result - 动作{{ prevIdx + 1 }}的执行结果
                    </div>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Visual builder for update_work_order -->
          <template v-if="action.type === 'update_work_order' && action.useBuilder">
            <el-form-item label="更新目标">
              <el-radio-group v-model="action.builder.updateTarget" @change="updateWorkOrderBuilderJSON(idx)">
                <el-radio value="current">当前工单</el-radio>
                <el-radio value="specified">指定工单</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="工单 ID" v-if="action.builder.updateTarget === 'specified'">
              <el-input
                v-model="action.builder.workOrderId"
                placeholder="输入工单ID或模板变量"
                @input="updateWorkOrderBuilderJSON(idx)"
              >
                <template #append>
                  <el-dropdown @command="cmd => insertWorkOrderIdTemplate(idx, cmd)" trigger="click">
                    <el-button>
                      <el-icon><More /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item disabled>上下文变量</el-dropdown-item>
                        <el-dropdown-item
                          v-for="ctx in contextVars"
                          :key="ctx.name"
                          :command="ctxTemplate(ctx.name)"
                        >
                          {{ ctxTemplateLabel(ctx) }}
                        </el-dropdown-item>
                        <el-dropdown-item divided disabled v-if="idx > 0">前序动作结果</el-dropdown-item>
                        <el-dropdown-item
                          v-for="prevIdx in idx"
                          :key="prevIdx"
                          :command="actionResultTemplate(prevIdx)"
                        >
                          {{ actionResultLabel(prevIdx) }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item label="更新字段">
              <div class="update-fields">
                <div v-for="(field, fieldIdx) in action.builder.updateFields" :key="fieldIdx" class="field-row">
                  <el-select v-model="field.name" placeholder="选择字段" style="width:180px" @change="updateWorkOrderBuilderJSON(idx)">
                    <el-option label="标题 (title)" value="title" />
                    <el-option label="描述 (description)" value="description" />
                    <el-option label="状态 (status)" value="status" />
                    <el-option label="优先级 (priority)" value="priority" />
                    <el-option label="可见性 (visibility)" value="visibility" />
                    <el-option label="指派人 (assigned_to)" value="assigned_to" />
                    <el-option label="业务编号 (business_no)" value="business_no" />
                    <el-option label="外部参考号 (external_ref)" value="external_ref" />
                    <el-option label="其他编码 (other_codes)" value="other_codes" />
                    <el-option label="设备名称快照 (device_name_snap)" value="device_name_snap" />
                    <el-option label="服务端别名 (device_alias_server)" value="device_alias_server" />
                    <el-option label="Agent端别名 (device_alias_agent)" value="device_alias_agent" />
                    <el-option label="设备分组 (device_group)" value="device_group" />
                    <el-option label="类型化数据 (data_json)" value="data_json" />
                  </el-select>
                  <el-select v-model="field.mode" placeholder="模式" style="width:100px;margin-left:8px" @change="updateWorkOrderBuilderJSON(idx)">
                    <el-option label="替换" value="replace" />
                    <el-option label="追加" value="append" />
                  </el-select>
                  <el-input
                    v-if="field.mode === 'append'"
                    v-model="field.separator"
                    placeholder="分隔符"
                    style="width:80px;margin-left:8px"
                    @input="updateWorkOrderBuilderJSON(idx)"
                  />
                  <el-input
                    v-model="field.value"
                    placeholder="字段值或模板变量 {{field}}"
                    style="flex:1;margin-left:8px"
                    @input="updateWorkOrderBuilderJSON(idx)"
                  >
                    <template #append>
                      <el-dropdown @command="cmd => insertUpdateFieldTemplate(idx, fieldIdx, cmd)" trigger="click">
                        <el-button>
                          <el-icon><More /></el-icon>
                        </el-button>
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item disabled>工单字段</el-dropdown-item>
                            <el-dropdown-item command="{{code}}">{{code}} - 工单编号</el-dropdown-item>
                            <el-dropdown-item command="{{title}}">{{title}} - 标题</el-dropdown-item>
                            <el-dropdown-item command="{{description}}">{{description}} - 描述</el-dropdown-item>
                            <el-dropdown-item command="{{status}}">{{status}} - 状态</el-dropdown-item>
                            <el-dropdown-item command="{{priority}}">{{priority}} - 优先级</el-dropdown-item>
                            <el-dropdown-item command="{{device_id}}">{{device_id}} - 设备ID</el-dropdown-item>
                            <el-dropdown-item command="{{other_codes}}">{{other_codes}} - 其他编码</el-dropdown-item>
                            <el-dropdown-item divided disabled v-if="contextVars.length > 0">上下文变量</el-dropdown-item>
                            <el-dropdown-item
                              v-for="ctx in contextVars"
                              :key="ctx.name"
                              :command="ctxTemplate(ctx.name)"
                            >
                              {{ ctxTemplateLabel(ctx) }}
                            </el-dropdown-item>
                            <el-dropdown-item divided disabled v-if="idx > 0">前序动作结果</el-dropdown-item>
                            <el-dropdown-item
                              v-for="prevIdx in idx"
                              :key="prevIdx"
                              :command="actionResultTemplate(prevIdx)"
                            >
                              {{ actionResultLabel(prevIdx) }}
                            </el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </template>
                  </el-input>
                  <el-button
                    text
                    type="danger"
                    @click="removeUpdateField(idx, fieldIdx)"
                    style="margin-left:8px"
                  >
                    删除
                  </el-button>
                </div>
                <el-button text type="primary" size="small" @click="addUpdateField(idx)">
                  <el-icon><Plus /></el-icon> 添加字段
                </el-button>
              </div>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Visual builder for create_work_order -->
          <template v-if="action.type === 'create_work_order' && action.useBuilder">
            <el-form-item label="工单类型">
              <el-select v-model="action.builder.typeCode" placeholder="选择工单类型" clearable style="width:100%" @change="updateCreateWorkOrderBuilderJSON(idx)">
                <el-option v-for="t in types" :key="t.code" :label="t.name" :value="t.code" />
              </el-select>
            </el-form-item>

            <el-form-item label="工单字段">
              <div class="update-fields">
                <div v-for="(field, fieldIdx) in action.builder.createFields" :key="fieldIdx" class="field-row">
                  <el-select v-model="field.name" placeholder="选择字段" style="width:200px" @change="updateCreateWorkOrderBuilderJSON(idx)">
                    <el-option label="标题 (title)" value="title" />
                    <el-option label="描述 (description)" value="description" />
                    <el-option label="设备ID (device_id)" value="device_id" />
                    <el-option label="优先级 (priority)" value="priority" />
                    <el-option label="指派人 (assignee_id)" value="assignee_id" />
                  </el-select>
                  <el-input
                    v-model="field.value"
                    placeholder="字段值或模板变量"
                    style="flex:1;margin-left:8px"
                    @input="updateCreateWorkOrderBuilderJSON(idx)"
                  />
                  <el-button
                    text
                    type="danger"
                    @click="removeCreateField(idx, fieldIdx)"
                    style="margin-left:8px"
                  >
                    删除
                  </el-button>
                </div>
                <el-button text type="primary" size="small" @click="addCreateField(idx)">
                  <el-icon><Plus /></el-icon> 添加字段
                </el-button>
              </div>
            </el-form-item>

            <el-form-item label="结果保存到上下文">
              <el-input
                v-model="action.builder.saveToContext"
                placeholder="变量名，如：new_work_order_id"
                @input="updateCreateWorkOrderBuilderJSON(idx)"
              >
                <template #prepend>ctx.</template>
              </el-input>
              <div class="hint">可选，将创建的工单ID保存到上下文变量</div>
            </el-form-item>

            <el-form-item label="生成的配置">
              <el-input v-model="action.configJSON" type="textarea" :rows="4" readonly />
            </el-form-item>

            <el-form-item>
              <el-button text type="primary" size="small" @click="action.useBuilder = false">
                切换到手动 JSON 模式
              </el-button>
            </el-form-item>
          </template>

          <!-- Fallback JSON editor -->
          <el-form-item v-else label="配置（JSON）">
            <el-input v-model="action.configJSON" type="textarea" :rows="6" placeholder="动作配置（JSON 对象）" />
            <div class="hint">
              <div v-if="action.type === 'call_endpoint'">
                格式：{"endpoint_id": 1, "params": {"key": "{{code}}"}, "save_to_context": "变量名"}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initEndpointBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'call_connector'">格式：{"connector_code": "xxx", "params": {"key": "{{title}}"}}</div>
              <div v-if="action.type === 'call_data_interface'">
                格式：{"interface_id": 1, "params": {"code": "{{other_codes}}"}}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initDataInterfaceBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'execute_js'">
                格式：{"code": "log('工单: ' + workOrder.code);"}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initJsBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'update_work_order'">
                格式：{"updates": {"status": "in_progress"}} 或 {"work_order_id": 123, "updates": {...}}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initUpdateWorkOrderBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'create_work_order'">
                格式：{"fields": {"title": "自动创建", "type_code": "xxx"}}
                <el-button text type="primary" size="small" @click="action.useBuilder = true; initCreateWorkOrderBuilder(idx)" style="margin-left:8px">
                  切换到可视化配置
                </el-button>
              </div>
              <div v-if="action.type === 'query_work_orders'">格式：{"conditions": {"device_id": "{{device_id}}"}, "limit": 10}</div>
            </div>
          </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="testDialog" title="测试工作流" width="600px">
      <el-form label-width="100px">
        <el-form-item label="选择工单">
          <el-select
            v-model="testForm.workOrderId"
            filterable
            remote
            reserve-keyword
            placeholder="输入工单编号、业务编号或其他编码搜索"
            :remote-method="searchWorkOrders"
            :loading="searchLoading"
            style="width: 100%"
            clearable
            popper-class="work-order-select-popper"
          >
            <el-option
              v-for="wo in searchedWorkOrders"
              :key="wo.id"
              :label="`${wo.code} - ${wo.title}`"
              :value="wo.id"
            >
              <div class="work-order-option">
                <div class="wo-main">{{ wo.code }} - {{ wo.title }}</div>
                <div class="wo-meta">
                  <span v-if="wo.business_no" class="wo-field">业务编号: {{ wo.business_no }}</span>
                  <span v-if="wo.business_no && wo.other_codes" class="wo-separator">|</span>
                  <span v-if="wo.other_codes" class="wo-field">其他编码: {{ wo.other_codes }}</span>
                  <el-tag size="small" class="wo-status" :type="getStatusType(wo.status)">{{ getStatusLabel(wo.status) }}</el-tag>
                </div>
              </div>
            </el-option>
          </el-select>
          <div class="hint">可搜索工单编号、业务编号、其他编码</div>
        </el-form-item>
        <el-form-item label="触发事件">
          <el-select v-model="testForm.event" placeholder="选择触发事件" style="width: 100%">
            <el-option
              v-for="evt in getAvailableEventsForTest()"
              :key="evt.value"
              :label="evt.label"
              :value="evt.value"
            />
          </el-select>
          <div class="hint" v-if="getCurrentWorkflowEvents().length > 0">
            当前工作流监听事件: {{ getCurrentWorkflowEvents().map(e => eventLabel(e)).join('、') }}
          </div>
          <div class="hint" v-else style="color: #67c23a;">
            当前工作流监听所有事件
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testDialog = false">取消</el-button>
        <el-button type="primary" @click="runTest" :disabled="!testForm.workOrderId">执行测试</el-button>
      </template>
    </el-dialog>

    <!-- Context Variable Dialog -->
    <el-dialog v-model="contextDialog" title="添加上下文变量" width="500px">
      <el-form label-width="100px">
        <el-form-item label="变量名" required>
          <el-input v-model="contextForm.name" placeholder="如：user_id" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="contextForm.description" placeholder="变量用途说明" />
        </el-form-item>
        <el-form-item label="默认值">
          <el-input v-model="contextForm.defaultValue" placeholder="可选，默认值" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="contextDialog = false">取消</el-button>
        <el-button type="primary" @click="saveContextVar">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { More, QuestionFilled, Plus, ArrowUp, ArrowDown, Loading, Top, Bottom, Filter } from '@element-plus/icons-vue'
import {
  getWorkOrderWorkflows, createWorkOrderWorkflow, updateWorkOrderWorkflow, deleteWorkOrderWorkflow,
  testWorkOrderWorkflow, getWorkOrderTypes, getWorkOrders
} from '@/api/workOrder'
import { listDataInterfaces, getInterfaceParamSchema } from '@/api/dataStack'
import { listOutboundEndpoints, getEndpointParamSchema } from '@/api/outbound'
import { useRouter } from 'vue-router'
import '@/monaco-setup.js'
import * as monaco from 'monaco-editor'

const router = useRouter()
const workflows = ref([])
const types = ref([])
const dataInterfaces = ref([])
const outboundEndpoints = ref([])
const dialog = ref(false)
const form = ref({
  id: null, name: '', type_code: '', description: '', enabled: true, sort_order: 0
})
const eventList = ref([])
const actions = ref([])
const contextVars = ref([])
const contextDialog = ref(false)
const contextForm = ref({ name: '', description: '', defaultValue: '' })
const testDialog = ref(false)
const testForm = ref({ workflowId: null, workOrderId: null, event: 'work_order.test' })
const searchedWorkOrders = ref([])
const searchLoading = ref(false)

// Monaco editors for JavaScript actions
const monacoEditors = ref({})

const availableEvents = [
  { label: '创建', value: 'work_order.created' },
  { label: '更新', value: 'work_order.updated' },
  { label: '状态变更', value: 'work_order.status_changed' },
  { label: '关闭', value: 'work_order.closed' }
]

const eventLabel = (e) => availableEvents.find(ev => ev.value === e)?.label || e

const parseEvents = (json) => {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}
const parseActions = (json) => {
  if (!json) return []
  try { return JSON.parse(json) } catch { return [] }
}

// 缓存行数据解析结果，避免重复解析
const rowCache = ref(new Map())

const getRowEvents = (row) => {
  const cacheKey = `events_${row.id}_${row.events}`
  if (rowCache.value.has(cacheKey)) {
    return rowCache.value.get(cacheKey)
  }
  const result = parseEvents(row.events)
  rowCache.value.set(cacheKey, result)
  return result
}

const getRowActionsCount = (row) => {
  const cacheKey = `actions_${row.id}_${row.actions_json?.substring(0, 50)}`
  if (rowCache.value.has(cacheKey)) {
    return rowCache.value.get(cacheKey)
  }
  const result = parseActions(row.actions_json).length
  rowCache.value.set(cacheKey, result)
  return result
}

const load = async () => {
  const res = await getWorkOrderWorkflows()
  workflows.value = res.data || []
  // 清除行缓存
  rowCache.value.clear()
}

const openCreate = () => {
  form.value = { id: null, name: '', type_code: '', description: '', enabled: true, sort_order: 0 }
  eventList.value = []
  actions.value = []
  contextVars.value = []
  dialog.value = true
}

const openEdit = (row) => {
  form.value = { ...row }
  eventList.value = parseEvents(row.events)
  const acts = parseActions(row.actions_json)

  // Extract context variables from workflow metadata
  contextVars.value = []
  try {
    const firstAction = acts[0]
    if (firstAction?.config?.context) {
      contextVars.value = firstAction.config.context.map(c => ({
        name: c.name || c,
        description: c.description || '',
        defaultValue: c.defaultValue || c.default_value || ''
      }))
    }
  } catch (e) {
    // Ignore
  }

  actions.value = acts.map((a, idx) => {
    const action = {
      type: a.type,
      configJSON: JSON.stringify(a.config, null, 2),
      useBuilder: true,
      builder: {},
      condition: a.condition || '', // 加载执行条件
      enabled: a.enabled !== false,
      collapsed: true, // 默认收起以提升性能
      activeTab: 'visual' // 初始化 activeTab
    }

    // Initialize builder based on action type
    if (a.type === 'call_endpoint' && a.config?.endpoint_id) {
      action.builder = {
        endpointId: a.config.endpoint_id,
        params: a.config.params || {},
        saveToContext: a.config.save_to_context || '',
        paramList: [] // 初始化为空数组而不是 null
      }
    } else if (a.type === 'call_data_interface' && a.config?.interface_id) {
      action.builder = {
        interfaceId: a.config.interface_id,
        params: a.config.params || {},
        paramList: [] // 初始化为空数组而不是 null
      }
    } else if (a.type === 'execute_js' && a.config?.code) {
      action.builder = {
        code: a.config.code || ''
      }
      // Monaco 编辑器将在对话框打开后初始化（@opened 事件）
    } else if (a.type === 'update_work_order') {
      action.builder = { updateTarget: 'current', workOrderId: '', updateFields: [] }
      if (a.config.work_order_id) {
        action.builder.updateTarget = 'specified'
        action.builder.workOrderId = a.config.work_order_id
      }
      // 支持新格式（数组）和旧格式（对象）
      if (Array.isArray(a.config.updates)) {
        action.builder.updateFields = a.config.updates.map(u => ({
          name: u.field || '',
          value: String(u.value || ''),
          mode: u.mode || 'replace',
          separator: u.separator || ','
        }))
      } else if (a.config.updates) {
        action.builder.updateFields = Object.entries(a.config.updates).map(([name, value]) => ({
          name,
          value: String(value),
          mode: 'replace',
          separator: ','
        }))
      }
    } else if (a.type === 'create_work_order') {
      action.builder = { typeCode: '', createFields: [], saveToContext: '' }
      if (a.config.fields) {
        action.builder.typeCode = a.config.fields.type_code || ''
        action.builder.createFields = Object.entries(a.config.fields)
          .filter(([name]) => name !== 'type_code')
          .map(([name, value]) => ({ name, value: String(value) }))
      }
      action.builder.saveToContext = a.config.save_to_context || ''
    } else {
      // 不支持可视化的类型，使用 JSON 模式
      action.useBuilder = false
    }

    return action
  })

  // 延迟打开对话框，让 Vue 有时间处理数据更新
  nextTick(() => {
    dialog.value = true
  })
}

const copyWorkflow = (row) => {
  form.value = {
    ...row,
    id: null,
    name: row.name + ' (复制)'
  }
  eventList.value = parseEvents(row.events)
  const acts = parseActions(row.actions_json)

  // Extract context variables from workflow metadata
  contextVars.value = []
  try {
    const firstAction = acts[0]
    if (firstAction?.config?.context) {
      contextVars.value = firstAction.config.context.map(c => ({
        name: c.name || c,
        description: c.description || '',
        defaultValue: c.defaultValue || c.default_value || ''
      }))
    }
  } catch (e) {
    // Ignore
  }

  actions.value = acts.map((a, idx) => {
    const action = {
      type: a.type,
      configJSON: JSON.stringify(a.config, null, 2),
      useBuilder: true,
      builder: {},
      condition: a.condition || '',
      enabled: a.enabled !== false,
      collapsed: true, // 默认收起以提升性能
      activeTab: 'visual' // 初始化 activeTab
    }

    // Initialize builder based on action type
    if (a.type === 'call_endpoint' && a.config?.endpoint_id) {
      action.builder = {
        endpointId: a.config.endpoint_id,
        params: a.config.params || {},
        saveToContext: a.config.save_to_context || '',
        paramList: [] // 初始化为空数组而不是 null
      }
    } else if (a.type === 'call_data_interface' && a.config?.interface_id) {
      action.builder = {
        interfaceId: a.config.interface_id,
        params: a.config.params || {},
        paramList: [] // 初始化为空数组而不是 null
      }
    } else if (a.type === 'execute_js' && a.config?.code) {
      action.builder = {
        code: a.config.code || ''
      }
    } else if (a.type === 'update_work_order') {
      action.builder = { updateTarget: 'current', workOrderId: '', updateFields: [] }
      if (a.config.work_order_id) {
        action.builder.updateTarget = 'specified'
        action.builder.workOrderId = a.config.work_order_id
      }
      if (Array.isArray(a.config.updates)) {
        action.builder.updateFields = a.config.updates.map(u => ({
          name: u.field || '',
          value: String(u.value || ''),
          mode: u.mode || 'replace',
          separator: u.separator || ','
        }))
      } else if (a.config.updates) {
        action.builder.updateFields = Object.entries(a.config.updates).map(([name, value]) => ({
          name,
          value: String(value),
          mode: 'replace',
          separator: ','
        }))
      }
    } else if (a.type === 'create_work_order') {
      action.builder = { typeCode: '', createFields: [], saveToContext: '' }
      if (a.config.fields) {
        action.builder.typeCode = a.config.fields.type_code || ''
        action.builder.createFields = Object.entries(a.config.fields)
          .filter(([name]) => name !== 'type_code')
          .map(([name, value]) => ({ name, value: String(value) }))
      }
      action.builder.saveToContext = a.config.save_to_context || ''
    } else {
      action.useBuilder = false
    }

    return action
  })
  dialog.value = true
}

const addAction = () => {
  actions.value.push({ type: '', configJSON: '{}', useBuilder: false, builder: {}, condition: '', enabled: true, collapsed: false, activeTab: 'visual' })
}

const insertAction = (idx, position) => {
  const newAction = { type: '', configJSON: '{}', useBuilder: false, builder: {}, condition: '', enabled: true, collapsed: false, activeTab: 'visual' }
  if (position === 'before') {
    actions.value.splice(idx, 0, newAction)
  } else {
    actions.value.splice(idx + 1, 0, newAction)
  }
}

const removeAction = (idx) => {
  actions.value.splice(idx, 1)
}

const toggleActionCollapse = (idx) => {
  const action = actions.value[idx]
  action.collapsed = !action.collapsed

  // 如果展开了 execute_js 类型的动作，且尚未初始化 Monaco 编辑器，则初始化
  if (!action.collapsed && action.type === 'execute_js' && action.useBuilder) {
    nextTick(() => {
      if (!monacoEditors.value[idx]) {
        initJsBuilder(idx)
      }
    })
  }
}

const actionTypeLabel = (type) => {
  const labels = {
    'call_endpoint': '调用第三方接口',
    'call_connector': '调用连接器',
    'call_data_interface': '调用数据接口',
    'execute_js': '执行 JavaScript',
    'update_work_order': '更新工单',
    'create_work_order': '创建工单',
    'query_work_orders': '查询工单'
  }
  return labels[type] || type
}

const moveAction = (idx, direction) => {
  const newIdx = idx + direction
  if (newIdx < 0 || newIdx >= actions.value.length) return
  const temp = actions.value[idx]
  actions.value[idx] = actions.value[newIdx]
  actions.value[newIdx] = temp
}

const openContextDialog = () => {
  contextForm.value = { name: '', description: '', defaultValue: '' }
  contextDialog.value = true
}

const saveContextVar = () => {
  if (!contextForm.value.name?.trim()) {
    ElMessage.warning('变量名不能为空')
    return
  }
  if (contextVars.value.some(v => v.name === contextForm.value.name)) {
    ElMessage.warning('变量名已存在')
    return
  }
  contextVars.value.push({ ...contextForm.value })
  contextDialog.value = false
}

const onDialogOpened = () => {
  // 对话框打开后，只初始化已展开的 execute_js 类型的 Monaco 编辑器
  // 收起的动作会在展开时再初始化，避免一次性初始化太多编辑器导致卡顿
  nextTick(() => {
    actions.value.forEach((action, idx) => {
      if (action.type === 'execute_js' && action.useBuilder && !action.collapsed) {
        setTimeout(() => {
          initJsBuilder(idx)
        }, 100)
      }
    })
  })
}

const onDialogClosed = () => {
  // 对话框完全关闭后清理状态和 Monaco 编辑器
  cleanupMonacoEditors()
}

const removeContextVar = (idx) => {
  contextVars.value.splice(idx, 1)
}


const onActionTypeChange = (idx) => {
  const action = actions.value[idx]
  if (action.type === 'call_endpoint') {
    action.useBuilder = true
    action.builder = { endpointId: null, params: {}, saveToContext: '', paramList: [] }
    action.configJSON = '{}'
    action.activeTab = 'visual' // 确保 activeTab 存在
  } else if (action.type === 'call_data_interface') {
    action.useBuilder = true
    action.builder = { interfaceId: null, params: {}, paramList: [] }
    action.configJSON = '{}'
    action.activeTab = 'visual'
  } else if (action.type === 'execute_js') {
    action.useBuilder = true
    action.builder = { code: '' }
    action.configJSON = '{"code": ""}'
    action.activeTab = 'visual'
    // 自动初始化 Monaco 编辑器
    nextTick(() => {
      initJsBuilder(idx)
    })
  } else if (action.type === 'update_work_order') {
    action.useBuilder = true
    action.builder = { updateTarget: 'current', workOrderId: '', updateFields: [] }
    action.configJSON = '{}'
    action.activeTab = 'visual'
  } else if (action.type === 'create_work_order') {
    action.useBuilder = true
    action.builder = { typeCode: '', createFields: [], saveToContext: '' }
    action.configJSON = '{"fields": {}}'
    action.activeTab = 'visual'
  } else {
    action.useBuilder = false
    action.configJSON = '{}'
    action.activeTab = 'visual'
  }
}

const initJsBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { code: '' }

  // Try to parse existing config
  try {
    const config = JSON.parse(action.configJSON || '{}')
    action.builder.code = config.code || ''
  } catch (e) {
    // Ignore
  }

  // Wait for DOM to render
  await nextTick()
  await nextTick() // Double nextTick to ensure DOM is fully ready

  // Initialize Monaco Editor with additional delay
  setTimeout(() => {
    const container = document.getElementById(`monaco-editor-${idx}`)
    if (!container) {
      console.error('Monaco container not found for action', idx)
      return
    }

    // Check if container has dimensions
    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      console.warn('Monaco container has zero dimensions, retrying...')
      // Retry after another delay
      setTimeout(() => initMonacoEditor(idx, container), 300)
      return
    }

    initMonacoEditor(idx, container)
  }, 200)
}

const initMonacoEditor = (idx, container) => {
  const action = actions.value[idx]

  // Dispose existing editor if any
  if (monacoEditors.value[idx]) {
    monacoEditors.value[idx].dispose()
    delete monacoEditors.value[idx]
  }

  try {
    const editor = monaco.editor.create(container, {
      value: action.builder.code,
      language: 'javascript',
      theme: 'vs',
      minimap: { enabled: false },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'on'
    })

    // Add type definitions for autocomplete
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2015,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      typeRoots: ['node_modules/@types']
    })

    // Build context variable type definitions
    const ctxFields = contextVars.value.map(c => `  ${c.name}?: any; // ${c.description || ''}`).join('\n')

    // Add custom type definitions for workOrder, ctx, actions
    const typeDefinitions = `
declare const workOrder: {
  id: number;
  code: string;
  title: string;
  description: string;
  device_id: number;
  status: string;
  priority: string;
  visibility: string;
  type_code: string;
  assigned_to?: number;
  assignee_id?: number;
  other_codes: string;
  business_no: string;
  external_ref: string;
  device_name_snap: string;
  device_alias_server: string;
  device_alias_agent: string;
  device_group: string;
  data_json: string;
  created_at: string;
  updated_at: string;
};

declare const ctx: {
${ctxFields}
};

declare const actions: Array<{type: string; result: any; error?: string}>;

declare const event: string;
declare const actor: string;

/** 打印日志到工作流执行日志 */
declare function log(message: string): void;

/** 设置上下文变量 */
declare function setVariable(key: string, value: any): void;

/** 获取上下文变量 */
declare function getVariable(key: string): any;

/** 追加字符串（带分隔符） */
declare function appendString(str1: string, str2: string, separator?: string): string;

/** 分割字符串 */
declare function splitString(str: string, separator?: string): string[];

/** 连接字符串数组 */
declare function joinString(arr: string[], separator?: string): string;

/** 更新工单字段 */
declare function updateWorkOrder(workOrderId: number, updates: {[field: string]: any}): Promise<void>;

/** 查询工单 */
declare function queryWorkOrders(conditions: {[field: string]: any}, limit?: number): Promise<any[]>;

/** 给工单添加标签 */
declare function addWorkOrderTag(workOrderId: number, tagCode: string): Promise<void>;

/** 移除工单标签 */
declare function removeWorkOrderTag(workOrderId: number, tagCode: string): Promise<void>;

/** 获取工单的所有标签 */
declare function getWorkOrderTags(workOrderId: number): Promise<string[]>;

declare const console: Console;
`

    monaco.languages.typescript.javascriptDefaults.addExtraLib(typeDefinitions, 'workflow-types.d.ts')

    // Update config on change
    editor.onDidChangeModelContent(() => {
      action.builder.code = editor.getValue()
      updateJsBuilderJSON(idx)
    })

    monacoEditors.value[idx] = editor

    // Force layout after creation with multiple attempts
    setTimeout(() => {
      editor.layout()
    }, 100)

    setTimeout(() => {
      editor.layout()
    }, 500)
  } catch (e) {
    console.error('Failed to create Monaco editor:', e)
  }
}

const updateJsBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = { code: action.builder.code }
  action.configJSON = JSON.stringify(config, null, 2)
}

const initUpdateWorkOrderBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { updateTarget: 'current', workOrderId: '', updateFields: [] }

  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.work_order_id) {
      action.builder.updateTarget = 'specified'
      action.builder.workOrderId = config.work_order_id
    }
    // 支持新格式（数组）和旧格式（对象）
    if (Array.isArray(config.updates)) {
      action.builder.updateFields = config.updates.map(u => ({
        name: u.field || '',
        value: String(u.value || ''),
        mode: u.mode || 'replace',
        separator: u.separator || ','
      }))
    } else if (config.updates) {
      action.builder.updateFields = Object.entries(config.updates).map(([name, value]) => ({
        name,
        value: String(value),
        mode: 'replace',
        separator: ','
      }))
    }
  } catch (e) {
    // Ignore
  }
}

const addUpdateField = (idx) => {
  const action = actions.value[idx]
  action.builder.updateFields.push({ name: '', value: '', mode: 'replace', separator: ',' })
}

const removeUpdateField = (idx, fieldIdx) => {
  const action = actions.value[idx]
  action.builder.updateFields.splice(fieldIdx, 1)
  updateWorkOrderBuilderJSON(idx)
}

const insertWorkOrderIdTemplate = (idx, template) => {
  const action = actions.value[idx]
  action.builder.workOrderId += template
  updateWorkOrderBuilderJSON(idx)
}

const insertUpdateFieldTemplate = (idx, fieldIdx, template) => {
  const action = actions.value[idx]
  const field = action.builder.updateFields[fieldIdx]
  if (!field) return
  field.value = (field.value || '') + template
  updateWorkOrderBuilderJSON(idx)
}

const insertConditionTemplate = (idx, template) => {
  const action = actions.value[idx]
  action.condition = (action.condition || '') + template
}

const updateWorkOrderBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = {}

  if (action.builder.updateTarget === 'specified' && action.builder.workOrderId) {
    config.work_order_id = action.builder.workOrderId
  }

  // 使用新的数组格式，支持 mode 和 separator
  const updates = []
  action.builder.updateFields.forEach(field => {
    if (field.name && field.value) {
      const update = {
        field: field.name,
        value: field.value,
        mode: field.mode || 'replace'
      }
      if (field.mode === 'append') {
        update.separator = field.separator || ','
      }
      updates.push(update)
    }
  })

  if (updates.length > 0) {
    config.updates = updates
  }

  action.configJSON = JSON.stringify(config, null, 2)
}

const initCreateWorkOrderBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { typeCode: '', createFields: [], saveToContext: '' }

  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.fields) {
      action.builder.typeCode = config.fields.type_code || ''
      action.builder.createFields = Object.entries(config.fields)
        .filter(([name]) => name !== 'type_code')
        .map(([name, value]) => ({ name, value: String(value) }))
    }
    action.builder.saveToContext = config.save_to_context || ''
  } catch (e) {
    // Ignore
  }
}

const addCreateField = (idx) => {
  const action = actions.value[idx]
  action.builder.createFields.push({ name: '', value: '' })
}

const removeCreateField = (idx, fieldIdx) => {
  const action = actions.value[idx]
  action.builder.createFields.splice(fieldIdx, 1)
  updateCreateWorkOrderBuilderJSON(idx)
}

const updateCreateWorkOrderBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const fields = {}

  if (action.builder.typeCode) {
    fields.type_code = action.builder.typeCode
  }

  action.builder.createFields.forEach(field => {
    if (field.name && field.value) {
      fields[field.name] = field.value
    }
  })

  const config = { fields }

  if (action.builder.saveToContext) {
    config.save_to_context = action.builder.saveToContext
  }

  action.configJSON = JSON.stringify(config, null, 2)
}

const initEndpointBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { endpointId: null, params: {}, saveToContext: '', paramList: [] }

  // Try to parse existing config
  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.endpoint_id) {
      action.builder.endpointId = config.endpoint_id
      action.builder.params = config.params || {}
      action.builder.saveToContext = config.save_to_context || ''
      await loadEndpointParams(idx, config.endpoint_id)
    }
  } catch (e) {
    // Ignore parse errors
  }
}

const initDataInterfaceBuilder = async (idx) => {
  const action = actions.value[idx]
  action.builder = { interfaceId: null, params: {}, paramList: [] }

  // Try to parse existing config
  try {
    const config = JSON.parse(action.configJSON || '{}')
    if (config.interface_id) {
      action.builder.interfaceId = config.interface_id
      action.builder.params = config.params || {}
      await loadInterfaceParams(idx, config.interface_id)
    }
  } catch (e) {
    // Ignore parse errors
  }
}

const onEndpointSelected = async (idx) => {
  const action = actions.value[idx]
  const endpointId = action.builder.endpointId
  if (!endpointId) {
    action.builder.paramList = null
    action.builder.params = {}
    updateEndpointBuilderJSON(idx)
    return
  }
  await loadEndpointParams(idx, endpointId)
  updateEndpointBuilderJSON(idx)
}

const loadEndpointParams = async (idx, endpointId) => {
  const action = actions.value[idx]
  action.builder.paramList = null // 设置为 null 显示加载中
  try {
    const res = await getEndpointParamSchema(endpointId)
    console.log('Endpoint param schema response:', res)
    // axios 响应: res.data 就是 API 返回的 JSON
    const params = res.data?.params || res.params || []
    console.log('Params:', params)
    action.builder.paramList = params
    console.log('Set paramList to:', action.builder.paramList)
  } catch (e) {
    console.error('Failed to load endpoint params:', e)
    ElMessage.warning('加载接口参数失败: ' + e.message)
    action.builder.paramList = [] // 失败时设置为空数组，不再显示加载中
  }
}

const updateEndpointBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = {
    endpoint_id: action.builder.endpointId,
    params: action.builder.params
  }
  if (action.builder.saveToContext) {
    config.save_to_context = action.builder.saveToContext
  }
  // Add context variables as metadata in the first action
  if (idx === 0 && contextVars.value.length > 0) {
    config.context = contextVars.value
  }
  action.configJSON = JSON.stringify(config, null, 2)
}

const onInterfaceSelected = async (idx) => {
  const action = actions.value[idx]
  const interfaceId = action.builder.interfaceId
  if (!interfaceId) {
    action.builder.paramList = null
    action.builder.params = {}
    updateBuilderJSON(idx)
    return
  }
  await loadInterfaceParams(idx, interfaceId)
  updateBuilderJSON(idx)
}

const loadInterfaceParams = async (idx, interfaceId) => {
  const action = actions.value[idx]
  action.builder.paramList = null // 设置为 null 显示加载中
  try {
    const res = await getInterfaceParamSchema(interfaceId)
    console.log('Interface param schema response:', res)
    // axios 响应: res.data 就是 API 返回的 JSON
    const params = res.data?.params || res.params || []
    console.log('Params:', params)
    action.builder.paramList = params
    console.log('Set paramList to:', action.builder.paramList)
  } catch (e) {
    console.error('Failed to load interface params:', e)
    ElMessage.warning('加载接口参数失败: ' + e.message)
    action.builder.paramList = [] // 失败时设置为空数组，不再显示加载中
  }
}

const updateBuilderJSON = (idx) => {
  const action = actions.value[idx]
  const config = {
    interface_id: action.builder.interfaceId,
    params: action.builder.params
  }
  action.configJSON = JSON.stringify(config, null, 2)
}

const insertTemplate = (idx, paramName, template) => {
  const action = actions.value[idx]
  const current = action.builder.params[paramName] || ''
  action.builder.params[paramName] = current + template
  if (action.type === 'call_endpoint') {
    updateEndpointBuilderJSON(idx)
  } else if (action.type === 'call_data_interface') {
    updateBuilderJSON(idx)
  }
}

const ctxTemplate = (name) => {
  return '{{ctx.' + name + '}}'
}

const ctxTemplateLabel = (ctx) => {
  return '{{ctx.' + ctx.name + '}} - ' + (ctx.description || ctx.name)
}

const actionResultTemplate = (idx) => {
  return '{{actions[' + idx + '].result}}'
}

const actionResultLabel = (idx) => {
  return '{{actions[' + idx + '].result}} - 动作' + (idx + 1) + '结果'
}


const save = async () => {
  if (!form.value.name?.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  // 构建 actions_json
  const actionsData = []
  for (const a of actions.value) {
    if (!a.type) {
      ElMessage.warning('请选择动作类型')
      return
    }
    let config
    try {
      config = JSON.parse(a.configJSON || '{}')
    } catch (e) {
      ElMessage.error('动作配置 JSON 格式错误: ' + e.message)
      return
    }
    const actionData = { type: a.type, config }
    // 添加执行条件（如果有）
    if (a.condition?.trim()) {
      actionData.condition = a.condition.trim()
    }
    // 启用/停用标记：始终写入，确保切换状态能正确保存
    actionData.enabled = a.enabled !== false
    actionsData.push(actionData)
  }
  const payload = {
    name: form.value.name,
    type_code: form.value.type_code || '',
    events: eventList.value.length ? JSON.stringify(eventList.value) : '',
    actions_json: JSON.stringify(actionsData),
    description: form.value.description || '',
    enabled: form.value.enabled,
    sort_order: form.value.sort_order || 0
  }
  if (form.value.id) {
    await updateWorkOrderWorkflow(form.value.id, payload)
    ElMessage.success('已更新')
  } else {
    await createWorkOrderWorkflow(payload)
    ElMessage.success('已创建')
  }
  dialog.value = false
  // watch(dialog) 会自动触发清理，不需要在这里重复调用
  load()
}

const toggleEnabled = async (row) => {
  const originalEnabled = row.enabled
  try {
    await updateWorkOrderWorkflow(row.id, {
      name: row.name,
      type_code: row.type_code,
      events: row.events,
      actions_json: row.actions_json,
      description: row.description,
      enabled: row.enabled,
      sort_order: row.sort_order
    })
    ElMessage.success('已更新')
    // 重新加载列表以确保数据一致，但不要在这里直接调用 load()
    // 因为可能导致响应式循环
    setTimeout(() => {
      load()
    }, 100)
  } catch (e) {
    ElMessage.error('更新失败')
    row.enabled = originalEnabled // 回滚开关状态
  }
}

const remove = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该工作流？', '提示', { type: 'warning' })
  } catch { return }
  await deleteWorkOrderWorkflow(row.id)
  ElMessage.success('已删除')
  load()
}

const openTest = (row) => {
  testForm.value.workflowId = row.id
  testForm.value.workOrderId = null
  searchedWorkOrders.value = []

  // 根据工作流配置的事件设置默认值
  const configuredEvents = parseEvents(row.events)
  if (configuredEvents.length > 0) {
    // 如果工作流配置了特定事件，使用第一个作为默认值
    testForm.value.event = configuredEvents[0]
  } else {
    // 如果工作流监听所有事件，使用 test 事件
    testForm.value.event = 'work_order.test'
  }

  testDialog.value = true
}

const searchWorkOrders = async (query) => {
  if (!query) {
    searchedWorkOrders.value = []
    return
  }
  searchLoading.value = true
  try {
    const res = await getWorkOrders({
      search_key: query,
      page: 1,
      limit: 20
    })
    searchedWorkOrders.value = res.data || []
  } catch (e) {
    console.error('Search work orders failed:', e)
    searchedWorkOrders.value = []
  } finally {
    searchLoading.value = false
  }
}

const getStatusLabel = (status) => {
  const labels = {
    'open': '待处理',
    'in_progress': '处理中',
    'pending': '待处理',
    'resolved': '已解决',
    'closed': '已关闭',
    'cancelled': '已取消'
  }
  return labels[status] || status
}

const getStatusType = (status) => {
  const types = {
    'open': '',
    'in_progress': 'warning',
    'pending': 'info',
    'resolved': 'success',
    'closed': 'info',
    'cancelled': 'info'
  }
  return types[status] || ''
}

const cleanupMonacoEditors = () => {
  // 清理所有 Monaco 编辑器实例
  const editorKeys = Object.keys(monacoEditors.value)
  if (editorKeys.length === 0) return

  editorKeys.forEach(key => {
    const editor = monacoEditors.value[key]
    if (editor && typeof editor.dispose === 'function') {
      try {
        editor.dispose()
      } catch (e) {
        console.warn('[Monaco] Failed to dispose editor:', key, e)
      }
    }
  })
  monacoEditors.value = {}
}

const getCurrentWorkflowEvents = () => {
  const currentWorkflow = workflows.value.find(w => w.id === testForm.value.workflowId)
  if (!currentWorkflow) return []
  return parseEvents(currentWorkflow.events)
}

const getAvailableEventsForTest = () => {
  const configuredEvents = getCurrentWorkflowEvents()

  // 如果工作流配置了特定事件，只显示这些事件
  if (configuredEvents.length > 0) {
    return configuredEvents.map(evt => ({
      label: eventLabel(evt) + ` (${evt})`,
      value: evt
    }))
  }

  // 如果工作流监听所有事件（未配置或配置为空），显示所有可用事件
  return [
    { label: '测试事件 (work_order.test)', value: 'work_order.test' },
    { label: '创建事件 (work_order.created)', value: 'work_order.created' },
    { label: '更新事件 (work_order.updated)', value: 'work_order.updated' },
    { label: '状态变更 (work_order.status_changed)', value: 'work_order.status_changed' },
    { label: '关闭事件 (work_order.closed)', value: 'work_order.closed' }
  ]
}

const runTest = async () => {
  if (!testForm.value.workOrderId) {
    ElMessage.warning('请选择工单')
    return
  }
  if (!testForm.value.event) {
    ElMessage.warning('请选择触发事件')
    return
  }

  // 获取当前工作流信息
  const currentWorkflow = workflows.value.find(w => w.id === testForm.value.workflowId)

  // 获取选中的工单信息
  const selectedWorkOrder = searchedWorkOrders.value.find(wo => wo.id === testForm.value.workOrderId)

  // 验证工单类型是否匹配工作流配置
  if (currentWorkflow && currentWorkflow.type_code && selectedWorkOrder) {
    if (currentWorkflow.type_code !== selectedWorkOrder.type_code) {
      try {
        await ElMessageBox.confirm(
          `当前工单类型为 "${selectedWorkOrder.type_code}"，与工作流配置的类型 "${currentWorkflow.type_code}" 不匹配。是否强制执行？`,
          '工单类型不匹配',
          {
            confirmButtonText: '强制执行',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch {
        return // 用户取消
      }
    }
  }

  console.log('Testing workflow:', {
    workflowId: testForm.value.workflowId,
    workOrderId: testForm.value.workOrderId,
    event: testForm.value.event
  })

  try {
    const res = await testWorkOrderWorkflow(
      testForm.value.workflowId,
      testForm.value.workOrderId,
      testForm.value.event
    )
    console.log('Test workflow response:', res)

    testDialog.value = false
    ElMessage.success('工作流已触发，正在跳转到执行日志...')

    // 异步执行需要等待一下，让日志有时间创建
    // 跳转到执行日志页面，并筛选当前工作流和工单
    setTimeout(() => {
      router.push({
        path: '/work-orders/workflow-logs',
        query: {
          workflow_id: testForm.value.workflowId,
          work_order_id: testForm.value.workOrderId,
          _t: Date.now() // 添加时间戳避免缓存
        }
      })
    }, 1500) // 增加延迟到1.5秒，确保日志有足够时间创建
  } catch (e) {
    console.error('Test workflow failed:', e)
    ElMessage.error('执行失败: ' + (e.response?.data?.error || e.message || '未知错误'))
  }
}

onMounted(async () => {
  const t = await getWorkOrderTypes()
  types.value = t.data || []

  // Load data interfaces for the builder
  try {
    const res = await listDataInterfaces()
    dataInterfaces.value = res.data || []
  } catch (e) {
    console.error('Failed to load data interfaces:', e)
  }

  // Load outbound endpoints for the builder
  try {
    const res = await listOutboundEndpoints()
    outboundEndpoints.value = res.data || []
  } catch (e) {
    console.error('Failed to load outbound endpoints:', e)
  }

  load()
})

onBeforeUnmount(() => {
  // Dispose all Monaco editors
  Object.values(monacoEditors.value).forEach(editor => {
    if (editor) {
      editor.dispose()
    }
  })
})

</script>

<style scoped>
.toolbar { margin-bottom: 16px; }
.section-title { font-weight: bold; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
.action-item { border: 1px solid #dcdfe6; border-radius: 4px; padding: 12px; margin-bottom: 12px; }
.action-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: bold; cursor: pointer; user-select: none; }
.action-head:hover { background: #f5f7fa; }
.action-head-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
.action-head-buttons { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.collapse-icon { transition: transform 0.3s ease; }
.collapse-icon.collapsed { transform: rotate(-90deg); }
.condition-preview {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  color: #909399;
  font-weight: normal;
  margin-left: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}
.condition-preview code {
  background: #f5f7fa;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.action-content { margin-top: 12px; }
.hint { font-size: 12px; color: #909399; margin-top: 4px; }

.context-section {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  min-height: 60px;
  margin-bottom: 16px;
}
.empty-hint {
  color: #909399;
  font-size: 13px;
  margin-bottom: 8px;
}

.param-mapping { border: 1px solid #ebeef5; border-radius: 4px; padding: 12px; background: #fafafa; }
.param-row { margin-bottom: 12px; }
.param-row:last-child { margin-bottom: 0; }
.param-label { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.param-name { font-weight: 600; color: #303133; }
.param-type { font-size: 12px; color: #909399; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
.param-desc { font-size: 12px; color: #606266; font-style: italic; }
.no-params { text-align: center; color: #909399; padding: 20px; }

.monaco-editor-wrapper {
  width: 100%;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}
.monaco-container {
  height: 300px;
  width: 100%;
  min-height: 300px;
}

.code-hint {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.8;
  color: #606266;
}

.update-fields {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
}
.field-row {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.field-row:last-child {
  margin-bottom: 0;
}

/* 工单选择器选项样式 */
.work-order-option {
  padding: 8px 0;
  line-height: 1.4;
}
.work-order-option .wo-main {
  font-weight: 500;
  color: #303133;
  margin-bottom: 4px;
}
.work-order-option .wo-meta {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 8px;
}
.work-order-option .wo-field {
  white-space: nowrap;
}
.work-order-option .wo-separator {
  color: #dcdfe6;
}
.work-order-option .wo-status {
  margin-left: auto;
}
</style>

<style>
/* 全局样式 - 工单选择器下拉面板 */
.work-order-select-popper .el-select-dropdown__item {
  height: auto !important;
  line-height: normal !important;
  padding: 0 20px !important;
}
</style>
