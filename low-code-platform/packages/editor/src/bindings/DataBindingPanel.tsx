/**
 * 数据绑定配置面板
 */

import React, { useState } from 'react';
import { DataBindingEditor } from './DataBindingEditor';
import { dataBindingManager } from './DataBindingManager';
import type { DataBinding, DataBindingConfig } from './types';
import './DataBindingPanel.css';

interface DataBindingPanelProps {
  componentId: string;
  propertyPath: string;
  currentBinding?: DataBinding;
  onBindingChange: (binding: DataBinding | null) => void;
}

export const DataBindingPanel: React.FC<DataBindingPanelProps> = ({
  componentId,
  propertyPath,
  currentBinding,
  onBindingChange,
}) => {
  const [showEditor, setShowEditor] = useState(false);
  const [isEnabled, setIsEnabled] = useState(!!currentBinding);

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (!enabled) {
      onBindingChange(null);
    }
  };

  const handleEdit = () => {
    setShowEditor(true);
  };

  const handleBindingChange = (binding: DataBinding) => {
    onBindingChange(binding);
    setIsEnabled(true);
  };

  const getBindingTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      static: '静态数据',
      interface: '数据接口',
      dataset: '数据集',
      variable: '变量',
      expression: '表达式',
    };
    return labels[type] || type;
  };

  const getBindingDescription = (binding: DataBinding): string => {
    switch (binding.type) {
      case 'static':
        return '静态值';
      case 'interface':
        return binding.interfaceSlug || '未选择接口';
      case 'dataset':
        return `数据集 #${binding.datasetId}`;
      case 'variable':
        return binding.variableName || '未命名变量';
      case 'expression':
        return binding.expression || '未设置表达式';
      default:
        return '';
    }
  };

  return (
    <div className="data-binding-panel">
      <div className="panel-header">
        <label>
          <input type="checkbox" checked={isEnabled} onChange={(e) => handleToggle(e.target.checked)} />
          &nbsp;数据绑定
        </label>
        {isEnabled && currentBinding && (
          <button onClick={handleEdit} className="btn-edit">
            ⚙️ 配置
          </button>
        )}
      </div>

      {isEnabled && currentBinding && (
        <div className="binding-info">
          <div className="info-row">
            <span className="label">类型:</span>
            <span className="value badge">{getBindingTypeLabel(currentBinding.type)}</span>
          </div>
          <div className="info-row">
            <span className="label">源:</span>
            <span className="value">{getBindingDescription(currentBinding)}</span>
          </div>
          {currentBinding.autoRefresh && (
            <div className="info-row">
              <span className="label">刷新:</span>
              <span className="value">每 {currentBinding.refreshInterval}s</span>
            </div>
          )}
          {currentBinding.cache && (
            <div className="info-row">
              <span className="label">缓存:</span>
              <span className="value">{currentBinding.cacheDuration}s</span>
            </div>
          )}
        </div>
      )}

      {isEnabled && !currentBinding && (
        <div className="empty-state">
          <p>未配置数据绑定</p>
          <button onClick={handleEdit} className="btn-primary btn-sm">
            配置绑定
          </button>
        </div>
      )}

      {showEditor && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <DataBindingEditor
              binding={currentBinding || { type: 'static' }}
              onChange={handleBindingChange}
              onClose={() => setShowEditor(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
