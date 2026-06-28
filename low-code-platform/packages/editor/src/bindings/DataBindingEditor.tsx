/**
 * 数据绑定配置组件
 */

import React, { useState, useEffect } from 'react';
import { useDataInterfaceStore } from '../data/dataInterfaceStore';
import { useDatasetStore } from '../data/datasetStore';
import type { DataBinding } from './types';
import './DataBindingEditor.css';

interface DataBindingEditorProps {
  binding: DataBinding;
  onChange: (binding: DataBinding) => void;
  onClose: () => void;
}

export const DataBindingEditor: React.FC<DataBindingEditorProps> = ({
  binding,
  onChange,
  onClose,
}) => {
  const { interfaces, fetchInterfaces } = useDataInterfaceStore();
  const { datasets, fetchDatasets } = useDatasetStore();

  const [localBinding, setLocalBinding] = useState<DataBinding>(binding);

  useEffect(() => {
    fetchInterfaces();
    fetchDatasets();
  }, [fetchInterfaces, fetchDatasets]);

  const handleTypeChange = (type: DataBinding['type']) => {
    const newBinding: DataBinding = {
      type,
      autoRefresh: false,
      cache: false,
    };

    setLocalBinding(newBinding);
  };

  const handleSubmit = () => {
    onChange(localBinding);
    onClose();
  };

  return (
    <div className="data-binding-editor">
      <div className="editor-header">
        <h3>配置数据绑定</h3>
        <button onClick={onClose} className="close-btn">
          ✕
        </button>
      </div>

      <div className="editor-body">
        {/* 绑定类型选择 */}
        <div className="form-group">
          <label>绑定类型</label>
          <select
            value={localBinding.type}
            onChange={(e) => handleTypeChange(e.target.value as DataBinding['type'])}
          >
            <option value="static">静态数据</option>
            <option value="interface">数据接口</option>
            <option value="dataset">数据集</option>
            <option value="variable">变量</option>
            <option value="expression">表达式</option>
          </select>
        </div>

        {/* 静态数据 */}
        {localBinding.type === 'static' && (
          <div className="form-group">
            <label>静态值 (JSON)</label>
            <textarea
              value={
                typeof localBinding.staticValue === 'string'
                  ? localBinding.staticValue
                  : JSON.stringify(localBinding.staticValue, null, 2)
              }
              onChange={(e) => {
                try {
                  const value = JSON.parse(e.target.value);
                  setLocalBinding({ ...localBinding, staticValue: value });
                } catch {
                  setLocalBinding({ ...localBinding, staticValue: e.target.value });
                }
              }}
              rows={8}
              className="code-editor"
              placeholder='["选项1", "选项2", "选项3"]'
            />
          </div>
        )}

        {/* 数据接口 */}
        {localBinding.type === 'interface' && (
          <>
            <div className="form-group">
              <label>选择接口</label>
              <select
                value={localBinding.interfaceSlug || ''}
                onChange={(e) => {
                  const iface = interfaces.find((i) => i.slug === e.target.value);
                  setLocalBinding({
                    ...localBinding,
                    interfaceSlug: e.target.value,
                    interfaceId: iface?.id,
                  });
                }}
              >
                <option value="">选择数据接口</option>
                {interfaces.map((iface) => (
                  <option key={iface.id} value={iface.slug}>
                    {iface.name} ({iface.slug})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>接口参数 (JSON)</label>
              <textarea
                value={JSON.stringify(localBinding.params || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const params = JSON.parse(e.target.value);
                    setLocalBinding({ ...localBinding, params });
                  } catch {
                    // 忽略无效 JSON
                  }
                }}
                rows={6}
                className="code-editor"
                placeholder='{"page": 1, "status": "{{variables.status}}"}'
              />
              <small>支持变量语法: {`{{variables.name}}`}</small>
            </div>
          </>
        )}

        {/* 数据集 */}
        {localBinding.type === 'dataset' && (
          <>
            <div className="form-group">
              <label>选择数据集</label>
              <select
                value={localBinding.datasetId || ''}
                onChange={(e) =>
                  setLocalBinding({ ...localBinding, datasetId: Number(e.target.value) })
                }
              >
                <option value="">选择数据集</option>
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.kind})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>数据集参数 (JSON)</label>
              <textarea
                value={JSON.stringify(localBinding.datasetParams || {}, null, 2)}
                onChange={(e) => {
                  try {
                    const params = JSON.parse(e.target.value);
                    setLocalBinding({ ...localBinding, datasetParams: params });
                  } catch {
                    // 忽略无效 JSON
                  }
                }}
                rows={6}
                className="code-editor"
                placeholder='{"status": "{{variables.status}}"}'
              />
              <small>支持变量语法: {`{{variables.name}}`}</small>
            </div>
          </>
        )}

        {/* 变量 */}
        {localBinding.type === 'variable' && (
          <div className="form-group">
            <label>变量名称</label>
            <input
              type="text"
              value={localBinding.variableName || ''}
              onChange={(e) => setLocalBinding({ ...localBinding, variableName: e.target.value })}
              placeholder="userInfo"
            />
            <small>从上下文中读取变量值</small>
          </div>
        )}

        {/* 表达式 */}
        {localBinding.type === 'expression' && (
          <div className="form-group">
            <label>JavaScript 表达式</label>
            <textarea
              value={localBinding.expression || ''}
              onChange={(e) => setLocalBinding({ ...localBinding, expression: e.target.value })}
              rows={4}
              className="code-editor"
              placeholder="variables.users.filter(u => u.status === 'active')"
            />
            <small>返回计算结果的 JavaScript 表达式</small>
          </div>
        )}

        {/* 数据转换 */}
        <div className="form-group">
          <label>数据转换 (可选)</label>
          <textarea
            value={localBinding.transform || ''}
            onChange={(e) => setLocalBinding({ ...localBinding, transform: e.target.value })}
            rows={6}
            className="code-editor"
            placeholder={`// 返回转换后的数据
return data.map(item => ({
  label: item.name,
  value: item.id
}));`}
          />
          <small>转换函数，接收 data 和 context 参数</small>
        </div>

        {/* 刷新配置 */}
        <div className="form-section">
          <h4>刷新配置</h4>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={localBinding.autoRefresh || false}
                onChange={(e) =>
                  setLocalBinding({ ...localBinding, autoRefresh: e.target.checked })
                }
              />
              &nbsp;自动刷新
            </label>
          </div>

          {localBinding.autoRefresh && (
            <div className="form-group">
              <label>刷新间隔（秒）</label>
              <input
                type="number"
                value={localBinding.refreshInterval || 30}
                onChange={(e) =>
                  setLocalBinding({ ...localBinding, refreshInterval: Number(e.target.value) })
                }
                min={5}
                max={3600}
              />
            </div>
          )}
        </div>

        {/* 缓存配置 */}
        <div className="form-section">
          <h4>缓存配置</h4>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={localBinding.cache || false}
                onChange={(e) => setLocalBinding({ ...localBinding, cache: e.target.checked })}
              />
              &nbsp;启用缓存
            </label>
          </div>

          {localBinding.cache && (
            <div className="form-group">
              <label>缓存时长（秒）</label>
              <input
                type="number"
                value={localBinding.cacheDuration || 60}
                onChange={(e) =>
                  setLocalBinding({ ...localBinding, cacheDuration: Number(e.target.value) })
                }
                min={10}
                max={3600}
              />
            </div>
          )}
        </div>
      </div>

      <div className="editor-footer">
        <button onClick={onClose} className="btn-secondary">
          取消
        </button>
        <button onClick={handleSubmit} className="btn-primary">
          确定
        </button>
      </div>
    </div>
  );
};
