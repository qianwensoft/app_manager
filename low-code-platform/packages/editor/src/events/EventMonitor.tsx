// ============================================
// EventMonitor - 事件监控面板
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { EventManager, EventType, EventPayload } from './EventManager';

interface EventMonitorProps {
  maxEvents?: number;
  autoScroll?: boolean;
  filterTypes?: EventType[];
}

export function EventMonitor({
  maxEvents = 100,
  autoScroll = true,
  filterTypes,
}: EventMonitorProps) {
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventPayload | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof EventManager.getStats>>();
  const listRef = useRef<HTMLDivElement>(null);

  // 监听所有事件
  useEffect(() => {
    if (isPaused) return;

    const handlerIds: string[] = [];

    // 获取所有事件类型
    const eventTypes: EventType[] = filterTypes || [
      'page:load',
      'page:unload',
      'page:show',
      'page:hide',
      'component:click',
      'component:change',
      'component:focus',
      'component:blur',
      'form:submit',
      'form:reset',
      'data:success',
      'data:error',
      'data:loading',
      'external:webhook',
      'external:stomp',
      'external:mqtt',
      'scan:barcode',
      'scan:qrcode',
      'scan:nfc',
      'workflow:start',
      'workflow:complete',
      'workflow:error',
    ];

    // 注册监听器
    eventTypes.forEach(type => {
      const id = EventManager.on(
        type,
        payload => {
          setEvents(prev => {
            const newEvents = [...prev, payload];
            if (newEvents.length > maxEvents) {
              newEvents.shift();
            }
            return newEvents;
          });
        },
        { priority: -1000 } // 低优先级，不影响业务逻辑
      );
      handlerIds.push(id);
    });

    return () => {
      handlerIds.forEach(id => EventManager.off(id));
    };
  }, [isPaused, maxEvents, filterTypes]);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // 定期更新统计信息
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(EventManager.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleClearEvents = () => {
    setEvents([]);
    setSelectedEvent(null);
  };

  const handleTogglePause = () => {
    setIsPaused(!isPaused);
  };

  const handleClearHistory = () => {
    EventManager.clearHistory();
    setEvents([]);
    setSelectedEvent(null);
  };

  const getEventColor = (type: EventType): string => {
    if (type.startsWith('page:')) return '#2196f3';
    if (type.startsWith('component:')) return '#4caf50';
    if (type.startsWith('form:')) return '#ff9800';
    if (type.startsWith('data:')) return '#9c27b0';
    if (type.startsWith('external:')) return '#f44336';
    if (type.startsWith('scan:')) return '#00bcd4';
    if (type.startsWith('workflow:')) return '#673ab7';
    return '#757575';
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className="event-monitor">
      <div className="monitor-header">
        <h3>事件监控</h3>
        <div className="monitor-stats">
          {stats && (
            <>
              <span>处理器: {stats.handlerCount}</span>
              <span>配置: {stats.configCount}</span>
              <span>事件: {events.length}</span>
            </>
          )}
        </div>
        <div className="monitor-controls">
          <button
            onClick={handleTogglePause}
            className={isPaused ? 'btn-play' : 'btn-pause'}
            title={isPaused ? '继续' : '暂停'}
          >
            {isPaused ? '▶️' : '⏸️'}
          </button>
          <button onClick={handleClearEvents} className="btn-clear" title="清空显示">
            🗑️
          </button>
          <button onClick={handleClearHistory} className="btn-clear" title="清空历史">
            🔄
          </button>
        </div>
      </div>

      <div className="monitor-content">
        <div className="event-list" ref={listRef}>
          {events.length === 0 ? (
            <div className="empty-state">
              <p>{isPaused ? '已暂停监控' : '等待事件...'}</p>
            </div>
          ) : (
            events.map((event, index) => (
              <div
                key={index}
                className={`event-item ${selectedEvent === event ? 'selected' : ''}`}
                onClick={() => setSelectedEvent(event)}
              >
                <div
                  className="event-indicator"
                  style={{ backgroundColor: getEventColor(event.type) }}
                ></div>
                <div className="event-info">
                  <div className="event-header">
                    <span className="event-type">{event.type}</span>
                    <span className="event-time">{formatTimestamp(event.timestamp)}</span>
                  </div>
                  {event.source && (
                    <div className="event-source">来源: {event.source}</div>
                  )}
                  {event.data && (
                    <div className="event-data-preview">
                      {typeof event.data === 'string'
                        ? event.data.slice(0, 50)
                        : JSON.stringify(event.data).slice(0, 50)}
                      {(typeof event.data === 'string'
                        ? event.data.length
                        : JSON.stringify(event.data).length) > 50 && '...'}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {selectedEvent && (
          <div className="event-detail">
            <div className="detail-header">
              <h4>事件详情</h4>
              <button
                onClick={() => setSelectedEvent(null)}
                className="btn-close"
                title="关闭"
              >
                ✕
              </button>
            </div>
            <div className="detail-content">
              <div className="detail-field">
                <label>类型:</label>
                <div className="detail-value">{selectedEvent.type}</div>
              </div>
              <div className="detail-field">
                <label>时间:</label>
                <div className="detail-value">
                  {new Date(selectedEvent.timestamp).toLocaleString('zh-CN')}
                </div>
              </div>
              {selectedEvent.source && (
                <div className="detail-field">
                  <label>来源:</label>
                  <div className="detail-value">{selectedEvent.source}</div>
                </div>
              )}
              {selectedEvent.data && (
                <div className="detail-field">
                  <label>数据:</label>
                  <pre className="detail-json">
                    {JSON.stringify(selectedEvent.data, null, 2)}
                  </pre>
                </div>
              )}
              {selectedEvent.metadata && (
                <div className="detail-field">
                  <label>元数据:</label>
                  <pre className="detail-json">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .event-monitor {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: white;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          overflow: hidden;
        }

        .monitor-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 20px;
          background: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }

        .monitor-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .monitor-stats {
          display: flex;
          gap: 15px;
          font-size: 12px;
          color: #666;
        }

        .monitor-controls {
          display: flex;
          gap: 5px;
        }

        .monitor-controls button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 5px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
        }

        .monitor-controls button:hover {
          background: #e0e0e0;
        }

        .btn-pause {
          color: #ff9800;
        }

        .btn-play {
          color: #4caf50;
        }

        .btn-clear {
          color: #f44336;
        }

        .monitor-content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .event-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }

        .empty-state {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
        }

        .event-item {
          display: flex;
          gap: 10px;
          padding: 10px;
          margin-bottom: 5px;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .event-item:hover {
          background: #f5f5f5;
        }

        .event-item.selected {
          background: #e3f2fd;
        }

        .event-indicator {
          width: 4px;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .event-info {
          flex: 1;
          min-width: 0;
        }

        .event-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .event-type {
          font-weight: 500;
          font-size: 13px;
        }

        .event-time {
          font-size: 11px;
          color: #999;
          font-family: monospace;
        }

        .event-source {
          font-size: 11px;
          color: #666;
          margin-bottom: 4px;
        }

        .event-data-preview {
          font-size: 11px;
          color: #999;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .event-detail {
          width: 350px;
          border-left: 1px solid #e0e0e0;
          display: flex;
          flex-direction: column;
          background: #fafafa;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #e0e0e0;
          background: white;
        }

        .detail-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .btn-close {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 20px;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-close:hover {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .detail-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px 20px;
        }

        .detail-field {
          margin-bottom: 15px;
        }

        .detail-field label {
          display: block;
          font-weight: 500;
          font-size: 12px;
          color: #666;
          margin-bottom: 5px;
        }

        .detail-value {
          font-size: 13px;
          word-break: break-word;
        }

        .detail-json {
          background: white;
          padding: 10px;
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
          overflow-x: auto;
          border: 1px solid #e0e0e0;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

// 导出简化的悬浮监控器
export function FloatingEventMonitor() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="floating-trigger"
        title="打开事件监控"
      >
        📊
        <style jsx>{`
          .floating-trigger {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 25px;
            background: #1976d2;
            color: white;
            border: none;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
            z-index: 1000;
          }

          .floating-trigger:hover {
            background: #1565c0;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          }
        `}</style>
      </button>
    );
  }

  return (
    <div
      className="floating-monitor"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 400,
        height: 500,
        zIndex: 1000,
      }}
    >
      <div className="floating-header" onMouseDown={handleMouseDown}>
        <span>事件监控</span>
        <button onClick={() => setIsOpen(false)} className="btn-close-floating">
          ✕
        </button>
      </div>
      <div style={{ height: 'calc(100% - 40px)' }}>
        <EventMonitor maxEvents={50} />
      </div>

      <style jsx>{`
        .floating-monitor {
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          overflow: hidden;
        }

        .floating-header {
          height: 40px;
          background: #1976d2;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 15px;
          cursor: move;
          user-select: none;
        }

        .btn-close-floating {
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
        }

        .btn-close-floating:hover {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
