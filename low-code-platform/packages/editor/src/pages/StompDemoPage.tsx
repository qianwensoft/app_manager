/**
 * STOMP 实时数据演示页面
 */

import React, { useState, useEffect } from 'react';
import {
  useStompConnection,
  useStompSubscription,
  useStompSend,
  StompStatusIndicator,
  StompMessageMonitor,
} from '../stomp';
import './StompDemoPage.css';

export const StompDemoPage: React.FC = () => {
  const [stompUrl, setStompUrl] = useState('http://localhost:8080/ws');
  const [manualConnect, setManualConnect] = useState(false);

  // STOMP 连接
  const { status, error, isConnected, connect, disconnect } = useStompConnection(stompUrl, {
    autoConnect: !manualConnect,
    reconnectDelay: 5000,
    debug: true,
  });

  // 发送消息
  const { send, sending } = useStompSend();

  // 示例订阅
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>([
    '/topic/notifications',
    '/topic/data-updates',
  ]);

  const [customTopic, setCustomTopic] = useState('');
  const [messageCount, setMessageCount] = useState(0);

  useStompSubscription('/topic/notifications', (message) => {
    console.log('[Demo] Notification received:', message);
    setMessageCount((prev) => prev + 1);
  });

  const handleAddTopic = () => {
    if (customTopic && !subscribedTopics.includes(customTopic)) {
      setSubscribedTopics([...subscribedTopics, customTopic]);
      setCustomTopic('');
    }
  };

  const handleRemoveTopic = (topic: string) => {
    setSubscribedTopics(subscribedTopics.filter((t) => t !== topic));
  };

  const handleSendTestMessage = async () => {
    try {
      await send('/app/test', {
        type: 'test',
        message: 'Hello from client',
        timestamp: Date.now(),
      });
      alert('消息已发送');
    } catch (error) {
      alert('发送失败: ' + error);
    }
  };

  return (
    <div className="stomp-demo-page">
      <div className="page-header">
        <h1>STOMP 实时数据演示</h1>
        <StompStatusIndicator />
      </div>

      {/* 连接配置 */}
      <div className="demo-section">
        <h2>📡 连接配置</h2>

        <div className="connection-config">
          <div className="form-group">
            <label>STOMP 服务器地址</label>
            <input
              type="text"
              value={stompUrl}
              onChange={(e) => setStompUrl(e.target.value)}
              placeholder="http://localhost:8080/ws"
              disabled={isConnected}
            />
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={manualConnect}
                onChange={(e) => setManualConnect(e.target.checked)}
              />
              &nbsp;手动连接（禁用自动连接）
            </label>
          </div>

          <div className="connection-actions">
            {!isConnected ? (
              <button onClick={connect} disabled={status === 'connecting'} className="btn-primary">
                {status === 'connecting' ? '连接中...' : '连接'}
              </button>
            ) : (
              <button onClick={disconnect} className="btn-secondary">
                断开连接
              </button>
            )}
          </div>

          {error && (
            <div className="error-message">
              <strong>错误:</strong> {error.message}
            </div>
          )}

          <div className="connection-info">
            <div className="info-item">
              <span className="label">状态:</span>
              <span className={`value status-${status}`}>{status}</span>
            </div>
            <div className="info-item">
              <span className="label">已接收消息:</span>
              <span className="value">{messageCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 订阅管理 */}
      <div className="demo-section">
        <h2>📬 订阅管理</h2>

        <div className="subscription-manager">
          <div className="add-subscription">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="/topic/your-topic"
              onKeyPress={(e) => e.key === 'Enter' && handleAddTopic()}
            />
            <button onClick={handleAddTopic} disabled={!isConnected} className="btn-primary">
              添加订阅
            </button>
          </div>

          <div className="subscription-list">
            {subscribedTopics.map((topic) => (
              <div key={topic} className="subscription-item">
                <span className="topic-name">{topic}</span>
                <button onClick={() => handleRemoveTopic(topic)} className="btn-remove">
                  ✕
                </button>
              </div>
            ))}
          </div>

          {!isConnected && (
            <p className="warning-message">请先连接到 STOMP 服务器才能订阅主题</p>
          )}
        </div>
      </div>

      {/* 消息监听 */}
      <div className="demo-section full-width">
        <h2>📨 实时消息监听</h2>

        {isConnected ? (
          <StompMessageMonitor destinations={subscribedTopics} maxMessages={20} autoRemove={false} />
        ) : (
          <div className="placeholder">
            <p>请先连接到 STOMP 服务器</p>
          </div>
        )}
      </div>

      {/* 发送消息 */}
      <div className="demo-section">
        <h2>📤 发送消息</h2>

        <div className="send-message">
          <button
            onClick={handleSendTestMessage}
            disabled={!isConnected || sending}
            className="btn-primary"
          >
            {sending ? '发送中...' : '发送测试消息'}
          </button>

          <p className="info-text">
            将发送测试消息到 <code>/app/test</code> 端点
          </p>
        </div>
      </div>

      {/* 使用说明 */}
      <div className="demo-section full-width">
        <h2>📚 使用说明</h2>

        <div className="usage-guide">
          <div className="guide-section">
            <h3>1. 连接到 STOMP 服务器</h3>
            <pre>{`import { useStompConnection } from './stomp';

const { isConnected, connect, disconnect } = useStompConnection(
  'http://localhost:8080/ws',
  { autoConnect: true, reconnectDelay: 5000 }
);`}</pre>
          </div>

          <div className="guide-section">
            <h3>2. 订阅主题</h3>
            <pre>{`import { useStompSubscription } from './stomp';

useStompSubscription('/topic/notifications', (message) => {
  console.log('Received:', message);
});`}</pre>
          </div>

          <div className="guide-section">
            <h3>3. 发送消息</h3>
            <pre>{`import { useStompSend } from './stomp';

const { send } = useStompSend();

await send('/app/message', { content: 'Hello' });`}</pre>
          </div>

          <div className="guide-section">
            <h3>4. 显示连接状态</h3>
            <pre>{`import { StompStatusIndicator } from './stomp';

<StompStatusIndicator />`}</pre>
          </div>
        </div>
      </div>

      {/* 特性列表 */}
      <div className="feature-list">
        <h2>✨ 核心特性</h2>
        <ul>
          <li>✅ 基于 SockJS + STOMP.js 的 WebSocket 连接</li>
          <li>✅ 自动重连机制</li>
          <li>✅ 多主题订阅管理</li>
          <li>✅ 实时消息监听和展示</li>
          <li>✅ 连接状态指示器</li>
          <li>✅ React Hooks API</li>
          <li>✅ 消息发送功能</li>
          <li>✅ 通知系统（自动移除）</li>
          <li>✅ 调试模式</li>
          <li>✅ 全局单例管理</li>
        </ul>
      </div>
    </div>
  );
};
