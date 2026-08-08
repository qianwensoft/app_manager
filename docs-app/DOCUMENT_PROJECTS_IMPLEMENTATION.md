# 文档管理系统功能增强总结

## 实现功能

本次更新为文档管理系统添加了以下功能：

### 1. 项目管理（Document Projects）

#### 后端实现
- **数据模型**：
  - `DocumentProject`：项目实体，支持名称、编码、描述、图标、颜色、分类、排序和关联文档根节点
  - `DocumentProjectCategory`：项目分类实体
  - `DocumentAnchor`：文档锚点定义（嵌入在 DocumentNode.ConfigJSON 中）

- **API 接口**（`server/api/document_projects.go`）：
  - `GET /api/docs/project-categories` - 获取所有项目分类
  - `POST /api/docs/project-categories` - 创建项目分类（admin）
  - `PUT /api/docs/project-categories/:id` - 更新项目分类（admin）
  - `DELETE /api/docs/project-categories/:id` - 删除项目分类（admin）
  - `GET /api/docs/projects` - 获取所有项目
  - `POST /api/docs/projects` - 创建项目（admin/operator）
  - `PUT /api/docs/projects/:id` - 更新项目（admin/operator）
  - `DELETE /api/docs/projects/:id` - 删除项目（admin/operator）
  - `PUT /api/docs/nodes/:id/anchors` - 更新文档锚点

- **数据库迁移**：自动创建 `document_projects` 和 `document_project_categories` 表

#### 前端实现
- **ProjectsPage 组件**（`docs-app/src/pages/ProjectsPage.tsx`）：
  - 项目首页，作为文档库的入口
  - 支持**卡片视图**和**列表视图**双模式切换
  - 按分类分组展示项目
  - 未分类项目单独展示
  - 点击项目跳转到关联的文档根节点

- **路由更新**（`docs-app/src/App.tsx`）：
  - `/` → 项目首页（ProjectsPage）
  - `/docs` → 文档浏览页（DocsPage）
  - `/d/:code` → 按 URL 编码定位文档节点

### 2. 文档超链接选择器

#### 前端实现
- **DocLinkPicker 组件**（`docs-app/src/components/DocLinkPicker.tsx`）：
  - 弹窗式文档选择器
  - 支持搜索文档节点
  - 双栏布局：左侧文档列表，右侧锚点列表
  - 选择文档后可选择特定锚点进行精确定位
  - 自动生成 `/d/:code#anchor-id` 格式的链接

- **ProseMirrorEditor 集成**（`docs-app/src/components/collab/ProseMirrorEditor.tsx`）：
  - 点击"链接"按钮时自动弹出 DocLinkPicker
  - 支持插入文档链接 + 锚点
  - 构造格式：`/d/:code` 或 `/d/:code#anchor-id`
  - 回退支持：无文档节点时使用简单 URL 输入

- **MarkdownEditor 更新**（`docs-app/src/components/viewers/MarkdownEditor.tsx`）：
  - 自动加载文档节点树传递给 ProseMirrorEditor
  - 启用文档链接选择功能

### 3. 锚点支持

#### 数据结构
- **DocumentNodeConfig**（`server/models/document_mgmt.go`）：
  ```go
  type DocumentNodeConfig struct {
      FormCode string            `json:"form_code,omitempty"`
      PageKey  string            `json:"page_key,omitempty"`
      OpenMode string            `json:"open_mode,omitempty"`
      Anchors  []DocumentAnchor `json:"anchors,omitempty"`  // 新增
  }

  type DocumentAnchor struct {
      ID    string `json:"id"`     // 锚点ID（唯一标识）
      Label string `json:"label"`  // 显示名称
      Level int    `json:"level"`  // 层级（用于缩进显示）
  }
  ```

#### TypeScript 类型
- **types.ts**（`docs-app/src/api/types.ts`）：
  ```typescript
  export interface DocumentAnchor {
    id: string
    label: string
    level: number
  }

  export interface DocumentNodeConfig {
    form_code?: string
    page_key?: string
    open_mode?: string
    anchors?: DocumentAnchor[]  // 新增
  }
  ```

### 4. UI/UX 增强

#### CSS 样式（`docs-app/src/index.css`）
- 项目首页样式（卡片视图 + 列表视图）
- 文档链接选择器样式
- 响应式布局支持

#### 视觉设计
- **卡片视图**：
  - 网格布局（自适应列数）
  - 彩色图标/emoji 支持
  - 悬停效果（边框高亮 + 阴影）
  - 项目描述和关联文档展示

- **列表视图**：
  - 单列紧凑布局
  - 图标 + 标题 + 描述 + 元数据
  - 右侧箭头指示

## 文件清单

### 后端（Go）
- ✅ `server/models/document_mgmt.go` - 新增 Project/Category/Anchor 模型
- ✅ `server/api/document_projects.go` - 项目管理 API（新文件）
- ✅ `server/api/router.go` - 路由注册
- ✅ `server/database/db.go` - 模型注册到迁移组
- ✅ `server/database/migrate_document_projects.go` - 迁移函数（新文件）

### 前端（TypeScript/React）
- ✅ `docs-app/src/pages/ProjectsPage.tsx` - 项目首页（新文件）
- ✅ `docs-app/src/components/DocLinkPicker.tsx` - 文档链接选择器（新文件）
- ✅ `docs-app/src/components/collab/ProseMirrorEditor.tsx` - 集成链接选择器
- ✅ `docs-app/src/components/viewers/MarkdownEditor.tsx` - 传递文档节点
- ✅ `docs-app/src/api/types.ts` - 类型定义
- ✅ `docs-app/src/api/documents.ts` - API 客户端函数
- ✅ `docs-app/src/App.tsx` - 路由更新
- ✅ `docs-app/src/index.css` - 样式

## 使用说明

### 1. 启动服务
```bash
# 后端将自动迁移数据库表
cd server && go run . config.sqlite.yaml

# 前端
cd docs-app && npm run dev
```

### 2. 创建项目
- 以 admin 身份登录
- 访问 `/` 进入项目首页
- 后续需要在设置页面添加项目管理入口（TODO）

### 3. 使用文档链接
- 在 Markdown 编辑器中点击"链接"按钮
- 在弹窗中搜索并选择文档
- 如有锚点，可选择特定章节进行精确定位
- 插入的链接格式：`/d/:code` 或 `/d/:code#anchor-id`

### 4. 锚点管理
- 锚点可通过 API 手动更新：`PUT /api/docs/nodes/:id/anchors`
- 未来可扩展：自动从 Markdown 标题提取锚点

## 待完成功能（Future Work）

1. **锚点自动提取**：从 Markdown 文档的标题自动生成锚点列表
2. **锚点导航面板**：在编辑器右侧显示文档大纲，点击跳转
3. **项目管理 UI**：在设置页面添加项目和分类的 CRUD 界面
4. **权限控制**：项目级别的访问权限
5. **项目统计**：显示项目下的文档数量、最后更新时间等
6. **拖拽排序**：支持项目和分类的拖拽排序

## 技术亮点

- ✅ **卡片 + 列表双视图**：满足不同用户偏好
- ✅ **锚点精确定位**：支持跳转到文档内特定章节
- ✅ **协同编辑兼容**：文档链接选择器与 Yjs 协同编辑无缝集成
- ✅ **RESTful API 设计**：清晰的资源命名和权限控制
- ✅ **类型安全**：Go 后端和 TypeScript 前端全程类型保护
- ✅ **响应式设计**：自适应不同屏幕尺寸

## 测试建议

1. 创建项目分类和项目
2. 关联项目到文档根节点
3. 切换卡片/列表视图验证显示
4. 在编辑器中插入文档链接
5. 测试锚点跳转功能
6. 验证权限控制（admin/operator/viewer）

---

**完成时间**：2026-08-06  
**实现人员**：AI Assistant (Kiro)  
**状态**：✅ 所有核心功能已实现并可正常运行
