<template>
  <el-tabs v-model="tab">
    <el-tab-pane label="数据源" name="src">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openSrc()">新建</el-button>
        <el-button size="small" @click="loadSources">刷新</el-button>
      </div>
      <el-table :data="sources" border size="small">
        <el-table-column prop="code" label="编码" width="140" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="read_only" label="只读" width="70">
          <template #default="{ row }">{{ row.read_only ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button link type="primary" @click="testSrc(row)">测试</el-button>
            <el-button link @click="showPoolStats(row)">连接池</el-button>
            <el-button link @click="openSrc(row)">编辑</el-button>
            <el-button link type="danger" @click="delSrc(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
    <el-tab-pane label="数据集" name="ds">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openDs()">新建</el-button>
        <el-button size="small" @click="loadDatasets">刷新</el-button>
      </div>
      <el-table :data="datasets" border size="small">
        <el-table-column prop="code" label="编码" width="140" show-overflow-tooltip />
        <el-table-column prop="category" label="分类" width="120" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column label="数据形态" min-width="140">
          <template #default="{ row }">{{ datasetRowShapeLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="数据源" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.kind === 'static'">—</span>
            <span v-else>{{ row.data_source?.name || (row.data_source_id ? `#${row.data_source_id}` : '未选择') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="kind" label="kind" width="100" />
        <el-table-column label="操作" width="480">
          <template #default="{ row }">
            <el-button v-if="row.kind === 'static'" link type="success" @click="openGenStatic(row)">生成CRUD接口</el-button>
            <el-button v-if="row.kind === 'query' || row.kind === 'buffer' || row.kind === 'transaction'" link type="warning" @click="openGenList(row)">生成 CRUD 接口</el-button>
            <el-button link type="info" @click="openDlgStructures(row)">结构</el-button>
            <el-button link type="primary" @click="openDatasetDebug(row)">调试</el-button>
            <el-button link @click="previewDs(row)">预览</el-button>
            <el-button link @click="openDs(row)">编辑</el-button>
            <el-button link type="danger" @click="delDs(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
    <el-tab-pane label="数据接口" name="iface">
      <div class="tbar">
        <el-button type="primary" size="small" @click="openIface()">新建</el-button>
        <el-button size="small" @click="loadIfaces">刷新</el-button>
        <el-button size="small" type="danger" :disabled="ifaceSelection.length === 0" @click="batchDelIface">批量删除{{ ifaceSelection.length ? `(${ifaceSelection.length})` : '' }}</el-button>
      </div>
      <el-table :data="ifaces" border size="small" @selection-change="ifaceSelection = $event">
        <el-table-column type="selection" width="42" />
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="code" label="编码（开放 URL）" width="180" show-overflow-tooltip />
        <el-table-column prop="slug" label="slug" width="140" show-overflow-tooltip />
        <el-table-column prop="kind" label="类型" width="100" />
        <el-table-column prop="category" label="分类" width="120" />
        <el-table-column prop="static_crud_op" label="静态CRUD" width="90" show-overflow-tooltip />
        <el-table-column label="数据集" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ datasetNameById(row.dataset_id, row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button link type="primary" @click="openIfaceDebug(row)">调试</el-button>
            <el-button link @click="openIface(row)">编辑</el-button>
            <el-button v-if="row.schema_json && row.schema_json.trim()" link type="success" @click="openIfaceMock(row)">模拟数据</el-button>
            <el-button link type="danger" @click="delIface(row)">删</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-tab-pane>
  </el-tabs>

  <el-dialog v-model="dlgSrc" :title="srcForm.id ? '数据源' : '新建数据源'" width="720px">
    <el-form label-width="108px">
      <el-form-item label="编码" required>
        <el-input v-model="srcForm.code" placeholder="字母开头，如 main_db、src_orders" />
        <div class="field-tip">管理端 API 与文档链接优先使用编码；留空则保存时由名称自动生成。</div>
      </el-form-item>
      <el-form-item label="名称"><el-input v-model="srcForm.name" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="srcForm.type" style="width: 100%" @change="onSrcTypeChange">
          <el-option label="sqlite" value="sqlite" />
          <el-option label="mysql" value="mysql" />
          <el-option label="postgres" value="postgres" />
          <el-option label="sqlserver" value="sqlserver" />
        </el-select>
      </el-form-item>
      <el-collapse>
        <el-collapse-item title="常用连接字段（生成 DSN）" name="conn">
          <template v-if="srcForm.type === 'sqlite'">
            <el-form-item label="文件路径">
              <el-input v-model="srcConn.sqlite_path" placeholder="./data/my.db 或 file:..." />
            </el-form-item>
          </template>
          <template v-else>
            <el-form-item label="主机"><el-input v-model="srcConn.host" placeholder="127.0.0.1" /></el-form-item>
            <el-form-item label="端口">
              <el-input-number v-model="srcConn.port" :min="1" :max="65535" controls-position="right" style="width: 160px" />
            </el-form-item>
            <el-form-item label="用户"><el-input v-model="srcConn.user" /></el-form-item>
            <el-form-item label="密码"><el-input v-model="srcConn.password" type="password" show-password /></el-form-item>
            <el-form-item label="数据库"><el-input v-model="srcConn.database" /></el-form-item>
          </template>
          <el-button type="primary" plain size="small" @click="applyBuildDsnFromForm">用上方字段生成 DSN</el-button>
        </el-collapse-item>
        <el-collapse-item title="连接池（写入 config_json，打开连接时生效）" name="pool">
          <el-form-item label="MaxOpen">
            <el-input-number v-model="srcPool.max_open" :min="0" :max="5000" controls-position="right" style="width: 160px" />
            <span class="field-tip" style="margin-left: 8px">0 表示不设置</span>
          </el-form-item>
          <el-form-item label="MaxIdle">
            <el-input-number v-model="srcPool.max_idle" :min="0" :max="5000" controls-position="right" style="width: 160px" />
          </el-form-item>
          <el-form-item label="连接最长存活秒">
            <el-input-number v-model="srcPool.conn_max_lifetime_sec" :min="0" :max="86400" controls-position="right" style="width: 160px" />
            <span class="field-tip" style="margin-left: 8px">0 表示不限制</span>
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
      <el-form-item label="DSN">
        <el-input v-model="srcForm.dsn" type="textarea" :rows="3" />
        <div class="field-tip">可直接编辑；也可用上方「生成 DSN」填充。连接池参数保存在 config_json。</div>
      </el-form-item>
      <el-form-item label="只读"><el-switch v-model="srcForm.read_only" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgSrc = false">取消</el-button>
      <el-button type="primary" @click="saveSrc">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="dlgStructures"
    title="数据结构"
    width="720px"
    destroy-on-close
    @opened="onStructuresDialogOpened"
    @closed="onStructuresDialogClosed"
  >
    <template v-if="structureDataset">
      <!-- 物理表结构管理：有表绑定 + 数据源非只读时显示 -->
      <template v-if="structureTableName && !structureSourceReadOnly">
        <div class="tbar" style="margin-bottom:6px;gap:8px">
          <el-button type="primary" size="small" @click="openStForm()">新增字段</el-button>
          <el-button size="small" @click="loadStructures(); loadStructureCols()">刷新</el-button>
          <el-button
            v-if="structureColsDraft.length && normalizeDialectKey(structureDialect) !== 'sqlite'"
            size="small" type="warning"
            :loading="structureColsModifyBusy"
            @click="runStructureModifyCols"
          >应用列修改</el-button>
          <el-tag v-if="normalizeDialectKey(structureDialect) === 'sqlite'" type="info" size="small">SQLite 不支持修改列定义</el-tag>
        </div>
        <el-table
          v-if="structureColsDraft.length"
          :data="structureColsDraft"
          border size="small"
          max-height="280"
          style="width:100%"
        >
          <el-table-column prop="name" label="字段名" min-width="110" />
          <el-table-column label="类型" min-width="140">
            <template #default="{ row }">
              <el-select
                v-if="normalizeDialectKey(structureDialect) !== 'sqlite'"
                v-model="row.data_type"
                filterable allow-create default-first-option
                size="small" style="width:100%"
              >
                <el-option v-for="t in suggestedSqlTypes(structureDialect)" :key="t" :label="t" :value="t" />
              </el-select>
              <span v-else>{{ row.data_type }}</span>
            </template>
          </el-table-column>
          <el-table-column label="主键" width="56" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.primary_key" type="success" size="small">PK</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="自增" width="56" align="center">
            <template #default="{ row }">
              <el-checkbox
                v-if="normalizeDialectKey(structureDialect) === 'mysql' && isIntegerSqlType(row.data_type)"
                v-model="row.auto_increment"
                size="small"
              />
              <el-tag v-else-if="row.auto_increment" type="warning" size="small">AI</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可空" width="56" align="center">
            <template #default="{ row }">
              <el-checkbox
                v-if="normalizeDialectKey(structureDialect) !== 'sqlite' && !row.primary_key"
                v-model="row.nullable"
                size="small"
              />
              <span v-else>{{ row.nullable ? '是' : '否' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="默认值" min-width="110">
            <template #default="{ row }">
              <el-input
                v-if="normalizeDialectKey(structureDialect) !== 'sqlite'"
                v-model="row.default_expr"
                size="small"
                placeholder="可选"
                clearable
              />
              <span v-else>{{ row.default_expr }}</span>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else-if="!structureColsLoading" description="暂无列信息" style="padding:12px 0" />
        <div style="margin-top:12px">
          <div style="font-size:13px;color:var(--el-text-color-secondary);margin-bottom:6px">执行 DDL（ADD COLUMN / ALTER TABLE 等）</div>
          <el-input
            v-model="structureAlterDdl"
            type="textarea"
            :rows="3"
            placeholder="ALTER TABLE my_table ADD COLUMN remark TEXT;"
          />
          <div style="margin-top:6px;display:flex;gap:8px;align-items:center">
            <el-button
              type="warning"
              :loading="structureAlterBusy"
              :disabled="!structureAlterDdl.trim()"
              @click="runStructureAlterDdl"
            >执行</el-button>
            <span class="field-tip" style="margin:0">执行后自动刷新列信息。</span>
          </div>
        </div>
      </template>
    </template>
    <el-dialog v-model="dlgStForm" :title="stForm.id ? '编辑结构' : '新建结构'" width="680px" append-to-body>
      <el-form label-width="100px">
        <el-form-item label="编码" required><el-input v-model="stForm.code" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="stForm.name" /></el-form-item>
        <el-form-item label="字段定义">
          <div style="width:100%">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <el-button type="primary" link size="small" @click="addStSchemaField">+ 添加字段</el-button>
              <el-button link size="small" @click="stSchemaRawMode = !stSchemaRawMode">
                {{ stSchemaRawMode ? '切换可视化' : '编辑原始 JSON' }}
              </el-button>
            </div>
            <template v-if="!stSchemaRawMode">
              <el-table :data="stSchemaFields" border size="small" style="width:100%">
                <el-table-column label="字段名" min-width="120">
                  <template #default="{ row }">
                    <el-input v-model="row.name" size="small" @change="syncFieldsToSchemaJson" />
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="110">
                  <template #default="{ row }">
                    <el-select v-model="row.type" size="small" @change="syncFieldsToSchemaJson">
                      <el-option value="string" label="string" />
                      <el-option value="number" label="number" />
                      <el-option value="integer" label="integer" />
                      <el-option value="boolean" label="boolean" />
                      <el-option value="array" label="array" />
                      <el-option value="object" label="object" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="默认值" min-width="100">
                  <template #default="{ row }">
                    <el-input v-model="row.default" size="small" @change="syncFieldsToSchemaJson" />
                  </template>
                </el-table-column>
                <el-table-column label="描述" min-width="120">
                  <template #default="{ row }">
                    <el-input v-model="row.description" size="small" @change="syncFieldsToSchemaJson" />
                  </template>
                </el-table-column>
                <el-table-column width="52" fixed="right">
                  <template #default="{ $index }">
                    <el-button link type="danger" size="small" @click="removeStSchemaField($index)">删</el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-if="!stSchemaFields.length" class="field-tip" style="margin-top:4px">暂无字段，点击「+ 添加字段」</div>
            </template>
            <el-input
              v-else
              v-model="stForm.schema_json"
              type="textarea"
              :rows="8"
              placeholder='{"type":"object","properties":{"id":{"type":"integer"}}}'
              @blur="stSchemaFields = schemaJsonToFields(stForm.schema_json)"
            />
          </div>
        </el-form-item>
        <el-form-item label="默认参数">
          <el-input v-model="stForm.default_param_values" type="textarea" :rows="3" placeholder='{"limit":100}' />
          <div class="field-tip">调用接口时若未传对应参数，将使用此处默认值填充。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgStForm = false">取消</el-button>
        <el-button type="primary" :loading="stSaving" @click="saveStForm">保存</el-button>
      </template>
    </el-dialog>
  </el-dialog>

  <DatasetForm
    v-model="dlgDs"
    :form="dsForm"
    :sources="sources"
    :custom-event-defs="customEventDefs"
    :custom-event-groups="customEventGroups"
    :outbound-webhooks="outboundWebhooks"
    :is-editing="dsDatasetEditing"
    :initial-ds-core-shape="dsCoreShape"
    :initial-ds-table-binding-mode="dsTableBindingMode"
    :initial-table-ui="dsTableUi"
    :initial-ingress-form="dsIngressFormSnapshot"
    :initial-evt-bind-form="dsEvtBindFormSnapshot"
    @save="onDatasetFormSave"
    @sync-columns="syncDsColumnsToParamSchema"
    @gen-crud="onGenCrudFromDataset"
  />

  <el-dialog v-model="dlgIface" :title="ifaceForm.id ? '数据接口' : '新建接口'" width="640px">
    <el-form label-width="100px">
      <el-form-item label="名称"><el-input v-model="ifaceForm.name" /></el-form-item>
      <el-form-item label="编码" required>
        <el-input v-model="ifaceForm.code" placeholder="开放路径 /api/open/v1/data/{编码}" />
        <div class="field-tip">第三方调用以编码为准；留空保存时将沿用 slug。</div>
      </el-form-item>
      <el-form-item label="slug">
        <el-input v-model="ifaceForm.slug" placeholder="可与编码相同；须字母开头 2–50 位" />
      </el-form-item>
      <el-form-item label="分类"><el-input v-model="ifaceForm.category" placeholder="接口侧分类" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="ifaceForm.kind" style="width: 100%" @change="onIfaceKindChange">
          <el-option label="query" value="query" />
          <el-option label="queryOne" value="queryOne" />
          <el-option label="transaction" value="transaction" />
        </el-select>
        <div class="field-tip">query 返回列表；queryOne 返回单条记录；transaction 仅可选「事务」类数据集。</div>
      </el-form-item>
      <el-form-item label="数据集" required>
        <el-select
          v-model="ifaceForm.dataset_id"
          placeholder="请选择数据集"
          filterable
          style="width: 100%"
          @change="onIfaceDatasetChange"
        >
          <el-option
            v-for="d in datasetsForIfaceKind(ifaceForm.kind)"
            :key="d.id"
            :label="`${d.name} (${d.code || d.id}) · ${datasetRowShapeLabel(d)}`"
            :value="d.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="ifaceForm.kind === 'query' || ifaceForm.kind === 'queryOne'" label="数据结构">
        <el-select
          v-model="ifaceForm.data_structure_id"
          clearable
          filterable
          placeholder="可选：绑定列契约与默认参数"
          style="width: 100%"
        >
          <el-option v-for="s in ifaceStructureList" :key="s.id" :label="`${s.name} (${s.code})`" :value="s.id" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="ifaceForm.kind === 'query' || ifaceForm.kind === 'queryOne'" label="接口默认参数">
        <el-input v-model="ifaceForm.param_defaults_json" type="textarea" :rows="3" placeholder='{"limit":200} — 仅补充请求未传的键' />
      </el-form-item>
      <template v-if="(ifaceForm.kind === 'query' || ifaceForm.kind === 'queryOne') && !ifaceForm.static_crud_op && ifaceSqlParamCandidates.length">
        <el-form-item label="接口参数化">
          <el-switch v-model="ifaceParamSyncEnabled" active-text="保存时写入数据集 param_schema" inactive-text="不同步" />
          <div class="field-tip">
            从当前数据集 SQL 的 <code>:name</code> 占位符中<strong>勾选</strong>要纳入参数说明的项；保存接口成功后写入绑定数据集的
            <code>param_schema</code>（JSON Schema），供开放调试、补全与文档。多接口共用同一数据集时以<strong>最后一次保存</strong>为准。
          </div>
        </el-form-item>
        <el-form-item v-if="ifaceParamSyncEnabled" label="暴露的参数">
          <div class="row-flex iface-param-toolbar">
            <el-button link type="primary" size="small" @click="ifaceSelectAllSqlParams">全选</el-button>
            <el-button link size="small" @click="ifaceClearSqlParams">全不选</el-button>
            <el-button link size="small" @click="syncIfaceParamSelectionFromDataset">按 SQL 重置候选</el-button>
          </div>
          <el-checkbox-group v-model="ifaceSelectedSqlParams" class="iface-param-checks">
            <el-checkbox v-for="k in ifaceSqlParamCandidates" :key="k" :label="k">
              <code>:{{ k }}</code>
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </template>
      <el-form-item v-if="ifaceForm.static_crud_op" label="静态CRUD">
        <el-input :model-value="ifaceForm.static_crud_op" disabled />
        <span class="field-tip">由「生成CRUD接口」自动写入；勿手改 slug 前缀以免与开放路由不一致。</span>
      </el-form-item>
      <el-form-item v-if="ifaceForm.kind === 'transaction'" label="执行步骤">
        <el-input
          v-model="ifaceForm.steps_json"
          type="textarea"
          :rows="5"
          placeholder='[{"sql":"INSERT INTO `t` (`name`) VALUES (:name)","label":"新增"}]'
        />
        <div class="field-tip">JSON 数组，每项 {"sql":"...","label":"..."}；留空则使用数据集的 steps_json。</div>
      </el-form-item>
      <el-form-item label="字段 Schema">
        <el-input
          v-model="ifaceForm.schema_json"
          type="textarea"
          :rows="5"
          :readonly="!!ifaceForm.static_crud_op"
          placeholder='{"type":"object","properties":{"id":{"type":"number"},...}}'
        />
        <div class="row-flex" style="gap:8px;margin-top:4px">
          <el-button
            v-if="!ifaceForm.static_crud_op"
            link
            type="primary"
            size="small"
            @click="mergeIfaceSchemaFromDataset"
          >补全（从数据集 param_schema 合并）</el-button>
          <span class="field-tip" style="margin:0">
            {{ ifaceForm.static_crud_op ? '由生成时自动写入，只读。' : '可选；用于一键生成模拟数据与接口文档。' }}
          </span>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgIface = false">取消</el-button>
      <el-button type="primary" @click="saveIface">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgIfaceMock" title="模拟数据" width="640px" destroy-on-close>
    <div v-if="ifaceMockJson" style="position:relative">
      <el-input v-model="ifaceMockJson" type="textarea" :rows="16" readonly />
      <el-button
        size="small"
        style="position:absolute;top:6px;right:6px"
        @click="copyIfaceMock"
      >复制</el-button>
    </div>
    <el-empty v-else description="该接口未配置 schema_json，无法生成模拟数据" />
    <template #footer>
      <el-button @click="dlgIfaceMock = false">关闭</el-button>
      <el-button v-if="ifaceMockJson" type="primary" @click="regenerateIfaceMock">重新生成</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgDataDebug" title="接口调试" width="920px" destroy-on-close @closed="dataDebugRow = null">
    <template v-if="dataDebugRow">
      <p class="field-tip">
        类型：<strong>{{ dataDebugKind === 'dataset' ? '数据集' : '数据接口' }}</strong>
        · {{ dataDebugKind === 'dataset' ? dataDebugRow.name : `${dataDebugRow.name} (${dataDebugRow.slug})` }}
      </p>
      <el-alert
        v-if="dataDebugKind === 'iface'"
        type="info"
        :closable="false"
        show-icon
        title="调用方式与「自定义应用 / 出站 HTTP」一致：路径 + API Key + Headers + JSON Body；下方可复制 curl。连接器链中请勿让出站 HTTP 回调本开放 URL，以免环状调用。"
        style="margin-bottom: 12px"
      />

      <el-collapse v-model="dataDebugCollapse" class="debug-collapse">
        <el-collapse-item v-if="dataDebugKind === 'iface'" title="开放接口调用（公网 / 第三方）" name="open">
          <el-descriptions :column="1" border size="small" class="debug-inv-desc">
            <el-descriptions-item label="URL">
              <div class="row-copy">
                <code class="url-line">{{ openDataIfaceAbsUrl }}</code>
                <el-button size="small" @click="copyText(openDataIfaceAbsUrl)">复制</el-button>
              </div>
              <div class="field-tip" style="margin-top: 4px">与浏览器同源前缀一致；生产环境请替换为实际网关域名。</div>
            </el-descriptions-item>
            <el-descriptions-item label="Method">
              接口配置：<strong>{{ (dataDebugRow.method || 'POST').toUpperCase() }}</strong>；带
              <code>param_values</code> 时请使用 <strong>POST</strong>（GET 无 body，等价空参数）。
            </el-descriptions-item>
            <el-descriptions-item label="Headers">
              <pre class="mono block tight">{{ openInvokeHeadersBlock }}</pre>
              <el-button size="small" @click="copyText(openInvokeHeadersBlock)">复制 Headers</el-button>
            </el-descriptions-item>
            <el-descriptions-item v-if="dataDebugRow.required_scopes" label="required_scopes（接口）">
              <code>{{ dataDebugRow.required_scopes }}</code>
              <div class="field-tip">API Key 的 permissions JSON 数组须<strong>额外包含</strong>以上每个 scope。</div>
            </el-descriptions-item>
            <el-descriptions-item label="API Key 权限提示">
              <code>{{ ifaceOpenScopesHint }}</code>
            </el-descriptions-item>
            <el-descriptions-item label="Body（POST JSON）">
              <pre class="mono block tight">{{ openInvokeBodyJson }}</pre>
              <el-button size="small" @click="copyText(openInvokeBodyJson)">复制 Body</el-button>
            </el-descriptions-item>
            <el-descriptions-item label="curl 示例">
              <pre class="mono block tight">{{ curlOpenInvokeExample }}</pre>
              <el-button size="small" @click="copyText(curlOpenInvokeExample)">复制 curl</el-button>
            </el-descriptions-item>
          </el-descriptions>
        </el-collapse-item>

        <el-collapse-item title="管理端调试（当前登录 Bearer）" name="admin">
          <el-descriptions :column="1" border size="small" class="debug-inv-desc">
            <el-descriptions-item label="URL">
              <div class="row-copy">
                <code class="url-line">{{ adminDebugAbsUrl }}</code>
                <el-button size="small" @click="copyText(adminDebugAbsUrl)">复制</el-button>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="Method">POST</el-descriptions-item>
            <el-descriptions-item label="Headers">
              <pre class="mono block tight">{{ adminDebugHeadersBlock }}</pre>
              <el-button size="small" @click="copyText(adminDebugHeadersBlock)">复制 Headers</el-button>
            </el-descriptions-item>
            <el-descriptions-item label="Body">
              <pre class="mono block tight">{{ adminDebugBodyJson }}</pre>
              <el-button size="small" @click="copyText(adminDebugBodyJson)">复制 Body</el-button>
            </el-descriptions-item>
            <el-descriptions-item label="curl 示例">
              <pre class="mono block tight">{{ curlAdminDebugExample }}</pre>
              <el-button size="small" @click="copyText(curlAdminDebugExample)">复制 curl</el-button>
            </el-descriptions-item>
          </el-descriptions>
          <p v-if="dataDebugKind === 'dataset'" class="field-tip">
            仅预览数据可用 <code>POST {{ adminPreviewPath }}</code>，Body 形态与上表相同（无 <code>debug</code> 扩展字段）。
          </p>
        </el-collapse-item>
      </el-collapse>

      <el-form v-if="dataDebugParamSchemaText" label-width="108px">
        <el-form-item label="param_schema">
          <el-input :model-value="dataDebugParamSchemaText" type="textarea" :rows="3" readonly />
          <div class="field-tip">绑定数据集的参数说明；与 SQL 中 <code>:name</code> 占位符、下方补全键名一致。</div>
        </el-form-item>
      </el-form>
      <el-form
        v-if="dataDebugKind === 'iface' && dataDebugRow?.kind === 'transaction'"
        label-width="108px"
        style="margin-bottom:0"
      >
        <el-form-item label="执行步骤">
          <el-input
            v-model="dataDebugStepsJson"
            type="textarea"
            :rows="4"
            placeholder='[{"sql":"INSERT INTO `t` (`name`) VALUES (:name)","label":"新增"}]'
          />
          <div class="row-flex" style="gap:8px;margin-top:4px">
            <div class="field-tip" style="margin:0">可临时覆盖接口的 steps_json；留空则使用接口/数据集原始配置。</div>
            <el-button link type="primary" size="small" @click="saveDebugStepsJson">保存到接口</el-button>
          </div>
        </el-form-item>
      </el-form>
      <el-form label-width="108px">
        <el-form-item v-if="showDataDebugModeSwitch" label="调试形式">
          <el-radio-group v-model="dataDebugExecMode">
            <el-radio-button value="transaction">事务（steps 演练并回滚）</el-radio-button>
            <el-radio-button value="query">查询（definition SQL）</el-radio-button>
          </el-radio-group>
          <div class="field-tip">
            事务形态跑 <code>steps_json</code> 中的多条 SQL，结束后回滚不写库；查询形态只执行「首条 SQL（definition）」作只读查询，与预览类数据集行为一致。
          </div>
        </el-form-item>
        <el-form-item label="param_values">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;width:100%">
            <el-button type="primary" link size="small" @click="fillDataDebugMockParams">一键填充模拟数据</el-button>
            <el-button link size="small" @click="fillDataDebugMockParams">刷新模拟数据</el-button>
            <el-button link size="small" @click="formatDataDebugParamJson">格式化 JSON</el-button>
          </div>
          <JsonParamValuesEditor
            v-model="dataDebugParamJson"
            :suggested-keys="dataDebugSuggestedParamKeys"
            :min-height="220"
            placeholder='{ "order_id": 1 } — 对应 SQL 中 :order_id'
            hint-text="JSON 高亮与校验；键名来自 SQL :占位符与 param_schema。在「{」或「,」后常自动弹出键补全，也可按 Ctrl+Space 打开补全。"
          />
        </el-form-item>
        <el-form-item v-if="showDataDebugLimit" label="limit">
          <el-input-number v-model="dataDebugLimit" :min="1" :max="5000" />
        </el-form-item>
      </el-form>
      <el-button type="primary" :loading="dataDebugBusy" @click="runDataDebug">执行调试</el-button>
      <div v-if="dataDebugResult" class="debug-out">
        <el-alert v-if="dataDebugResult.error" type="error" :title="String(dataDebugResult.error)" :closable="false" show-icon />
        <template v-else>
          <el-descriptions v-if="dataDebugResult.elapsed_ms != null" :column="2" border size="small" class="debug-meta">
            <el-descriptions-item label="kind">{{ dataDebugResult.kind }}</el-descriptions-item>
            <el-descriptions-item label="耗时 ms">{{ dataDebugResult.elapsed_ms }}</el-descriptions-item>
            <el-descriptions-item v-if="dataDebugResult.debug_mode" label="调试形式">{{ dataDebugResult.debug_mode }}</el-descriptions-item>
            <el-descriptions-item v-if="dataDebugResult.sql" label="SQL" :span="2">
              <pre class="mono">{{ dataDebugResult.sql }}</pre>
            </el-descriptions-item>
            <el-descriptions-item v-if="dataDebugResult.arg_count != null" label="参数个数">{{ dataDebugResult.arg_count }}</el-descriptions-item>
            <el-descriptions-item v-if="dataDebugResult.rolled_back" label="事务">已回滚（仅演练）</el-descriptions-item>
            <el-descriptions-item v-if="dataDebugResult.slug" label="slug">{{ dataDebugResult.slug }}</el-descriptions-item>
          </el-descriptions>
          <div v-if="dataDebugResult.steps_sql?.length" class="field-tip">事务步骤 SQL：</div>
          <pre v-if="dataDebugResult.steps_sql?.length" class="mono block">{{ dataDebugResult.steps_sql.join('\n---\n') }}</pre>
          <div class="field-tip" style="margin-top: 10px">data（行 JSON）：</div>
          <pre class="mono block">{{ prettyDataDebugJson(dataDebugResult.data) }}</pre>
        </template>
      </div>

      <!-- event_bound 最近入表数据 -->
      <template v-if="dataDebugKind === 'dataset' && dataDebugRow?.kind === 'event_bound'">
        <el-divider />
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-weight:600">最近入表数据</span>
          <el-input-number v-model="eventRowsLimit" :min="1" :max="500" size="small" style="width:100px" />
          <el-button size="small" :loading="eventRowsBusy" @click="loadEventRows">查询</el-button>
          <span v-if="eventRowsTable" class="field-tip" style="margin:0">表：<code>{{ eventRowsTable }}</code></span>
        </div>
        <el-alert v-if="eventRowsError" type="error" :title="eventRowsError" :closable="false" show-icon style="margin-bottom:8px" />
        <template v-if="eventRowsCols.length">
          <el-table :data="eventRowsData" border size="small" max-height="300" style="width:100%">
            <el-table-column type="index" width="48" />
            <el-table-column
              v-for="col in eventRowsDataCols"
              :key="col"
              :prop="col"
              :label="col"
              min-width="110"
              show-overflow-tooltip
            />
            <el-table-column label="载荷" width="72" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="openEventPayload(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="field-tip" style="margin-top:4px">共 {{ eventRowsData.length }} 行，系统列（id / created_at）已置首</div>
        </template>
        <el-empty v-else-if="eventRowsLoaded" description="暂无数据" />

        <!-- 原始载荷抽屉 -->
        <el-drawer
          v-model="eventPayloadDrawer"
          title="原始载荷"
          direction="rtl"
          size="480px"
          :append-to-body="true"
          destroy-on-close
        >
          <template v-if="eventPayloadRow">
            <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
              <el-button size="small" @click="copyText(eventPayloadJson)">复制 JSON</el-button>
            </div>
            <pre class="mono block tight event-payload-pre">{{ eventPayloadJson }}</pre>
            <el-divider />
            <el-descriptions :column="1" border size="small">
              <el-descriptions-item v-for="(val, key) in eventPayloadRow" :key="key" :label="String(key)">
                <code>{{ val == null ? 'null' : String(val) }}</code>
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-drawer>
      </template>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgPreview" title="数据集预览" fullscreen destroy-on-close @closed="previewRow = null">
    <div v-loading="previewBusy" style="display:flex;flex-direction:column;height:calc(100vh - 120px)">
      <el-table
        v-if="previewCols.length"
        :data="previewRows"
        border
        size="small"
        style="flex:1;overflow:auto"
        height="100%"
        row-key="_idx"
      >
        <el-table-column
          v-for="col in previewCols"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
      <el-empty v-else description="无数据" />
      <div style="display:flex;justify-content:flex-end;margin-top:12px;flex-shrink:0">
        <el-pagination
          v-model:current-page="previewPage"
          v-model:page-size="previewPageSize"
          :total="previewTotal"
          :page-sizes="[50, 100, 200, 500, 1000]"
          layout="total, sizes, prev, pager, next"
          @current-change="onPreviewPageChange"
          @size-change="onPreviewPageSizeChange"
        />
      </div>
    </div>
  </el-dialog>

  <el-dialog v-model="dlgGenStatic" title="一键生成静态表 CRUD 开放接口" width="520px" destroy-on-close @closed="genStaticTarget = null">
    <p class="field-tip">
      将创建 4 个 slug：<code>{{ genStaticForm.base_slug }}-list|create|update|delete</code>。列表需 API Key 范围
      <code>open:dataiface:query</code>，增删改需 <code>open:dataiface:write</code>。
    </p>
    <el-form label-width="100px">
      <el-form-item label="slug 前缀" required>
        <el-input v-model="genStaticForm.base_slug" placeholder="字母开头，如 demo_kpi" />
      </el-form-item>
      <el-form-item label="分类">
        <el-input v-model="genStaticForm.category" placeholder="可选，写入接口 category" clearable />
      </el-form-item>
      <el-form-item label="分组">
        <el-select v-model="genStaticForm.group_id" clearable placeholder="可选" style="width: 100%">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgGenStatic = false">取消</el-button>
      <el-button type="primary" :loading="genBusy" @click="submitGenStatic">生成</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="dlgGenList" title="生成 CRUD 开放接口" width="60%" destroy-on-close @closed="genListTarget = null">
    <p class="field-tip">
      按所选操作批量生成开放接口，slug 规则：<code>{{ genListForm.base_slug || 'xxx' }}-list</code>、<code>-get</code>、<code>-create</code> 等。
      需 API Key 含 <code>open:dataiface:query</code>（读）或 <code>open:dataiface:exec</code>（写）。
      <template v-if="genListReadOnly"><br><el-tag type="warning" size="small" style="margin-top:4px">数据源只读，写操作不可用</el-tag></template>
      <template v-if="genListQueryOnly"><br><el-tag type="info" size="small" style="margin-top:4px">query 类数据集仅支持只读接口，写操作已禁用</el-tag></template>
    </p>
    <el-form label-width="100px">
      <el-form-item label="slug 前缀" required>
        <el-input v-model="genListForm.base_slug" placeholder="如 orders_api" />
      </el-form-item>
      <el-form-item label="操作" required>
        <el-checkbox-group v-model="genListForm.ops">
          <el-checkbox
            v-for="op in ALL_OPS"
            :key="op.value"
            :value="op.value"
            :disabled="op.write && (genListReadOnly || genListQueryOnly)"
          >{{ op.label }}</el-checkbox>
        </el-checkbox-group>
      </el-form-item>
      <el-form-item label="数据表" required>
        <el-select
          v-model="genListForm.table"
          filterable
          allow-create
          default-first-option
          placeholder="选已有表或输入新表名"
          style="width: 100%"
          @visible-change="v => v && loadGenListTables()"
        >
          <el-option v-for="t in genListTables" :key="t" :label="t" :value="t" />
        </el-select>
        <div class="field-tip">打开下拉时自动加载当前数据集数据源的表列表；也可直接输入表名。</div>
      </el-form-item>
      <el-form-item label="主键字段">
        <el-input v-model="genListForm.primary_key" placeholder="默认 id" style="width: 200px" />
        <span class="field-tip" style="margin-left:8px">用于 get / update / delete 的 WHERE 条件</span>
      </el-form-item>
      <el-form-item v-if="genListForm.table?.trim()" label="字段列表">
        <el-table
          v-loading="genListColsLoading"
          :data="genListCols"
          border
          size="small"
          style="width: 100%"
          max-height="220"
          empty-text="暂无字段信息"
        >
          <el-table-column prop="name" label="字段名" min-width="120" />
          <el-table-column prop="data_type" label="类型" min-width="120" />
          <el-table-column label="主键" width="64" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.primary_key" type="success" size="small">PK</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="自增" width="64" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.auto_increment" type="warning" size="small">AI</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="可空" width="64" align="center">
            <template #default="{ row }">
              <span>{{ row.nullable ? '是' : '否' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="default_expr" label="默认值" min-width="120" show-overflow-tooltip />
        </el-table>
      </el-form-item>
      <el-form-item v-if="!genListForm.table?.trim()" label="建表（可选）">
        <CreateTableColumnDesigner
          v-model:table-name="genListUi.newTableName"
          v-model:columns="genListUi.columns"
          :dialect="genListSqlDialect"
          @update:ddl="onGenListDesignerDdl"
        />
        <el-button
          v-if="genListUi.newTableName?.trim()"
          link
          type="primary"
          size="small"
          style="margin-top: 4px"
          @click="genListForm.table = genListUi.newTableName.trim()"
        >
          将设计表名填入上方「数据表」
        </el-button>
        <div class="row-flex" style="margin-top: 8px">
          <el-switch
            v-model="genListUi.ddlManual"
            inline-prompt
            active-text="手动 DDL"
            inactive-text="表格生成"
          />
        </div>
        <SqlDialectEditor
          v-model="genListDdl"
          :dialect="genListSqlDialect"
          :table-names="genListTables"
          mode="ddl"
          :read-only="!genListUi.ddlManual"
          :min-height="120"
          placeholder="若需先建表，写 CREATE TABLE ... 后点执行"
        />
        <el-button
          type="warning"
          size="small"
          style="margin-top: 6px"
          :loading="genListDdlBusy"
          :disabled="!genListTarget?.data_source_id && !genListTarget?.data_source?.id"
          @click="runGenListDdl"
        >
          执行建表
        </el-button>
      </el-form-item>
      <el-form-item label="数据集名称">
        <el-input v-model="genListForm.name" placeholder="可选，默认表名" clearable />
      </el-form-item>
      <el-form-item label="分类">
        <el-input v-model="genListForm.category" clearable />
      </el-form-item>
      <el-form-item label="分组">
        <el-select v-model="genListForm.group_id" clearable placeholder="可选" style="width: 100%">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlgGenList = false">取消</el-button>
      <el-button type="primary" :loading="genBusy" @click="submitGenList">生成</el-button>
    </template>
  </el-dialog>

  <!-- 连接池状态抽屉 -->
  <el-drawer v-model="dlgPoolStats" :title="`连接池状态 — ${poolStatsRow?.name || ''}`" size="400px">
    <div v-if="poolStatsLoading" style="padding: 24px; text-align: center">
      <el-icon class="is-loading"><Loading /></el-icon> 加载中…
    </div>
    <template v-else-if="poolStats">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="当前开连接数">{{ poolStats.open_connections }}</el-descriptions-item>
        <el-descriptions-item label="使用中">{{ poolStats.in_use }}</el-descriptions-item>
        <el-descriptions-item label="空闲">{{ poolStats.idle }}</el-descriptions-item>
        <el-descriptions-item label="等待队列">{{ poolStats.wait_count }}</el-descriptions-item>
        <el-descriptions-item label="等待耗时(ms)">{{ poolStats.wait_duration_ms }}</el-descriptions-item>
        <el-descriptions-item label="MaxOpenConns (配置)">{{ poolStats.config_max_open }}</el-descriptions-item>
        <el-descriptions-item label="MaxIdleConns (配置)">{{ poolStats.config_max_idle }}</el-descriptions-item>
        <el-descriptions-item label="ConnMaxLifetime(s) (配置)">{{ poolStats.config_max_lifetime_sec }}</el-descriptions-item>
        <el-descriptions-item label="MaxIdleClosed">{{ poolStats.max_idle_closed }}</el-descriptions-item>
        <el-descriptions-item label="MaxLifetimeClosed">{{ poolStats.max_lifetime_closed }}</el-descriptions-item>
      </el-descriptions>
      <div class="field-tip" style="margin-top: 12px">连接池由首次查询/测试时创建；若数据为全零请先点「测试」建立连接。</div>
    </template>
    <el-empty v-else description="暂无数据" />
  </el-drawer>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as api from '@/api/dataStack'
import * as ceApi from '@/api/customEventConfig'
import { listOutboundWebhooks } from '@/api/outbound'
import SqlDialectEditor from '@/components/SqlDialectEditor.vue'
import JsonParamValuesEditor from '@/components/JsonParamValuesEditor.vue'
import CreateTableColumnDesigner from '@/components/CreateTableColumnDesigner.vue'
import DatasetForm from './DatasetForm.vue'
import { defaultCreateColumns, suggestedSqlTypes, normalizeDialectKey, quoteIdent } from '@/utils/createTableDdl.js'
import { buildDsnFromFields, mergeDataSourceConfigJson } from '@/utils/sqlDsn.js'

function isIntegerSqlType (t) {
  return /^(int|bigint|smallint|tinyint|mediumint)(\s*\(.*\))?$/i.test(String(t || '').trim())
}

const route = useRoute()
const router = useRouter()
const VALID_TABS = ['src', 'ds', 'iface']
const tab = ref(VALID_TABS.includes(route.query.tab) ? route.query.tab : 'src')
watch(tab, v => router.replace({ query: { ...route.query, tab: v } }))
const sources = ref([])
const datasets = ref([])
const ifaces = ref([])
const ifaceSelection = ref([])

const dlgSrc = ref(false)
const srcForm = ref({
  id: null,
  code: '',
  name: '',
  type: 'sqlite',
  dsn: '',
  read_only: true,
  config_json: ''
})
const srcConn = reactive({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'mysql',
  sqlite_path: './data/app-manager.db'
})
const srcPool = reactive({
  max_open: 0,
  max_idle: 0,
  conn_max_lifetime_sec: 0
})

const dlgStructures = ref(false)
const structureDataset = ref(null)
const structureList = ref([])
const structureLoading = ref(false)
// physical table management within 数据结构 dialog
const structureCols = ref([])
const structureColsLoading = ref(false)
const structureAlterDdl = ref('')
const structureAlterBusy = ref(false)
const structureTableName = computed(() => {
  const ds = structureDataset.value
  if (!ds) return ''
  const meta = parseDatasetMetaFull(ds.meta_json != null ? String(ds.meta_json) : '')
  if (meta.table_name) return meta.table_name
  if (ds.kind === 'buffer') {
    const mo = safeJsonParse(ds.meta_json != null ? String(ds.meta_json) : '')
    return String(mo.ingress?.buffer_table || '').trim()
  }
  return ''
})
const structureSourceReadOnly = computed(() => {
  const ds = structureDataset.value
  if (!ds) return true
  const sid = ds.data_source_id ?? ds.data_source?.id
  const src = sources.value.find(s => s.id === sid)
  if (src) return src.read_only === true || src.read_only === 1
  return ds.data_source?.read_only === true || ds.data_source?.read_only === 1
})
const structureDialect = computed(() => {
  const ds = structureDataset.value
  if (!ds) return 'sqlite'
  return dialectForDataSourceId(ds.data_source_id ?? ds.data_source?.id)
})
// editable draft of structureCols
const structureColsDraft = ref([])
const structureColsModifyBusy = ref(false)
const dlgStForm = ref(false)
const stSaving = ref(false)
const stForm = ref({
  id: null,
  code: '',
  name: '',
  schema_json: '{}',
  default_param_values: ''
})

const ifaceStructureList = ref([])
const dlgDs = ref(false)
/** 扩展形态：与「固定表/动态 SQL」互斥；空字符串表示标准 query 数据集 */
const dsExtKind = ref('')
/** 仅 kind=query 且未选扩展时：fixed_table = 固定表或视图，dynamic_sql = 动态 SQL */
const dsCoreShape = ref('dynamic_sql')
/** table_binding.binding_mode 缓存，用于锁定选用表等 */
const dsTableBindingMode = ref('')
/** kind=buffer 时 meta.ingress 结构化编辑 */
const dsIngressForm = reactive({
  kind: 'http_webhook',
  buffer_table: '',
  poll_url: '',
  poll_interval_sec: 60,
  poll_method: 'GET',
  poll_headers_json: '',
  poll_body: '',
  webhook_secret: '',
  raw_column: 'payload',
  /** 轮询是否必须落物理表；false 对应 ingress.cache_required=false */
  cache_required_poll: true
})

// Snapshots passed to DatasetForm as initial props (plain objects, not reactive proxies)
const dsIngressFormSnapshot = ref(null)
const dsEvtBindFormSnapshot = ref(null)

// Custom event definitions + groups for event_bound dataset selection
const customEventDefs = ref([])
const customEventGroups = ref([])

// Outbound webhooks for event_bound webhook-push source
const outboundWebhooks = ref([])

// Pool stats drawer
const dlgPoolStats = ref(false)
const poolStatsRow = ref(null)
const poolStats = ref(null)
const poolStatsLoading = ref(false)

async function showPoolStats (row) {
  poolStatsRow.value = row
  poolStats.value = null
  dlgPoolStats.value = true
  poolStatsLoading.value = true
  try {
    const r = await api.getDataSourcePoolStats(row.id)
    poolStats.value = r.data
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '获取连接池状态失败')
  } finally {
    poolStatsLoading.value = false
  }
}
const dsForm = ref({
  id: null,
  code: '',
  name: '',
  category: '',
  data_source_id: null,
  kind: 'query',
  definition: 'SELECT 1',
  steps_json: '[]',
  param_schema: '',
  meta_json: ''
})
const dlgIface = ref(false)
const ifaceForm = ref({
  id: null,
  name: '',
  code: '',
  slug: '',
  category: 'default',
  kind: 'query',
  dataset_id: null,
  data_structure_id: null,
  param_defaults_json: '',
  static_crud_op: '',
  schema_json: '',
  steps_json: ''
})

/** 查询接口：是否将所选 SQL 参数写入绑定数据集的 param_schema */
const ifaceParamSyncEnabled = ref(false)
/** 勾选要写入 param_schema.properties 的占位符名（与 :name 一致） */
const ifaceSelectedSqlParams = ref([])

const ifaceSqlParamCandidates = computed(() => {
  if ((ifaceForm.value.kind !== 'query' && ifaceForm.value.kind !== 'queryOne') || ifaceForm.value.static_crud_op) return []
  const ds = datasets.value.find(d => d.id === ifaceForm.value.dataset_id)
  if (!ds || (ds.kind !== 'query' && ds.kind !== 'buffer')) return []
  return collectParamNamesFromDataset(ds)
})

const dlgPreview = ref(false)
const previewRows = ref([])
const previewCols = ref([])
const previewRow = ref(null)
const previewPage = ref(1)
const previewPageSize = ref(50)
const previewTotal = ref(0)
const previewBusy = ref(false)

/** 数据集 / 数据接口 调试 */
const dlgDataDebug = ref(false)
const dataDebugKind = ref('dataset')
const dataDebugRow = ref(null)
const dataDebugParamJson = ref('{}')
const dataDebugStepsJson = ref('')
const dataDebugLimit = ref(200)
const dataDebugResult = ref(null)
const dataDebugBusy = ref(false)
const dataDebugCollapse = ref(['open', 'admin'])
const eventRowsLimit = ref(50)
const eventRowsBusy = ref(false)
const eventRowsData = ref([])
const eventRowsCols = ref([])
const eventRowsTable = ref('')
const eventRowsError = ref('')
const eventRowsLoaded = ref(false)
const eventPayloadDrawer = ref(false)
const eventPayloadRow = ref(null)

// 系统列置首，其余按原顺序
const EVENT_SYS_COLS = ['id', 'created_at', 'updated_at']
const eventRowsDataCols = computed(() => {
  const cols = eventRowsCols.value
  const sys = cols.filter(c => EVENT_SYS_COLS.includes(c))
  const rest = cols.filter(c => !EVENT_SYS_COLS.includes(c))
  return [...sys, ...rest]
})
const eventPayloadJson = computed(() =>
  eventPayloadRow.value ? JSON.stringify(eventPayloadRow.value, null, 2) : ''
)
const openEventPayload = row => {
  eventPayloadRow.value = row
  eventPayloadDrawer.value = true
}

/** 事务类数据集 / transaction 接口：调试时用 definition 查询还是 steps 演练 */
const dataDebugExecMode = ref('transaction')

const showDataDebugModeSwitch = computed(() => {
  const row = dataDebugRow.value
  if (!row) return false
  if (dataDebugKind.value === 'dataset' && row.kind === 'transaction') return true
  return dataDebugKind.value === 'iface' && row.kind === 'transaction'
})

const showDataDebugLimit = computed(() => {
  const row = dataDebugRow.value
  if (!row) return true
  // CRUD 写操作不需要 limit
  const op = row.static_crud_op ? String(row.static_crud_op).toLowerCase().trim() : ''
  if (op && op !== 'list') return false
  // 事务接口/数据集（非 query 演练模式）不需要 limit
  if (row.kind === 'transaction' && dataDebugExecMode.value !== 'query') return false
  return true
})

const debugApiOrigin = computed(() => (typeof window !== 'undefined' ? window.location.origin || '' : ''))

/** 列表行：管理端路由键优先编码（与后端纯数字主键区分）。 */
function dataStackRouteKey (row) {
  if (row == null) return ''
  const c = row.code != null ? String(row.code).trim() : ''
  return c || String(row.id)
}

const openDataIfacePath = computed(() => {
  if (dataDebugKind.value !== 'iface' || !dataDebugRow.value) return ''
  const k = String(dataDebugRow.value.code || dataDebugRow.value.slug || '').trim()
  if (!k) return ''
  return `/api/open/v1/data/${encodeURIComponent(k)}`
})

const openDataIfaceAbsUrl = computed(() => {
  const p = openDataIfacePath.value
  return p ? `${debugApiOrigin.value}${p}` : ''
})

const adminDebugPath = computed(() => {
  if (!dataDebugRow.value?.id) return ''
  const k = encodeURIComponent(dataStackRouteKey(dataDebugRow.value))
  if (dataDebugKind.value === 'dataset') return `/api/data/datasets/${k}/debug`
  return `/api/data/interfaces/${k}/debug`
})

const adminDebugAbsUrl = computed(() => {
  const p = adminDebugPath.value
  return p ? `${debugApiOrigin.value}${p}` : ''
})

const adminPreviewPath = computed(() => {
  if (dataDebugKind.value !== 'dataset' || !dataDebugRow.value?.id) return ''
  return `/api/data/datasets/${encodeURIComponent(dataStackRouteKey(dataDebugRow.value))}/preview`
})

const debugParamObject = computed(() => {
  try {
    const o = JSON.parse(dataDebugParamJson.value || '{}')
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {}
  } catch {
    return {}
  }
})

const openInvokeBodyJson = computed(() =>
  JSON.stringify({ param_values: debugParamObject.value }, null, 2)
)

const ifaceOpenScopesHint = computed(() => {
  if (dataDebugKind.value !== 'iface' || !dataDebugRow.value) return 'open:dataiface:query'
  const row = dataDebugRow.value
  if (row.static_crud_op && row.static_crud_op !== 'list') return 'open:dataiface:write'
  if (row.kind === 'transaction') return 'open:dataiface:write'
  return 'open:dataiface:query'
})

const openInvokeHeadersBlock = computed(() =>
  ['Content-Type: application/json', 'X-API-Key: <在「API 密钥」页创建的 Key>'].join('\n')
)

const adminDebugBodyJson = computed(() => {
  const payload = { param_values: debugParamObject.value, limit: dataDebugLimit.value }
  if (showDataDebugModeSwitch.value && dataDebugExecMode.value === 'query') {
    payload.mode = 'query'
  }
  return JSON.stringify(payload, null, 2)
})

const adminBearerMasked = computed(() => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : ''
  if (!t) return 'Bearer <登录后由前端请求自动携带>'
  return `Bearer <已登录，长度 ${t.length}，与当前会话一致>`
})

const adminDebugHeadersBlock = computed(() =>
  ['Content-Type: application/json', `Authorization: ${adminBearerMasked.value}`].join('\n')
)

function shellEscapeSingleQuotes (s) {
  return String(s).replace(/'/g, `'\"'\"'`)
}

const curlOpenInvokeExample = computed(() => {
  const url = openDataIfaceAbsUrl.value
  if (!url) return ''
  const body = JSON.stringify({ param_values: debugParamObject.value })
  return [
    "curl -sS -X POST \\",
    `  '${shellEscapeSingleQuotes(url)}' \\`,
    "  -H 'Content-Type: application/json' \\",
    "  -H 'X-API-Key: <你的_API_Key>' \\",
    `  -d '${shellEscapeSingleQuotes(body)}'`
  ].join('\n')
})

const curlAdminDebugExample = computed(() => {
  const url = adminDebugAbsUrl.value
  if (!url) return ''
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : ''
  const curlPayload = { param_values: debugParamObject.value, limit: dataDebugLimit.value }
  if (showDataDebugModeSwitch.value && dataDebugExecMode.value === 'query') {
    curlPayload.mode = 'query'
  }
  const body = JSON.stringify(curlPayload)
  const authPart = token ? `Bearer ${token}` : 'Bearer <JWT>'
  return [
    "curl -sS -X POST \\",
    `  '${shellEscapeSingleQuotes(url)}' \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -H 'Authorization: ${shellEscapeSingleQuotes(authPart)}' \\`,
    `  -d '${shellEscapeSingleQuotes(body)}'`
  ].join('\n')
})

async function copyText (text) {
  if (text == null || text === '') return
  try {
    await navigator.clipboard.writeText(String(text))
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

const groups = ref([])
const dlgGenStatic = ref(false)
const genStaticTarget = ref(null)
const genStaticForm = ref({ base_slug: '', category: '', group_id: null })
const dlgGenList = ref(false)
const genListTarget = ref(null)
const genListForm = ref({ base_slug: '', table: '', primary_key: 'id', ops: ['list', 'get'], name: '', category: '', group_id: null })
const genBusy = ref(false)
const genListTables = ref([])

const ALL_OPS = [
  { value: 'list',         label: '列表查询',  write: false },
  { value: 'get',          label: '单条查询',  write: false },
  { value: 'create',       label: '新增',      write: true  },
  { value: 'batch_create', label: '批量新增',  write: true  },
  { value: 'update',       label: '修改',      write: true  },
  { value: 'delete',       label: '删除',      write: true  },
]
const genListReadOnly = computed(() => {
  const row = genListTarget.value
  if (!row) return true
  const sid = row.data_source_id ?? row.data_source?.id
  const src = sources.value.find(s => s.id === sid)
  if (src) return src.read_only === true || src.read_only === 1
  return row.data_source?.read_only === true || row.data_source?.read_only === 1
})
// kind=query 数据集只允许只读接口
const genListQueryOnly = computed(() => genListTarget.value?.kind === 'query')
const genListDdl = ref('')
const genListDdlBusy = ref(false)
const genListCols = ref([])
const genListColsLoading = ref(false)

/** 生成列表弹窗：表格设计建表 + DDL */
const genListUi = ref({
  newTableName: '',
  columns: [],
  ddlManual: false,
  lastDesignerDdl: ''
})

/** 查询类数据集：手写 SQL / 选已有表 / 建表 DDL（仅 UI，不单独存库） */
const dsTableUi = ref({
  mode: 'manual',
  tableList: [],
  tableName: '',
  selectedColumns: [],
  columnsLoading: false,
  createSql: '',
  createNewTableName: '',
  createColumns: [],
  createSqlManual: false,
  lastDesignerDdl: '',
  loading: false,
  ddlLoading: false
})
/** 打开数据集弹窗赋值时跳过一次 data_source_id 监听，避免清空从 meta_json._ui 恢复的选表状态 */
const suppressDsDataSourceWatch = ref(false)

function dialectForDataSourceId (id) {
  if (!id) return 'sqlite'
  return sources.value.find((s) => s.id === id)?.type || 'sqlite'
}

function onDsDesignerDdl (sql) {
  const s = sql || ''
  dsTableUi.value.lastDesignerDdl = s
  if (!dsTableUi.value.createSqlManual) {
    dsTableUi.value.createSql = s
  }
}

function onGenListDesignerDdl (sql) {
  const s = sql || ''
  genListUi.value.lastDesignerDdl = s
  if (!genListUi.value.ddlManual) {
    genListDdl.value = s
  }
}

watch(
  () => dsForm.value.data_source_id,
  () => {
    if (suppressDsDataSourceWatch.value) {
      suppressDsDataSourceWatch.value = false
      dsTableUi.value.createColumns = defaultCreateColumns(dialectForDataSourceId(dsForm.value.data_source_id))
      dsTableUi.value.createNewTableName = ''
      dsTableUi.value.createSqlManual = false
      return
    }
    dsTableUi.value.tableList = []
    dsTableUi.value.tableName = ''
    dsTableUi.value.createColumns = defaultCreateColumns(dialectForDataSourceId(dsForm.value.data_source_id))
    dsTableUi.value.createNewTableName = ''
    dsTableUi.value.createSqlManual = false
  }
)

watch(
  () => dsTableUi.value.createSqlManual,
  (manual) => {
    if (!manual && dsTableUi.value.lastDesignerDdl) {
      dsTableUi.value.createSql = dsTableUi.value.lastDesignerDdl
    }
  }
)

watch(
  () => genListUi.value.ddlManual,
  (manual) => {
    if (!manual && genListUi.value.lastDesignerDdl) {
      genListDdl.value = genListUi.value.lastDesignerDdl
    }
  }
)

/** 当前数据集表单绑定的数据源类型，用于 SQL 编辑器方言（高亮 + 关键字 / 片段补全） */
const dsSqlDialect = computed(() => {
  const id = dsForm.value.data_source_id
  if (!id) return 'sqlite'
  return sources.value.find(s => s.id === id)?.type || 'sqlite'
})

/** query 与 buffer 共用选表 / SQL 编辑 UI */
const dsIsSqlDataset = computed(() => {
  const k = dsForm.value.kind
  return k === 'query' || k === 'buffer'
})

const dsIsQueryDynamicWithSource = computed(
  () =>
    dsForm.value.kind === 'query' &&
    dsCoreShape.value === 'dynamic_sql' &&
    !!dsForm.value.data_source_id
)

const dsDatasetEditing = computed(() => !!dsForm.value.id)
/** 编辑已有数据集时锁定数据源（内存 JSON 无数据源项） */
const dsDataSourceLocked = computed(
  () => dsDatasetEditing.value && dsForm.value.kind !== 'static'
)
/** 编辑 + 固定表形态 + 选用已有（非本集创建表）：锁定表方式、表名与查询 SQL */
const dsTableExistingLocked = computed(() => {
  if (!dsDatasetEditing.value) return false
  if (dsForm.value.kind !== 'query' || dsCoreShape.value !== 'fixed_table') return false
  if (dsTableBindingMode.value === 'created_by_dataset') return false
  if (dsTableUi.value.mode !== 'existing' || !String(dsTableUi.value.tableName || '').trim()) return false
  return (
    dsTableBindingMode.value === 'existing_selected' ||
    dsTableBindingMode.value === ''
  )
})

const dsDefinitionSqlLocked = computed(() => dsTableExistingLocked.value)

/** 事件通知 Webhook 开放路径提示（实际以数据集 code 为准） */
const dsBufferWebhookHintUrl = computed(() => {
  const base = typeof window !== 'undefined' ? (window.location.origin || '') : ''
  const code = (dsForm.value.code || '').trim() || '{保存后填写编码}'
  return `${base}/api/open/v1/ingress/buffer/${encodeURIComponent(code)}`
})

const genListSqlDialect = computed(() => {
  const row = genListTarget.value
  const sid = row?.data_source_id ?? row?.data_source?.id
  if (!sid) return 'sqlite'
  return sources.value.find(s => s.id === sid)?.type || row?.data_source?.type || 'sqlite'
})

function datasetKindLabel (k) {
  const m = {
    static: '内存 JSON',
    query: 'SQL 数据集',
    buffer: '缓存表',
    transaction: '事务写入'
  }
  return m[k] || k || '—'
}

function datasetNameById (id, ifaceRow) {
  if (ifaceRow?.dataset?.name) {
    const dc = ifaceRow.dataset.code ? ` (${ifaceRow.dataset.code})` : ''
    return `${ifaceRow.dataset.name}${dc}`
  }
  const d = datasets.value.find(x => x.id === id)
  if (!d) return id != null ? `#${id}` : '—'
  return d.code ? `${d.name} (${d.code})` : `${d.name} (#${d.id})`
}

const loadAll = async () => {
  const [a, b, c, g, evtDefs, evtGroups, whs] = await Promise.all([
    api.listDataSources(),
    api.listDatasets(),
    api.listDataInterfaces(),
    api.listInterfaceGroups(),
    ceApi.listCustomEventDefinitions(),
    ceApi.listCustomEventGroups(),
    listOutboundWebhooks()
  ])
  sources.value = a.data || []
  datasets.value = b.data || []
  ifaces.value = c.data || []
  groups.value = g.data || []
  customEventDefs.value = evtDefs.data || []
  customEventGroups.value = evtGroups.data || []
  outboundWebhooks.value = whs.data || []
}

const loadSources = async () => { sources.value = (await api.listDataSources()).data || [] }
const loadDatasets = async () => { datasets.value = (await api.listDatasets()).data || [] }
const loadIfaces = async () => {
  const [c, g] = await Promise.all([api.listDataInterfaces(), api.listInterfaceGroups()])
  ifaces.value = c.data || []
  groups.value = g.data || []
}

const openGenStatic = row => {
  genStaticTarget.value = row
  genStaticForm.value = {
    base_slug: (row.name || 'data').toLowerCase().replace(/[^\w-]+/g, '_').replace(/^([^a-zA-Z])/, 'd$1').slice(0, 40),
    category: row.category || '',
    group_id: null
  }
  dlgGenStatic.value = true
}

const submitGenStatic = async () => {
  if (!genStaticTarget.value?.id) return
  if (!genStaticForm.value.base_slug?.trim()) {
    ElMessage.warning('请填写 slug 前缀')
    return
  }
  genBusy.value = true
  try {
    const res = await api.generateStaticCrudInterfaces(dataStackRouteKey(genStaticTarget.value), {
      base_slug: genStaticForm.value.base_slug.trim(),
      category: genStaticForm.value.category || '',
      group_id: genStaticForm.value.group_id || undefined
    })
    const arr = res.data || []
    dlgGenStatic.value = false
    ElMessage.success(`已生成 ${arr.length} 个开放接口（见「数据接口」页）`)
    loadAll()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '生成失败')
  } finally {
    genBusy.value = false
  }
}

const onGenCrudFromDataset = async (tableName) => {
  dlgDs.value = false
  await openGenList(dsForm.value)
  if (tableName) {
    genListForm.value.table = tableName
    genListForm.value.base_slug = tableName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[^a-z]/, 'd').slice(0, 40)
  }
}

const openGenList = async row => {
  genListTarget.value = row
  const defaultOps = row.kind === 'transaction'
    ? ['list', 'get', 'create', 'update', 'delete']
    : ['list', 'get']
  genListForm.value = {
    base_slug: (row.name || 'list').toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '').replace(/^([^a-zA-Z])/, 'd$1').slice(0, 40),
    table: '',
    primary_key: 'id',
    ops: defaultOps,
    name: '',
    category: row.category || '',
    group_id: null
  }
  genListDdl.value = ''
  genListTables.value = []
  const sid = row.data_source_id ?? row.data_source?.id
  const d = sources.value.find((s) => s.id === sid)?.type || row.data_source?.type || 'sqlite'
  genListUi.value = {
    newTableName: '',
    columns: defaultCreateColumns(d),
    ddlManual: false,
    lastDesignerDdl: ''
  }
  dlgGenList.value = true
  await nextTick()
  await loadGenListTables()
  // pre-select table from dataset meta (fixed_table / buffer / transaction)
  if (!genListForm.value.table) {
    const meta = parseDatasetMetaFull(row.meta_json != null ? String(row.meta_json) : '')
    let tn = meta.table_name || ''
    if (!tn && row.kind === 'buffer') {
      const mo = safeJsonParse(row.meta_json != null ? String(row.meta_json) : '')
      tn = String(mo.ingress?.buffer_table || '').trim()
    }
    if (tn) genListForm.value.table = tn
  }
  // use table name as default slug prefix
  if (genListForm.value.table) {
    genListForm.value.base_slug = genListForm.value.table.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^[^a-z]/, 'd').slice(0, 40)
  }
}

async function loadGenListTables () {
  const row = genListTarget.value
  if (!row) {
    genListTables.value = []
    return
  }
  const sid = row.data_source_id ?? row.data_source?.id
  if (!sid) {
    genListTables.value = []
    return
  }
  try {
    const r = await api.listDataSourceTables(sid)
    genListTables.value = r.data || []
  } catch {
    genListTables.value = []
  }
}

async function loadGenListCols (table) {
  const row = genListTarget.value
  const sid = row?.data_source_id ?? row?.data_source?.id
  if (!sid || !table?.trim()) {
    genListCols.value = []
    return
  }
  genListColsLoading.value = true
  try {
    const r = await api.listDataSourceTableColumns(sid, table.trim())
    genListCols.value = r.data || []
  } catch {
    genListCols.value = []
  } finally {
    genListColsLoading.value = false
  }
}

watch(() => genListForm.value.table, (t) => {
  loadGenListCols(t)
})

async function runGenListDdl () {
  const row = genListTarget.value
  const sid = row?.data_source_id ?? row?.data_source?.id
  const sql = genListDdl.value.trim()
  if (!sid) {
    ElMessage.warning('当前数据集无数据源')
    return
  }
  if (!sql) {
    ElMessage.warning('请输入建表 DDL')
    return
  }
  genListDdlBusy.value = true
  try {
    await api.execDataSourceDDL(sid, { sql })
    ElMessage.success('建表已执行')
    genListDdl.value = ''
    genListUi.value.ddlManual = false
    genListUi.value.newTableName = ''
    genListUi.value.columns = defaultCreateColumns(genListSqlDialect.value)
    genListUi.value.lastDesignerDdl = ''
    await loadGenListTables()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '执行失败')
  } finally {
    genListDdlBusy.value = false
  }
}

const submitGenList = async () => {
  if (!genListTarget.value?.id) return
  if (!genListForm.value.base_slug?.trim() || !genListForm.value.table?.trim()) {
    ElMessage.warning('请填写 slug 前缀与表名')
    return
  }
  if (!genListForm.value.ops?.length) {
    ElMessage.warning('请至少选择一个操作')
    return
  }
  genBusy.value = true
  try {
    // 从列信息构建 JSON Schema，供生成的接口关联
    let schemaJson = ''
    if (genListCols.value.length) {
      const props = {}
      for (const col of genListCols.value) {
        const t = String(col.type || '').toLowerCase()
        let jsType = 'string'
        if (/int|bigint|smallint|tinyint|numeric|decimal|float|double|real|number/.test(t)) jsType = 'number'
        else if (/bool/.test(t)) jsType = 'boolean'
        props[col.name] = { type: jsType, description: col.type || '' }
      }
      schemaJson = JSON.stringify({ type: 'object', properties: props }, null, 2)
    }
    const res = await api.generateCrudInterfaces(dataStackRouteKey(genListTarget.value), {
      base_slug: genListForm.value.base_slug.trim(),
      table: genListForm.value.table.trim(),
      primary_key: genListForm.value.primary_key?.trim() || 'id',
      ops: genListForm.value.ops,
      name: genListForm.value.name?.trim() || '',
      category: genListForm.value.category || '',
      group_id: genListForm.value.group_id || undefined,
      schema_json: schemaJson
    })
    dlgGenList.value = false
    const count = res.data?.data?.length || 0
    ElMessage.success(`已生成 ${count} 个开放接口`)
    loadAll()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '生成失败')
  } finally {
    genBusy.value = false
  }
}

function resetSrcConnAndPool () {
  Object.assign(srcConn, {
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'mysql',
    sqlite_path: './data/app-manager.db'
  })
  Object.assign(srcPool, { max_open: 0, max_idle: 0, conn_max_lifetime_sec: 0 })
}

function parseSrcConfigIntoForms (row) {
  resetSrcConnAndPool()
  if (!row?.config_json || !String(row.config_json).trim()) return
  try {
    const o = JSON.parse(row.config_json)
    if (o.pool_max_open != null) srcPool.max_open = Number(o.pool_max_open) || 0
    if (o.pool_max_idle != null) srcPool.max_idle = Number(o.pool_max_idle) || 0
    if (o.pool_conn_max_lifetime_sec != null) {
      srcPool.conn_max_lifetime_sec = Number(o.pool_conn_max_lifetime_sec) || 0
    }
    if (o.dsn_fields && typeof o.dsn_fields === 'object') {
      Object.assign(srcConn, o.dsn_fields)
    }
  } catch {
    /* ignore */
  }
}

function onSrcTypeChange () {
  resetSrcConnAndPool()
}

function applyBuildDsnFromForm () {
  srcForm.value.dsn = buildDsnFromFields(srcForm.value.type, srcConn)
}

const openSrc = row => {
  resetSrcConnAndPool()
  if (row) {
    srcForm.value = { ...row, config_json: row.config_json != null ? String(row.config_json) : '' }
    parseSrcConfigIntoForms(row)
  } else {
    srcForm.value = {
      id: null,
      code: '',
      name: '',
      type: 'sqlite',
      dsn: 'file:./data/app-manager.db?_fk=1',
      read_only: true,
      config_json: ''
    }
  }
  dlgSrc.value = true
}
const saveSrc = async () => {
  const patch = { dsn_fields: { ...srcConn } }
  patch.pool_max_open = srcPool.max_open > 0 ? srcPool.max_open : null
  patch.pool_max_idle = srcPool.max_idle > 0 ? srcPool.max_idle : null
  patch.pool_conn_max_lifetime_sec =
    srcPool.conn_max_lifetime_sec > 0 ? srcPool.conn_max_lifetime_sec : null
  const config_json = mergeDataSourceConfigJson(srcForm.value.config_json || '', patch)
  const payload = { ...srcForm.value, config_json }
  if (srcForm.value.id) await api.updateDataSource(srcForm.value.id, payload)
  else await api.createDataSource(payload)
  dlgSrc.value = false
  ElMessage.success('已保存')
  loadAll()
}
const testSrc = async row => {
  try {
    await api.testDataSource(dataStackRouteKey(row))
    ElMessage.success('连接成功')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '失败')
  }
}
const delSrc = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataSource(dataStackRouteKey(row))
  loadAll()
}

function safeJsonParse (s, fallback = {}) {
  try {
    if (s == null || !String(s).trim()) return { ...fallback }
    const o = JSON.parse(String(s))
    return o && typeof o === 'object' && !Array.isArray(o) ? o : { ...fallback }
  } catch {
    return { ...fallback }
  }
}

function extractTableNameFromCreateSql (sql) {
  const m = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([\w.]+)[`"]?/i.exec(String(sql || '').trim())
  return m ? m[1] : ''
}

function resetDsIngressFormDefaults () {
  dsIngressForm.kind = 'http_webhook'
  dsIngressForm.buffer_table = ''
  dsIngressForm.poll_url = ''
  dsIngressForm.poll_interval_sec = 60
  dsIngressForm.poll_method = 'GET'
  dsIngressForm.poll_headers_json = ''
  dsIngressForm.poll_body = ''
  dsIngressForm.webhook_secret = ''
  dsIngressForm.raw_column = 'payload'
  dsIngressForm.cache_required_poll = true
}

function parseDsIngressFormFromMeta (metaStr) {
  const o = safeJsonParse(metaStr, {})
  const ing = o.ingress && typeof o.ingress === 'object' ? o.ingress : {}
  const k = String(ing.kind || '').toLowerCase()
  dsIngressForm.kind = k === 'http_poll' || k === 'poll' ? 'http_poll' : 'http_webhook'
  dsIngressForm.buffer_table = String(o.buffer_table || '').trim()
  dsIngressForm.poll_url = String(ing.poll_url || '').trim()
  dsIngressForm.poll_interval_sec =
    Number(ing.poll_interval_sec) > 0 ? Number(ing.poll_interval_sec) : 60
  dsIngressForm.poll_method = String(ing.poll_method || 'GET').toUpperCase() || 'GET'
  dsIngressForm.poll_headers_json =
    typeof ing.poll_headers_json === 'string'
      ? ing.poll_headers_json
      : ing.poll_headers_json != null
        ? JSON.stringify(ing.poll_headers_json)
        : ''
  dsIngressForm.poll_body = String(ing.poll_body || '')
  dsIngressForm.webhook_secret = String(ing.webhook_secret || '')
  dsIngressForm.raw_column = String(ing.raw_column || 'payload')
  dsIngressForm.cache_required_poll = ing.cache_required !== false
}

function stripIngressKeysFromMeta () {
  const o = safeJsonParse(dsForm.value.meta_json, {})
  delete o.ingress
  delete o.buffer_table
  dsForm.value.meta_json = Object.keys(o).length ? JSON.stringify(o) : ''
}

function buildIngressObjectForSave () {
  if (dsIngressForm.kind === 'http_poll') {
    const out = {
      kind: 'http_poll',
      poll_url: String(dsIngressForm.poll_url || '').trim(),
      poll_interval_sec: Number(dsIngressForm.poll_interval_sec) > 0 ? Number(dsIngressForm.poll_interval_sec) : 60,
      poll_method: String(dsIngressForm.poll_method || 'GET').toUpperCase(),
      poll_body: String(dsIngressForm.poll_body || '')
    }
    const h = String(dsIngressForm.poll_headers_json || '').trim()
    if (h) out.poll_headers_json = h
    if (!dsIngressForm.cache_required_poll) out.cache_required = false
    return out
  }
  return {
    kind: 'http_webhook',
    webhook_secret: String(dsIngressForm.webhook_secret || '').trim(),
    raw_column: String(dsIngressForm.raw_column || 'payload').trim() || 'payload'
  }
}

function onDsCacheIngressToggle (on) {
  if (on) {
    dsForm.value.kind = 'buffer'
    if (!String(dsForm.value.meta_json || '').trim()) {
      resetDsIngressFormDefaults()
      dsForm.value.meta_json = JSON.stringify(
        { ingress: { kind: 'http_webhook' }, buffer_table: '' },
        null,
        2
      )
    }
    parseDsIngressFormFromMeta(dsForm.value.meta_json)
    onDsKindChange()
  } else {
    dsForm.value.kind = 'query'
    stripIngressKeysFromMeta()
    onDsKindChange()
  }
}

/** 解析 sql_shape、选表 UI、table_binding（建表溯源） */
function parseDatasetMetaFull (metaStr) {
  const o = safeJsonParse(metaStr, {})
  const exp = String(o.sql_shape || '').trim()
  const tb = o.table_binding && typeof o.table_binding === 'object' ? o.table_binding : null
  const u = o._ui && typeof o._ui === 'object' ? o._ui : null

  if (exp === 'dynamic_sql') {
    return {
      sql_shape: 'dynamic_sql',
      table_mode: u?.table_mode === 'create' ? 'create' : 'manual',
      table_name: '',
      binding_mode: '',
      object_kind: 'table'
    }
  }

  if (tb && String(tb.object_name || '').trim()) {
    return {
      sql_shape: 'fixed_table',
      table_mode: 'existing',
      table_name: String(tb.object_name).trim(),
      binding_mode: tb.binding_mode === 'created_by_dataset' ? 'created_by_dataset' : 'existing_selected',
      object_kind: tb.object_kind === 'view' ? 'view' : 'table'
    }
  }

  if (exp === 'fixed_table') {
    const tm = u?.table_mode === 'create' ? 'create' : 'existing'
    const tn = typeof u?.table_name === 'string' ? u.table_name.trim() : ''
    return {
      sql_shape: 'fixed_table',
      table_mode: tm,
      table_name: tn,
      binding_mode:
        tm === 'existing' && tn ? 'existing_selected' : '',
      object_kind: 'table'
    }
  }

  if (u?.table_mode === 'existing' && typeof u.table_name === 'string' && u.table_name.trim()) {
    return {
      sql_shape: 'fixed_table',
      table_mode: 'existing',
      table_name: u.table_name.trim(),
      binding_mode: 'existing_selected',
      object_kind: 'table'
    }
  }
  if (u?.table_mode === 'create') {
    return {
      sql_shape: 'fixed_table',
      table_mode: 'create',
      table_name: '',
      binding_mode: '',
      object_kind: 'table'
    }
  }

  return {
    sql_shape: 'dynamic_sql',
    table_mode: u?.table_mode === 'manual' ? 'manual' : 'manual',
    table_name: '',
    binding_mode: '',
    object_kind: 'table'
  }
}

function buildDatasetMetaJsonForSave ({
  kind,
  metaStr,
  sqlShape,
  tableMode,
  tableName
}) {
  const o = safeJsonParse(metaStr, {})
  if (kind === 'query') {
    delete o.ingress
    delete o.buffer_table
  }
  if (kind === 'buffer') {
    delete o.sql_shape
    delete o.table_binding
    o.ingress = buildIngressObjectForSave()
    o.buffer_table = String(dsIngressForm.buffer_table || '').trim()
    o._ui = {
      table_mode: tableMode || 'manual',
      table_name: tableMode === 'existing' ? String(tableName || '').trim() : ''
    }
    return JSON.stringify(o)
  }
  if (kind === 'transaction' || kind === 'static') {
    delete o.sql_shape
    delete o.table_binding
    delete o._ui
    delete o.ingress
    delete o.buffer_table
    return Object.keys(o).length ? JSON.stringify(o) : ''
  }
  if (sqlShape === 'dynamic_sql') {
    o.sql_shape = 'dynamic_sql'
    delete o.table_binding
    o._ui = { table_mode: 'manual', table_name: '' }
    return JSON.stringify(o)
  }
  o.sql_shape = 'fixed_table'
  const tn = String(tableName || '').trim()
  let bm = ''
  if (tableMode === 'existing' && tn) {
    bm =
      dsTableBindingMode.value === 'created_by_dataset'
        ? 'created_by_dataset'
        : 'existing_selected'
    o.table_binding = {
      object_kind: 'table',
      object_name: tn,
      binding_mode: bm
    }
  } else {
    delete o.table_binding
  }
  o._ui = {
    table_mode: tableMode || 'existing',
    table_name: tableMode === 'existing' ? tn : ''
  }
  return JSON.stringify(o)
}

function onDsCoreShapeChange () {
  if (dsCoreShape.value === 'fixed_table' && dsForm.value.kind === 'query') {
    if (dsTableUi.value.mode === 'manual') dsTableUi.value.mode = 'existing'
  }
}

function onDsExtKindChange (v) {
  const next = v == null || v === '' ? '' : String(v)
  if (!next) {
    const was = dsForm.value.kind
    dsForm.value.kind = 'query'
    if (was === 'buffer' || was === 'transaction' || was === 'static') {
      dsCoreShape.value = 'dynamic_sql'
      dsTableBindingMode.value = ''
      dsTableUi.value.mode = 'manual'
      dsTableUi.value.tableName = ''
      dsTableUi.value.tableList = []
    }
    return
  }
  dsForm.value.kind = next
  onDsKindChange()
}

function datasetRowShapeLabel (row) {
  if (!row) return '—'
  const k = row.kind
  if (k === 'buffer') {
    const m = safeJsonParse(row.meta_json != null ? String(row.meta_json) : '')
    const ik = String(m.ingress?.kind || '').toLowerCase()
    if (ik === 'http_poll' || ik === 'poll') return '缓存表（轮询）'
    return '缓存表（事件通知）'
  }
  if (k === 'transaction') return '事务写入'
  if (k === 'static') return '内存 JSON'
  if (k === 'event_bound') {
    const m = safeJsonParse(row.meta_json != null ? String(row.meta_json) : '')
    const eb = m.event_binding
    if (eb?.source_key) return `事件绑定（${eb.source_key}）`
    return '事件绑定'
  }
  const meta = parseDatasetMetaFull(row.meta_json != null ? String(row.meta_json) : '')
  if (meta.sql_shape === 'fixed_table') {
    return meta.binding_mode === 'created_by_dataset'
      ? '固定表/视图（本集建表）'
      : '固定表/视图'
  }
  return '动态 SQL'
}

function normalizeDsFormFromRow (row) {
  if (!row) {
    return {
      id: null,
      code: '',
      name: '',
      category: '',
      data_source_id: null,
      kind: 'query',
      definition: 'SELECT 1',
      steps_json: '[]',
      param_schema: '',
      meta_json: ''
    }
  }
  let kind = 'query'
  if (row.kind === 'static' || row.kind === 'transaction' || row.kind === 'buffer' || row.kind === 'event_bound') {
    kind = row.kind
  }
  return {
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    category: row.category || '',
    data_source_id: row.data_source_id ?? row.data_source?.id ?? null,
    kind,
    definition: row.definition ?? '',
    steps_json: row.steps_json || '[]',
    param_schema: row.param_schema != null ? String(row.param_schema) : '',
    meta_json: row.meta_json != null ? String(row.meta_json) : ''
  }
}

const onDsKindChange = () => {
  if (dsForm.value.kind === 'static') {
    dsForm.value.data_source_id = null
    if (!String(dsForm.value.definition || '').trim()) {
      dsForm.value.definition = '[\n  { "col1": "示例", "col2": 1 }\n]'
    }
  }
  if (dsForm.value.kind === 'buffer') {
    if (!String(dsForm.value.meta_json || '').trim()) {
      dsForm.value.meta_json = JSON.stringify(
        { ingress: { kind: 'http_webhook' }, buffer_table: '' },
        null,
        2
      )
    }
    dsForm.value.steps_json = '[]'
    parseDsIngressFormFromMeta(dsForm.value.meta_json)
  }
}

async function loadDsTables () {
  if (!dsForm.value.data_source_id) {
    ElMessage.warning('请先选择数据源')
    return
  }
  dsTableUi.value.loading = true
  try {
    const r = await api.listDataSourceTables(dsForm.value.data_source_id)
    dsTableUi.value.tableList = r.data || []
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '加载表失败')
    dsTableUi.value.tableList = []
  } finally {
    dsTableUi.value.loading = false
  }
}

async function applyDsSelectStar () {
  if (!dsForm.value.data_source_id || !dsTableUi.value.tableName) return
  try {
    const r = await api.getDataSourceSelectAllSql(dsForm.value.data_source_id, dsTableUi.value.tableName)
    dsForm.value.definition = r.sql || ''
    ElMessage.success('已填入 SQL')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '失败')
  }
}

async function syncDsColumnsToParamSchema (tableName) {
  const tbl = tableName || dsTableUi.value.tableName
  if (!dsForm.value.data_source_id || !tbl) return
  try {
    const r = await api.listDataSourceTableColumns(dsForm.value.data_source_id, tbl)
    const cols = r.data || []
    const properties = {}
    for (const c of cols) {
      const n = c.name
      if (!n) continue
      const tags = [c.data_type, c.nullable ? 'nullable' : 'not null']
      if (c.primary_key) tags.push('PK')
      if (c.auto_increment) tags.push('auto_increment')
      if (c.default_expr) tags.push('default: ' + c.default_expr)
      properties[n] = {
        type: 'string',
        description: tags.filter(Boolean).join(', ')
      }
    }
    dsForm.value.param_schema = JSON.stringify({ type: 'object', properties }, null, 2)
    ElMessage.success('已根据列元数据生成 param_schema')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '拉取列失败')
  }
}

async function loadIfaceStructuresForDataset () {
  ifaceStructureList.value = []
  const id = ifaceForm.value.dataset_id
  if (!id) return
  const ds = datasets.value.find(d => d.id === id)
  if (!ds) return
  try {
    const r = await api.listDatasetStructures(dataStackRouteKey(ds))
    ifaceStructureList.value = r.data || []
  } catch {
    ifaceStructureList.value = []
  }
}

async function onIfaceDatasetChange () {
  ifaceForm.value.data_structure_id = null
  syncIfaceParamSelectionFromDataset()
  await loadIfaceStructuresForDataset()
}

function openDlgStructures (row) {
  structureDataset.value = row
  dlgStructures.value = true
}

/** 弹窗打开完成后再拉列表，避免与 destroy-on-close 竞态；并合并列表页 Preload 的 structures 作首屏 */
function onStructuresDialogOpened () {
  loadStructures({ preferPreload: true })
  loadStructureCols()
}

function onStructuresDialogClosed () {
  structureDataset.value = null
  structureList.value = []
  structureCols.value = []
  structureColsDraft.value = []
  structureAlterDdl.value = ''
}

async function loadStructureCols () {
  const ds = structureDataset.value
  const tn = structureTableName.value
  if (!ds || !tn) { structureCols.value = []; structureColsDraft.value = []; return }
  const sid = ds.data_source_id ?? ds.data_source?.id
  if (!sid) { structureCols.value = []; structureColsDraft.value = []; return }
  structureColsLoading.value = true
  try {
    const r = await api.listDataSourceTableColumns(sid, tn)
    structureCols.value = r.data || []
    structureColsDraft.value = structureCols.value.map(c => ({
      name: c.name,
      data_type: c.data_type,
      nullable: c.nullable,
      auto_increment: c.auto_increment,
      default_expr: c.default_expr || '',
      primary_key: c.primary_key,
      _orig: { data_type: c.data_type, nullable: c.nullable, auto_increment: c.auto_increment, default_expr: c.default_expr || '' }
    }))
  } catch {
    structureCols.value = []
    structureColsDraft.value = []
  } finally {
    structureColsLoading.value = false
  }
}

function buildModifyColDdl (dialect, tableName, col) {
  const d = normalizeDialectKey(dialect)
  const qt = quoteIdent(d, tableName)
  const qc = quoteIdent(d, col.name)
  const typ = (col.data_type || 'TEXT').trim()
  const defClause = col.default_expr ? ` DEFAULT ${col.default_expr}` : ''
  if (d === 'mysql') {
    const nullClause = col.nullable ? ' NULL' : ' NOT NULL'
    const aiClause = col.auto_increment ? ' AUTO_INCREMENT' : ''
    return `ALTER TABLE ${qt} MODIFY COLUMN ${qc} ${typ}${nullClause}${defClause}${aiClause};`
  }
  if (d === 'postgres') {
    const stmts = [`ALTER TABLE ${qt} ALTER COLUMN ${qc} TYPE ${typ}`]
    if (col.nullable) stmts.push(`ALTER TABLE ${qt} ALTER COLUMN ${qc} DROP NOT NULL`)
    else stmts.push(`ALTER TABLE ${qt} ALTER COLUMN ${qc} SET NOT NULL`)
    if (col.default_expr) stmts.push(`ALTER TABLE ${qt} ALTER COLUMN ${qc} SET DEFAULT ${col.default_expr}`)
    else stmts.push(`ALTER TABLE ${qt} ALTER COLUMN ${qc} DROP DEFAULT`)
    return stmts.join(';\n') + ';'
  }
  if (d === 'sqlserver') {
    const nullClause = col.nullable ? ' NULL' : ' NOT NULL'
    return `ALTER TABLE ${qt} ALTER COLUMN ${qc} ${typ}${nullClause};`
  }
  return ''
}

async function runStructureModifyCols () {
  const ds = structureDataset.value
  const sid = ds?.data_source_id ?? ds?.data_source?.id
  const tn = structureTableName.value
  const d = structureDialect.value
  if (normalizeDialectKey(d) === 'sqlite') {
    ElMessage.warning('SQLite 不支持修改列定义，请使用下方 DDL 框手动重建')
    return
  }
  const changed = structureColsDraft.value.filter(col => {
    const o = col._orig
    return col.data_type !== o.data_type || col.nullable !== o.nullable ||
      col.auto_increment !== o.auto_increment || col.default_expr !== o.default_expr
  })
  if (!changed.length) { ElMessage.info('没有检测到修改'); return }
  const sqls = changed.map(col => buildModifyColDdl(d, tn, col)).filter(Boolean)
  if (!sqls.length) return
  structureColsModifyBusy.value = true
  try {
    for (const sql of sqls) {
      await api.execDataSourceDDL(sid, { sql })
    }
    ElMessage.success(`已应用 ${sqls.length} 条列修改`)
    await loadStructureCols()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '执行失败')
  } finally {
    structureColsModifyBusy.value = false
  }
}

async function runStructureAlterDdl () {
  const ds = structureDataset.value
  const sid = ds?.data_source_id ?? ds?.data_source?.id
  const sql = structureAlterDdl.value.trim()
  if (!sid || !sql) return
  structureAlterBusy.value = true
  try {
    await api.execDataSourceDDL(sid, { sql })
    ElMessage.success('DDL 执行成功')
    structureAlterDdl.value = ''
    await loadStructureCols()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '执行失败')
  } finally {
    structureAlterBusy.value = false
  }
}

/** 规范化 GET /structures 响应（拦截器已解一层 axios） */
function normalizeStructuresResponse (r) {
  if (r == null) return []
  if (Array.isArray(r)) return r
  if (Array.isArray(r.data)) return r.data
  return []
}

function sortStructuresById (arr) {
  return [...arr].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))
}

async function loadStructures (opts = {}) {
  const ds = structureDataset.value
  if (!ds) return
  const preferPreload = opts.preferPreload === true
  if (preferPreload && Array.isArray(ds.structures) && ds.structures.length > 0) {
    structureList.value = sortStructuresById(ds.structures)
  }
  structureLoading.value = true
  try {
    const r = await api.listDatasetStructures(dataStackRouteKey(ds))
    const list = sortStructuresById(normalizeStructuresResponse(r))
    structureList.value = list
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '加载失败')
    if (!structureList.value.length) structureList.value = []
  } finally {
    structureLoading.value = false
  }
}

// schema_json 可视化编辑：将 JSON Schema properties 转为行列表
const stSchemaFields = ref([]) // [{ name, type, default, description }]
const stSchemaRawMode = ref(false)

function schemaJsonToFields (jsonStr) {
  try {
    const obj = JSON.parse(jsonStr || '{}')
    const props = obj.properties || obj.columns || {}
    if (Array.isArray(obj.columns)) {
      // columns 数组格式
      return obj.columns.map(c => ({
        name: c.name || c.field || '',
        type: c.type || 'string',
        default: c.default != null ? String(c.default) : '',
        description: c.description || c.label || ''
      }))
    }
    return Object.entries(props).map(([k, v]) => ({
      name: k,
      type: v.type || 'string',
      default: v.default != null ? String(v.default) : '',
      description: v.description || ''
    }))
  } catch {
    return []
  }
}

function fieldsToSchemaJson (fields) {
  const properties = {}
  fields.forEach(f => {
    if (!f.name.trim()) return
    const entry = { type: f.type || 'string' }
    if (f.default !== '') entry.default = f.default
    if (f.description) entry.description = f.description
    properties[f.name.trim()] = entry
  })
  return JSON.stringify({ type: 'object', properties }, null, 2)
}

function syncFieldsToSchemaJson () {
  stForm.value.schema_json = fieldsToSchemaJson(stSchemaFields.value)
}

function addStSchemaField () {
  stSchemaFields.value.push({ name: '', type: 'string', default: '', description: '' })
}

function removeStSchemaField (idx) {
  stSchemaFields.value.splice(idx, 1)
  syncFieldsToSchemaJson()
}

function openStForm (row) {
  stSchemaRawMode.value = false
  if (row) {
    stForm.value = {
      id: row.id,
      code: row.code || '',
      name: row.name || '',
      schema_json: row.schema_json != null ? String(row.schema_json) : '{}',
      default_param_values: row.default_param_values != null ? String(row.default_param_values) : ''
    }
  } else {
    stForm.value = { id: null, code: '', name: '', schema_json: '{}', default_param_values: '' }
  }
  stSchemaFields.value = schemaJsonToFields(stForm.value.schema_json)
  dlgStForm.value = true
}

async function saveStForm () {
  const ds = structureDataset.value
  if (!ds) return
  if (!(stForm.value.code || '').trim()) {
    ElMessage.warning('请填写编码')
    return
  }
  stSaving.value = true
  try {
    const body = {
      code: stForm.value.code.trim(),
      name: stForm.value.name,
      schema_json: stForm.value.schema_json || '{}',
      default_param_values: stForm.value.default_param_values || ''
    }
    if (stForm.value.id) {
      await api.updateDatasetStructure(dataStackRouteKey(ds), String(stForm.value.id), body)
    } else {
      await api.createDatasetStructure(dataStackRouteKey(ds), body)
    }
    dlgStForm.value = false
    ElMessage.success('已保存')
    await loadStructures()
    await loadAll()
    syncStructureDatasetFromList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '保存失败')
  } finally {
    stSaving.value = false
  }
}

function syncStructureDatasetFromList () {
  const id = structureDataset.value?.id
  if (id == null) return
  const fresh = datasets.value.find(d => d.id === id)
  if (fresh) structureDataset.value = fresh
}

async function delStructure (row) {
  await ElMessageBox.confirm('删除该结构？', '确认')
  const ds = structureDataset.value
  if (!ds) return
  await api.deleteDatasetStructure(dataStackRouteKey(ds), dataStackRouteKey(row))
  ElMessage.success('已删除')
  await loadStructures()
  await loadAll()
  syncStructureDatasetFromList()
}

async function runDsCreateDdl () {
  const sql = String(dsTableUi.value.createSql || '').trim()
  if (!sql) {
    ElMessage.warning('请输入 CREATE TABLE … DDL')
    return
  }
  if (!dsForm.value.data_source_id) return
  dsTableUi.value.ddlLoading = true
  try {
    await api.execDataSourceDDL(dsForm.value.data_source_id, { sql })
    ElMessage.success('DDL 已执行')
    const inferred =
      String(dsTableUi.value.createNewTableName || '').trim() || extractTableNameFromCreateSql(sql)
    if (dsForm.value.kind === 'query' && dsCoreShape.value === 'fixed_table' && inferred) {
      dsTableBindingMode.value = 'created_by_dataset'
      dsTableUi.value.tableName = inferred
      dsForm.value.meta_json = buildDatasetMetaJsonForSave({
        kind: 'query',
        metaStr: dsForm.value.meta_json,
        sqlShape: 'fixed_table',
        tableMode: 'existing',
        tableName: inferred
      })
    }
    dsTableUi.value.createSql = ''
    dsTableUi.value.createSqlManual = false
    dsTableUi.value.createNewTableName = ''
    dsTableUi.value.createColumns = defaultCreateColumns(dialectForDataSourceId(dsForm.value.data_source_id))
    dsTableUi.value.lastDesignerDdl = ''
    await loadDsTables()
    dsTableUi.value.mode = 'existing'
    if (dsForm.value.kind === 'query' && dsCoreShape.value === 'fixed_table' && inferred) {
      await applyDsSelectStar()
    }
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '执行失败')
  } finally {
    dsTableUi.value.ddlLoading = false
  }
}

const openDs = row => {
  suppressDsDataSourceWatch.value = true
  dsForm.value = normalizeDsFormFromRow(row)
  const k = dsForm.value.kind
  if (k === 'buffer') {
    parseDsIngressFormFromMeta(dsForm.value.meta_json)
  } else {
    resetDsIngressFormDefaults()
  }
  const full = parseDatasetMetaFull(dsForm.value.meta_json)
  dsCoreShape.value = k === 'query' ? full.sql_shape : 'dynamic_sql'
  dsTableBindingMode.value = full.binding_mode || ''
  const di = dialectForDataSourceId(dsForm.value.data_source_id)
  let tableMode = 'manual'
  if (k === 'buffer') {
    tableMode = full.table_mode || 'manual'
  } else if (k === 'query' && full.sql_shape === 'fixed_table') {
    tableMode = full.table_mode === 'create' ? 'create' : 'existing'
  } else if (k === 'query') {
    tableMode = 'manual'
  }
  dsTableUi.value = {
    mode: tableMode,
    tableList: [],
    tableName: full.table_name || '',
    createSql: '',
    createNewTableName: '',
    createColumns: defaultCreateColumns(di),
    createSqlManual: false,
    lastDesignerDdl: '',
    loading: false,
    ddlLoading: false
  }

  // Prepare event_bound snapshot
  if (k === 'event_bound') {
    const o = safeJsonParse(dsForm.value.meta_json, {})
    const eb = o.event_binding || {}
    dsEvtBindFormSnapshot.value = {
      source_type: eb.source_type ?? 'custom_event_def',
      source_id: eb.source_id ?? null,
      source_key: eb.source_key ?? '',
      webhook_id: eb.webhook_id ?? null,
      table_name: eb.table_name ?? '',
      schema_initialized: eb.schema_initialized ?? false,
      schema_columns: eb.schema_columns ?? []
    }
  } else {
    dsEvtBindFormSnapshot.value = null
  }

  // Prepare ingress snapshot for buffer
  dsIngressFormSnapshot.value = k === 'buffer' ? { ...dsIngressForm } : null

  dlgDs.value = true
}

// Called by DatasetForm when user clicks save (payload already built by child)
const onDatasetFormSave = async (payload) => {
  try {
    if (dsForm.value.id) await api.updateDataset(dataStackRouteKey(dsForm.value), payload)
    else await api.createDataset(payload)
    dlgDs.value = false
    ElMessage.success('已保存')
    loadAll()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || e?.message || '保存失败')
  }
}

// Kept for any remaining internal references; delegates to DatasetForm now
const saveDs = () => {}

function prettyDataDebugJson (raw) {
  if (raw == null || raw === '') return '—'
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }
  try {
    return JSON.stringify(raw, null, 2)
  } catch {
    return String(raw)
  }
}

/** 与后端 dataset_param_sql.go 一致：命名占位符 :name；跳过 PostgreSQL ::cast */
function extractNamedSqlParamsFromSql (sqlStr) {
  if (!sqlStr || typeof sqlStr !== 'string') return []
  const seen = new Set()
  const order = []
  const re = /:([a-zA-Z_][a-zA-Z0-9_]*)/g
  let m
  while ((m = re.exec(sqlStr)) !== null) {
    const start = m.index
    if (start > 0 && sqlStr[start - 1] === ':') continue
    const name = m[1]
    if (!seen.has(name)) {
      seen.add(name)
      order.push(name)
    }
  }
  return order
}

function collectParamNamesFromDataset (ds) {
  if (!ds || ds.kind === 'static') return []
  if (ds.kind === 'query' || ds.kind === 'buffer') return extractNamedSqlParamsFromSql(ds.definition || '')
  if (ds.kind === 'transaction') {
    const names = []
    const seen = new Set()
    for (const n of extractNamedSqlParamsFromSql(ds.definition || '')) {
      if (!seen.has(n)) {
        seen.add(n)
        names.push(n)
      }
    }
    let steps = []
    try {
      const raw = ds.steps_json
      const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
      if (Array.isArray(arr)) steps = arr.filter(s => typeof s === 'string')
    } catch {
      /* ignore */
    }
    for (const step of steps) {
      for (const n of extractNamedSqlParamsFromSql(step)) {
        if (!seen.has(n)) {
          seen.add(n)
          names.push(n)
        }
      }
    }
    return names
  }
  return []
}

/** 从 param_schema 取键：支持 JSON Schema.properties、普通对象、或字符串数组 */
function parseParamSchemaKeys (raw) {
  if (raw == null || raw === '') return null
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return null
  try {
    const o = JSON.parse(s)
    if (o && typeof o === 'object' && !Array.isArray(o) && o.properties && typeof o.properties === 'object') {
      return Object.keys(o.properties)
    }
    if (o && typeof o === 'object' && !Array.isArray(o)) return Object.keys(o)
    if (Array.isArray(o) && o.every(x => typeof x === 'string')) return o
  } catch {
    /* ignore */
  }
  return null
}

function mergeParamNameOrder (sqlNames, schemaKeys) {
  if (!schemaKeys?.length) return sqlNames
  const out = [...sqlNames]
  const seen = new Set(sqlNames)
  for (const k of schemaKeys) {
    if (!seen.has(k)) {
      seen.add(k)
      out.push(k)
    }
  }
  return out
}

function demoValueForParamName (name) {
  const n = String(name).toLowerCase()
  if (n === 'id' || n.endsWith('_id')) return 1
  if (n.includes('email')) return 'demo@example.com'
  if (n.includes('phone') || n.includes('mobile')) return '13800138000'
  if (n.includes('name') || n.includes('title') || n.includes('code') || n.includes('slug')) return 'demo'
  if (n === 'limit' || n === 'page_size' || n === 'size') return 10
  if (n === 'offset' || n === 'page') return 0
  if (n.includes('count') || n.includes('num') || n.includes('amount') || n.includes('qty')) return 1
  if (n.includes('time') || n.includes('date')) return '2026-01-01'
  if (n.includes('enabled') || n === 'active' || n === 'deleted') return 0
  return null
}

function buildDemoParamValuesObject (sqlNames, paramSchemaRaw) {
  const schemaKeys = parseParamSchemaKeys(paramSchemaRaw)
  const keys = mergeParamNameOrder(sqlNames, schemaKeys)
  const obj = {}
  for (const k of keys) obj[k] = demoValueForParamName(k)
  return obj
}

/** 打开「接口调试」时默认填入 param_values 示例（由 SQL :占位符 与 param_schema 推断） */
function defaultDebugParamJson (row, kind) {
  if (kind === 'dataset') {
    if (row.kind === 'static') return '{}'
    const names = collectParamNamesFromDataset(row)
    const obj = buildDemoParamValuesObject(names, row.param_schema)
    return JSON.stringify(obj, null, 2)
  }
  // CRUD 接口：按操作类型给出典型示例，尽量从 schema_json 推断字段
  const op = row.static_crud_op ? String(row.static_crud_op).toLowerCase().trim() : ''
  if (op) {
    if (op === 'list') return JSON.stringify({ limit: 20, offset: 0 }, null, 2)
    if (op === 'get' || op === 'delete') return JSON.stringify({ id: 1 }, null, 2)
    // create / update：从 schema_json 推断字段
    const schemaKeys = parseParamSchemaKeys(row.schema_json) || []
    const bodyFields = schemaKeys.filter(k => k !== 'id')
    if (op === 'create') {
      const obj = {}
      for (const k of bodyFields) obj[k] = demoValueForParamName(k)
      if (!bodyFields.length) obj.name = 'demo'
      return JSON.stringify(obj, null, 2)
    }
    if (op === 'update') {
      const obj = { id: 1 }
      for (const k of bodyFields) obj[k] = demoValueForParamName(k)
      if (!bodyFields.length) obj.name = 'demo'
      return JSON.stringify(obj, null, 2)
    }
    return JSON.stringify({ id: 1 }, null, 2)
  }
  const ds = datasets.value.find(d => d.id === row.dataset_id) || row.dataset
  if (!ds || ds.kind === 'static') return '{}'
  const names = collectParamNamesFromDataset(ds)
  const obj = buildDemoParamValuesObject(names, ds.param_schema)
  return JSON.stringify(obj, null, 2)
}

/** 调试弹窗：param_schema 展示（数据集自身或接口绑定数据集） */
const dataDebugParamSchemaText = computed(() => {
  const row = dataDebugRow.value
  if (!row) return ''
  if (dataDebugKind.value === 'dataset') return (row.param_schema && String(row.param_schema).trim()) || ''
  const ds = datasets.value.find(d => d.id === row.dataset_id) || row.dataset
  return (ds?.param_schema && String(ds.param_schema).trim()) || ''
})

/** 供 CodeMirror 补全的键名列表（与一键填充逻辑同源） */
const dataDebugSuggestedParamKeys = computed(() => {
  const row = dataDebugRow.value
  if (!row) return []
  if (dataDebugKind.value === 'dataset') {
    if (row.kind === 'static') return []
    const sqlNames = collectParamNamesFromDataset(row)
    return mergeParamNameOrder(sqlNames, parseParamSchemaKeys(row.param_schema))
  }
  const op = row.static_crud_op ? String(row.static_crud_op).toLowerCase().trim() : ''
  if (op === 'list') return ['limit', 'offset']
  if (op === 'get' || op === 'delete') return ['id']
  if (op === 'create') return ['name']
  if (op === 'update') return ['id', 'name']
  if (op) return ['id']
  const ds = datasets.value.find(d => d.id === row.dataset_id) || row.dataset
  if (!ds || ds.kind === 'static') return []
  const sqlNames = collectParamNamesFromDataset(ds)
  return mergeParamNameOrder(sqlNames, parseParamSchemaKeys(ds.param_schema))
})

async function fillDataDebugMockParams () {
  if (!dataDebugRow.value) return
  try {
    const key = dataDebugRow.value.id
    const res = dataDebugKind.value === 'iface'
      ? await api.mockParamsInterface(key)
      : await api.mockParamsDataset(key)
    dataDebugParamJson.value = JSON.stringify(res?.param_values ?? {}, null, 2)
    ElMessage.success('已填入模拟 param_values')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '获取模拟数据失败')
  }
}

function formatDataDebugParamJson () {
  try {
    const o = JSON.parse(dataDebugParamJson.value || '{}')
    dataDebugParamJson.value = JSON.stringify(o, null, 2)
    ElMessage.success('已格式化 JSON')
  } catch {
    ElMessage.warning('当前内容不是合法 JSON，无法格式化')
  }
}

const openDatasetDebug = async row => {
  dataDebugKind.value = 'dataset'
  dataDebugRow.value = row
  dataDebugExecMode.value = 'transaction'
  dataDebugParamJson.value = '{}'
  dataDebugLimit.value = 200
  dataDebugResult.value = null
  dataDebugCollapse.value = ['admin']
  eventRowsData.value = []
  eventRowsCols.value = []
  eventRowsTable.value = ''
  eventRowsError.value = ''
  eventRowsLoaded.value = false
  dlgDataDebug.value = true
  try {
    const res = await api.mockParamsDataset(row.id)
    dataDebugParamJson.value = JSON.stringify(res?.param_values ?? {}, null, 2)
  } catch { dataDebugParamJson.value = defaultDebugParamJson(row, 'dataset') }
}

const openIfaceDebug = async row => {
  dataDebugKind.value = 'iface'
  dataDebugRow.value = row
  dataDebugExecMode.value = 'transaction'
  dataDebugParamJson.value = '{}'
  dataDebugStepsJson.value = row.steps_json != null ? String(row.steps_json) : ''
  dataDebugLimit.value = 200
  dataDebugResult.value = null
  dataDebugCollapse.value = []
  dlgDataDebug.value = true
  try {
    const res = await api.mockParamsInterface(row.id)
    dataDebugParamJson.value = JSON.stringify(res?.param_values ?? {}, null, 2)
  } catch { dataDebugParamJson.value = defaultDebugParamJson(row, 'iface') }
}

const saveDebugStepsJson = async () => {
  const row = dataDebugRow.value
  if (!row?.id) return
  const s = dataDebugStepsJson.value.trim()
  if (s) {
    try { JSON.parse(s) } catch {
      ElMessage.error('steps_json 格式错误，请检查 JSON')
      return
    }
  }
  try {
    await api.updateDataInterface(dataStackRouteKey(row), { ...row, steps_json: s })
    row.steps_json = s
    ElMessage.success('已保存到接口')
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  }
}

const runDataDebug = async () => {
  if (!dataDebugRow.value?.id) return
  let pv
  try {
    pv = JSON.parse(dataDebugParamJson.value || '{}')
    if (pv === null || typeof pv !== 'object' || Array.isArray(pv)) {
      ElMessage.warning('param_values 须为 JSON 对象')
      return
    }
  } catch {
    ElMessage.error('param_values 须为合法 JSON')
    return
  }
  dataDebugBusy.value = true
  dataDebugResult.value = null
  try {
    const body = { param_values: pv, limit: dataDebugLimit.value }
    if (showDataDebugModeSwitch.value && dataDebugExecMode.value === 'query') {
      body.mode = 'query'
    }
    if (dataDebugKind.value === 'iface' && dataDebugStepsJson.value.trim()) {
      body.steps_json = dataDebugStepsJson.value.trim()
    }
    const res =
      dataDebugKind.value === 'dataset'
        ? await api.debugDataset(dataStackRouteKey(dataDebugRow.value), body)
        : await api.debugDataInterface(dataStackRouteKey(dataDebugRow.value), body)
    dataDebugResult.value = res && typeof res === 'object' ? res : { raw: res }
  } catch (e) {
    dataDebugResult.value = { error: e?.response?.data?.error || e?.message || '请求失败' }
  } finally {
    dataDebugBusy.value = false
  }
}

const loadEventRows = async () => {
  if (!dataDebugRow.value?.id) return
  eventRowsBusy.value = true
  eventRowsError.value = ''
  eventRowsLoaded.value = false
  try {
    const res = await api.getDatasetEventRows(dataStackRouteKey(dataDebugRow.value), eventRowsLimit.value)
    const rows = res?.data ?? []
    eventRowsData.value = Array.isArray(rows) ? rows : []
    eventRowsCols.value = eventRowsData.value.length ? Object.keys(eventRowsData.value[0]) : []
    eventRowsTable.value = res?.table ?? ''
    eventRowsLoaded.value = true
  } catch (e) {
    eventRowsError.value = e?.response?.data?.error || e?.message || '查询失败'
  } finally {
    eventRowsBusy.value = false
  }
}

const previewDs = async (row, page = 1) => {
  previewBusy.value = true
  try {
    const offset = (page - 1) * previewPageSize.value
    const res = await api.previewDataset(dataStackRouteKey(row), {
      param_values: {},
      limit: previewPageSize.value,
      offset
    })
    const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? [])
    const arr = JSON.parse(raw || '[]')
    previewRows.value = Array.isArray(arr) ? arr.map((r, i) => ({ ...r, _idx: offset + i })) : []
    previewTotal.value = res.total ?? previewRows.value.length
    previewPage.value = page
    previewRow.value = row

    // 列：优先用 param_schema 定义的字段，fallback 到行数据 keys
    let schemaCols = []
    if (row.param_schema) {
      try {
        const schema = JSON.parse(row.param_schema)
        if (schema?.properties) schemaCols = Object.keys(schema.properties)
      } catch {}
    }
    if (schemaCols.length) {
      previewCols.value = schemaCols
    } else if (previewRows.value.length) {
      const keys = new Set()
      previewRows.value.forEach(r => {
        if (r && typeof r === 'object') Object.keys(r).filter(k => k !== '_idx').forEach(k => keys.add(k))
      })
      previewCols.value = [...keys]
    } else {
      previewCols.value = []
    }
    dlgPreview.value = true
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '预览失败')
  } finally {
    previewBusy.value = false
  }
}

const onPreviewPageChange = (page) => {
  if (previewRow.value) previewDs(previewRow.value, page)
}

const onPreviewPageSizeChange = (size) => {
  previewPageSize.value = size
  if (previewRow.value) previewDs(previewRow.value, 1)
}

const delDs = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataset(dataStackRouteKey(row))
  loadAll()
}

function datasetsForIfaceKind (kind) {
  if (kind === 'transaction') {
    return datasets.value.filter(d => d.kind === 'transaction')
  }
  return datasets.value.filter(d => d.kind === 'query' || d.kind === 'buffer')
}

function onIfaceKindChange () {
  ifaceParamSyncEnabled.value = false
  const list = datasetsForIfaceKind(ifaceForm.value.kind)
  if (!list.some(d => d.id === ifaceForm.value.dataset_id)) {
    ifaceForm.value.dataset_id = list[0]?.id ?? null
  }
  syncIfaceParamSelectionFromDataset()
}

function inferJsonSchemaTypeForParam (name) {
  const n = String(name).toLowerCase()
  if (n === 'id' || n.endsWith('_id') || n === 'limit' || n === 'offset' || n === 'page' || n === 'page_size' || n === 'size') {
    return 'integer'
  }
  if (n.includes('count') || n.includes('num') || n.includes('amount') || n === 'qty') return 'number'
  if (n.includes('enabled') || n === 'active' || n === 'deleted') return 'boolean'
  return 'string'
}

function buildParamSchemaFromKeys (keys) {
  const properties = {}
  for (const k of keys) {
    properties[k] = {
      type: inferJsonSchemaTypeForParam(k),
      description: `SQL 命名参数 :${k}`
    }
  }
  return JSON.stringify({ type: 'object', properties }, null, 2)
}

function buildDatasetPayloadWithParamSchema (ds, keys) {
  return {
    code: ds.code,
    name: ds.name,
    category: ds.category || '',
    kind: ds.kind,
    definition: ds.definition || '',
    steps_json: ds.steps_json || '[]',
    param_schema: buildParamSchemaFromKeys(keys),
    meta_json: ds.meta_json != null ? String(ds.meta_json) : '',
    data_source_id: ds.data_source_id
  }
}

function syncIfaceParamSelectionFromDataset () {
  if (ifaceForm.value.kind !== 'query') {
    ifaceSelectedSqlParams.value = []
    return
  }
  const ds = datasets.value.find(d => d.id === ifaceForm.value.dataset_id)
  if (!ds || (ds.kind !== 'query' && ds.kind !== 'buffer')) {
    ifaceSelectedSqlParams.value = []
    return
  }
  const keys = collectParamNamesFromDataset(ds)
  const fromSchema = parseParamSchemaKeys(ds.param_schema)
  let pick = []
  if (fromSchema?.length) {
    pick = fromSchema.filter(k => keys.includes(k))
  }
  if (!pick.length) pick = [...keys]
  ifaceSelectedSqlParams.value = pick
}

function ifaceSelectAllSqlParams () {
  ifaceSelectedSqlParams.value = [...ifaceSqlParamCandidates.value]
}

function ifaceClearSqlParams () {
  ifaceSelectedSqlParams.value = []
}

const openIface = row => {
  const qList = datasets.value.filter(d => d.kind === 'query' || d.kind === 'buffer')
  ifaceForm.value = row
    ? {
        ...row,
        dataset_id: row.dataset_id,
        static_crud_op: row.static_crud_op || '',
        code: row.code || row.slug || '',
        data_structure_id: row.data_structure_id ?? null,
        param_defaults_json: row.param_defaults_json != null ? String(row.param_defaults_json) : '',
        schema_json: row.schema_json != null ? String(row.schema_json) : '',
        steps_json: row.steps_json != null ? String(row.steps_json) : ''
      }
    : {
        id: null,
        name: '',
        code: 'demo_api',
        slug: 'demo_api',
        category: 'default',
        kind: 'query',
        dataset_id: qList[0]?.id ?? null,
        data_structure_id: null,
        param_defaults_json: '',
        static_crud_op: '',
        schema_json: '',
        steps_json: ''
      }
  ifaceParamSyncEnabled.value = false
  nextTick(async () => {
    syncIfaceParamSelectionFromDataset()
    await loadIfaceStructuresForDataset()
  })
  dlgIface.value = true
}

/** 将绑定数据集的 param_schema.properties 中缺失的键合并进 ifaceForm.schema_json */
const mergeIfaceSchemaFromDataset = () => {
  const ds = datasets.value.find(d => d.id === ifaceForm.value.dataset_id)
  if (!ds?.param_schema) {
    ElMessage.info('绑定数据集无 param_schema，无法补全')
    return
  }
  let dsSchema = {}
  try { dsSchema = JSON.parse(ds.param_schema) } catch { ElMessage.error('数据集 param_schema 格式错误'); return }
  let cur = {}
  if (ifaceForm.value.schema_json?.trim()) {
    try { cur = JSON.parse(ifaceForm.value.schema_json) } catch { ElMessage.error('当前 schema_json 格式错误'); return }
  }
  const merged = { type: 'object', ...cur, properties: { ...(dsSchema.properties || {}), ...(cur.properties || {}) } }
  ifaceForm.value.schema_json = JSON.stringify(merged, null, 2)
  ElMessage.success('已合并')
}

// ── 模拟数据 ──────────────────────────────────────────────────────────────────
const dlgIfaceMock = ref(false)
const ifaceMockJson = ref('')
const _mockRow = ref(null)

const _generateMockFromSchema = schemaStr => {
  if (!schemaStr?.trim()) return ''
  let schema = {}
  try { schema = JSON.parse(schemaStr) } catch { return '' }
  const genValue = (def, depth = 0) => {
    if (!def || depth > 4) return null
    const t = def.type
    if (t === 'number' || t === 'integer') return Math.floor(Math.random() * 1000)
    if (t === 'boolean') return Math.random() > 0.5
    if (t === 'array') return [genValue(def.items, depth + 1)]
    if (t === 'object' || def.properties) {
      const obj = {}
      for (const [k, v] of Object.entries(def.properties || {})) obj[k] = genValue(v, depth + 1)
      return obj
    }
    // string — try to guess from key name / description
    const hint = (def.description || '').toLowerCase()
    if (/time|date/.test(hint)) return new Date().toISOString().slice(0, 19).replace('T', ' ')
    if (/id$/.test(hint)) return Math.floor(Math.random() * 10000)
    return 'sample_' + Math.random().toString(36).slice(2, 7)
  }
  const row = genValue(schema)
  return JSON.stringify(row, null, 2)
}

const openIfaceMock = row => {
  _mockRow.value = row
  ifaceMockJson.value = _generateMockFromSchema(row.schema_json)
  dlgIfaceMock.value = true
}

const regenerateIfaceMock = () => {
  ifaceMockJson.value = _generateMockFromSchema(_mockRow.value?.schema_json)
}

const copyIfaceMock = async () => {
  try {
    await navigator.clipboard.writeText(ifaceMockJson.value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选取')
  }
}

const saveIface = async () => {
  if (ifaceForm.value.dataset_id == null) {
    ElMessage.warning('请选择数据集')
    return
  }
  const slug = (ifaceForm.value.slug || '').trim()
  let code = (ifaceForm.value.code || '').trim()
  if (!code) code = slug
  const ifacePayload = {
    name: ifaceForm.value.name,
    code,
    slug,
    category: ifaceForm.value.category,
    kind: ifaceForm.value.kind,
    dataset_id: ifaceForm.value.dataset_id,
    data_structure_id: ifaceForm.value.data_structure_id ?? null,
    param_defaults_json: ifaceForm.value.param_defaults_json || '',
    method: ifaceForm.value.method || 'POST',
    enabled: ifaceForm.value.enabled !== false,
    required_scopes: ifaceForm.value.required_scopes || '',
    group_id: ifaceForm.value.group_id,
    static_crud_op: ifaceForm.value.static_crud_op || '',
    schema_json: ifaceForm.value.schema_json || '',
    steps_json: ifaceForm.value.steps_json || ''
  }
  try {
    if (ifaceForm.value.id) await api.updateDataInterface(dataStackRouteKey(ifaceForm.value), ifacePayload)
    else await api.createDataInterface(ifacePayload)

    const syncSchema =
      ifaceForm.value.kind === 'query' &&
      !ifaceForm.value.static_crud_op &&
      ifaceParamSyncEnabled.value &&
      ifaceSelectedSqlParams.value.length > 0
    if (syncSchema) {
      const ds = datasets.value.find(d => d.id === ifaceForm.value.dataset_id)
      if (ds?.kind === 'query' || ds?.kind === 'buffer') {
        try {
          await api.updateDataset(dataStackRouteKey(ds), buildDatasetPayloadWithParamSchema(ds, ifaceSelectedSqlParams.value))
        } catch (e2) {
          ElMessage.warning(
            '接口已保存，但写入数据集 param_schema 失败：' + (e2?.response?.data?.error || e2?.message || '未知错误')
          )
        }
      }
    }

    dlgIface.value = false
    ElMessage.success('已保存')
    loadAll()
  } catch (e) {
    ElMessage.error(e?.response?.data?.error || '保存失败')
  }
}

const delIface = async row => {
  await ElMessageBox.confirm('删除？', '确认')
  await api.deleteDataInterface(dataStackRouteKey(row))
  loadAll()
}

const batchDelIface = async () => {
  if (!ifaceSelection.value.length) return
  await ElMessageBox.confirm(`确认删除选中的 ${ifaceSelection.value.length} 条接口？`, '批量删除', { type: 'warning' })
  await api.batchDeleteDataInterfaces(ifaceSelection.value.map(r => r.id))
  ifaceSelection.value = []
  loadAll()
}

onMounted(loadAll)
</script>

<style scoped>
.tbar {
  margin-bottom: 8px;
}
.field-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.45;
}
.row-flex {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
}
.debug-out {
  margin-top: 14px;
}
.debug-meta {
  margin-top: 10px;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
.mono.block {
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
}
.mono.block.tight {
  max-height: 200px;
}
.event-payload-pre {
  max-height: 360px;
  overflow: auto;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  border: 1px solid var(--el-border-color-lighter);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  white-space: pre;
  word-break: normal;
  margin: 0;
}
.debug-collapse {
  margin-bottom: 12px;
}
.row-copy {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.url-line {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-size: 12px;
}
.debug-inv-desc :deep(.el-descriptions__label) {
  width: 140px;
}
.debug-param-actions {
  margin-left: 6px;
}
.iface-param-toolbar {
  margin-bottom: 6px;
}
.iface-param-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
</style>
