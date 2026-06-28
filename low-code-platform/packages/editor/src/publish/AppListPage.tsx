/**
 * Phase 5: 应用发布 - 应用列表页
 *
 * 显示所有应用，提供搜索、筛选、创建、编辑等功能
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from './appStore';
import AppForm from './AppForm';
import type { App, CreateAppRequest, UpdateAppRequest } from './types';
import './AppListPage.css';

export const AppListPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    apps,
    loading,
    error,
    pagination,
    filters,
    fetchApps,
    createApp,
    updateApp,
    deleteApp,
    setFilters,
    clearError,
  } = useAppStore();

  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // 初始加载
  useEffect(() => {
    fetchApps();
  }, []);

  // 搜索和筛选
  const handleSearch = () => {
    setFilters({
      search: searchQuery,
      status: statusFilter === 'all' ? undefined : (statusFilter as any),
      page: 1,
    });
    fetchApps();
  };

  const handleCreateClick = () => {
    setEditingApp(null);
    setShowModal(true);
  };

  const handleEditClick = (app: App) => {
    setEditingApp(app);
    setShowModal(true);
  };

  const handleDeleteClick = (appId: number) => {
    setDeleteConfirm(appId);
  };

  const confirmDelete = async () => {
    if (deleteConfirm === null) return;

    try {
      await deleteApp(deleteConfirm);
      setDeleteConfirm(null);
      alert('应用已删除');
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  const handleFormSubmit = async (data: CreateAppRequest | UpdateAppRequest) => {
    try {
      if (editingApp) {
        await updateApp(editingApp.id, data);
        alert('应用已更新');
      } else {
        await createApp(data as CreateAppRequest);
        alert('应用已创建');
      }
      setShowModal(false);
      setEditingApp(null);
      fetchApps();
    } catch (err: any) {
      throw err;
    }
  };

  const handleViewApp = (app: App) => {
    navigate(`/publish/apps/${app.id}`);
  };

  const handleBuildApp = (app: App) => {
    navigate(`/publish/apps/${app.id}/build`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published':
        return 'status-published';
      case 'draft':
        return 'status-draft';
      case 'archived':
        return 'status-archived';
      default:
        return '';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'published':
        return '已发布';
      case 'draft':
        return '草稿';
      case 'archived':
        return '已归档';
      default:
        return status;
    }
  };

  return (
    <div className="app-list-page">
      <div className="app-list-header">
        <h1>应用管理</h1>
        <button className="btn-primary" onClick={handleCreateClick}>
          ➕ 创建应用
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}

      <div className="app-list-filters">
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索应用名称或代码..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>🔍</button>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">所有状态</option>
          <option value="draft">草稿</option>
          <option value="published">已发布</option>
          <option value="archived">已归档</option>
        </select>

        <div className="filter-stats">
          共 {pagination.total} 个应用
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📱</div>
          <h3>暂无应用</h3>
          <p>点击"创建应用"按钮开始创建您的第一个应用</p>
          <button className="btn-primary" onClick={handleCreateClick}>
            创建应用
          </button>
        </div>
      ) : (
        <div className="app-grid">
          {apps.map((app) => (
            <div key={app.id} className="app-card">
              <div className="app-card-header">
                {app.icon ? (
                  <img src={app.icon} alt={app.name} className="app-icon" />
                ) : (
                  <div className="app-icon-placeholder">📱</div>
                )}
                <div className="app-info">
                  <h3>{app.name}</h3>
                  <p className="app-code">{app.code}</p>
                </div>
                <span className={`status-badge ${getStatusColor(app.status)}`}>
                  {getStatusLabel(app.status)}
                </span>
              </div>

              <div className="app-card-body">
                <p className="app-description">
                  {app.description || '暂无描述'}
                </p>

                <div className="app-meta">
                  <div className="meta-item">
                    <span className="meta-label">版本:</span>
                    <span className="meta-value">{app.version}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">页面:</span>
                    <span className="meta-value">{app.pages?.length || 0}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">更新:</span>
                    <span className="meta-value">
                      {new Date(app.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {app.tags && app.tags.length > 0 && (
                  <div className="app-tags">
                    {app.tags.map((tag, index) => (
                      <span key={index} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="app-card-footer">
                <button
                  className="btn-icon"
                  onClick={() => handleViewApp(app)}
                  title="查看详情"
                >
                  👁️
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleEditClick(app)}
                  title="编辑"
                >
                  ✏️
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleBuildApp(app)}
                  title="构建"
                >
                  🔨
                </button>
                <button
                  className="btn-icon btn-danger"
                  onClick={() => handleDeleteClick(app.id)}
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pagination.total > pagination.pageSize && (
        <div className="pagination">
          <button
            disabled={pagination.page === 1}
            onClick={() => {
              setFilters({ page: pagination.page - 1 });
              fetchApps();
            }}
          >
            上一页
          </button>
          <span>
            第 {pagination.page} 页 / 共{' '}
            {Math.ceil(pagination.total / pagination.pageSize)} 页
          </span>
          <button
            disabled={
              pagination.page >= Math.ceil(pagination.total / pagination.pageSize)
            }
            onClick={() => {
              setFilters({ page: pagination.page + 1 });
              fetchApps();
            }}
          >
            下一页
          </button>
        </div>
      )}

      {/* 创建/编辑模态框 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <AppForm
              app={editingApp}
              onSubmit={handleFormSubmit}
              onCancel={() => {
                setShowModal(false);
                setEditingApp(null);
              }}
              mode={editingApp ? 'edit' : 'create'}
            />
          </div>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm !== null && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div
            className="confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>确认删除</h3>
            <p>确定要删除这个应用吗？此操作不可撤销。</p>
            <div className="dialog-actions">
              <button onClick={() => setDeleteConfirm(null)}>取消</button>
              <button className="btn-danger" onClick={confirmDelete}>
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppListPage;
