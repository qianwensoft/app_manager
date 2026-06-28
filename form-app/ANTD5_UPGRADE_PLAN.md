# Ant Design 4 升级到 5 方案

## 当前状态

项目使用 Ant Design 4.22.8，存在以下依赖关系：

```json
{
  "antd": "4.22.8",
  "@formily/antd": "^2.3.7",           // 依赖 antd 4.x
  "@designable/formily-antd": "^1.0.0-beta.45"  // 依赖 antd 4.x
}
```

## 问题分析

1. **@formily/antd**: 官方提供 `@formily/antd-v5` 包支持 antd 5
2. **@designable/formily-antd**: 只支持 antd 4.x，没有 v5 版本

## 升级方案

### 方案 1：保持 Ant Design 4.x（推荐）

**原因**：
- ✅ `@designable/formily-antd` 是页面设计器的核心依赖，无 v5 版本
- ✅ 当前功能稳定，defaultProps 警告已通过过滤解决
- ✅ 不影响运行时功能和 Android 9 兼容性
- ✅ 警告仅在开发环境出现，生产环境不受影响

**已实施的优化**：
```typescript
// src/main.tsx
// 开发环境过滤 defaultProps 警告
if (import.meta.env.DEV) {
  const originalError = console.error
  console.error = (...args: any[]) => {
    if (args[0]?.includes('Support for defaultProps will be removed')) {
      return
    }
    originalError.call(console, ...args)
  }
}
```

### 方案 2：部分升级到 Ant Design 5（复杂）

如果确实需要 antd 5 的新特性，可以考虑混合方案：

#### 2.1 安装依赖

```bash
npm install --save --legacy-peer-deps antd@^5.0.0 @formily/antd-v5@latest
```

#### 2.2 保留 antd 4.x 用于设计器

```typescript
// 为设计器保留 antd 4.x 别名
import * as Antd4 from 'antd-v4'  // 需要配置别名
```

#### 2.3 修改导入

```typescript
// 运行时使用 antd 5
import { Button, Modal } from 'antd'  // v5
import { FormItem, Input } from '@formily/antd-v5'

// 设计器使用 antd 4
import { Drawer, Tabs } from 'antd-v4'
import '@designable/formily-antd'  // 继续使用 v4
```

**问题**：
- ⚠️ 需要维护两套 antd 版本
- ⚠️ 样式可能冲突
- ⚠️ 打包体积大幅增加（+500KB）
- ⚠️ 开发体验差，容易混淆

### 方案 3：完全升级到 Ant Design 5（不推荐）

放弃 `@designable/formily-antd` 设计器，重新实现或寻找替代方案。

**成本**：
- ❌ 需要重写页面设计器（工作量巨大）
- ❌ 失去可视化布局能力
- ❌ 需要大量测试和迁移

## 推荐行动

### ✅ 当前最佳方案：保持 Ant Design 4.x

**理由**：
1. defaultProps 警告不影响功能
2. 已通过控制台过滤解决开发体验问题
3. Ant Design 5 的主要改进（CSS-in-JS、新组件）对本项目价值有限
4. 避免破坏性变更和大量测试工作

**后续考虑**：
- 关注 `@designable/formily-antd` 是否发布 v5 版本
- 考虑在新项目中使用 antd 5
- 当前项目保持稳定优先

## Ant Design 5 主要变化

如果未来升级，需要注意：

### 1. 破坏性变更

- **移除 less**：改用 CSS-in-JS
- **移除 defaultProps**：使用 ES6 默认参数
- **移除 moment**：改用 dayjs
- **移除 IE 支持**：不再兼容 IE11

### 2. 样式变化

```typescript
// v4
import 'antd/dist/antd.css'

// v5 不需要手动导入 CSS
// 组件自动注入样式
```

### 3. 组件 API 变化

```typescript
// v4
<Button type="ghost">按钮</Button>

// v5
<Button variant="outlined">按钮</Button>
```

### 4. Form 组件变化

```typescript
// v4
<Form.Item name="username" rules={[{ required: true }]}>
  <Input />
</Form.Item>

// v5 基本兼容，但内部实现不同
```

## 迁移成本估算

| 任务 | 工作量 | 风险 |
|------|--------|------|
| 升级依赖 | 1小时 | 低 |
| 修复设计器兼容性 | **无法实现** | 高 |
| 修改样式导入 | 2小时 | 低 |
| 修复 API 变化 | 4小时 | 中 |
| 完整测试 | 8小时 | 高 |
| **总计** | **15小时+** | **高** |

**结论**：由于设计器依赖无法升级，完全迁移到 antd 5 **不可行**。

## 替代方案：消除警告的其他方法

### 方法 1：已实施 - 控制台过滤

✅ 当前方案，开发体验良好

### 方法 2：禁用 React.StrictMode（不推荐）

```typescript
// 不推荐：会隐藏其他有用的警告
ReactDOM.render(<App />, document.getElementById('root'))
```

### 方法 3：使用 React 17（不推荐）

降级到 React 17 没有这些警告，但失去 React 18 的新特性。

## 总结

✅ **保持 Ant Design 4.x** 是当前最佳选择

- 功能稳定，Android 9 兼容性已解决
- defaultProps 警告已过滤，不影响开发
- 避免大量重构和测试工作
- 等待 `@designable/formily-antd` 发布 v5 版本后再考虑升级

🔄 **未来升级路径**

1. 关注 `@designable/formily-antd` 更新
2. 当 v5 版本可用时，参考官方迁移指南
3. 在测试环境充分验证后再升级生产环境

## 相关资源

- [Ant Design 5.x 迁移指南](https://ant.design/docs/react/migration-v5)
- [Formily Antd V5](https://github.com/alibaba/formily/tree/formily_next/packages/antd-v5)
- [@designable/formily-antd GitHub](https://github.com/alibaba/designable)
