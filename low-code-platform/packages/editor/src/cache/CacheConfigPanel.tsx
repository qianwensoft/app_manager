/**
 * 缓存配置面板
 */

import React from 'react';
import { useCacheConfig } from './useCacheQuery';
import type { CacheConfig } from './types';
import './CacheConfigPanel.css';

interface CacheConfigPanelProps {
  onClose?: () => void;
}

export const CacheConfigPanel: React.FC<CacheConfigPanelProps> = ({ onClose }) => {
  const { config, updateConfig } = useCacheConfig();

  const handleUpdate = (updates: Partial<CacheConfig>) => {
    updateConfig(updates);
  };

  return (
    <div className="cache-config-panel">
      <div className="panel-header">
        <h3>缓存配置</h3>
        {onClose && (
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      <div className="panel-body">
        <div className="config-section">
          <h4>基础设置</h4>

          <div className="config-item">
            <label>最大缓存条目数</label>
            <input
              type="number"
              value={config.maxEntries}
              onChange={(e) =>
                handleUpdate({ maxEntries: parseInt(e.target.value) || 100 })
              }
              min={10}
              max={1000}
            />
            <span className="hint">条目数达到上限后将自动淘汰</span>
          </div>

          <div className="config-item">
            <label>默认 TTL（秒）</label>
            <input
              type="number"
              value={config.defaultTTL / 1000}
              onChange={(e) =>
                handleUpdate({ defaultTTL: (parseInt(e.target.value) || 300) * 1000 })
              }
              min={1}
              max={3600}
            />
            <span className="hint">缓存默认有效期（0 表示永久）</span>
          </div>

          <div className="config-item">
            <label>最大缓存大小（MB）</label>
            <input
              type="number"
              value={config.maxSize / (1024 * 1024)}
              onChange={(e) =>
                handleUpdate({
                  maxSize: (parseInt(e.target.value) || 10) * 1024 * 1024,
                })
              }
              min={1}
              max={100}
            />
            <span className="hint">缓存总大小上限</span>
          </div>
        </div>

        <div className="config-section">
          <h4>淘汰策略</h4>

          <div className="config-item">
            <label>策略类型</label>
            <select
              value={config.evictionPolicy}
              onChange={(e) =>
                handleUpdate({
                  evictionPolicy: e.target.value as 'lru' | 'lfu' | 'fifo',
                })
              }
            >
              <option value="lru">LRU（最近最少使用）</option>
              <option value="lfu">LFU（最不经常使用）</option>
              <option value="fifo">FIFO（先进先出）</option>
            </select>
            <span className="hint">
              {config.evictionPolicy === 'lru' && '淘汰最久未访问的条目'}
              {config.evictionPolicy === 'lfu' && '淘汰访问次数最少的条目'}
              {config.evictionPolicy === 'fifo' && '淘汰最早创建的条目'}
            </span>
          </div>
        </div>

        <div className="config-section">
          <h4>离线缓存</h4>

          <div className="config-item">
            <label>
              <input
                type="checkbox"
                checked={config.enableOfflineCache}
                onChange={(e) =>
                  handleUpdate({ enableOfflineCache: e.target.checked })
                }
              />
              启用离线缓存
            </label>
            <span className="hint">将缓存持久化到 localStorage</span>
          </div>
        </div>

        <div className="config-section">
          <h4>自动清理</h4>

          <div className="config-item">
            <label>
              <input
                type="checkbox"
                checked={config.autoCleanup}
                onChange={(e) => handleUpdate({ autoCleanup: e.target.checked })}
              />
              启用自动清理
            </label>
            <span className="hint">自动清理过期的缓存条目</span>
          </div>

          {config.autoCleanup && (
            <div className="config-item">
              <label>清理间隔（秒）</label>
              <input
                type="number"
                value={config.cleanupInterval / 1000}
                onChange={(e) =>
                  handleUpdate({
                    cleanupInterval: (parseInt(e.target.value) || 60) * 1000,
                  })
                }
                min={10}
                max={600}
              />
              <span className="hint">自动清理的执行间隔</span>
            </div>
          )}
        </div>
      </div>

      <div className="panel-footer">
        <div className="info-box">
          <p>💡 配置更改会立即生效</p>
          <p>⚠️ 修改淘汰策略或大小限制可能触发缓存清理</p>
        </div>
      </div>
    </div>
  );
};
