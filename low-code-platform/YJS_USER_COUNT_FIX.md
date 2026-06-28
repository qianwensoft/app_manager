# 在线人数显示问题修复

**问题：** 只有一个用户时，在线人数在 0-1 之间不实时显示  
**修复时间：** 2026-06-27 05:56  
**状态：** ✅ 已修复

---

## 🔴 问题分析

### 根本原因
1. **初始值问题**：`userCount` 初始化为 1，而不是根据实际 awareness 状态
2. **Awareness 未主动设置**：客户端连接后没有主动设置自己的 awareness 状态
3. **显示逻辑问题**：当 `userCount = 0` 时显示 "0 人在线" 不友好

### 问题表现
- 单用户时：显示 "0 人在线" 或不显示
- 多用户时：人数可能不准确
- awareness 状态没有被正确广播

---

## 🛠️ 修复方案

### 1. 修改初始值
```typescript
// 修复前
const [userCount, setUserCount] = useState(1);

// 修复后
const [userCount, setUserCount] = useState(0); // 初始值为 0，等待 awareness 更新
```

### 2. 主动设置 Awareness 状态
```typescript
// 连接成功后设置本地 awareness 状态
if (status === 'connected') {
  provider.awareness.setLocalState({
    user: {
      name: 'User',
      color: '#' + Math.floor(Math.random()*16777215).toString(16),
    },
  });

  const count = provider.awareness.getStates().size;
  console.log('[Yjs] Connected, current user count:', count);
  setUserCount(count);
}
```

**关键点：**
- `setLocalState` 会触发 awareness 的 change 事件
- 这会通知后端和其他客户端有新用户加入
- 后端会保存并广播这个 awareness 状态

### 3. 添加详细日志
```typescript
provider.awareness.on('change', () => {
  const count = provider.awareness.getStates().size;
  console.log('[Yjs] Awareness changed, user count:', count);
  setUserCount(count);
});

// 立即获取初始在线人数
const initialCount = provider.awareness.getStates().size;
console.log('[Yjs] Initial user count:', initialCount);
setUserCount(initialCount);
```

### 4. 清理 Awareness 状态
```typescript
return () => {
  console.log('[Yjs] Cleaning up - removing awareness state');
  // 清除本地 awareness 状态（通知其他用户我离开了）
  provider.awareness.setLocalState(null);

  yData.unobserve(observer);
  provider.destroy();
  ydoc.destroy();
};
```

### 5. 优化显示逻辑
```typescript
// EditorPage.tsx
<span>
  {collab.connectionStatus === 'connected' && collab.userCount > 0 && `${collab.userCount} 人在线`}
  {collab.connectionStatus === 'connected' && collab.userCount === 0 && '已连接'}
  {collab.connectionStatus === 'connecting' && '连接中...'}
  {collab.connectionStatus === 'disconnected' && '连接断开'}
</span>
```

**改进：**
- `userCount > 0`：显示实际人数
- `userCount === 0`：显示"已连接"（连接建立但 awareness 尚未同步）

---

## 🔄 工作流程

### 单用户场景
1. 用户打开页面
2. WebSocket 连接建立 → 显示 "连接中..."
3. 连接成功 → `status = 'connected'`
4. 设置本地 awareness 状态 → `setLocalState({...})`
5. 触发 awareness change 事件 → `userCount = 1`
6. 显示 "1 人在线"

### 第二个用户加入
1. 用户 B 连接成功
2. 用户 B 设置 awareness 状态
3. 后端收到用户 B 的 awareness 消息
4. 后端广播给用户 A
5. 用户 A 收到 awareness 变更 → `userCount = 2`
6. 两个用户都显示 "2 人在线"

### 用户离开
1. 用户 B 关闭页面
2. cleanup 函数调用 `setLocalState(null)`
3. 后端收到 awareness 更新
4. 后端广播给用户 A
5. 用户 A 的 awareness change 触发 → `userCount = 1`
6. 用户 A 显示 "1 人在线"

---

## 🧪 测试步骤

### 1. 单用户测试
- [ ] 打开 `http://localhost:5174/editor?id=1`
- [ ] 观察连接状态变化：连接中 → 已连接/1人在线
- [ ] 打开浏览器控制台，查看日志：
  ```
  [Yjs] Connection status changed: connected
  [Yjs] Connected, current user count: 1
  [Yjs] Awareness changed, user count: 1
  ```

### 2. 多用户测试
- [ ] 窗口 A：打开编辑器，确认显示 "1 人在线"
- [ ] 窗口 B：打开同一页面（隐身模式或不同浏览器）
- [ ] 窗口 A：应立即显示 "2 人在线"
- [ ] 窗口 B：应显示 "2 人在线"

### 3. 离开测试
- [ ] 关闭窗口 B
- [ ] 窗口 A：应在 1-2 秒内更新为 "1 人在线"
- [ ] 查看后端日志：
  ```
  YjsHub: unregistered client user_id=X from room=lowcode-page-1, remaining=1
  ```

### 4. 快速连接/断开
- [ ] 快速打开/关闭多个窗口
- [ ] 验证在线人数准确无误
- [ ] 无卡顿或显示错误

---

## 📊 预期效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 单用户连接 | 0 人在线 或 不显示 | 1 人在线 |
| 第二用户加入 | 可能不更新 | 立即显示 2 人在线 |
| 用户离开 | 延迟或不更新 | 1-2s 内更新 |
| 连接中 | 显示错误人数 | 显示"连接中..." |
| 初始加载 | 显示 1 人在线（错误）| 显示"已连接"或实际人数 |

---

## 🔍 调试命令

### 前端控制台
```javascript
// 查看当前 awareness 状态
console.log(provider.awareness.getStates())

// 查看在线用户数
console.log(provider.awareness.getStates().size)
```

### 后端日志
```bash
tail -f /tmp/app-manager.log | grep -E "YjsHub|awareness"
```

---

## 📝 相关文件

### 修改的文件
1. `low-code-platform/packages/editor/src/collab/useYjsCollab.ts`
   - 修改 userCount 初始值
   - 添加 setLocalState 调用
   - 添加详细日志
   - 清理时移除 awareness 状态

2. `low-code-platform/packages/editor/src/pages/EditorPage.tsx`
   - 优化在线人数显示逻辑

---

## ✅ 验证清单

- [ ] 刷新浏览器，前端代码已更新
- [ ] 单用户显示 "1 人在线"
- [ ] 多用户显示正确人数
- [ ] 用户离开后实时更新
- [ ] 控制台日志清晰
- [ ] 无报错或警告

---

## 🎯 下一步

请在浏览器中测试：
1. 刷新 `http://localhost:5174/editor?id=1`
2. 观察右上角在线人数显示
3. 打开第二个窗口验证多用户
4. 查看控制台日志确认 awareness 工作正常

---

**修复工程师：** Claude (Kiro AI)  
**修复日期：** 2026-06-27
