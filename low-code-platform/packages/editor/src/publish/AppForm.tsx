/**
 * Phase 5: 应用发布 - 应用配置表单
 *
 * 应用基本信息、页面配置、主题设置等
 */

import React, { useState, useEffect } from 'react';
import type {
  App,
  CreateAppRequest,
  UpdateAppRequest,
  AppTheme,
  AppConfig,
  PageReference,
} from './types';
import './AppForm.css';

interface AppFormProps {
  app?: App | null;
  onSubmit: (data: CreateAppRequest | UpdateAppRequest) => Promise<void>;
  onCancel: () => void;
  mode?: 'create' | 'edit';
}

export const AppForm: React.FC<AppFormProps> = ({
  app,
  onSubmit,
  onCancel,
  mode = 'create',
}) => {
  const [formData, setFormData] = useState<CreateAppRequest | UpdateAppRequest>({
    code: '',
    name: '',
    description: '',
    icon: '',
    theme: {},
    config: {},
    tags: [],
  });

  const [pages, setPages] = useState<PageReference[]>([]);
  const [startPageId, setStartPageId] = useState<number | undefined>();
  const [availablePages, setAvailablePages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化表单数据
  useEffect(() => {
    if (app) {
      setFormData({
        name: app.name,
        description: app.description || '',
        icon: app.icon || '',
        theme: app.theme || {},
        config: app.config || {},
        tags: app.tags || [],
      });
      setPages(app.pages || []);
      setStartPageId(app.startPageId);
    }
  }, [app]);

  // 加载可用页面列表
  useEffect(() => {
    // TODO: 从 API 获取页面列表
    // 这里暂时使用 mock 数据
    setAvailablePages([
      { id: 1, title: '首页', path: '/home' },
      { id: 2, title: '用户列表', path: '/users' },
      { id: 3, title: '设置', path: '/settings' },
    ]);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleThemeChange = (key: keyof AppTheme, value: string) => {
    setFormData((prev) => ({
      ...prev,
      theme: { ...prev.theme, [key]: value },
    }));
  };

  const handleConfigChange = (key: keyof AppConfig, value: any) => {
    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [key]: value },
    }));
  };

  const handleAddPage = (pageId: number) => {
    const page = availablePages.find((p) => p.id === pageId);
    if (!page) return;

    const exists = pages.find((p) => p.pageId === pageId);
    if (exists) {
      alert('该页面已添加');
      return;
    }

    const newPage: PageReference = {
      pageId: page.id,
      order: pages.length,
      title: page.title,
      path: page.path,
      visible: true,
    };

    setPages([...pages, newPage]);
  };

  const handleRemovePage = (pageId: number) => {
    setPages(pages.filter((p) => p.pageId !== pageId));
    if (startPageId === pageId) {
      setStartPageId(undefined);
    }
  };

  const handlePageOrderChange = (pageId: number, direction: 'up' | 'down') => {
    const index = pages.findIndex((p) => p.pageId === pageId);
    if (index === -1) return;

    const newPages = [...pages];
    if (direction === 'up' && index > 0) {
      [newPages[index - 1], newPages[index]] = [newPages[index], newPages[index - 1]];
    } else if (direction === 'down' && index < newPages.length - 1) {
      [newPages[index], newPages[index + 1]] = [newPages[index + 1], newPages[index]];
    }

    // 更新 order
    newPages.forEach((page, idx) => {
      page.order = idx;
    });

    setPages(newPages);
  };

  const handlePageVisibilityToggle = (pageId: number) => {
    setPages(
      pages.map((p) =>
        p.pageId === pageId ? { ...p, visible: !p.visible } : p
      )
    );
  };

  const handleTagsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
    setFormData((prev) => ({ ...prev, tags }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const submitData = {
        ...formData,
        pages,
        startPageId,
      };

      await onSubmit(submitData);
    } catch (err: any) {
      setError(err.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="app-form" onSubmit={handleSubmit}>
      <div className="app-form-header">
        <h2>{mode === 'create' ? '创建应用' : '编辑应用'}</h2>
      </div>

      {error && (
        <div className="app-form-error">
          <span className="error-icon">⚠️</span>
          {error}
        </div>
      )}

      <div className="app-form-body">
        {/* 基本信息 */}
        <section className="app-form-section">
          <h3>基本信息</h3>

          <div className="app-form-field">
            <label htmlFor="code">应用标识 *</label>
            <input
              type="text"
              id="code"
              name="code"
              value={(formData as CreateAppRequest).code || ''}
              onChange={handleInputChange}
              placeholder="app-code"
              pattern="[a-z0-9-]+"
              required
              disabled={mode === 'edit'}
              title="只能包含小写字母、数字和连字符"
            />
            <small>用于 URL，只能包含小写字母、数字和连字符</small>
          </div>

          <div className="app-form-field">
            <label htmlFor="name">应用名称 *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="我的应用"
              required
            />
          </div>

          <div className="app-form-field">
            <label htmlFor="description">应用描述</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="简要描述应用的功能..."
              rows={3}
            />
          </div>

          <div className="app-form-field">
            <label htmlFor="icon">应用图标 URL</label>
            <input
              type="url"
              id="icon"
              name="icon"
              value={formData.icon}
              onChange={handleInputChange}
              placeholder="https://example.com/icon.png"
            />
            {formData.icon && (
              <div className="icon-preview">
                <img src={formData.icon} alt="图标预览" />
              </div>
            )}
          </div>

          <div className="app-form-field">
            <label htmlFor="tags">标签</label>
            <input
              type="text"
              id="tags"
              value={formData.tags?.join(', ') || ''}
              onChange={handleTagsChange}
              placeholder="标签1, 标签2, 标签3"
            />
            <small>用逗号分隔多个标签</small>
          </div>
        </section>

        {/* 页面配置 */}
        <section className="app-form-section">
          <h3>页面配置</h3>

          <div className="app-form-field">
            <label>添加页面</label>
            <select
              onChange={(e) => {
                const pageId = parseInt(e.target.value);
                if (pageId) {
                  handleAddPage(pageId);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="">选择要添加的页面...</option>
              {availablePages
                .filter((p) => !pages.find((pg) => pg.pageId === p.id))
                .map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title} ({page.path})
                  </option>
                ))}
            </select>
          </div>

          <div className="pages-list">
            {pages.length === 0 ? (
              <div className="empty-state">
                <p>暂无页面，请添加页面</p>
              </div>
            ) : (
              pages.map((page, index) => (
                <div key={page.pageId} className="page-item">
                  <div className="page-item-header">
                    <input
                      type="radio"
                      name="startPage"
                      checked={startPageId === page.pageId}
                      onChange={() => setStartPageId(page.pageId)}
                      title="设为启动页"
                    />
                    <span className="page-title">{page.title}</span>
                    <span className="page-path">{page.path}</span>
                    {startPageId === page.pageId && (
                      <span className="start-badge">启动页</span>
                    )}
                  </div>

                  <div className="page-item-actions">
                    <button
                      type="button"
                      onClick={() => handlePageOrderChange(page.pageId, 'up')}
                      disabled={index === 0}
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePageOrderChange(page.pageId, 'down')}
                      disabled={index === pages.length - 1}
                      title="下移"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePageVisibilityToggle(page.pageId)}
                      title={page.visible ? '隐藏' : '显示'}
                    >
                      {page.visible ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePage(page.pageId)}
                      className="danger"
                      title="移除"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 主题配置 */}
        <section className="app-form-section">
          <h3>主题配置</h3>

          <div className="app-form-row">
            <div className="app-form-field">
              <label htmlFor="primaryColor">主色调</label>
              <input
                type="color"
                id="primaryColor"
                value={formData.theme?.primaryColor || '#1890ff'}
                onChange={(e) => handleThemeChange('primaryColor', e.target.value)}
              />
            </div>

            <div className="app-form-field">
              <label htmlFor="secondaryColor">辅助色</label>
              <input
                type="color"
                id="secondaryColor"
                value={formData.theme?.secondaryColor || '#52c41a'}
                onChange={(e) => handleThemeChange('secondaryColor', e.target.value)}
              />
            </div>
          </div>

          <div className="app-form-field">
            <label htmlFor="fontFamily">字体</label>
            <select
              id="fontFamily"
              value={formData.theme?.fontFamily || 'system-ui'}
              onChange={(e) => handleThemeChange('fontFamily', e.target.value)}
            >
              <option value="system-ui">系统默认</option>
              <option value="'Helvetica Neue', Helvetica, Arial, sans-serif">
                Helvetica
              </option>
              <option value="'PingFang SC', 'Microsoft YaHei', sans-serif">
                微软雅黑
              </option>
              <option value="'Roboto', sans-serif">Roboto</option>
            </select>
          </div>
        </section>

        {/* 应用配置 */}
        <section className="app-form-section">
          <h3>应用配置</h3>

          <div className="app-form-field">
            <label htmlFor="title">应用标题</label>
            <input
              type="text"
              id="title"
              value={formData.config?.title || ''}
              onChange={(e) => handleConfigChange('title', e.target.value)}
              placeholder="显示在浏览器标题栏"
            />
          </div>

          <div className="app-form-field">
            <label htmlFor="baseURL">API 基础 URL</label>
            <input
              type="url"
              id="baseURL"
              value={formData.config?.baseURL || ''}
              onChange={(e) => handleConfigChange('baseURL', e.target.value)}
              placeholder="https://api.example.com"
            />
          </div>

          <div className="app-form-field">
            <label>
              <input
                type="checkbox"
                checked={formData.config?.debug || false}
                onChange={(e) => handleConfigChange('debug', e.target.checked)}
              />
              调试模式
            </label>
          </div>
        </section>
      </div>

      <div className="app-form-footer">
        <button type="button" onClick={onCancel} disabled={loading}>
          取消
        </button>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? '提交中...' : mode === 'create' ? '创建' : '保存'}
        </button>
      </div>
    </form>
  );
};

export default AppForm;
