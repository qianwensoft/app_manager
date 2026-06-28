/**
 * Phase 5.4: 版本管理界面
 *
 * 功能：
 * - 版本列表展示（时间线视图）
 * - 创建新版本
 * - 版本详情查看
 * - 版本对比
 * - 版本回滚
 * - 版本标签管理
 * - 变更日志编辑
 * - 版本导出
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { versionApi } from '../publish/versionApi';
import { appApi } from '../publish/appApi';
import type { AppVersion, App, VersionComparison } from '../publish/types';
import './VersionManagementPage.css';

export const VersionManagementPage: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<App | null>(null);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<AppVersion | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareVersions, setCompareVersions] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [filterTag, setFilterTag] = useState<string>('');
  const [allTags, setAllTags] = useState<string[]>([]);

  // 新版本表单
  const [newVersion, setNewVersion] = useState({
    version: '',
    changelog: '',
    tags: [] as string[],
  });

  useEffect(() => {
    if (appId) {
      loadData();
    }
  }, [appId]);

  const loadData = async () => {
    if (!appId) return;

    setLoading(true);
    try {
      const [appData, versionsData, tagsData] = await Promise.all([
        appApi.get(parseInt(appId)),
        versionApi.list(parseInt(appId), { sortBy: 'createdAt', sortOrder: 'desc' }),
        versionApi.getAllTags(parseInt(appId)),
      ]);

      setApp(appData);
      setVersions(versionsData.items);
      setAllTags(tagsData);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('加载数据失败：' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!appId || !newVersion.version) {
      alert('请填写版本号');
      return;
    }

    // 验证版本号格式（semver）
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    if (!semverRegex.test(newVersion.version)) {
      alert('版本号格式不正确，应符合 semver 格式（例如：1.0.0）');
      return;
    }

    try {
      await versionApi.create(parseInt(appId), newVersion);
      alert('版本创建成功');
      setShowCreateModal(false);
      setNewVersion({ version: '', changelog: '', tags: [] });
      loadData();
    } catch (error) {
      console.error('Failed to create version:', error);
      alert('创建版本失败：' + (error as Error).message);
    }
  };

  const handleRollback = async (version: AppVersion) => {
    if (!appId) return;

    if (!confirm(`确定要回滚到版本 ${version.version} 吗？这将创建一个新版本。`)) {
      return;
    }

    try {
      await versionApi.rollback(parseInt(appId), version.id);
      alert('回滚成功');
      loadData();
    } catch (error) {
      console.error('Failed to rollback:', error);
      alert('回滚失败：' + (error as Error).message);
    }
  };

  const handleCompare = async () => {
    if (!appId || !compareVersions.from || !compareVersions.to) {
      alert('请选择要对比的两个版本');
      return;
    }

    try {
      const result = await versionApi.compare(
        parseInt(appId),
        compareVersions.from,
        compareVersions.to
      );
      setComparison(result);
    } catch (error) {
      console.error('Failed to compare versions:', error);
      alert('对比失败：' + (error as Error).message);
    }
  };

  const handleExport = async (version: AppVersion) => {
    if (!appId) return;

    try {
      const blob = await versionApi.exportSnapshot(parseInt(appId), version.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${app?.code}-${version.version}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export version:', error);
      alert('导出失败：' + (error as Error).message);
    }
  };

  const handleUpdateTags = async (version: AppVersion, tags: string[]) => {
    if (!appId) return;

    try {
      await versionApi.updateTags(parseInt(appId), version.id, tags);
      alert('标签更新成功');
      loadData();
    } catch (error) {
      console.error('Failed to update tags:', error);
      alert('更新标签失败：' + (error as Error).message);
    }
  };

  const handleUpdateChangelog = async (version: AppVersion, changelog: string) => {
    if (!appId) return;

    try {
      await versionApi.updateChangelog(parseInt(appId), version.id, changelog);
      alert('变更日志更新成功');
      loadData();
    } catch (error) {
      console.error('Failed to update changelog:', error);
      alert('更新变更日志失败：' + (error as Error).message);
    }
  };

  const filteredVersions = filterTag
    ? versions.filter((v) => v.tags?.includes(filterTag))
    : versions;

  const suggestNextVersion = () => {
    if (versions.length === 0) return '1.0.0';

    const latest = versions[0].version;
    const parts = latest.split(/[.-]/);
    const [major, minor, patch] = parts.map((p) => parseInt(p) || 0);

    return `${major}.${minor}.${patch + 1}`;
  };

  if (loading) {
    return <div className="version-management-page loading">加载中...</div>;
  }

  if (!app) {
    return <div className="version-management-page error">应用不存在</div>;
  }

  return (
    <div className="version-management-page">
      {/* 头部 */}
      <header className="page-header">
        <div className="header-left">
          <button className="back-button" onClick={() => navigate('/apps')}>
            ← 返回
          </button>
          <div className="header-info">
            <h1>{app.name} - 版本管理</h1>
            <p className="app-code">{app.code}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowCompareModal(true)}>
            对比版本
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + 创建版本
          </button>
        </div>
      </header>

      {/* 统计信息 */}
      <div className="stats-bar">
        <div className="stat-item">
          <span className="stat-label">总版本数</span>
          <span className="stat-value">{versions.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">当前版本</span>
          <span className="stat-value">{app.version}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">最后更新</span>
          <span className="stat-value">
            {versions[0] ? new Date(versions[0].createdAt).toLocaleDateString() : '-'}
          </span>
        </div>
      </div>

      {/* 过滤器 */}
      {allTags.length > 0 && (
        <div className="filter-bar">
          <span className="filter-label">标签过滤：</span>
          <button
            className={`filter-tag ${!filterTag ? 'active' : ''}`}
            onClick={() => setFilterTag('')}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              className={`filter-tag ${filterTag === tag ? 'active' : ''}`}
              onClick={() => setFilterTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 版本时间线 */}
      <div className="version-timeline">
        {filteredVersions.length === 0 ? (
          <div className="empty-state">
            <p>暂无版本记录</p>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
              创建第一个版本
            </button>
          </div>
        ) : (
          filteredVersions.map((version, index) => (
            <VersionCard
              key={version.id}
              version={version}
              isLatest={index === 0}
              isCurrent={version.version === app.version}
              onRollback={() => handleRollback(version)}
              onExport={() => handleExport(version)}
              onUpdateTags={(tags) => handleUpdateTags(version, tags)}
              onUpdateChangelog={(changelog) => handleUpdateChangelog(version, changelog)}
              onViewDetails={() => setSelectedVersion(version)}
            />
          ))
        )}
      </div>

      {/* 创建版本模态框 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>创建新版本</h2>
              <button className="close-button" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>版本号 *</label>
                <div className="version-input-group">
                  <input
                    type="text"
                    value={newVersion.version}
                    onChange={(e) => setNewVersion({ ...newVersion, version: e.target.value })}
                    placeholder="例如：1.0.0"
                  />
                  <button
                    className="btn btn-small"
                    onClick={() => setNewVersion({ ...newVersion, version: suggestNextVersion() })}
                  >
                    建议：{suggestNextVersion()}
                  </button>
                </div>
                <small>请使用语义化版本号（Semantic Versioning）格式</small>
              </div>

              <div className="form-group">
                <label>变更日志</label>
                <textarea
                  value={newVersion.changelog}
                  onChange={(e) => setNewVersion({ ...newVersion, changelog: e.target.value })}
                  placeholder="描述本次版本的主要变更..."
                  rows={6}
                />
              </div>

              <div className="form-group">
                <label>标签</label>
                <input
                  type="text"
                  value={newVersion.tags.join(', ')}
                  onChange={(e) =>
                    setNewVersion({
                      ...newVersion,
                      tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
                    })
                  }
                  placeholder="例如：stable, production（用逗号分隔）"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreateVersion}>
                创建版本
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 版本对比模态框 */}
      {showCompareModal && (
        <div className="modal-overlay" onClick={() => setShowCompareModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>版本对比</h2>
              <button className="close-button" onClick={() => setShowCompareModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="compare-selectors">
                <div className="form-group">
                  <label>从版本</label>
                  <select
                    value={compareVersions.from}
                    onChange={(e) =>
                      setCompareVersions({ ...compareVersions, from: e.target.value })
                    }
                  >
                    <option value="">请选择...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.version}>
                        {v.version}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="compare-arrow">→</div>
                <div className="form-group">
                  <label>到版本</label>
                  <select
                    value={compareVersions.to}
                    onChange={(e) =>
                      setCompareVersions({ ...compareVersions, to: e.target.value })
                    }
                  >
                    <option value="">请选择...</option>
                    {versions.map((v) => (
                      <option key={v.id} value={v.version}>
                        {v.version}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn btn-primary" onClick={handleCompare}>
                  对比
                </button>
              </div>

              {comparison && (
                <div className="comparison-result">
                  <h3>变更记录（{comparison.changes.length} 项）</h3>
                  <div className="changes-list">
                    {comparison.changes.map((change, index) => (
                      <div key={index} className={`change-item change-${change.type}`}>
                        <div className="change-header">
                          <span className="change-type">{getChangeTypeLabel(change.type)}</span>
                          <span className="change-category">{change.category}</span>
                          <span className="change-path">{change.path}</span>
                        </div>
                        {change.type === 'modified' && (
                          <div className="change-details">
                            <div className="old-value">
                              <strong>旧值：</strong>
                              <code>{JSON.stringify(change.oldValue, null, 2)}</code>
                            </div>
                            <div className="new-value">
                              <strong>新值：</strong>
                              <code>{JSON.stringify(change.newValue, null, 2)}</code>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 版本详情模态框 */}
      {selectedVersion && (
        <div className="modal-overlay" onClick={() => setSelectedVersion(null)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>版本详情 - {selectedVersion.version}</h2>
              <button className="close-button" onClick={() => setSelectedVersion(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <VersionDetails version={selectedVersion} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// 版本卡片组件
interface VersionCardProps {
  version: AppVersion;
  isLatest: boolean;
  isCurrent: boolean;
  onRollback: () => void;
  onExport: () => void;
  onUpdateTags: (tags: string[]) => void;
  onUpdateChangelog: (changelog: string) => void;
  onViewDetails: () => void;
}

const VersionCard: React.FC<VersionCardProps> = ({
  version,
  isLatest,
  isCurrent,
  onRollback,
  onExport,
  onUpdateTags,
  onUpdateChangelog,
  onViewDetails,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editChangelog, setEditChangelog] = useState(version.changelog || '');
  const [editTags, setEditTags] = useState((version.tags || []).join(', '));

  const handleSave = () => {
    onUpdateChangelog(editChangelog);
    onUpdateTags(editTags.split(',').map((t) => t.trim()).filter(Boolean));
    setIsEditing(false);
  };

  return (
    <div className={`version-card ${isLatest ? 'latest' : ''} ${isCurrent ? 'current' : ''}`}>
      <div className="version-marker"></div>
      <div className="version-content">
        <div className="version-header">
          <div className="version-info">
            <h3 className="version-number">{version.version}</h3>
            <div className="version-badges">
              {isLatest && <span className="badge badge-success">最新</span>}
              {isCurrent && <span className="badge badge-primary">当前</span>}
              {version.tags?.map((tag) => (
                <span key={tag} className="badge badge-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <div className="version-meta">
            <span className="version-author">{version.createdBy}</span>
            <span className="version-date">
              {new Date(version.createdAt).toLocaleString()}
            </span>
          </div>
        </div>

        {isEditing ? (
          <div className="version-edit">
            <div className="form-group">
              <label>变更日志</label>
              <textarea
                value={editChangelog}
                onChange={(e) => setEditChangelog(e.target.value)}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label>标签</label>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="用逗号分隔"
              />
            </div>
            <div className="edit-actions">
              <button className="btn btn-small btn-secondary" onClick={() => setIsEditing(false)}>
                取消
              </button>
              <button className="btn btn-small btn-primary" onClick={handleSave}>
                保存
              </button>
            </div>
          </div>
        ) : (
          <>
            {version.changelog && (
              <div className="version-changelog">
                <pre>{version.changelog}</pre>
              </div>
            )}

            <div className="version-actions">
              <button className="btn btn-small" onClick={onViewDetails}>
                查看详情
              </button>
              <button className="btn btn-small" onClick={() => setIsEditing(true)}>
                编辑
              </button>
              <button className="btn btn-small" onClick={onExport}>
                导出
              </button>
              {!isCurrent && (
                <button className="btn btn-small btn-warning" onClick={onRollback}>
                  回滚到此版本
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 版本详情组件
interface VersionDetailsProps {
  version: AppVersion;
}

const VersionDetails: React.FC<VersionDetailsProps> = ({ version }) => {
  const snapshot = version.snapshot;

  return (
    <div className="version-details">
      <div className="detail-section">
        <h4>基本信息</h4>
        <table className="detail-table">
          <tbody>
            <tr>
              <td>版本号</td>
              <td>{version.version}</td>
            </tr>
            <tr>
              <td>创建者</td>
              <td>{version.createdBy}</td>
            </tr>
            <tr>
              <td>创建时间</td>
              <td>{new Date(version.createdAt).toLocaleString()}</td>
            </tr>
            {version.tags && version.tags.length > 0 && (
              <tr>
                <td>标签</td>
                <td>{version.tags.join(', ')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {version.changelog && (
        <div className="detail-section">
          <h4>变更日志</h4>
          <pre className="changelog-content">{version.changelog}</pre>
        </div>
      )}

      <div className="detail-section">
        <h4>快照内容</h4>
        <div className="snapshot-stats">
          <div className="snapshot-stat">
            <span className="stat-label">页面</span>
            <span className="stat-value">{snapshot.pages?.length || 0}</span>
          </div>
          <div className="snapshot-stat">
            <span className="stat-label">工作流</span>
            <span className="stat-value">{snapshot.workflows?.length || 0}</span>
          </div>
          <div className="snapshot-stat">
            <span className="stat-label">数据源</span>
            <span className="stat-value">{snapshot.dataSources?.length || 0}</span>
          </div>
          <div className="snapshot-stat">
            <span className="stat-label">数据集</span>
            <span className="stat-value">{snapshot.datasets?.length || 0}</span>
          </div>
          <div className="snapshot-stat">
            <span className="stat-label">数据接口</span>
            <span className="stat-value">{snapshot.dataInterfaces?.length || 0}</span>
          </div>
        </div>
      </div>

      {snapshot.metadata && (
        <div className="detail-section">
          <h4>元数据</h4>
          <table className="detail-table">
            <tbody>
              <tr>
                <td>快照时间</td>
                <td>{new Date(snapshot.metadata.snapshotAt).toLocaleString()}</td>
              </tr>
              <tr>
                <td>平台</td>
                <td>{snapshot.metadata.platform}</td>
              </tr>
              <tr>
                <td>编辑器版本</td>
                <td>{snapshot.metadata.editorVersion}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// 辅助函数
function getChangeTypeLabel(type: 'added' | 'removed' | 'modified'): string {
  switch (type) {
    case 'added':
      return '新增';
    case 'removed':
      return '删除';
    case 'modified':
      return '修改';
    default:
      return type;
  }
}

export default VersionManagementPage;
