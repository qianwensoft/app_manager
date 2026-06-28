# DataTable 搜索功能实现文档

## 功能概述

为 DataTable 组件添加了完整的搜索/查询功能，支持所有三种数据源（静态数据、API、上下文数据）。

## 实现的功能

### 1. 核心搜索能力
- ✅ 全局搜索输入框（带搜索图标）
- ✅ 清除按钮（✕）
- ✅ 实时结果计数显示
- ✅ 防抖优化（默认 300ms）
- ✅ 自动重置分页到第1页

### 2. 数据源支持
- ✅ **静态数据**：客户端过滤，大小写不敏感的子串匹配
- ✅ **API 数据**：发送搜索参数到后端，支持自定义参数名
- ✅ **上下文数据**：客户端过滤（与静态数据相同）

### 3. 可配置选项
- `enableSearch` - 启用/禁用搜索（默认：true）
- `searchPlaceholder` - 搜索框占位符（默认：使用 i18n）
- `searchableColumns` - 可搜索的列（逗号分隔，留空则搜索所有列）
- `searchParamName` - API 搜索参数名（默认："search"）
- `searchDebounceMs` - 防抖延迟（默认：300ms）

### 4. 国际化支持
- ✅ 所有文本支持中英文切换
- ✅ 新增 `i18n.search` 命名空间
  - `placeholder` - 搜索框占位符
  - `clear` - 清除按钮文本
  - `resultsCount` - 结果计数模板
  - `loading` - 加载中文本
  - `noData` - 无数据文本

## 技术实现

### 自定义 Hook
```typescript
function useDebounce(value: string, delay: number): string
```
- 使用 `useState` 和 `useEffect` 实现
- 自动清理 timeout，避免内存泄漏

### 状态管理
- `searchTerm` - 即时用户输入
- `debouncedSearchTerm` - 防抖后的值（触发 API 调用）

### 搜索逻辑

**静态数据过滤：**
```typescript
result = result.filter(row =>
  searchableColumnsArray.some(key =>
    String(row[key] || '').toLowerCase().includes(searchLower)
  )
);
```

**API 参数注入：**
```typescript
const searchParams = debouncedSearchTerm
  ? { [searchParamName]: debouncedSearchTerm }
  : {};
const allParams = { ...params, ...paginationParams, ...searchParams };
```

## UI 组件结构

```
<div className="w-full">
  {enableSearch && (
    <div className="mb-4 flex items-center gap-3">
      <div className="relative flex-1 max-w-md">
        <input />
        <搜索图标 />
        <清除按钮 />
      </div>
      <结果计数 />
    </div>
  )}
  <table>...</table>
  <分页控制 />
</div>
```

## 测试指南

### 前提条件
开发服务器运行在：http://localhost:5175/

### 测试步骤

#### 1. 基础搜索测试
1. 访问 http://localhost:5175/editor?id=1
2. 从组件面板拖入 "表格" 组件
3. 在搜索框输入 "张三" - 应立即过滤结果
4. 点击 ✕ 按钮 - 清除搜索并显示所有数据

#### 2. API 数据源测试
1. 在属性面板选择数据源 = "API 接口"
2. 设置 API 地址：`/api/lowcode/pages`
3. 打开浏览器开发工具 Network 标签
4. 在搜索框输入内容
5. 等待 300ms 后应看到 API 请求包含 `?search=...` 参数

#### 3. 高级配置测试
1. 设置 "可搜索字段" = "name,city"
2. 搜索 "25" - 应该**不**匹配年龄字段（因为未包含在搜索列中）
3. 搜索 "北京" - 应该匹配城市字段
4. 设置 "API 搜索参数名" = "q"
5. API 请求应使用 `?q=...` 而不是 `?search=...`

#### 4. 国际化测试
1. 点击右上角语言切换器
2. 切换到 "🇺🇸 English"
3. 搜索框占位符应变为 "Search..."
4. 结果计数应显示 "X results"

#### 5. 性能测试
1. 在搜索框快速输入 "abcdefg"
2. 打开 Network 标签
3. 应该只看到**一次** API 请求（防抖生效）
4. 而不是7次请求（每个字符一次）

#### 6. 分页集成测试
1. 确保数据源有多页数据
2. 导航到第2页
3. 输入搜索词
4. 分页应自动重置到第1页
5. 总页数应反映过滤后的结果

## API 契约

### GET 请求示例
```
GET /api/data?page=1&pageSize=10&search=keyword
```

### POST 请求示例
```
POST /api/data
Content-Type: application/json

{
  "page": 1,
  "pageSize": 10,
  "search": "keyword"
}
```

### 预期响应格式
```json
{
  "data": [...],
  "total": 100
}
```
或
```json
[...]  // 直接返回数组
```

## 边界情况处理

| 场景 | 处理方式 |
|------|---------|
| 空列配置 | 默认搜索所有列 |
| null/undefined 单元格值 | 安全转换为字符串 |
| 无效 searchableColumns | 过滤空值，仅保留有效列 |
| 搜索期间加载 | 输入框保持响应，使用防抖值 |
| 特殊字符 | 无需转义，子串匹配安全 |
| API 错误 | 现有 try-catch 处理 |
| 禁用分页的搜索 | 仍正常工作，显示所有过滤结果 |

## 性能考量

- **防抖**: 300ms 防止过度 API 调用
- **客户端过滤**: O(n×m) 复杂度，n=行数，m=可搜索列数
  - 适用于 <1000 行的数据集
  - 更大数据集推荐使用 API 过滤
- **重渲染**: 最小化，仅在 searchTerm 或 debouncedSearchTerm 变化时
- **内存**: 两个字符串状态变量，开销可忽略

## 未来增强（Phase 2）

- [ ] 每列独立过滤器下拉框
- [ ] 高级操作符（等于、开始于、结束于、正则表达式、数值范围）
- [ ] 日期范围选择器（用于日期列）
- [ ] 多列搜索 AND/OR 逻辑
- [ ] 保存过滤器预设（localStorage）
- [ ] 搜索高亮（匹配文本加粗）
- [ ] 导出过滤数据（CSV 下载）
- [ ] 搜索历史记录下拉

## 文件清单

| 文件 | 变更 |
|------|------|
| `src/components/DataTable.tsx` | 主要实现：hook、状态、搜索逻辑、UI |
| `src/i18n/index.ts` | 新增 `search` 命名空间（5个键） |
| `src/puck-config/index.tsx` | 已导入 DataTableConfig（无需修改） |

## 技术栈

- React 18.3.1
- TypeScript
- Tailwind CSS 3.4.17
- Puck.js (低代码编辑器)
- 自定义 debounce hook（无外部依赖）

## 提交信息建议

```
feat(editor): add search functionality to DataTable component

- Add useDebounce custom hook for search input optimization
- Support all data sources: static (client-side), API (server-side), context
- Configurable search columns, param name, and debounce delay
- Add search UI with icon, clear button, and result count
- Full i18n support (zh-CN/en-US)
- Auto-reset pagination on search
- Default 300ms debounce to prevent excessive API calls

Test: http://localhost:5175/editor?id=1
```

## 相关文档

- 实现计划：`/Users/frank/.claude/plans/tidy-singing-reef.md`
- 项目说明：`/CLAUDE.md`
- 组件库：`src/puck-config/index.tsx`

---

**实现完成时间**: 2026-06-26  
**开发服务器**: http://localhost:5175/  
**状态**: ✅ 开发完成，等待测试验收
