// ============================================
// EventConfigPanel - 事件配置面板
// ============================================

import React, { useState, useEffect } from 'react';
import { EventManager, EventType, EventConfig, EventAction } from './EventManager';

interface EventConfigPanelProps {
  pageId?: number;
  componentId?: string;
  onSave?: (config: EventConfig) => void;
  onClose?: () => void;
}

const EVENT_TYPE_OPTIONS: { label: string; value: EventType; category: string }[] = [
  // 生命周期事件
  { label: '页面加载', value: 'page:load', category: '生命周期' },
  { label: '页面卸载', value: 'page:unload', category: '生命周期' },
  { label: '页面显示', value: 'page:show', category: '生命周期' },
  { label: '页面隐藏', value: 'page:hide', category: '生命周期' },
  // 用户交互事件
  { label: '组件点击', value: 'component:click', category: '用户交互' },
  { label: '组件变更', value: 'component:change', category: '用户交互' },
  { label: '组件获焦', value: 'component:focus', category: '用户交互' },
  { label: '组件失焦', value: 'component:blur', category: '用户交互' },
  { label: '表单提交', value: 'form:submit', category: '用户交互' },
  { label: '表单重置', value: 'form:reset', category: '用户交互' },
  // 数据事件
  { label: '数据成功', value: 'data:success', category: '数据' },
  { label: '数据错误', value: 'data:error', category: '数据' },
  { label: '数据加载中', value: 'data:loading', category: '数据' },
  // 外部事件
  { label: 'Webhook', value: 'external:webhook', category: '外部' },
  { label: 'STOMP', value: 'external:stomp', category: '外部' },
  { label: 'MQTT', value: 'external:mqtt', category: '外部' },
  // 扫描事件
  { label: '条形码扫描', value: 'scan:barcode', category: '扫描' },
  { label: '二维码扫描', value: 'scan:qrcode', category: '扫描' },
  { label: 'NFC 扫描', value: 'scan:nfc', category: '扫描' },
  // 工作流事件
  { label: '工作流开始', value: 'workflow:start', category: '工作流' },
  { label: '工作流完成', value: 'workflow:complete', category: '工作流' },
  { label: '工作流错误', value: 'workflow:error', category: '工作流' },
];

const ACTION_TYPE_OPTIONS = [
  { label: '触发工作流', value: 'workflow' },
  { label: '页面导航', value: 'navigation' },
  { label: '显示消息', value: 'message' },
  { label: '自定义代码', value: 'custom' },
];

export function EventConfigPanel({
  pageId,
  componentId,
  onSave,
  onClose,
}: EventConfigPanelProps) {
  const [configs, setConfigs] = useState<EventConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<EventConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  // 加载事件配置
  useEffect(() => {
    const loadedConfigs = EventManager.getEventConfigs({ pageId, componentId });
    setConfigs(loadedConfigs);
  }, [pageId, componentId]);

  const handleAddConfig = () => {
    const newConfig: EventConfig = {
      pageId,
      componentId,
      eventType: 'component:click',
      workflowEnabled: false,
      enabled: true,
      actions: [],
      priority: 0,
    };
    setEditingConfig(newConfig);
    setShowEditor(true);
  };

  const handleEditConfig = (config: EventConfig) => {
    setEditingConfig({ ...config });
    setShowEditor(true);
  };

  const handleDeleteConfig = (config: EventConfig) => {
    if (confirm('确定要删除此事件配置吗？')) {
      EventManager.unregisterEventConfig(config);
      setConfigs(configs.filter(c => c !== config));
    }
  };

  const handleSaveConfig = () => {
    if (!editingConfig) return;

    EventManager.registerEventConfig(editingConfig);

    if (editingConfig.id) {
      // 更新现有配置
      setConfigs(configs.map(c => (c.id === editingConfig.id ? editingConfig : c)));
    } else {
      // 添加新配置
      const newConfig = { ...editingConfig, id: Date.now() };
      setConfigs([...configs, newConfig]);
      EventManager.registerEventConfig(newConfig);
    }

    setShowEditor(false);
    setEditingConfig(null);

    if (onSave) {
      onSave(editingConfig);
    }
  };

  const handleCancelEdit = () => {
    setShowEditor(false);
    setEditingConfig(null);
  };

  const groupedEventTypes = EVENT_TYPE_OPTIONS.reduce(
    (acc, option) => {
      if (!acc[option.category]) {
        acc[option.category] = [];
      }
      acc[option.category].push(option);
      return acc;
    },
    {} as Record<string, typeof EVENT_TYPE_OPTIONS>
  );

  return (
    <div className="event-config-panel">
      <div className="panel-header">
        <h3>事件配置</h3>
        <div className="panel-actions">
          <button onClick={handleAddConfig} className="btn-primary">
            ➕ 添加事件
          </button>
          {onClose && (
            <button onClick={onClose} className="btn-secondary">
              关闭
            </button>
          )}
        </div>
      </div>

      <div className="config-list">
        {configs.length === 0 ? (
          <div className="empty-state">
            <p>暂无事件配置</p>
            <button onClick={handleAddConfig} className="btn-primary">
              添加第一个事件
            </button>
          </div>
        ) : (
          configs.map((config, index) => (
            <div key={index} className="config-item">
              <div className="config-info">
                <div className="config-type">
                  {EVENT_TYPE_OPTIONS.find(o => o.value === config.eventType)?.label ||
                    config.eventType}
                </div>
                {config.workflowEnabled && config.workflowId && (
                  <div className="config-workflow">
                    📋 工作流: {config.workflowId}
                  </div>
                )}
                {config.actions && config.actions.length > 0 && (
                  <div className="config-actions-count">
                    ⚡ {config.actions.length} 个动作
                  </div>
                )}
                <div className="config-status">
                  {config.enabled ? (
                    <span className="status-enabled">✅ 启用</span>
                  ) : (
                    <span className="status-disabled">❌ 禁用</span>
                  )}
                </div>
              </div>
              <div className="config-controls">
                <button
                  onClick={() => handleEditConfig(config)}
                  className="btn-icon"
                  title="编辑"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteConfig(config)}
                  className="btn-icon"
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showEditor && editingConfig && (
        <div className="event-editor-modal">
          <div className="modal-overlay" onClick={handleCancelEdit}></div>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingConfig.id ? '编辑事件' : '新建事件'}</h3>
              <button onClick={handleCancelEdit} className="btn-close">
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-field">
                <label>事件类型 *</label>
                <select
                  value={editingConfig.eventType}
                  onChange={e =>
                    setEditingConfig({
                      ...editingConfig,
                      eventType: e.target.value as EventType,
                    })
                  }
                  className="config-input"
                >
                  {Object.entries(groupedEventTypes).map(([category, options]) => (
                    <optgroup key={category} label={category}>
                      {options.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>触发条件（可选）</label>
                <input
                  type="text"
                  value={editingConfig.condition || ''}
                  onChange={e =>
                    setEditingConfig({ ...editingConfig, condition: e.target.value })
                  }
                  placeholder="例: payload.data.amount > 1000"
                  className="config-input"
                />
                <small>JavaScript 表达式，返回 true 时执行</small>
              </div>

              <div className="form-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editingConfig.workflowEnabled}
                    onChange={e =>
                      setEditingConfig({
                        ...editingConfig,
                        workflowEnabled: e.target.checked,
                      })
                    }
                  />
                  触发工作流
                </label>
              </div>

              {editingConfig.workflowEnabled && (
                <div className="form-field">
                  <label>工作流 ID *</label>
                  <input
                    type="text"
                    value={editingConfig.workflowId || ''}
                    onChange={e =>
                      setEditingConfig({ ...editingConfig, workflowId: e.target.value })
                    }
                    placeholder="输入工作流 ID"
                    className="config-input"
                  />
                </div>
              )}

              <div className="form-field">
                <label>动作</label>
                <EventActionsEditor
                  actions={editingConfig.actions || []}
                  onChange={actions => setEditingConfig({ ...editingConfig, actions })}
                />
              </div>

              <div className="form-field">
                <label>优先级</label>
                <input
                  type="number"
                  value={editingConfig.priority || 0}
                  onChange={e =>
                    setEditingConfig({
                      ...editingConfig,
                      priority: parseInt(e.target.value, 10),
                    })
                  }
                  className="config-input"
                />
                <small>数字越大优先级越高</small>
              </div>

              <div className="form-field">
                <label>
                  <input
                    type="checkbox"
                    checked={editingConfig.enabled}
                    onChange={e =>
                      setEditingConfig({ ...editingConfig, enabled: e.target.checked })
                    }
                  />
                  启用此事件
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={handleCancelEdit} className="btn-secondary">
                取消
              </button>
              <button onClick={handleSaveConfig} className="btn-primary">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .event-config-panel {
          padding: 20px;
          background: #f5f5f5;
          border-radius: 8px;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .panel-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .panel-actions {
          display: flex;
          gap: 10px;
        }

        .config-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          background: white;
          border-radius: 8px;
        }

        .empty-state p {
          color: #999;
          margin-bottom: 20px;
        }

        .config-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          background: white;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .config-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .config-type {
          font-weight: 600;
          font-size: 14px;
        }

        .config-workflow,
        .config-actions-count {
          font-size: 12px;
          color: #666;
        }

        .config-status {
          font-size: 12px;
        }

        .status-enabled {
          color: #4caf50;
        }

        .status-disabled {
          color: #f44336;
        }

        .config-controls {
          display: flex;
          gap: 5px;
        }

        .btn-icon {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 5px;
        }

        .btn-icon:hover {
          opacity: 0.7;
        }

        .btn-primary {
          background: #1976d2;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-primary:hover {
          background: #1565c0;
        }

        .btn-secondary {
          background: #e0e0e0;
          color: #333;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-secondary:hover {
          background: #d0d0d0;
        }

        .event-editor-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
          position: relative;
          background: white;
          border-radius: 8px;
          width: 600px;
          max-width: 90vw;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .btn-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-close:hover {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .form-field {
          margin-bottom: 20px;
        }

        .form-field label {
          display: block;
          margin-bottom: 8px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-field small {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          color: #666;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 20px;
          border-top: 1px solid #e0e0e0;
        }
      `}</style>
    </div>
  );
}

// 动作编辑器子组件
function EventActionsEditor({
  actions,
  onChange,
}: {
  actions: EventAction[];
  onChange: (actions: EventAction[]) => void;
}) {
  const handleAddAction = () => {
    onChange([
      ...actions,
      {
        type: 'navigation',
        config: {},
      },
    ]);
  };

  const handleRemoveAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (index: number, action: EventAction) => {
    onChange(actions.map((a, i) => (i === index ? action : a)));
  };

  return (
    <div className="actions-editor">
      {actions.map((action, index) => (
        <div key={index} className="action-item">
          <select
            value={action.type}
            onChange={e =>
              handleUpdateAction(index, {
                ...action,
                type: e.target.value as EventAction['type'],
                config: {},
              })
            }
            className="config-input"
          >
            {ACTION_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <ActionConfigEditor
            type={action.type}
            config={action.config}
            onChange={config => handleUpdateAction(index, { ...action, config })}
          />

          <button
            onClick={() => handleRemoveAction(index)}
            className="btn-remove"
            title="删除"
          >
            🗑️
          </button>
        </div>
      ))}

      <button onClick={handleAddAction} className="btn-add-action">
        ➕ 添加动作
      </button>

      <style jsx>{`
        .actions-editor {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .action-item {
          display: flex;
          gap: 10px;
          padding: 10px;
          background: #f5f5f5;
          border-radius: 4px;
          align-items: flex-start;
        }

        .action-item select {
          width: 150px;
        }

        .btn-remove {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 4px;
        }

        .btn-add-action {
          background: #e0e0e0;
          border: none;
          padding: 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-add-action:hover {
          background: #d0d0d0;
        }
      `}</style>
    </div>
  );
}

// 动作配置编辑器
function ActionConfigEditor({
  type,
  config,
  onChange,
}: {
  type: EventAction['type'];
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}) {
  switch (type) {
    case 'navigation':
      return (
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={config.target || ''}
            onChange={e => onChange({ ...config, target: e.target.value })}
            placeholder="目标页面路径"
            className="config-input"
            style={{ marginBottom: '5px' }}
          />
          <input
            type="text"
            value={config.params || ''}
            onChange={e => onChange({ ...config, params: e.target.value })}
            placeholder="参数 (JSON)"
            className="config-input"
          />
        </div>
      );

    case 'message':
      return (
        <div style={{ flex: 1 }}>
          <input
            type="text"
            value={config.message || ''}
            onChange={e => onChange({ ...config, message: e.target.value })}
            placeholder="消息内容"
            className="config-input"
            style={{ marginBottom: '5px' }}
          />
          <select
            value={config.type || 'info'}
            onChange={e => onChange({ ...config, type: e.target.value })}
            className="config-input"
          >
            <option value="info">信息</option>
            <option value="success">成功</option>
            <option value="warning">警告</option>
            <option value="error">错误</option>
          </select>
        </div>
      );

    case 'custom':
      return (
        <div style={{ flex: 1 }}>
          <textarea
            value={config.code || ''}
            onChange={e => onChange({ ...config, code: e.target.value })}
            placeholder="自定义代码 (JavaScript)"
            className="config-input"
            rows={3}
          />
        </div>
      );

    default:
      return null;
  }
}
