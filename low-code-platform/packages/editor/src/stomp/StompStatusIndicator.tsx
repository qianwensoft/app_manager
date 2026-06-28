/**
 * STOMP 连接状态指示器组件
 */

import React from 'react';
import { useStompStatus } from './useSTOMP';
import './StompStatusIndicator.css';

export const StompStatusIndicator: React.FC = () => {
  const { status, isConnected, subscriptionCount } = useStompStatus();

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'error':
        return '🔴';
      default:
        return '⚫';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return '已连接';
      case 'connecting':
        return '连接中';
      case 'error':
        return '连接错误';
      default:
        return '未连接';
    }
  };

  const getStatusClass = () => {
    return `stomp-status-indicator status-${status}`;
  };

  return (
    <div className={getStatusClass()}>
      <span className="status-icon">{getStatusIcon()}</span>
      <span className="status-text">{getStatusText()}</span>
      {isConnected && subscriptionCount > 0 && (
        <span className="subscription-count" title="活动订阅数">
          {subscriptionCount}
        </span>
      )}
    </div>
  );
};
