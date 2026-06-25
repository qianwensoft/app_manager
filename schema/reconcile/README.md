# schema ↔ models 对账

`schema/` 中的 TypeScript 接口应与 `server/models` 的 JSON 字段（`json` tag）保持一致。

## 自动化

对账逻辑：`server/schemasync/`  
注册表：`server/schemasync/registry.go` — 新增 REST 实体时在此追加 `Entry`  
测试：`server/tests/schema_reconcile_test.go`

```bash
# 仓库根目录
make schema-check

# 或
cd server && go test ./tests -run TestSchemaReconcile -v
```

失败时输出示例：

```
- DataInterface (DataInterface)
    missing in TS: static_crud_op
    missing in Go: foo_bar
```

## 新增实体流程

1. 在 `server/models/*.go` 添加/修改结构体与 `json` tag  
2. 在 `schema/api/*.ts`（或 `schema/form-app/*.ts`）添加对应 `export interface`  
3. 在 `schemasync/registry.go` 的 `Registry` 追加一条映射  
4. 若某字段仅在一侧出现（嵌套关联、manifest 子集等），用 `AllowGoOnly` / `AllowTSOnly` 标注  
5. 运行 `make schema-check` 直至通过  

## 特殊条目

| Entry | 说明 |
|-------|------|
| `AgentMenuManifestItem` | manifest 下发的 `FormAppMenuBundleItem` 是 `AgentMenuItem` 子集 + `preview_path` / `content_version` |
| `Dataset` / `DataInterface` | 允许 `data_source` / `dataset` 等嵌套预加载字段在两侧同时存在 |
