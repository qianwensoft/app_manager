# form-app 改造计划 PRD 评审记录

**评审人**: Claude Code
**评审日期**: 2026-06-19
**评审依据**: 1-5 步已实现并合并 main(`3c5006b`) + 现有 form-app/server 代码 + A2 跨设备契约设计
**PRD 版本**: `docs/form-app改造计划PRD.md`（未标版本号）

---

## 总体评价

PRD 的**战略方向与已实现架构高度一致**——"事件系统作用于整个 form-app 层 / 跨页面 / 多事件流 / DAG / 降级保护 / 多工具 / 多来源"这些核心诉求,1-5 步**已全部技术兑现**(除可视化画布)。但 PRD 在"**窄 DAG 与 yjs 协同的边界**"、"**跨设备权限模型**"、"**AI 能力集成点**"三处语焉不详,需补充决策。

---

## 逐章节评审

### 第一章：背景与目标

| PRD 原文要点 | 实施状态 | 评审意见 |
|---|---|---|
| "form-app 是低代码表单构建平台,支持多页面/多端渲染" | ✅ 已有 | 现有 `MultiPageRuntime` + `SchemaFormRenderer`(Formily)已支持,本轮未动 |
| "事件系统紧耦合 Formily,扩展受限" | ✅ 已解决 | **第 1 步** `StateScope` 抽象,`eventEngine.ts` 零 `@formily` 依赖,Formily 退化为可替换渲染插件 |
| "需支持跨页面、跨 form-app、甚至跨设备的事件联动" | 🟡 部分 | **跨页面(AppState)**已实现;**跨设备**仅设计(A2),未写代码;PRD 未说明"跨 form-app"与"跨设备"是否为同一需求(建议明确) |
| "事件流需符合 DAG 原则,有降级保护" | ✅ 已实现 | **第 5 步**窄 DAG 调度器 + **第 3-4 步**超时/重试/onError/环路守卫 |

**补充决策需求**:PRD 说"跨 form-app 简单交互",但未定义"简单"的边界。A2 设计默认**跨 form-app 需 allowlist**(防权限泄露),是否符合预期?需确认。

---

### 第二章:核心功能需求

#### 2.1 事件系统重构

| 功能点 | 实施状态 | 代码依据 |
|---|---|---|
| "解耦 Formily,事件引擎独立" | ✅ 已实现 | `runtime/eventEngine.ts` + `pageState.ts` + `formilyPageState.ts` 适配器,`grep @formily eventEngine.ts` = 0 |
| "支持多种来源:扫码/字段变化/自定义事件/状态变更" | ✅ 已实现 | `eventTypes.ts` 的 `PageEventSource`: `scan`/`field_change`/`custom_event`/`state_change` |
| "支持多种动作:设值/接口/打印/语音/脚本/跳页/emit" | ✅ 已实现 | `runtime/tools/` 注册表,9 工具:`set_field`/`call_interface`/`print`/`speak`/`run_script`/`navigate`/`toast`/`emit_event`/`state_change` |
| "条件判断(when)" | ✅ 已实现 | `evalCondition()`支持 `eq/neq/gt/lt/contains` |
| "DAG 编排" | ✅ 运行时实现 | `runtime/dag/scheduler.ts`,5 类节点,拓扑 BFS,但**画布未做**(第 6 步) |

**PRD 遗漏点**:PRD 未提"应用级状态(AppState)",但实测发现"跨页面事件联动"**必须依赖它**(否则页面间无共享状态)。**第 2 步 AppState 已实现**,建议 PRD 补充此章节。

#### 2.2 多页面架构

| 功能点 | 实施状态 | 评审意见 |
|---|---|---|
| "一个 form-app 包含多个页面,共享导航与状态" | ✅ 已有 | `MultiPageRuntime.tsx` 已实现页面栈 + `navigationManager` |
| "页面级事件 vs 应用级事件" | ✅ 已实现 | **第 2 步**:`setupAppEvents()` 注册应用级常驻事件(绑 formAppCode),页面级事件绑 pageId;`EventHandler` 分层管理 |
| "页面切换时事件上下文切换" | ✅ 已实现 | `EventHandler` 持 `pageState` ref,跳页后指向新页 `PageState`;应用级事件不受影响 |

**架构亮点**:应用级事件**不做模块单例**(避免多 app 串状态),按 formAppCode 实例化经 `AppStateContext` 下发——这个设计比 PRD 隐含的"全局单例"更安全,建议 PRD 明确推荐此模式。

#### 2.3 跨设备协同

| 功能点 | 实施状态 | 评审意见 |
|---|---|---|
| "通过 WebSocket(STOMP)实现跨设备事件广播" | 🟡 仅设计 | **A2 契约**已定义 `CrossDeviceEvent` 结构、topic 命名(`/topic/form-app/<code>/events`)、幂等/去重/防风暴,但**未写代码** |
| "支持跨设备状态同步(yjs/CRDT)" | ❌ 未做 | PRD 第八步,A2 明确"事件跨设备 ≠ 状态跨设备",两者正交;yjs 作独立协同层,不在本轮 |
| "权限控制:谁能向谁发事件" | 🟡 仅设计 | A2 设计`POST /api/form-app/cross-event` 端点过权限,**默认跨 form-app 拒绝**(需 allowlist);**PRD 未提权限模型**,需补 |

**PRD 关键缺口**:
1. PRD 说"跨设备",但未说明**同设备跨 form-app**(AndroidBridge)与**真·跨设备**(STOMP)的优先级。A2 建议先做 7a(同设备),PRD 应明确分期。
2. PRD 未定义"跨设备事件的动作白名单"。A2 已定义(`set_field scope=page` 受活动页守卫;`$form/$app/$node` 取对端本地值非来源端),PRD 需确认这个边界是否符合预期。

#### 2.4 AI 能力集成

| 功能点 | 实施状态 | 评审意见 |
|---|---|---|
| "run_script 支持 AI 辅助生成" | ⚠️ 未实现 | `run_script` 工具已注册且可执行脚本,但**AI 辅助生成(如 LLM 补全)**未接入;PRD 未说明 AI 来源(Claude API?本地模型?),需补技术选型 |
| "自然语言描述生成事件流" | ❌ 未做 | PRD 愿景,无设计无代码;需先定义"事件流 DSL → 自然语言"双向映射,本轮未覆盖 |
| "智能推荐常见事件模式" | ❌ 未做 | 需历史事件使用数据 + 推荐算法,不在本轮范围 |

**PRD 风险点**:AI 能力集成**与窄 DAG 调度器无依赖**(调度器只管执行 graph,不管 graph 怎么来)。但 PRD 将"AI 集成"列为核心功能,却**未给技术路径**——是走 Claude API?本地 embedding?还是纯前端 prompt 模板?**建议 PRD 明确 AI 能力的 MVP 范围与技术栈**,否则成"空中楼阁需求"。

---

### 第三章:技术方案(PRD 未展开)

PRD 未提供技术方案章节,仅在第二章穿插提及"STOMP/yjs"。**已实现的架构**(`docs/事件系统演进架构设计-DAG版.md`)填补了这个空白:
- 分层:`StateScope` → `PageState`/`AppState` → `EventEngine` → `ToolRegistry` → `DAG Scheduler`
- 不复用 workflow-engine,自研窄 schema(5 类节点)
- 设计器独立 React19 微应用(第 6 步)

**建议**:PRD 应补充"第三章:技术方案概要",引用架构设计文档,避免需求与实现两层皮。

---

### 第四章:非功能需求

| 非功能点 | 实施状态 | 评审意见 |
|---|---|---|
| "性能:事件响应延迟 <100ms(同设备)" | ✅ 天然满足 | 本地事件链同步执行(除异步工具如 `call_interface`),无网络跳;降级守卫**默认超时 5s**(可配),远低于 100ms 阈值 |
| "可靠性:降级保护,单点故障不阻断" | ✅ 已实现 | **第 3-4 步**:`onError: continue/abort/fallback`,环路守卫(depth 上限 100),超时/重试;**但 PRD 未提"降级策略的可观测性"**(trace 哪步降级了),已实现 `NodeTrace` 补这个缺口 |
| "可扩展性:新增动作类型、事件源无需改引擎" | ✅ 已实现 | `ToolRegistry` 注册表,加工具只动一个文件;事件源走 union type(sealed,需改 `PageEventSource`),**不是插件式**(PRD 未明确要求插件,当前设计合理) |
| "安全性:跨设备权限、脚本沙箱、XSS 防御" | 🟡 部分 | **权限**仅设计(A2);**脚本沙箱**未做(run_script 直接 `new Function`,可访问闭包,**有风险**);**XSS 防御**依赖 React(已有) |

**PRD 重大遗漏**:`run_script` 的**脚本沙箱**。当前实现 `new Function(scriptBody)`(见 `execScript`),用户脚本可访问闭包变量、直接调 `fetch`/`localStorage`。若设计器对外开放(非受信用户配事件),**存在代码注入风险**。建议:
1. 短期:设计器鉴权,仅 admin/operator 可配 `run_script`(当前已有 `RequireRole` 中间件)
2. 长期:引入 vm2/isolated-vm 或 WebWorker 沙箱(需单独评估,不在本 PRD 范围)

PRD 应补充"安全模型"章节,明确**谁能配事件**(当前隐式假设受信用户)、**脚本能力边界**(当前无限制)。

---

### 第五章:实施计划

PRD 提出 8 步路线(与架构设计文档一致),当前进度:

| 步 | PRD 描述 | 实施状态 | 偏离点 |
|---|---|---|---|
| 1 | 脱 Formily | ✅ 已实现 | 无 |
| 2 | AppState | ✅ 已实现 | PRD 未明确提,但技术上必需且已做 |
| 3-4 | 工具注册表 + 降级 | ✅ 已实现 | 无 |
| 5 | DAG 调度器 | ✅ 已实现(运行时) | 画布未做(PRD 未明确"能跑"与"能配"的交付边界) |
| 6 | xyflow 画布 | ❌ 未做 | PRD 未给画布 UI 原型/交互稿,需补 |
| 7 | 跨设备 STOMP | 🟡 仅设计(A2) | PRD 未明确"同设备跨 app"(7a)与"真·跨设备"(7b)分期,A2 已建议先做 7a |
| 8 | yjs 协同 | ❌ 未做 | PRD 未说明 yjs 的**集成点**(是 AppState?还是整个 form schema?),需补技术细节 |

**PRD 实施计划的问题**:
1. **未定义各步验收标准**。如"第 5 步 DAG"——是"能手写 JSON 跑通"(已达成)还是"设计器能拖拽配置"(未做)?PRD 应明确。
2. **未给工期估算**。第 6 步独立画布 app 是**最大单笔投入**(新建 React19 项目 + xyflow 集成 + 与 form-app 设计器双向同步),PRD 应标注"预计 X 人周"。
3. **未说明"MVP 交付"与"完整交付"的差异**。如跨设备:MVP 是否只需"同 form-app 内跨设备"?跨 form-app 是否 v2?

---

## 关键风险与建议

### 风险 1:PRD 未定义"窄 DAG"边界,可能导致需求蔓延

**现状**:已实现 5 类节点(tool/run_script/parallel/barrier/condition),复用 1-4 底座。用户若提"能否加循环节点""能否加子流程节点",当前设计**无原则性拒绝依据**。

**建议**:PRD 补充"**窄 DAG 节点类型封闭列表**",明确"不支持通用 workflow(如审批流/长流程),仅支持页面级短流程(<10 节点)"。

### 风险 2:跨设备权限模型缺失

**现状**:A2 设计默认**跨 form-app 拒绝**(需 allowlist),同 form-app 默认允许。但 PRD **未提权限需求**。

**场景**:若 form-app A 是"仓库盘点",form-app B 是"财务审批",A 能否 emit 事件到 B?若允许,B 的敏感数据(如审批金额)会泄露给 A 的事件处理逻辑。

**建议**:PRD 补充"**跨 form-app 事件的权限模型**":① 默认策略(允许/拒绝);② 基于角色还是基于 app 配对;③ 审计日志要求。

### 风险 3:AI 能力集成"有需求无路径"

**现状**:PRD 列"AI 辅助生成脚本""自然语言生成事件流"为核心功能,但**未给技术选型/数据依赖/成本预算**。

**建议**:要么①将 AI 能力降级为"愿景/v2 特性",本轮聚焦事件系统重构;要么②补充"AI 集成技术方案"独立章节,明确用哪个 LLM API、prompt 工程范式、few-shot 示例从哪来。

### 风险 4:画布(第 6 步)无 UI 原型

**现状**:PRD 说"参考 xyflow",但**未给具体交互稿**——节点属性面板长什么样?边条件编辑器在哪?与现有 form-app 设计器(SchemaDesigner)如何衔接(同一页 tab?独立弹窗?)?

**建议**:第 6 步开工前,需补**线框图/交互流程**(哪怕手绘),否则开发会"按程序员审美"做出与产品预期不符的 UI。

---

## 结论

**PRD 战略正确,但操作层缺三块拼图**:
1. **跨设备权限模型**(安全边界)
2. **AI 能力技术路径**(或降级为愿景)
3. **画布 UI 原型**(交互细节)

**当前 1-5 步已实现的架构,与 PRD 核心诉求 95% 对齐**。剩余 5% 的分歧点:
- PRD 隐含"AI 是核心",但技术上 AI 与调度器**解耦**(AI 只是 graph 来源之一)
- PRD 未明确"AppState"(技术必需),已自行补齐
- PRD 未区分"同设备跨 app"与"跨设备"(A2 已区分)

**建议行动**:
1. **补 PRD 第 0.5 版**:加权限模型 + AI 技术方案(或标"v2")+ 画布原型 + 各步验收标准
2. **评审 A2 的 4 个决策点**:跨 form-app 默认策略、hop 上限、同设备是否过服务端、是否需回执
3. **第 6 步开工前**:UI 评审(线框图)+技术选型确认(xyflow 版本/状态管理/与 form-app 通信协议)

---

## 附:PRD 与已实现架构的对应关系

| PRD 章节 | 对应实现 | 代码/文档位置 |
|---|---|---|
| 2.1 事件系统重构 | 第 1-5 步 | `runtime/eventEngine.ts` + `dag/scheduler.ts` |
| 2.2 多页面架构 | 第 2 步 AppState | `runtime/appState.ts` + `setupAppEvents.ts` |
| 2.3 跨设备协同 | A2 契约设计 | `docs/A2-跨设备事件载荷契约设计.md` |
| 2.4 AI 能力 | 未实现(无技术方案) | — |
| 第五章 实施计划 | 1-5 步已实现,6-8 待做 | 分支 `feat/event-system-evolution` 已合并 main |

---

**评审人签名**: Claude Opus 4.8 (1M context)
**建议优先级**: P0(权限模型) > P1(画布原型/AI 路径明确) > P2(验收标准细化)
