# 工单分享页面 - 添加当前用户显示

## 问题描述
工单报告分享页面（`WorkOrderReportShare.vue`）右上角缺少当前登录用户信息显示。

## 解决方案

### 修改文件
- `web/src/views/WorkOrderReportShare.vue`

### 实现细节

#### 1. 导入必要的依赖
```javascript
import { User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
```

#### 2. 获取当前用户信息
```javascript
const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)
```

#### 3. 添加角色标签辅助函数
```javascript
const roleLabel = (role) => {
  const labels = { admin: '管理员', operator: '操作员', viewer: '查看者' }
  return labels[role] || role
}
```

#### 4. 更新页面头部布局
在卡片头部添加用户信息显示区域：
```html
<div class="card-header-actions">
  <div v-if="currentUser" class="current-user">
    <el-icon><User /></el-icon>
    <span>{{ currentUser.username }}</span>
    <el-tag v-if="currentUser.role" size="small" type="info">{{ roleLabel(currentUser.role) }}</el-tag>
  </div>
  <el-radio-group v-model="viewMode" size="default" class="view-mode-group">
    <el-radio-button value="statistics">统计</el-radio-button>
    <el-radio-button value="list">列表</el-radio-button>
    <el-radio-button value="board">看板</el-radio-button>
  </el-radio-group>
</div>
```

#### 5. 添加样式
```css
.card-header-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.current-user {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #606266;
  padding: 6px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px solid #e4e7ed;
}

.current-user .el-icon {
  font-size: 16px;
  color: #909399;
}

.current-user span {
  font-weight: 500;
}
```

#### 6. 移动端适配
```css
@media (max-width: 767px) {
  .card-header-actions {
    align-items: stretch;
  }

  .current-user {
    justify-content: center;
  }
}
```

## 功能说明

### 显示内容
- 用户图标（User Icon）
- 用户名（username）
- 角色标签（admin/operator/viewer）

### 显示逻辑
- 仅在用户已登录时显示（`v-if="currentUser"`）
- 角色标签显示中文：管理员/操作员/查看者
- 采用浅灰背景的卡片样式，与页面风格一致

### 响应式设计
- 桌面端：右上角显示，垂直排列用户信息和视图切换按钮
- 移动端：用户信息居中对齐，保持良好的视觉效果

## 测试建议

### 测试场景
1. **已登录用户访问分享链接**
   - 验证右上角显示当前用户名和角色
   - 验证不同角色（admin/operator/viewer）的标签显示

2. **未登录用户访问公开分享链接**
   - 验证用户信息区域不显示（v-if 条件）

3. **移动端访问**
   - 验证用户信息在小屏幕上的显示效果
   - 验证布局适配是否正常

4. **不同权限场景**
   - 验证有编辑权限的用户看到的界面
   - 验证只读权限用户看到的界面

## 相关文件
- `web/src/stores/auth.js` - 用户认证状态管理
- `web/src/views/WorkOrderReportShare.vue` - 工单报告分享页面

## 构建验证
✅ Web 项目构建成功，无语法错误
