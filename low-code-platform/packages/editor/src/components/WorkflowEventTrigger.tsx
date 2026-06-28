// ============================================
// WorkflowEventTrigger - 工作流事件触发器配置
// ============================================

import React, { useState, useEffect } from 'react';
import { EventManager, EventType, EventConfig } from '../events/EventManager';
import { pageApi } from '../api/client';

interface WorkflowEventTriggerProps {
  workflowId: string;
  onSave?: () => void;
}

interface TriggerFormData {
  eventType: EventType;
  pageId?: string;
  componentId?: string;
  condition?: string;
}

const TRIGGER_EVENT_OPTIONS: { label: string; value: EventType; category: string; needsPage?: boolean; needsComponent?: boolean }[] = [
  // 页面生命周期
  { label: '页面加载', value: 'page:load', category: '页面生命周期', needsPage: true },
  { label: '页面卸载', value: 'page:unload', category: '页面生命周期', needsPage: true },
  // 用户交互
  { label: '组件点击', value: 'component:click', category: '用户交互', needsPage: true, needsComponent: true },
  { label: '组件变更', value: 'component:change', category: '用户交互', needsPage: true, needsComponent: true },
  { label: '表单提交', value: 'form:submit', category: '用户交互', needsPage: true },
  // 数据事件
  { label: '数据成功', value: 'data:success', category: '数据事件' },
  { label: '数据错误', value: 'data:error', category: '数据事件' },
  // 外部事件
  { label: 'Webhook', value: 'external:webhook', category: '外部事件' },
  { label: 'STOMP', value: 'external:stomp', category: '外部事件' },
  { label: 'MQTT', value: 'external:mqtt', category: '外部事件' },
  // 扫描事件
  { label: '条形码扫描', value: 'scan:barcode', category: '扫描事件' },
  { label: '二维码扫描', value: 'scan:qrcode', category: '扫描事件' },
  { label: 'NFC 扫描', value: 'scan:nfc', category: '扫描事件' },
];

export function WorkflowEventTrigger({ workflowId, onSave }: WorkflowEventTriggerProps) {
  const [triggers, setTriggers] = useState<EventConfig[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pages, setPages] = useState<any[]>([]);
  const [formData, setFormData] = useState<TriggerFormData>({
    eventType: 'page:load',
  });
  const [selectedEventOption, setSelectedEventOption] = useState<typeof TRIGGER_EVENT_OPTIONS[0] | null>(null);

  // 加载已配置的触发器
  useEffect(() => {
    loadTriggers();
    loadPages();
  }, [workflowId]);

  const loadPages = async () => {
    try {
      const data = await pageApi.list();
      setPages(data);
    } catch (error) {
      console.error('Failed to load pages:', error);
    }
  };

  const loadTriggers = () => {
    const allConfigs = EventManager.getEventConfigs();
    const workflowTriggers = allConfigs.filter(
      (c) => c.workflowEnabled && c.workflowId === workflowId
    );
    setTriggers(workflowTriggers);
  };

  const handleSelectEventType = (option: typeof TRIGGER_EVENT_OPTIONS[0]) => {
    setSelectedEventOption(option);
    setFormData({
      eventType: option.value,
      pageId: undefined,
      componentId: undefined,
      condition: undefined,
    });
  };

  const handleAddTrigger = () => {
    if (selectedEventOption?.needsPage && !formData.pageId) {
      alert('请选择页面');
      return;
    }
    if (selectedEventOption?.needsComponent && !formData.componentId) {
      alert('请输入组件 ID');
      return;
    }

    const config: EventConfig = {
      id: Date.now(),
      eventType: formData.eventType,
      workflowId,
      workflowEnabled: true,
      enabled: true,
      priority: 0,
      pageId: formData.pageId,
      componentId: formData.componentId,
      condition: formData.condition,
    };

    EventManager.registerEventConfig(config);
    loadTriggers();
    setShowAddDialog(false);
    setSelectedEventOption(null);

    if (onSave) {
      onSave();
    }
  };

  const handleRemoveTrigger = (config: EventConfig) => {
    if (confirm('确定要移除此触发器吗？')) {
      EventManager.unregisterEventConfig(config);
      loadTriggers();

      if (onSave) {
        onSave();
      }
    }
  };

  const handleToggleEnabled = (config: EventConfig) => {
    const updated = { ...config, enabled: !config.enabled };
    EventManager.unregisterEventConfig(config);
    EventManager.registerEventConfig(updated);
    loadTriggers();

    if (onSave) {
      onSave();
    }
  };

  const groupedOptions = TRIGGER_EVENT_OPTIONS.reduce(
    (acc, option) => {
      if (!acc[option.category]) {
        acc[option.category] = [];
      }
      acc[option.category].push(option);
      return acc;
    },
    {} as Record<string, typeof TRIGGER_EVENT_OPTIONS>
  );

  return (
    <div className="workflow-event-trigger">
      <div className="trigger-header">
        <h3>⚡ 事件触发器</h3>
        <button onClick={() => setShowAddDialog(true)} className="btn-add">
          ➕ 添加触发器
        </button>
      </div>

      <div className="trigger-list">
        {triggers.length === 0 ? (
          <div className="empty-state">
            <p>此工作流暂无事件触发器</p>
            <p className="hint">添加触发器后，工作流将在对应事件发生时自动执行</p>
          </div>
        ) : (
          triggers.map((config) => {
            const option = TRIGGER_EVENT_OPTIONS.find((o) => o.value === config.eventType);
            const page = pages.find((p) => p.id === parseInt(config.pageId || '0'));

            return (
              <div key={config.id} className="trigger-item">
                <div className="trigger-info">
                  <div className="trigger-event">
                    {option?.label || config.eventType}
                  </div>
                  {config.pageId && (
                    <div className="trigger-meta">📄 页面: {page?.name || config.pageId}</div>
                  )}
                  {config.componentId && (
                    <div className="trigger-meta">🧩 组件: {config.componentId}</div>
                  )}
                  {config.condition && (
                    <div className="trigger-condition">条件: {config.condition}</div>
                  )}
                </div>
                <div className="trigger-controls">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={() => handleToggleEnabled(config)}
                    />
                    <span className="slider"></span>
                  </label>
                  <button
                    onClick={() => handleRemoveTrigger(config)}
                    className="btn-remove"
                    title="移除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddDialog && (
        <div className="add-trigger-dialog">
          <div className="dialog-overlay" onClick={() => setShowAddDialog(false)}></div>
          <div className="dialog-content">
            <div className="dialog-header">
              <h3>添加事件触发器</h3>
              <button onClick={() => setShowAddDialog(false)} className="btn-close">
                ✕
              </button>
            </div>
            <div className="dialog-body">
              {!selectedEventOption ? (
                <>
                  <p className="dialog-hint">选择触发事件类型：</p>
                  {Object.entries(groupedOptions).map(([category, options]) => (
                    <div key={category} className="event-category">
                      <div className="category-title">{category}</div>
                      <div className="event-options">
                        {options.map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleSelectEventType(option)}
                            className="event-option"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="trigger-form">
                  <div className="form-section">
                    <div className="form-label">事件类型</div>
                    <div className="form-value">{selectedEventOption.label}</div>
                    <button
                      onClick={() => setSelectedEventOption(null)}
                      className="btn-change"
                    >
                      更换
                    </button>
                  </div>

                  {selectedEventOption.needsPage && (
                    <div className="form-section">
                      <label className="form-label">
                        绑定页面 <span className="required">*</span>
                      </label>
                      <select
                        value={formData.pageId || ''}
                        onChange={(e) => setFormData({ ...formData, pageId: e.target.value })}
                        className="form-select"
                      >
                        <option value="">请选择页面</option>
                        {pages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name} ({page.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedEventOption.needsComponent && (
                    <div className="form-section">
                      <label className="form-label">
                        组件 ID <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.componentId || ''}
                        onChange={(e) => setFormData({ ...formData, componentId: e.target.value })}
                        placeholder="例如: submitButton"
                        className="form-input"
                      />
                      <div className="form-hint">输入页面中组件的唯一标识符</div>
                    </div>
                  )}

                  <div className="form-section">
                    <label className="form-label">触发条件（可选）</label>
                    <input
                      type="text"
                      value={formData.condition || ''}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                      placeholder="例如: data.status === 'success'"
                      className="form-input"
                    />
                    <div className="form-hint">JavaScript 表达式，返回 true 时触发</div>
                  </div>

                  <div className="form-actions">
                    <button onClick={() => setSelectedEventOption(null)} className="btn-cancel">
                      取消
                    </button>
                    <button onClick={handleAddTrigger} className="btn-confirm">
                      确认添加
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .workflow-event-trigger {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 15px;
          background: #f9f9f9;
        }

        .trigger-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .trigger-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .btn-add {
          background: #1976d2;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }

        .btn-add:hover {
          background: #1565c0;
        }

        .trigger-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .empty-state {
          text-align: center;
          padding: 30px;
          color: #999;
        }

        .empty-state p {
          margin: 5px 0;
        }

        .empty-state .hint {
          font-size: 12px;
        }

        .trigger-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: white;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
        }

        .trigger-info {
          flex: 1;
        }

        .trigger-event {
          font-weight: 500;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .trigger-condition {
          font-size: 12px;
          color: #666;
          font-family: monospace;
        }

        .trigger-meta {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }

        .trigger-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 20px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: 0.3s;
          border-radius: 20px;
        }

        .slider:before {
          position: absolute;
          content: '';
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #4caf50;
        }

        input:checked + .slider:before {
          transform: translateX(20px);
        }

        .btn-remove {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 4px;
        }

        .btn-remove:hover {
          opacity: 0.7;
        }

        .add-trigger-dialog {
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

        .dialog-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .dialog-content {
          position: relative;
          background: white;
          border-radius: 8px;
          width: 500px;
          max-width: 90vw;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .dialog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
        }

        .dialog-header h3 {
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
        }

        .btn-close:hover {
          background: #f0f0f0;
          border-radius: 4px;
        }

        .dialog-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
        }

        .event-category {
          margin-bottom: 20px;
        }

        .event-category:last-child {
          margin-bottom: 0;
        }

        .category-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 10px;
          color: #666;
        }

        .event-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .event-option {
          background: #f5f5f5;
          border: 1px solid #e0e0e0;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .event-option:hover {
          background: #1976d2;
          color: white;
          border-color: #1976d2;
        }

        .dialog-hint {
          margin-bottom: 15px;
          font-size: 14px;
          color: #666;
        }

        .trigger-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .form-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-label {
          font-weight: 500;
          font-size: 13px;
          color: #333;
        }

        .form-value {
          display: inline-block;
          padding: 8px 12px;
          background: #f0f0f0;
          border-radius: 4px;
          font-size: 14px;
        }

        .required {
          color: #f44336;
        }

        .form-select,
        .form-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          width: 100%;
          box-sizing: border-box;
        }

        .form-select:focus,
        .form-input:focus {
          outline: none;
          border-color: #1976d2;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
        }

        .form-hint {
          font-size: 12px;
          color: #999;
        }

        .btn-change {
          align-self: flex-start;
          background: none;
          border: 1px solid #1976d2;
          color: #1976d2;
          padding: 4px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .btn-change:hover {
          background: #1976d2;
          color: white;
        }

        .form-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 10px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
        }

        .btn-cancel {
          padding: 8px 16px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-cancel:hover {
          background: #f5f5f5;
        }

        .btn-confirm {
          padding: 8px 16px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        .btn-confirm:hover {
          background: #1565c0;
        }
      `}</style>
    </div>
  );
}
