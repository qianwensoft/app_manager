/**
 * 数据预览组件
 */

import React, { useState } from 'react';
import { useDynamicData } from './useDataBinding';
import type { DataBinding } from './types';
import './DataPreview.css';

interface DataPreviewProps {
  binding: DataBinding;
  maxHeight?: number;
}

export const DataPreview: React.FC<DataPreviewProps> = ({ binding, maxHeight = 400 }) => {
  const { data, loading, error, refresh } = useDynamicData(binding);
  const [viewMode, setViewMode] = useState<'json' | 'table'>('json');

  const renderJSON = () => {
    if (!data) return null;

    return (
      <pre className="preview-json" style={{ maxHeight }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  const renderTable = () => {
    if (!data) return null;

    // 如果是数组，渲染表格
    if (Array.isArray(data) && data.length > 0) {
      const keys = Object.keys(data[0]);

      return (
        <div className="preview-table-container" style={{ maxHeight }}>
          <table className="preview-table">
            <thead>
              <tr>
                {keys.map((key) => (
                  <th key={key}>{key}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={index}>
                  {keys.map((key) => (
                    <td key={key}>{JSON.stringify(row[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // 如果是对象，渲染键值对
    if (typeof data === 'object') {
      return (
        <div className="preview-table-container" style={{ maxHeight }}>
          <table className="preview-table">
            <thead>
              <tr>
                <th>键</th>
                <th>值</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data).map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{JSON.stringify(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return <div className="preview-value">{String(data)}</div>;
  };

  return (
    <div className="data-preview">
      <div className="preview-header">
        <div className="preview-tabs">
          <button
            className={`tab ${viewMode === 'json' ? 'active' : ''}`}
            onClick={() => setViewMode('json')}
          >
            JSON
          </button>
          <button
            className={`tab ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
          >
            表格
          </button>
        </div>
        <button onClick={refresh} disabled={loading} className="btn-refresh">
          {loading ? '⏳' : '🔄'} 刷新
        </button>
      </div>

      <div className="preview-body">
        {loading && <div className="preview-loading">加载中...</div>}

        {error && (
          <div className="preview-error">
            <strong>错误:</strong> {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {viewMode === 'json' && renderJSON()}
            {viewMode === 'table' && renderTable()}
          </>
        )}

        {!loading && !error && !data && (
          <div className="preview-empty">暂无数据</div>
        )}
      </div>

      {!loading && !error && data && (
        <div className="preview-footer">
          {Array.isArray(data) && <span>共 {data.length} 条记录</span>}
          {typeof data === 'object' && !Array.isArray(data) && (
            <span>共 {Object.keys(data).length} 个字段</span>
          )}
        </div>
      )}
    </div>
  );
};
