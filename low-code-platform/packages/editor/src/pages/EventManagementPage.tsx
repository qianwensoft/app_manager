// ============================================
// EventManagementPage - 事件管理页面
// ============================================

import React, { useState } from 'react';
import { EventConfigPanel } from '../events/EventConfigPanel';
import { EventMonitor } from '../events/EventMonitor';
import { EventManager } from '../events/EventManager';

export function EventManagementPage() {
  const [activeTab, setActiveTab] = useState<'config' | 'monitor' | 'stats'>('config');
  const [stats, setStats] = useState(EventManager.getStats());

  // 定期更新统计信息
  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats(EventManager.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleResetEventManager = () => {
    if (confirm('确定要重置事件管理器吗？这将清除所有事件配置和历史记录。')) {
      EventManager.reset();
      setStats(EventManager.getStats());
    }
  };

  return (
    <div className="event-management-page">
      <div className="page-header">
        <h1>事件管理</h1>
        <p>配置和监控低代码平台的事件系统</p>
      </div>

      <div className="page-tabs">
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          📋 事件配置
        </button>
        <button
          className={`tab ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          📊 事件监控
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📈 统计信息
        </button>
      </div>

      <div className="page-content">
        {activeTab === 'config' && (
          <div className="tab-content">
            <EventConfigPanel />
          </div>
        )}

        {activeTab === 'monitor' && (
          <div className="tab-content" style={{ height: '600px' }}>
            <EventMonitor />
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="tab-content">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">🎯</div>
                <div className="stat-info">
                  <div className="stat-value">{stats.handlerCount}</div>
                  <div className="stat-label">事件处理器</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">⚙️</div>
                <div className="stat-info">
                  <div className="stat-value">{stats.configCount}</div>
                  <div className="stat-label">事件配置</div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">📝</div>
                <div className="stat-info">
                  <div className="stat-value">{stats.historySize}</div>
                  <div className="stat-label">历史记录</div>
                </div>
              </div>
            </div>

            <div className="handlers-by-type">
              <h3>各类型处理器数量</h3>
              <div className="handlers-list">
                {Object.entries(stats.handlersByType).length === 0 ? (
                  <p className="empty-message">暂无注册的事件处理器</p>
                ) : (
                  Object.entries(stats.handlersByType).map(([type, count]) => (
                    <div key={type} className="handler-item">
                      <span className="handler-type">{type}</span>
                      <span className="handler-count">{count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="actions">
              <button onClick={handleResetEventManager} className="btn-danger">
                🔄 重置事件管理器
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .event-management-page {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
        }

        .page-header {
          margin-bottom: 30px;
        }

        .page-header h1 {
          margin: 0 0 10px 0;
          font-size: 28px;
          font-weight: 600;
        }

        .page-header p {
          margin: 0;
          color: #666;
          font-size: 14px;
        }

        .page-tabs {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          border-bottom: 2px solid #e0e0e0;
        }

        .tab {
          background: none;
          border: none;
          padding: 12px 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #666;
          border-bottom: 3px solid transparent;
          transition: all 0.2s;
          margin-bottom: -2px;
        }

        .tab:hover {
          color: #1976d2;
        }

        .tab.active {
          color: #1976d2;
          border-bottom-color: #1976d2;
        }

        .page-content {
          background: white;
          border-radius: 8px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .tab-content {
          animation: fadeIn 0.3s;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .stat-card {
          display: flex;
          gap: 15px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          color: white;
        }

        .stat-icon {
          font-size: 48px;
        }

        .stat-info {
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .stat-value {
          font-size: 32px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 5px;
        }

        .stat-label {
          font-size: 14px;
          opacity: 0.9;
        }

        .handlers-by-type {
          margin-bottom: 30px;
        }

        .handlers-by-type h3 {
          margin: 0 0 15px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .handlers-list {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 15px;
          max-height: 300px;
          overflow-y: auto;
        }

        .empty-message {
          text-align: center;
          color: #999;
          padding: 20px;
          margin: 0;
        }

        .handler-item {
          display: flex;
          justify-content: space-between;
          padding: 10px 15px;
          background: white;
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .handler-item:last-child {
          margin-bottom: 0;
        }

        .handler-type {
          font-family: monospace;
          font-size: 13px;
          color: #333;
        }

        .handler-count {
          font-weight: 600;
          color: #1976d2;
        }

        .actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
        }

        .btn-danger {
          background: #f44336;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }

        .btn-danger:hover {
          background: #d32f2f;
        }
      `}</style>
    </div>
  );
}
