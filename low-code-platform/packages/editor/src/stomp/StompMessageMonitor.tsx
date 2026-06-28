/**
 * STOMP 消息监听器组件
 */

import React, { useState } from 'react';
import { useStompNotifications } from './useSTOMP';
import './StompMessageMonitor.css';

interface StompMessageMonitorProps {
  destinations: string[];
  maxMessages?: number;
  autoRemove?: boolean;
}

export const StompMessageMonitor: React.FC<StompMessageMonitorProps> = ({
  destinations,
  maxMessages = 20,
  autoRemove = true,
}) => {
  const [selectedDestination, setSelectedDestination] = useState<string | null>(
    destinations[0] || null
  );

  const { notifications, removeNotification, clearNotifications } = useStompNotifications(
    selectedDestination || '',
    {
      maxNotifications: maxMessages,
      autoRemove,
      autoRemoveDelay: 10000,
    }
  );

  return (
    <div className="stomp-message-monitor">
      <div className="monitor-header">
        <h3>实时消息监听</h3>
        <div className="monitor-controls">
          <select
            value={selectedDestination || ''}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="destination-select"
          >
            {destinations.map((dest) => (
              <option key={dest} value={dest}>
                {dest}
              </option>
            ))}
          </select>
          <button onClick={clearNotifications} className="btn-clear">
            清空
          </button>
        </div>
      </div>

      <div className="monitor-body">
        {notifications.length === 0 ? (
          <div className="empty-state">
            <p>等待消息...</p>
            <small>订阅: {selectedDestination}</small>
          </div>
        ) : (
          <div className="message-list">
            {notifications.map((notification) => (
              <div key={notification.id} className="message-item">
                <div className="message-header">
                  <span className="message-time">
                    {new Date(notification.timestamp).toLocaleTimeString('zh-CN')}
                  </span>
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="btn-remove"
                  >
                    ✕
                  </button>
                </div>
                <div className="message-body">
                  <pre>{JSON.stringify(notification.data, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="monitor-footer">
        <span className="message-count">{notifications.length} 条消息</span>
        {autoRemove && <span className="auto-remove-hint">消息将在 10 秒后自动移除</span>}
      </div>
    </div>
  );
};
