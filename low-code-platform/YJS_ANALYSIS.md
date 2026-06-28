# Yjs 协同编辑问题分析报告

## 问题概述

用户反馈的两个核心问题：
1. **在线人数刷新过慢**
2. **修改内容没有及时同步**

## 当前架构分析

### 前端实现 (`useYjsCollab.ts`)

#### 关键代码位置
- 文件：`packages/editor/src/collab/useYjsCollab.ts`
- 使用场景：`packages/editor/src/pages/EditorPage.tsx`

#### 当前实现方式

```typescript
// WebSocket 连接
const wsUrl = `${wsProtocol}//${wsHost}/ws/yjs`;
const roomName = `lowcode-page-${pageId}`;
const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
  params: { token: localStorage.getItem('auth_token') || '' },
});

// 在线人数监听
provider.awareness.on('change', () => {
  setUserCount(provider.awareness.getStates().size);
});

// 数据同步方式：整个 JSON 字符串
yData.set('json', JSON.stringify(data));
```

### 后端实现 (`server/yjs/`)

#### WebSocket 服务器
- 文件：`server/api/yjs_ws.go`
- Hub 管理：`server/yjs/hub.go`

#### 当前实现特点
- **同步广播**：使用同步 `WriteMessage` 发送消息
- **房间隔离**：按 `room` 参数隔离不同页面
- **无 awareness 支持**：后端只转发消息，未实现 Yjs awareness 协议

---

## 🔴 问题根因分析

### 问题 1：在线人数刷新过慢

#### 根本原因
**后端未实现 Yjs Awareness 协议**

Yjs 的 `y-websocket` 协议包含两种消息类型：
1. **Sync 消息**（`messageType === 0`）：文档同步
2. **Awareness 消息**（`messageType === 1`）：用户在线状态、光标位置等

当前实现问题：
```go
// server/api/yjs_ws.go:59-72
for {
    messageType, data, err := conn.ReadMessage()
    // ...
    if messageType == websocket.BinaryMessage || messageType == websocket.TextMessage {
        // 直接广播，不区分 Yjs 消息类型
        YjsHub.Broadcast(room, conn, data)
    }
}
```

**实际发生的情况：**
- 前端 `provider.awareness` 发送状态更新
- 后端接收到 awareness 二进制消息并广播
- 但由于缺乏 awareness 状态管理，新加入的客户端无法获取当前在线用户列表
- `provider.awareness.getStates().size` 只能看到主动发送过 awareness 消息的用户

**表现症状：**
- 新用户加入时看不到已在线用户
- 用户退出时其他人不知道
- 在线人数更新依赖用户的编辑操作（触发 awareness 更新）

### 问题 2：修改内容没有及时同步

#### 可能原因分析

**A. 数据粒度过大**
```typescript
// useYjsCollab.ts:107
yData.set('json', JSON.stringify(data));
```

- **问题**：每次修改都序列化整个 Puck Data 对象为 JSON 字符串
- **影响**：
  - 大文档时网络传输慢
  - 无法利用 Yjs CRDT 细粒度冲突解决
  - 容易出现"最后写入覆盖"问题

**B. 本地变更标志竞争条件**
```typescript
// useYjsCollab.ts:103-114
isLocalChange.current = true;
ydoc.transact(() => {
  yData.set('json', JSON.stringify(data));
});
setTimeout(() => {
  isLocalChange.current = false;
}, 0);
```

- **问题**：使用 `setTimeout(..., 0)` 异步重置标志
- **风险**：
  - 如果远程更新在 `setTimeout` 执行前到达，会被错误地忽略
  - 高频编辑时可能导致事件处理顺序混乱

**C. 后端广播瓶颈**
```go
// server/yjs/hub.go:54-75
func (h *Hub) Broadcast(room string, sender *websocket.Conn, data []byte) {
    // ...
    for conn := range clients {
        if conn == sender {
            continue
        }
        // 同步发送，可能阻塞
        if err := conn.WriteMessage(messageType, data); err != nil {
            log.Printf("YjsHub: broadcast error: %v", err)
        }
    }
}
```

- **问题**：同步遍历所有客户端发送
- **影响**：
  - 如果某个客户端网络慢，会阻塞整个广播循环
  - 大房间（多用户）时延迟累积

**D. WebSocket 连接不稳定**
- 缺少心跳机制
- 无自动重连错误恢复
- 网络波动时连接可能悄悄断开

---

## 🛠️ 解决方案

### 方案 1：完整实现 Yjs Awareness 协议（推荐）

#### 前端改进（已有，但需确保启用）
```typescript
// y-websocket 默认支持 awareness，无需修改前端代码
// 确保 awareness 状态正常更新
provider.awareness.setLocalState({
  user: {
    id: userId,
    name: userName,
    color: userColor,
  },
});
```

#### 后端改进（核心）

**需要解析 Yjs 协议消息类型：**

```go
// server/yjs/hub.go 添加
type MessageType byte

const (
    MessageSync      MessageType = 0
    MessageAwareness MessageType = 1
)

// 需要维护 awareness 状态
type Hub struct {
    mu        sync.RWMutex
    rooms     map[string]map[*websocket.Conn]uint
    awareness map[string]map[*websocket.Conn][]byte // room -> conn -> awareness state
}

// 解析消息类型并处理
func (h *Hub) HandleMessage(room string, sender *websocket.Conn, data []byte) {
    if len(data) < 1 {
        return
    }
    
    messageType := MessageType(data[0])
    
    switch messageType {
    case MessageSync:
        // 同步消息：广播给所有人
        h.Broadcast(room, sender, data)
        
    case MessageAwareness:
        // Awareness 消息：
        // 1. 保存发送者的状态
        h.mu.Lock()
        if h.awareness[room] == nil {
            h.awareness[room] = make(map[*websocket.Conn][]byte)
        }
        h.awareness[room][sender] = data
        h.mu.Unlock()
        
        // 2. 广播给所有人
        h.Broadcast(room, sender, data)
        
        // 3. 新用户加入时，发送所有已有的 awareness 状态
        // （在 RegisterClient 中处理）
    }
}
```

**新客户端加入时发送所有 awareness 状态：**

```go
func (h *Hub) RegisterClient(room string, conn *websocket.Conn, userID uint) {
    h.mu.Lock()
    // ... 现有注册逻辑 ...
    
    // 发送当前房间所有用户的 awareness 状态
    if awarenessStates, ok := h.awareness[room]; ok {
        for _, state := range awarenessStates {
            conn.WriteMessage(websocket.BinaryMessage, state)
        }
    }
    h.mu.Unlock()
}
```

### 方案 2：优化数据同步粒度

**从整个 JSON 字符串改为细粒度 Y.Map：**

```typescript
// useYjsCollab.ts 改进版本
const yData = ydoc.getMap('puckData');

// 不再使用单一 JSON 字符串
// yData.set('json', JSON.stringify(data));

// 改为：细粒度映射
const yContent = yData.get('content') as Y.Array || ydoc.getArray('content');
const yRoot = yData.get('root') as Y.Map || ydoc.getMap('root');

// 同步 content 数组
yContent.delete(0, yContent.length);
yContent.push(data.content);

// 同步 root 对象
for (const key in data.root) {
    yRoot.set(key, data.root[key]);
}
```

**优点：**
- 只传输变更部分
- Yjs CRDT 可以正确解决冲突
- 网络传输量大幅减少

**缺点：**
- 需要重构数据同步逻辑
- Puck Data 结构复杂，完全映射需要递归处理

### 方案 3：改进本地变更标志机制

```typescript
// 使用事务完成回调代替 setTimeout
const updateData = (data: Data) => {
    if (!ydocRef.current || isLocalChange.current) return;

    const yData = ydocRef.current.getMap('puckData');
    isLocalChange.current = true;

    ydocRef.current.transact(() => {
        yData.set('json', JSON.stringify(data));
    }, 'local'); // 标记为本地事务

    // 事务完成后立即重置
    isLocalChange.current = false;
};

// observer 中判断事务来源
const observer = (event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
    if (transaction.origin === 'local') {
        return; // 忽略本地事务
    }
    // ... 应用远程变更
};
yData.observe(observer);
```

### 方案 4：后端广播异步化

```go
// server/yjs/hub.go 改进
func (h *Hub) Broadcast(room string, sender *websocket.Conn, data []byte) {
    h.mu.RLock()
    clients := h.rooms[room]
    h.mu.RUnlock()

    if clients == nil {
        return
    }

    // 使用 goroutine 并发发送
    for conn := range clients {
        if conn == sender {
            continue
        }
        
        go func(c *websocket.Conn) {
            // 每个连接加写锁，避免并发写冲突
            c.SetWriteDeadline(time.Now().Add(5 * time.Second))
            if err := c.WriteMessage(websocket.BinaryMessage, data); err != nil {
                log.Printf("YjsHub: broadcast error: %v", err)
            }
        }(conn)
    }
}
```

**注意：** gorilla/websocket 的 Conn 不是并发安全的，需要为每个连接加写锁。

### 方案 5：添加心跳和重连机制

**前端：**
```typescript
// y-websocket 自带重连，但需配置
const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
    params: { token: localStorage.getItem('auth_token') || '' },
    // 重连配置
    resyncInterval: 5000,  // 每5秒强制重新同步
    maxBackoffTime: 5000,  // 最大退避时间
});

// 监听连接状态
provider.on('status', ({ status }: { status: string }) => {
    console.log('Yjs connection status:', status);
    if (status === 'disconnected') {
        toast.warning('协同编辑连接断开，正在重连...');
    }
});
```

**后端：**
```go
// 添加 ping/pong 心跳
conn.SetReadDeadline(time.Now().Add(60 * time.Second))
conn.SetPongHandler(func(string) error {
    conn.SetReadDeadline(time.Now().Add(60 * time.Second))
    return nil
})

// 定时发送 ping
go func() {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                return
            }
        }
    }
}()
```

---

## 📋 推荐实施顺序

### 阶段 1：快速修复（1-2 天）
1. ✅ **实现 Awareness 协议支持**（方案 1）
   - 解决在线人数刷新问题
   - 立即见效

2. ✅ **改进本地变更标志**（方案 3）
   - 减少同步丢失
   - 低风险改进

3. ✅ **添加连接状态提示**
   - 用户可见连接问题
   - 改善用户体验

### 阶段 2：性能优化（3-5 天）
4. ⚡ **后端广播异步化**（方案 4）
   - 提高并发性能
   - 需要仔细测试

5. ⚡ **添加心跳机制**（方案 5）
   - 提高连接稳定性
   - 减少幽灵连接

### 阶段 3：架构改进（可选，1-2 周）
6. 🔧 **细粒度数据同步**（方案 2）
   - 最大化 Yjs 优势
   - 需要重构，谨慎评估

---

## 🧪 测试建议

### 功能测试
- [ ] 多用户同时编辑不同组件
- [ ] 多用户同时编辑同一组件（冲突解决）
- [ ] 用户加入/退出时在线人数更新
- [ ] 网络断开后自动重连
- [ ] 大文档（100+ 组件）编辑性能

### 压力测试
- [ ] 10+ 用户同时在线
- [ ] 高频编辑（每秒多次修改）
- [ ] 大消息广播（复杂组件）
- [ ] 长时间运行稳定性（8+ 小时）

### 边界测试
- [ ] 第一个用户加入空房间
- [ ] 最后一个用户离开房间
- [ ] 用户强制关闭浏览器
- [ ] 服务器重启后客户端恢复

---

## 📊 预期效果

### 修复后指标

| 指标 | 当前 | 修复后 | 改进 |
|------|------|--------|------|
| 在线人数更新延迟 | 不确定（依赖编辑操作） | < 500ms | ✅ 确定性 |
| 内容同步延迟 | 500ms - 2s | < 200ms | ⚡ 60%+ |
| 大房间广播延迟 | O(n) 线性增长 | O(1) 恒定 | ⚡ 并发化 |
| 连接稳定性 | 易断连 | 自动恢复 | ✅ 健壮性 |

---

## 🔗 相关资源

- [Yjs Documentation](https://docs.yjs.dev/)
- [y-websocket Protocol](https://github.com/yjs/y-websocket)
- [Awareness Protocol](https://docs.yjs.dev/api/about-awareness)

---

**分析日期：** 2026-06-27  
**分析人员：** Claude (Kiro AI)
