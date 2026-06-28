/**
 * Phase 4.6 完善 - 数据绑定缓存集成演示页面
 *
 * 展示如何在数据绑定中使用缓存系统
 */

import React, { useState } from 'react';
import {
  useDataBindingCache,
  useDataBindingCacheStats,
  useDataBindingCacheInvalidation,
  useDataBindingCacheConfig,
} from '../bindings/useDataBindingCache';
import type { DataBinding } from '../bindings/types';
import './DataBindingCacheDemo.css';

export const DataBindingCacheDemo: React.FC = () => {
  const [interfaceSlug, setInterfaceSlug] = useState('users-list');
  const [datasetId, setDatasetId] = useState(1);

  // 缓存统计
  const { stats, refresh: refreshStats } = useDataBindingCacheStats();

  // 缓存失效操作
  const {
    invalidateByInterface,
    invalidateByInterfaceId,
    invalidateByDataset,
    invalidateByType,
    clearAll,
  } = useDataBindingCacheInvalidation();

  // 缓存配置
  const { config, updateConfig } = useDataBindingCacheConfig();

  // 示例 1: 接口绑定 + 缓存
  const interfaceBinding: DataBinding = {
    type: 'interface',
    interfaceSlug,
    params: {},
    cache: true,
    cacheDuration: 60,
  };

  const {
    data: interfaceData,
    isLoading: interfaceLoading,
    error: interfaceError,
    isCached: interfaceCached,
    refetch: refetchInterface,
    invalidate: invalidateInterface,
  } = useDataBindingCache(
    interfaceBinding,
    async () => {
      // 模拟 API 调用
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' },
          { id: 3, name: 'Charlie', email: 'charlie@example.com' },
        ],
        total: 3,
        timestamp: new Date().toISOString(),
      };
    },
    {
      ttl: 60000, // 60 秒
      tags: ['users', 'interface'],
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    }
  );

  // 示例 2: 数据集绑定 + 缓存
  const datasetBinding: DataBinding = {
    type: 'dataset',
    datasetId,
    datasetParams: {},
    cache: true,
    cacheDuration: 30,
  };

  const {
    data: datasetData,
    isLoading: datasetLoading,
    isCached: datasetCached,
    refetch: refetchDataset,
  } = useDataBindingCache(
    datasetBinding,
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        records: Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Record ${i + 1}`,
          value: Math.random() * 100,
        })),
        timestamp: new Date().toISOString(),
      };
    },
    {
      ttl: 30000, // 30 秒
      tags: ['dataset'],
    }
  );

  return (
    <div className="data-binding-cache-demo">
      <header className="demo-header">
        <h1>📦 数据绑定缓存集成演示</h1>
        <p>展示 Phase 4.6 缓存系统与数据绑定的集成</p>
      </header>

      <div className="demo-content">
        {/* 缓存统计 */}
        <section className="demo-section">
          <div className="section-header">
            <h2>📊 缓存统计</h2>
            <button onClick={refreshStats} className="btn-refresh">
              🔄 刷新
            </button>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">缓存条目</div>
              <div className="stat-value">{stats.totalEntries}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">命中次数</div>
              <div className="stat-value">{stats.hits}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">未命中次数</div>
              <div className="stat-value">{stats.misses}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">命中率</div>
              <div className="stat-value">
                {(stats.hitRate * 100).toFixed(1)}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">缓存大小</div>
              <div className="stat-value">
                {(stats.totalSize / 1024).toFixed(2)} KB
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">淘汰次数</div>
              <div className="stat-value">{stats.evictions}</div>
            </div>
          </div>
        </section>

        {/* 缓存配置 */}
        <section className="demo-section">
          <h2>⚙️ 缓存配置</h2>

          <div className="config-form">
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableQueryCache}
                  onChange={(e) =>
                    updateConfig({ enableQueryCache: e.target.checked })
                  }
                />
                启用查询缓存
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={config.enableBackgroundRefetch}
                  onChange={(e) =>
                    updateConfig({ enableBackgroundRefetch: e.target.checked })
                  }
                />
                启用后台重新获取
              </label>
            </div>

            <div className="form-group">
              <label>
                过期时间 (毫秒):
                <input
                  type="number"
                  value={config.staleTime || 30000}
                  onChange={(e) =>
                    updateConfig({ staleTime: parseInt(e.target.value) })
                  }
                />
              </label>
            </div>

            <div className="form-group">
              <label>
                缓存时间 (毫秒):
                <input
                  type="number"
                  value={config.cacheTime || 300000}
                  onChange={(e) =>
                    updateConfig({ cacheTime: parseInt(e.target.value) })
                  }
                />
              </label>
            </div>
          </div>
        </section>

        {/* 示例 1: 接口绑定 */}
        <section className="demo-section">
          <h2>🔗 示例 1: 接口绑定 + 缓存</h2>

          <div className="example-controls">
            <input
              type="text"
              value={interfaceSlug}
              onChange={(e) => setInterfaceSlug(e.target.value)}
              placeholder="接口 slug"
            />
            <button onClick={() => refetchInterface()} disabled={interfaceLoading}>
              {interfaceLoading ? '加载中...' : '重新获取'}
            </button>
            <button onClick={invalidateInterface}>
              失效缓存
            </button>
            <button onClick={() => invalidateByInterface(interfaceSlug)}>
              按接口失效
            </button>
          </div>

          {interfaceCached && (
            <div className="cache-badge">✅ 从缓存加载</div>
          )}

          {interfaceError && (
            <div className="error-message">❌ {interfaceError.message}</div>
          )}

          {interfaceData && (
            <div className="data-display">
              <h3>用户列表 (共 {interfaceData.total} 个)</h3>
              <ul className="user-list">
                {interfaceData.users.map((user: any) => (
                  <li key={user.id}>
                    <strong>{user.name}</strong> - {user.email}
                  </li>
                ))}
              </ul>
              <div className="timestamp">
                时间戳: {interfaceData.timestamp}
              </div>
            </div>
          )}
        </section>

        {/* 示例 2: 数据集绑定 */}
        <section className="demo-section">
          <h2>📊 示例 2: 数据集绑定 + 缓存</h2>

          <div className="example-controls">
            <input
              type="number"
              value={datasetId}
              onChange={(e) => setDatasetId(parseInt(e.target.value))}
              placeholder="数据集 ID"
            />
            <button onClick={() => refetchDataset()} disabled={datasetLoading}>
              {datasetLoading ? '加载中...' : '重新获取'}
            </button>
            <button onClick={() => invalidateByDataset(datasetId)}>
              按数据集失效
            </button>
          </div>

          {datasetCached && (
            <div className="cache-badge">✅ 从缓存加载</div>
          )}

          {datasetData && (
            <div className="data-display">
              <h3>数据集记录</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>名称</th>
                    <th>值</th>
                  </tr>
                </thead>
                <tbody>
                  {datasetData.records.map((record: any) => (
                    <tr key={record.id}>
                      <td>{record.id}</td>
                      <td>{record.name}</td>
                      <td>{record.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="timestamp">
                时间戳: {datasetData.timestamp}
              </div>
            </div>
          )}
        </section>

        {/* 缓存操作 */}
        <section className="demo-section">
          <h2>🛠️ 缓存操作</h2>

          <div className="cache-actions">
            <button onClick={() => invalidateByType('interface')}>
              失效所有接口缓存
            </button>
            <button onClick={() => invalidateByType('dataset')}>
              失效所有数据集缓存
            </button>
            <button onClick={clearAll} className="btn-danger">
              清空所有缓存
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DataBindingCacheDemo;
