import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { versionApi } from './versionApi';
import type { AppVersion } from './types';
import './VersionHistoryPage.css';

export function VersionHistoryPage() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || '0');

  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<[number, number] | null>(null);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVersion, setNewVersion] = useState({
    version: '',
    changelog: '',
    tags: [] as string[],
  });

  // 加载版本列表
  useEffect(() => {
    loadVersions();
  }, [appId]);

  const loadVersions = async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const data = await versionApi.listVersions(appId);
      setVersions(data);
    } catch (error) {
      console.error('Failed to load versions:', error);
    } finally {
      setLoading(false);
    }
  };

  // 创建版本
  const handleCreateVersion = async () => {
    if (!appId || !newVersion.version) return;

    try {
      await versionApi.createVersion(appId, {
        version: newVersion.version,
        changelog: newVersion.changelog,
        tags: newVersion.tags,
      });

      setShowCreateModal(false);
      setNewVersion({ version: '', changelog: '', tags: [] });
      loadVersions();
    } catch (error) {
      console.error('Failed to create version:', error);
      alert('创建版本失败');
    }
  };

  // 删除版本
  const handleDeleteVersion = async (versionId: number) => {
    if (!confirm('确定要删除这个版本吗？')) return;

    try {
      await versionApi.deleteVersion(appId, versionId);
      loadVersions();
    } catch (error) {
      console.error('Failed to delete version:', error);
      alert('删除版本失败');
    }
  };

  // 回滚到某个版本
  const handleRollback = async (versionId: number) => {
    if (!confirm('确定要回滚到这个版本吗？这将覆盖当前配置。')) return;

    try {
      await versionApi.rollbackToVersion(appId, versionId);
      alert('回滚成功！');
      loadVersions();
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('回滚失败');
    }
  };

  // 比较版本
  const handleCompare = async () => {
    if (!selectedVersions || selectedVersions.length !== 2) return;

    try {
      const result = await versionApi.compareVersions(
        appId,
        selectedVersions[0],
        selectedVersions[1]
      );
      setCompareResult(result);
    } catch (error) {
      console.error('Failed to compare versions:', error);
      alert('比较版本失败');
    }
  };

  // 切换版本选择
  const toggleVersionSelection = (versionId: number) => {
    if (!selectedVersions) {
      setSelectedVersions([versionId, versionId]);
    } else if (selectedVersions.includes(versionId)) {
      const newSelection = selectedVersions.filter(id => id !== versionId);
      setSelectedVersions(newSelection.length === 2 ? [newSelection[0], newSelection[0]] : null);
    } else if (selectedVersions.length < 2) {
      setSelectedVersions([...selectedVersions, versionId] as [number, number]);
    }
  };

  if (loading) {
    return (
      <div className="version-history-page">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="version-history-page">
      <div className="page-header">
        <h1>版本历史</h1>
        <div className="header-actions">
          <button
            className="btn-compare"
            onClick={handleCompare}
            disabled={!selectedVersions || selectedVersions.length !== 2}
          >
            比较版本
          </button>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            创建版本
          </button>
        </div>
      </div>

      {/* 版本列表 */}
      <div className="version-timeline">
        {versions.map((version, index) => (
          <div
            key={version.id}
            className={`version-item ${
              selectedVersions?.includes(version.id) ? 'selected' : ''
            }`}
          >
            <div className="version-marker">
              <input
                type="checkbox"
                checked={selectedVersions?.includes(version.id) || false}
                onChange={() => toggleVersionSelection(version.id)}
              />
            </div>

            <div className="version-content">
              <div className="version-header">
                <h3>v{version.version}</h3>
                {version.tags && version.tags.length > 0 && (
                  <div className="version-tags">
                    {version.tags.map((tag, i) => (
                      <span key={i} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {index === 0 && <span className="badge-current">当前版本</span>}
              </div>

              {version.changelog && (
                <div className="version-changelog">{version.changelog}</div>
              )}

              <div className="version-meta">
                <span>创建时间: {new Date(version.createdAt).toLocaleString()}</span>
                {version.buildId && <span>构建 ID: #{version.buildId}</span>}
              </div>

              <div className="version-actions">
                {index !== 0 && (
                  <button
                    className="btn-rollback"
                    onClick={() => handleRollback(version.id)}
                  >
                    回滚
                  </button>
                )}
                <button
                  className="btn-danger"
                  onClick={() => handleDeleteVersion(version.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}

        {versions.length === 0 && (
          <div className="empty-state">
            <p>暂无版本历史</p>
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              创建第一个版本
            </button>
          </div>
        )}
      </div>

      {/* 创建版本弹窗 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>创建新版本</h2>

            <div className="form-group">
              <label>版本号 (Semver)</label>
              <input
                type="text"
                placeholder="例如: 1.0.0"
                value={newVersion.version}
                onChange={(e) =>
                  setNewVersion({ ...newVersion, version: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>变更日志</label>
              <textarea
                placeholder="描述本次版本的变更内容..."
                rows={5}
                value={newVersion.changelog}
                onChange={(e) =>
                  setNewVersion({ ...newVersion, changelog: e.target.value })
                }
              />
            </div>

            <div className="form-group">
              <label>标签 (用逗号分隔)</label>
              <input
                type="text"
                placeholder="例如: stable, hotfix"
                value={newVersion.tags.join(', ')}
                onChange={(e) =>
                  setNewVersion({
                    ...newVersion,
                    tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                  })
                }
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateVersion}
                disabled={!newVersion.version}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 版本比较结果 */}
      {compareResult && (
        <div className="modal-overlay" onClick={() => setCompareResult(null)}>
          <div className="modal-content compare-modal" onClick={(e) => e.stopPropagation()}>
            <h2>版本比较结果</h2>

            <div className="compare-result">
              <pre>{JSON.stringify(compareResult, null, 2)}</pre>
            </div>

            <div className="modal-actions">
              <button className="btn-primary" onClick={() => setCompareResult(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
