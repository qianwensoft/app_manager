# 工作流型接口完整技术设计方案

## 决策确认

根据讨论确定的技术方案：

1. ✅ **接口解耦**：workflow接口不绑定数据集，但绑定多数据源
2. ✅ **一致性策略**：多数据源采用最终一致性（补偿机制/Saga模式）
3. ✅ **脚本引擎**：全支持 JavaScript + Lua + Go插件
4. ✅ **前端编辑器**：拖拽式可视化编辑器（基于Vue Flow）

---

## 一、数据模型设计

### 1.1 DataInterface表扩展

```go
type DataInterface struct {
    ID                uint      `gorm:"primaryKey" json:"id"`
    Name              string    `gorm:"size:200" json:"name"`
    Code              string    `gorm:"uniqueIndex;size:120" json:"code"`
    Slug              string    `gorm:"uniqueIndex;size:120" json:"slug"`
    Kind              string    `gorm:"size:32" json:"kind"` // 新增 "workflow"
    
    // workflow类型时这两个字段为NULL
    DatasetID         *uint     `gorm:"index" json:"dataset_id"`
    DataStructureID   *uint     `gorm:"index" json:"data_structure_id"`
    
    // workflow专用字段
    WorkflowJSON      string    `gorm:"type:text" json:"workflow_json"`
    DataSourcesJSON   string    `gorm:"type:text" json:"datasources_json"` // 多数据源配置
    
    // 复用现有字段
    SchemaJSON        string    `gorm:"type:text" json:"schema_json"` // 输入参数schema
    ParamDefaultsJSON string    `gorm:"type:text" json:"param_defaults_json"`
    
    Enabled           bool      `gorm:"default:true" json:"enabled"`
    RequiredScopes    string    `gorm:"type:text" json:"required_scopes"`
    CreatedAt         time.Time `json:"created_at"`
    UpdatedAt         time.Time `json:"updated_at"`
}
```

### 1.2 DataSourcesJSON格式

```json
{
  "datasources": [
    {
      "alias": "db_main",
      "data_source_id": 1,
      "description": "主业务库（订单、用户）"
    },
    {
      "alias": "db_inventory",
      "data_source_id": 2,
      "description": "库存库"
    },
    {
      "alias": "db_log",
      "data_source_id": 3,
      "description": "日志库（只写）"
    }
  ],
  "default_datasource": "db_main"
}
```

### 1.3 WorkflowJSON完整格式

```json
{
  "version": "1.0",
  "description": "创建订单并扣减库存的完整流程",
  "steps": [
    {
      "id": "step_create_order",
      "type": "sql",
      "label": "创建订单",
      "datasource": "db_main",
      "sql": "INSERT INTO orders (user_id, amount, status) VALUES (:user_id, :amount, 'pending')",
      "transaction_group": "tx_main",
      "output": {
        "order_id": "{{last_insert_id}}"
      },
      "on_error": "rollback"
    },
    {
      "id": "step_query_user",
      "type": "interface",
      "label": "查询用户信息",
      "interface_code": "user_info_query",
      "params": {
        "user_id": ":user_id"
      },
      "output": "user_info"
    },
    {
      "id": "step_check_vip",
      "type": "condition",
      "label": "判断VIP等级",
      "expression": ":user_info.vip_level >= 3",
      "then": ["step_apply_discount"],
      "else": ["step_normal_price"]
    },
    {
      "id": "step_apply_discount",
      "type": "script",
      "label": "计算VIP折扣",
      "engine": "javascript",
      "code": "return {final_amount: context.amount * 0.8};",
      "output": "pricing"
    },
    {
      "id": "step_deduct_inventory",
      "type": "sql",
      "label": "扣减库存",
      "datasource": "db_inventory",
      "sql": "UPDATE inventory SET stock = stock - :quantity WHERE product_id = :product_id AND stock >= :quantity",
      "transaction_group": "tx_inventory",
      "expect_affected_rows": 1,
      "on_error": "rollback"
    }
  ],
  "transactions": {
    "tx_main": {
      "datasource": "db_main",
      "isolation": "READ_COMMITTED",
      "steps": ["step_create_order"]
    },
    "tx_inventory": {
      "datasource": "db_inventory",
      "isolation": "REPEATABLE_READ",
      "steps": ["step_deduct_inventory"]
    }
  },
  "error_handling": {
    "strategy": "compensate",
    "compensation_steps": [
      {
        "for_step": "step_create_order",
        "sql": "UPDATE orders SET status = 'cancelled' WHERE id = :order_id",
        "datasource": "db_main"
      },
      {
        "for_step": "step_deduct_inventory",
        "sql": "UPDATE inventory SET stock = stock + :quantity WHERE product_id = :product_id",
        "datasource": "db_inventory"
      }
    ]
  }
}
```

---

## 二、数据源动态路由设计

### 2.1 四种路由方式

#### 方式1：静态指定（最常见）
```json
{
  "type": "sql",
  "datasource": "db_main",
  "sql": "INSERT INTO orders ..."
}
```

#### 方式2：参数动态路由
```json
{
  "type": "sql",
  "datasource": ":request.region",
  "sql": "INSERT INTO orders ..."
}
```

调用示例：
```bash
POST /api/open/v1/data/create_order
{
  "region": "db_hz",
  "user_id": 123
}
```

#### 方式3：条件路由规则
```json
{
  "type": "sql",
  "datasource_routing": {
    "rules": [
      {"condition": "{{user_id}} % 2 == 0", "datasource": "db_even"},
      {"condition": "{{user_id}} % 2 == 1", "datasource": "db_odd"}
    ],
    "default": "db_main"
  },
  "sql": "SELECT * FROM users WHERE id = :user_id"
}
```

#### 方式4：脚本路由
```json
{
  "type": "sql",
  "datasource_routing": {
    "type": "script",
    "engine": "javascript",
    "code": "if (context.amount > 10000) return 'db_high_value'; return 'db_normal';"
  },
  "sql": "INSERT INTO orders ..."
}
```

---

## 三、代码架构设计

### 3.1 目录结构

```
server/
├── workflow/
│   ├── engine.go              # 工作流执行引擎
│   ├── context.go             # 执行上下文
│   ├── step.go                # 步骤定义
│   ├── step_executor.go       # 步骤执行器接口
│   ├── sql_executor.go        # SQL步骤执行器
│   ├── interface_executor.go  # 接口调用执行器
│   ├── condition_executor.go  # 条件判断执行器
│   ├── script_executor.go     # 脚本执行器
│   ├── datasource_router.go   # 数据源路由器
│   ├── transaction_manager.go # 事务管理器
│   ├── compensation.go        # 补偿机制
│   └── audit.go               # 审计日志
├── api/
│   ├── iface_executor.go      # 统一执行入口（集成workflow）
│   └── ...
```

### 3.2 核心接口定义

```go
// server/workflow/step_executor.go
package workflow

type StepExecutor interface {
    Execute(step *Step, ctx *Context) (*StepResult, error)
    Validate(step *Step) error
}

type Context struct {
    Request     map[string]interface{}
    Variables   map[string]interface{}
    StepOutputs map[string]interface{}
    Datasources map[string]*models.DataSource
    UserID      *uint
    RequestID   string
}

type StepResult struct {
    StepID       string
    Success      bool
    Output       interface{}
    AffectedRows int64
    LastInsertID int64
    ElapsedMS    int64
    Error        string
}
```

---

## 四、事务管理（最终一致性）

### 4.1 Saga补偿模式

```go
// server/workflow/compensation.go
type CompensationManager struct {
    completed []*StepResult
    workflow  *Workflow
}

func (cm *CompensationManager) Compensate(ctx *Context) error {
    // 逆序执行补偿
    for i := len(cm.completed) - 1; i >= 0; i-- {
        stepResult := cm.completed[i]
        compensation := cm.findCompensation(stepResult.StepID)
        
        if compensation != nil {
            if err := cm.executeCompensation(compensation, ctx); err != nil {
                log.Printf("补偿失败: step=%s, err=%v", stepResult.StepID, err)
            }
        }
    }
    return nil
}
```

### 4.2 事务分组管理

```go
// server/workflow/transaction_manager.go
type TransactionManager struct {
    groups map[string]*TransactionGroup
}

type TransactionGroup struct {
    ID         string
    Datasource *models.DataSource
    Isolation  string
    Tx         *sql.Tx
    Committed  bool
}

func (tm *TransactionManager) Begin(groupID string) error {
    group := tm.groups[groupID]
    db, _ := dbdriver.OpenDataSource(group.Datasource)
    
    tx, err := db.BeginTx(context.Background(), &sql.TxOptions{
        Isolation: parseIsolation(group.Isolation),
    })
    
    group.Tx = tx
    return err
}

func (tm *TransactionManager) CommitAll() error {
    for _, group := range tm.groups {
        if err := group.Tx.Commit(); err != nil {
            return fmt.Errorf("commit tx_group %s failed: %w", group.ID, err)
        }
        group.Committed = true
    }
    return nil
}
```

---

## 五、脚本引擎实现

### 5.1 JavaScript引擎（goja）

```go
// server/workflow/js_engine.go
package workflow

import "github.com/dop251/goja"

type JavaScriptEngine struct{}

func (e *JavaScriptEngine) Execute(code string, ctx *Context) (interface{}, error) {
    vm := goja.New()
    
    // 注入上下文
    vm.Set("context", ctx.ToMap())
    vm.Set("request", ctx.Request)
    vm.Set("vars", ctx.Variables)
    
    // 注入工具函数
    vm.Set("log", func(msg string) {
        fmt.Printf("[JS] %s\n", msg)
    })
    
    // 执行代码
    result, err := vm.RunString(code)
    if err != nil {
        return nil, err
    }
    
    return result.Export(), nil
}
```

### 5.2 Lua引擎（gopher-lua）

```go
// server/workflow/lua_engine.go
package workflow

import lua "github.com/yuin/gopher-lua"

type LuaEngine struct{}

func (e *LuaEngine) Execute(code string, ctx *Context) (interface{}, error) {
    L := lua.NewState()
    defer L.Close()
    
    // 注入上下文
    L.SetGlobal("context", e.toTable(L, ctx.ToMap()))
    L.SetGlobal("request", e.toTable(L, ctx.Request))
    
    // 执行代码
    if err := L.DoString(code); err != nil {
        return nil, err
    }
    
    // 获取返回值
    ret := L.Get(-1)
    return e.toGo(ret), nil
}
```

### 5.3 Go插件引擎

```go
// server/workflow/go_plugin_engine.go
package workflow

import "plugin"

type GoPluginEngine struct {
    pluginDir string
}

func (e *GoPluginEngine) Execute(code string, ctx *Context) (interface{}, error) {
    // code格式: "plugin_name:function_name"
    parts := strings.Split(code, ":")
    pluginName, funcName := parts[0], parts[1]
    
    // 加载插件
    p, err := plugin.Open(filepath.Join(e.pluginDir, pluginName+".so"))
    if err != nil {
        return nil, err
    }
    
    // 查找函数
    symbol, err := p.Lookup(funcName)
    if err != nil {
        return nil, err
    }
    
    // 类型断言并执行
    fn, ok := symbol.(func(*Context) (interface{}, error))
    if !ok {
        return nil, fmt.Errorf("invalid plugin signature")
    }
    
    return fn(ctx)
}
```

---

## 六、实施路线图

### 阶段1：修复当前BUG ✅ 已完成
- [x] 修复`iface_executor.go`步骤格式解析
- [x] 统一使用`parseStepsJSON`
- [x] 添加单元测试

### 阶段2：基础架构搭建（1周）
- [ ] 数据库migration：添加workflow字段
- [ ] 创建`server/workflow/`包
- [ ] 实现`Engine`、`Context`、`Step`基础结构
- [ ] 实现`SQLStepExecutor`（静态数据源）
- [ ] 集成到`iface_executor.go`的`Execute`函数

### 阶段3：多数据源路由（3-5天）
- [ ] 实现`DataSourceRouter`
- [ ] 支持参数动态路由
- [ ] 支持条件路由规则
- [ ] 支持脚本路由

### 阶段4：事务管理（5-7天）
- [ ] 实现`TransactionManager`
- [ ] 事务分组提交
- [ ] 实现`CompensationManager`
- [ ] Saga补偿机制

### 阶段5：脚本引擎（1周）
- [ ] JavaScript引擎（goja）
- [ ] Lua引擎（gopher-lua）
- [ ] Go插件加载器
- [ ] 沙箱安全限制

### 阶段6：接口调用步骤（2-3天）
- [ ] 实现`InterfaceCallExecutor`
- [ ] 参数映射
- [ ] 循环依赖检测

### 阶段7：条件分支（2-3天）
- [ ] 表达式解析器
- [ ] then/else分支路由

### 阶段8：前端拖拽编辑器（2周）
- [ ] Vue Flow集成
- [ ] 组件库拖拽
- [ ] 节点属性编辑
- [ ] 工作流JSON导入导出

### 阶段9：监控和调试（1周）
- [ ] 执行日志
- [ ] 性能统计
- [ ] 失败告警

---

## 七、数据库Migration

```sql
-- 添加workflow相关字段
ALTER TABLE data_interfaces 
ADD COLUMN workflow_json TEXT DEFAULT NULL,
ADD COLUMN datasources_json TEXT DEFAULT NULL;

-- 修改kind枚举（如果使用枚举约束）
-- ALTER TABLE data_interfaces MODIFY COLUMN kind VARCHAR(32);

-- 允许workflow类型的接口不绑定数据集
-- ALTER TABLE data_interfaces MODIFY COLUMN dataset_id INT NULL;
```

---

## 八、API示例

### 创建workflow接口

```bash
POST /api/data/interfaces
{
  "name": "创建订单工作流",
  "code": "order_workflow",
  "slug": "order_workflow",
  "kind": "workflow",
  "dataset_id": null,
  "datasources_json": "{\"datasources\":[{\"alias\":\"db_main\",\"data_source_id\":1}]}",
  "workflow_json": "{...}",
  "schema_json": "{\"type\":\"object\",\"properties\":{\"user_id\":{\"type\":\"integer\"},\"amount\":{\"type\":\"number\"}}}"
}
```

### 调用workflow接口

```bash
POST /api/open/v1/data/order_workflow
{
  "user_id": 123,
  "amount": 100.00,
  "product_id": 456,
  "quantity": 2
}
```

响应：
```json
{
  "ok": true,
  "kind": "workflow",
  "elapsed_ms": 45,
  "steps": [
    {
      "step_id": "step_create_order",
      "success": true,
      "output": {"order_id": 789},
      "elapsed_ms": 12
    },
    {
      "step_id": "step_deduct_inventory",
      "success": true,
      "affected_rows": 1,
      "elapsed_ms": 8
    }
  ],
  "data": {
    "order_id": 789,
    "final_amount": 80.00
  }
}
```

---

## 九、兼容性策略

### 9.1 向后兼容

- `kind=transaction`的现有接口继续工作
- 内部委托给workflow引擎执行
- 响应格式保持一致

### 9.2 迁移工具

```bash
# 将transaction接口转换为workflow
go run tools/migrate_transaction_to_workflow.go --interface-id=123
```

---

## 十、安全考量

### 10.1 SQL注入防护
- 强制使用参数绑定（`:param`）
- 禁止动态SQL拼接
- 白名单SQL关键字检查

### 10.2 脚本沙箱
- JavaScript/Lua执行超时限制（默认5秒）
- 禁止访问文件系统
- 禁止网络请求（除非明确允许）
- 内存使用限制

### 10.3 权限控制
- workflow接口需要`write`权限scope
- 敏感操作（DELETE）需要额外审批
- 数据源级别的读写权限控制

---

**文档版本**: v1.0  
**创建日期**: 2026-07-01  
**作者**: Claude (Kiro)  
**状态**: 阶段1已完成，阶段2进行中
