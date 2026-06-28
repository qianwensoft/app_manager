/**
 * 缓存管理页面
 */

import React, { useState } from 'react';
import {
  useCacheStats,
  useCacheEntries,
  useCacheInvalidation,
} from '../cache/useCacheQuery';
import { CacheConfigPanel } from '../cache/CacheConfigPanel';
import './CacheManagementPage.css';

export const CacheManagementPage: React.FC = () => {
  const { stats, refresh: refreshStats, reset: resetStats } = useCacheStats();
  const { entries, refresh: refreshEntries } = useCacheEntries();
  const {
    invalidateKey,
    invalidateByTags,
    invalidateByPrefix,
    clearAll,
  } = useCacheInvalidation();

  const [showConfig, setShowConfig] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');

  // 格式化大小
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 格式化时间
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  // 格式化相对时间
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} 天前`;
    if (hours > 0) return `${hours} 小时前`;
    if (minutes > 0) return `${minutes} 分钟前`;
    return `${seconds} 秒前`;
  };

  // 获取所有标签
  const allTags = Array.from(
    new Set(entries.flatMap((entry) => entry.tags))
  ).sort();

  // 过滤条目
  const filteredEntries = entries.filter((entry) => {
    if (searchQuery && !entry.key.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterTag && !entry.tags.includes(filterTag)) {
      return false;
    }
    return true;
  });

  // 处理删除
  const handleDelete = (key: string) => {
    if (confirm(`确定要删除缓存 "${key}" 吗？`)) {
      invalidateKey(key);
      refreshEntries();
      refreshStats();
    }
  };

  // 处理按标签删除
  const handleDeleteByTag = (tag: string) => {
    if (confirm(`确定要删除所有标签为 "${tag}" 的缓存吗？`)) {
      const count = invalidateByTags([tag]);
      alert(`已删除 ${count} 个缓存条目`);
      refreshEntries();
      refreshStats();
    }
  };

  // 处理按前缀删除
  const handleDeleteByPrefix = () => {
    const prefix = prompt('请输入要删除的缓存键前缀：');
    if (prefix) {
      const count = invalidateByPrefix(prefix);
      alert(`已删除 ${count} 个缓存条目`);
      refreshEntries();
      refreshStats();
    }
  };

  // 处理清空所有
  const handleClearAll = () => {
    if (confirm('确定要清空所有缓存吗？此操作不可撤销！')) {
      clearAll();
      refreshEntries();
      refreshStats();
    }
  };

  // 处理重置统计
  const handleResetStats = () => {
    if (confirm('确定要重置统计信息吗？')) {
      resetStats();
    }
  };

  return (
    <div className="cache-management-page">
      <div className="page-header">
        <h1>缓存管理</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowConfig(!showConfig)}>
            ⚙️ 配置
          </button>
          <button className="btn btn-secondary" onClick={handleDeleteByPrefix}>
            🔍 按前缀删除
          </button>
          <button className="btn btn-danger" onClick={handleClearAll}>
            🗑️ 清空所有
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="config-modal">
          <div className="config-modal-content">
            <CacheConfigPanel onClose={() => setShowConfig(false)} />
          </div>
        </div>
      )}

      {/* 统计信息 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-content">
            <div className="stat-label">缓存条目</div>
            <div className="stat-value">{stats?.totalEntries || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💾</div>
          <div className="stat-content">
            <div className="stat-label">总大小</div>
            <div className="stat-value">{formatSize(stats?.totalSize || 0)}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <div className="stat-label">命中率</div>
            <div className="stat-value">
              {((stats?.hitRate || 0) * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-label">缓存命中</div>
            <div className="stat-value">{stats?.hits || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">❌</div>
          <div className="stat-content">
            <div className="stat-label">缓存未命中</div>
            <div className="stat-value">{stats?.misses || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔄</div>
          <div className="stat-content">
            <div className="stat-label">平均访问</div>
            <div className="stat-value">
              {(stats?.avgAccessCount || 0).toFixed(1)}
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏏️</div>
          <div className="stat-content">
            <div className="stat-label">淘汰次数</div>
            <div className="stat-value">{stats?.evictions || 0}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏰</div>
          <div className="stat-content">
            <div className="stat-label">过期次数</div>
            <div className="stat-value">{stats?.expirations || 0}</div>
          </div>
        </div>
      </div>

      <div className="stats-actions">
        <button className="btn btn-secondary" onClick={handleResetStats}>
          重置统计
        </button>
      </div>

      {/* 过滤器 */}
      <div className="filters">
        <input
          type="text"
          className="search-input"
          placeholder="搜索缓存键..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="tag-filter"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="">所有标签</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        {filterTag && (
          <button
            className="btn btn-sm btn-danger"
            onClick={() => handleDeleteByTag(filterTag)}
          >
            删除该标签的所有缓存
          </button>
        )}
      </div>

      {/* 缓存列表 */}
      <div className="cache-list">
        <div className="list-header">
          <h2>缓存条目 ({filteredEntries.length})</h2>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            <p>暂无缓存条目</p>
          </div>
        ) : (
          <div className="entries-table">
            <table>
              <thead>
                <tr>
                  <th>缓存键</th>
                  <th>大小</th>
                  <th>访问次数</th>
                  <th>创建时间</th>
                  <th>最后访问</th>
                  <th>标签</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry.key}
                    className={selectedEntry === entry.key ? 'selected' : ''}
                    onClick={() => setSelectedEntry(entry.key)}
                  >
                    <td className="key-cell">
                      <code>{entry.key}</code>
                      {entry.persistent && <span className="badge">持久化</span>}
                      {entry.expiresAt && entry.expiresAt < Date.now() + 60000 && (
                        <span className="badge badge-warning">即将过期</span>
                      )}
                    </td>
                    <td>{formatSize(entry.size)}</td>
                    <td>{entry.accessCount}</td>
                    <td title={formatTime(entry.timestamp)}>
                      {formatRelativeTime(entry.timestamp)}
                    </td>
                    <td title={formatTime(entry.lastAccessed)}>
                      {formatRelativeTime(entry.lastAccessed)}
                    </td>
                    <td>
                      {entry.tags.length > 0 ? (
                        <div className="tags">
                          {entry.tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry.key);
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 详情面板 */}
      {selectedEntry && (
        <div className="details-panel">
          <div className="details-header">
            <h3>缓存详情</h3>
            <button
              className="close-btn"
              onClick={() => setSelectedEntry(null)}
            >
              ✕
            </button>
          </div>
          <div className="details-content">
            {(() => {
              const entry = entries.find((e) => e.key === selectedEntry);
              if (!entry) return null;

              return (
                <div className="details-grid">
                  <div className="detail-item">
                    <strong>键：</strong>
                    <code>{entry.key}</code>
                  </div>
                  <div className="detail-item">
                    <strong>大小：</strong>
                    {formatSize(entry.size)}
                  </div>
                  <div className="detail-item">
                    <strong>创建时间：</strong>
                    {formatTime(entry.timestamp)}
                  </div>
                  <div className="detail-item">
                    <strong>最后访问：</strong>
                    {formatTime(entry.lastAccessed)}
                  </div>
                  <div className="detail-item">
                    <strong>访问次数：</strong>
                    {entry.accessCount}
                  </div>
                  {entry.expiresAt && (
                    <div className="detail-item">
                      <strong>过期时间：</strong>
                      {formatTime(entry.expiresAt)}
                    </div>
                  )}
                  <div className="detail-item">
                    <strong>持久化：</strong>
                    {entry.persistent ? '是' : '否'}
                  </div>
                  <div className="detail-item full-width">
                    <strong>标签：</strong>
                    {entry.tags.length > 0 ? (
                      <div className="tags">
                        {entry.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      '无'
                    )}
                  </div>
                  <div className="detail-item full-width">
                    <strong>数据预览：</strong>
                    <pre className="data-preview">
                      {JSON.stringify(entry.data, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
