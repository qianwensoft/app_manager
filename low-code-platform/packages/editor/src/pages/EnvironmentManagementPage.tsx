/**
 * Phase 5.5: 环境配置管理页面
 *
 * 功能：
 * - 环境列表展示（development/staging/production）
 * - 环境变量管理
 * - 环境配置管理
 * - 环境切换/激活
 * - 环境配置导入/导出
 * - 环境对比
 * - 环境克隆
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { environmentApi, type EnvironmentConfig } from '../publish/environmentApi';
import { appApi } from '../publish/appApi';
import type { App, PublishTarget } from '../publish/types';
import './EnvironmentManagementPage.css';

export const EnvironmentManagementPage: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const [app, setApp] = useState<App | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PublishTarget>('development');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // 编辑状态
  const [editingVariables, setEditingVariables] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, any>>({});

  // 新环境表单
  const [newEnv, setNewEnv] = useState({
    environment: 'development' as PublishTarget,
    name: '',
    description: '',
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
      const [appData, envsData] = await Promise.all([
        appApi.get(parseInt(appId)),
        environmentApi.list(parseInt(appId)),
      ]);

      setApp(appData);
      setEnvironments(envsData);

      // 设置默认激活的环境
      const activeEnv = envsData.find((e) => e.isActive);
      if (activeEnv) {
        setActiveTab(activeEnv.environment);
        loadEnvironmentDetails(activeEnv.environment);
      } else if (envsData.length > 0) {
        setActiveTab(envsData[0].environment);
        loadEnvironmentDetails(envsData[0].environment);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('加载数据失败：' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadEnvironmentDetails = async (environment: PublishTarget) => {
    if (!appId) return;

    try {
      const [varsData, envData] = await Promise.all([
        environmentApi.getVariables(parseInt(appId), environment, false),
        environmentApi.get(parseInt(appId), environment),
      ]);

      setVariables(varsData);
      setConfig(envData.config || {});
    } catch (error) {
      console.error('Failed to load environment details:', error);
    }
  };

  const handleTabChange = (environment: PublishTarget) => {
    setActiveTab(environment);
    setEditingVariables(false);
    setEditingConfig(false);
    loadEnvironmentDetails(environment);
  };

  const handleCreateEnvironment = async () => {
    if (!appId || !newEnv.name) {
      alert('请填写环境名称');
      return;
    }

    try {
      await environmentApi.create(parseInt(appId), newEnv);
      alert('环境创建成功');
      setShowCreateModal(false);
      setNewEnv({ environment: 'development', name: '', description: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create environment:', error);
      alert('创建环境失败：' + (error as Error).message);
    }
  };

  const handleActivateEnvironment = async (environment: PublishTarget) => {
    if (!appId) return;

    if (!confirm(`确定要激活 ${getEnvironmentLabel(environment)} 环境吗？`)) {
      return;
    }

    try {
      await environmentApi.activate(parseInt(appId), environment);
      alert('环境激活成功');
      loadData();
    } catch (error) {
      console.error('Failed to activate environment:', error);
      alert('激活环境失败：' + (error as Error).message);
    }
  };

  const handleSaveVariables = async () => {
    if (!appId) return;

    try {
      await environmentApi.updateVariables(parseInt(appId), activeTab, variables);
      alert('环境变量保存成功');
      setEditingVariables(false);
      loadData();
    } catch (error) {
      console.error('Failed to save variables:', error);
      alert('保存失败：' + (error as Error).message);
    }
  };

  const handleSaveConfig = async () => {
    if (!appId) return;

    try {
      await environmentApi.updateConfig(parseInt(appId), activeTab, config);
      alert('环境配置保存成功');
      setEditingConfig(false);
      loadData();
    } catch (error) {
      console.error('Failed to save config:', error);
      alert('保存失败：' + (error as Error).message);
    }
  };

  const handleExport = async (environment: PublishTarget) => {
    if (!appId) return;

    try {
      const blob = await environmentApi.exportConfig(parseInt(appId), environment, false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${app?.code}-${environment}-config.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export config:', error);
      alert('导出失败：' + (error as Error).message);
    }
  };

  const handleImport = async (file: File) => {
    if (!appId) return;

    try {
      await environmentApi.importConfig(parseInt(appId), activeTab, file);
      alert('导入成功');
      setShowImportModal(false);
      loadData();
      loadEnvironmentDetails(activeTab);
    } catch (error) {
      console.error('Failed to import config:', error);
      alert('导入失败：' + (error as Error).message);
    }
  };

  const handleClone = async (fromEnv: PublishTarget, toEnv: PublishTarget) => {
    if (!appId) return;

    if (!confirm(`确定要将 ${getEnvironmentLabel(fromEnv)} 的配置克隆到 ${getEnvironmentLabel(toEnv)} 吗？`)) {
      return;
    }

    try {
      await environmentApi.clone(parseInt(appId), fromEnv, toEnv, false);
      alert('克隆成功');
      loadData();
    } catch (error) {
      console.error('Failed to clone environment:', error);
      alert('克隆失败：' + (error as Error).message);
    }
  };

  const addVariable = () => {
    const key = prompt('请输入变量名:');
    if (key && key.trim()) {
      setVariables({ ...variables, [key.trim()]: '' });
    }
  };

  const removeVariable = (key: string) => {
    if (confirm(`确定要删除变量 ${key} 吗？`)) {
      const newVars = { ...variables };
      delete newVars[key];
      setVariables(newVars);
    }
  };

  const currentEnv = environments.find((e) => e.environment === activeTab);

  if (loading) {
    return <div className="environment-management-page loading">加载中...</div>;
  }

  if (!app) {
    return <div className="environment-management-page error">应用不存在</div>;
  }

  return (
    <div className="environment-management-page">
      {/* 头部 */}
      <header className="page-header">
        <div className="header-left">
          <button className="back-button" onClick={() => navigate('/publish/apps')}>
            ← 返回
          </button>
          <div className="header-info">
            <h1>{app.name} - 环境配置</h1>
            <p className="app-code">{app.code}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowCompareModal(true)}>
            对比环境
          </button>
          <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
            导入配置
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + 创建环境
          </button>
        </div>
      </header>

      {/* 环境标签页 */}
      <div className="environment-tabs">
        {environments.map((env) => (
          <button
            key={env.environment}
            className={`env-tab ${activeTab === env.environment ? 'active' : ''} ${
              env.isActive ? 'is-active' : ''
            }`}
            onClick={() => handleTabChange(env.environment)}
          >
            <span className="env-icon">{getEnvironmentIcon(env.environment)}</span>
            <span className="env-name">{env.name}</span>
            {env.isActive && <span className="active-badge">当前</span>}
          </button>
        ))}
      </div>

      {/* 环境详情 */}
      {currentEnv && (
        <div className="environment-content">
          {/* 环境信息卡片 */}
          <div className="info-card">
            <div className="card-header">
              <h2>环境信息</h2>
              <div className="card-actions">
                {!currentEnv.isActive && (
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => handleActivateEnvironment(currentEnv.environment)}
                  >
                    激活此环境
                  </button>
                )}
                <button
                  className="btn btn-small"
                  onClick={() => handleExport(currentEnv.environment)}
                >
                  导出配置
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">环境名称</span>
                  <span className="info-value">{currentEnv.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">环境类型</span>
                  <span className="info-value">{getEnvironmentLabel(currentEnv.environment)}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">状态</span>
                  <span className={`status-badge ${currentEnv.isActive ? 'active' : 'inactive'}`}>
                    {currentEnv.isActive ? '已激活' : '未激活'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">最后更新</span>
                  <span className="info-value">
                    {new Date(currentEnv.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              {currentEnv.description && (
                <div className="info-description">
                  <span className="info-label">描述</span>
                  <p>{currentEnv.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* 环境变量卡片 */}
          <div className="variables-card">
            <div className="card-header">
              <h2>环境变量</h2>
              <div className="card-actions">
                {editingVariables ? (
                  <>
                    <button className="btn btn-small" onClick={addVariable}>
                      + 添加变量
                    </button>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => {
                        setEditingVariables(false);
                        loadEnvironmentDetails(activeTab);
                      }}
                    >
                      取消
                    </button>
                    <button className="btn btn-small btn-primary" onClick={handleSaveVariables}>
                      保存
                    </button>
                  </>
                ) : (
                  <button className="btn btn-small" onClick={() => setEditingVariables(true)}>
                    编辑
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {Object.keys(variables).length === 0 ? (
                <div className="empty-state">
                  <p>暂无环境变量</p>
                  <button className="btn btn-primary" onClick={addVariable}>
                    添加第一个变量
                  </button>
                </div>
              ) : (
                <div className="variables-list">
                  {Object.entries(variables).map(([key, value]) => (
                    <div key={key} className="variable-item">
                      <div className="variable-key">{key}</div>
                      {editingVariables ? (
                        <div className="variable-edit">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) =>
                              setVariables({ ...variables, [key]: e.target.value })
                            }
                            placeholder="请输入值"
                          />
                          <button
                            className="btn-icon btn-danger"
                            onClick={() => removeVariable(key)}
                            title="删除"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <div className="variable-value">
                          {currentEnv.secrets?.includes(key) ? '••••••••' : value || '-'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 环境配置卡片 */}
          <div className="config-card">
            <div className="card-header">
              <h2>环境配置</h2>
              <div className="card-actions">
                {editingConfig ? (
                  <>
                    <button
                      className="btn btn-small btn-secondary"
                      onClick={() => {
                        setEditingConfig(false);
                        loadEnvironmentDetails(activeTab);
                      }}
                    >
                      取消
                    </button>
                    <button className="btn btn-small btn-primary" onClick={handleSaveConfig}>
                      保存
                    </button>
                  </>
                ) : (
                  <button className="btn btn-small" onClick={() => setEditingConfig(true)}>
                    编辑
                  </button>
                )}
              </div>
            </div>
            <div className="card-body">
              {editingConfig ? (
                <textarea
                  className="config-editor"
                  value={JSON.stringify(config, null, 2)}
                  onChange={(e) => {
                    try {
                      setConfig(JSON.parse(e.target.value));
                    } catch (err) {
                      // 输入中，可能暂时无效
                    }
                  }}
                  rows={15}
                  placeholder="JSON 格式配置"
                />
              ) : (
                <pre className="config-preview">{JSON.stringify(config, null, 2)}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 创建环境模态框 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>创建环境</h2>
              <button className="close-button" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>环境类型 *</label>
                <select
                  value={newEnv.environment}
                  onChange={(e) =>
                    setNewEnv({ ...newEnv, environment: e.target.value as PublishTarget })
                  }
                >
                  <option value="development">Development (开发)</option>
                  <option value="staging">Staging (预发布)</option>
                  <option value="production">Production (生产)</option>
                </select>
              </div>

              <div className="form-group">
                <label>环境名称 *</label>
                <input
                  type="text"
                  value={newEnv.name}
                  onChange={(e) => setNewEnv({ ...newEnv, name: e.target.value })}
                  placeholder="例如：开发环境"
                />
              </div>

              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={newEnv.description}
                  onChange={(e) => setNewEnv({ ...newEnv, description: e.target.value })}
                  placeholder="环境描述..."
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreateEnvironment}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入配置模态框 */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>导入配置到 {getEnvironmentLabel(activeTab)}</h2>
              <button className="close-button" onClick={() => setShowImportModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>选择配置文件 (JSON)</label>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleImport(file);
                    }
                  }}
                />
                <small>导入配置将覆盖当前环境的所有配置</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 环境对比模态框 */}
      {showCompareModal && (
        <CompareEnvironmentsModal
          appId={parseInt(appId!)}
          environments={environments}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );
};

// 环境对比模态框组件
interface CompareEnvironmentsModalProps {
  appId: number;
  environments: EnvironmentConfig[];
  onClose: () => void;
}

const CompareEnvironmentsModal: React.FC<CompareEnvironmentsModalProps> = ({
  appId,
  environments,
  onClose,
}) => {
  const [fromEnv, setFromEnv] = useState<PublishTarget>('development');
  const [toEnv, setToEnv] = useState<PublishTarget>('production');
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    setLoading(true);
    try {
      const result = await environmentApi.compare(appId, fromEnv, toEnv);
      setComparison(result);
    } catch (error) {
      console.error('Failed to compare:', error);
      alert('对比失败：' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>环境对比</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="compare-selectors">
            <div className="form-group">
              <label>从环境</label>
              <select value={fromEnv} onChange={(e) => setFromEnv(e.target.value as PublishTarget)}>
                {environments.map((env) => (
                  <option key={env.environment} value={env.environment}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="compare-arrow">→</div>
            <div className="form-group">
              <label>到环境</label>
              <select value={toEnv} onChange={(e) => setToEnv(e.target.value as PublishTarget)}>
                {environments.map((env) => (
                  <option key={env.environment} value={env.environment}>
                    {env.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" onClick={handleCompare} disabled={loading}>
              {loading ? '对比中...' : '对比'}
            </button>
          </div>

          {comparison && (
            <div className="comparison-result">
              <h3>环境变量差异</h3>
              <div className="diff-section">
                {comparison.variablesDiff.added.length > 0 && (
                  <div className="diff-group diff-added">
                    <h4>新增 ({comparison.variablesDiff.added.length})</h4>
                    <ul>
                      {comparison.variablesDiff.added.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.variablesDiff.removed.length > 0 && (
                  <div className="diff-group diff-removed">
                    <h4>删除 ({comparison.variablesDiff.removed.length})</h4>
                    <ul>
                      {comparison.variablesDiff.removed.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.variablesDiff.modified.length > 0 && (
                  <div className="diff-group diff-modified">
                    <h4>修改 ({comparison.variablesDiff.modified.length})</h4>
                    <ul>
                      {comparison.variablesDiff.modified.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <h3>配置差异</h3>
              <div className="diff-section">
                {comparison.configDiff.added.length > 0 && (
                  <div className="diff-group diff-added">
                    <h4>新增 ({comparison.configDiff.added.length})</h4>
                    <ul>
                      {comparison.configDiff.added.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.configDiff.removed.length > 0 && (
                  <div className="diff-group diff-removed">
                    <h4>删除 ({comparison.configDiff.removed.length})</h4>
                    <ul>
                      {comparison.configDiff.removed.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {comparison.configDiff.modified.length > 0 && (
                  <div className="diff-group diff-modified">
                    <h4>修改 ({comparison.configDiff.modified.length})</h4>
                    <ul>
                      {comparison.configDiff.modified.map((key: string) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 辅助函数
function getEnvironmentLabel(env: PublishTarget): string {
  switch (env) {
    case 'development':
      return '开发环境';
    case 'staging':
      return '预发布环境';
    case 'production':
      return '生产环境';
    default:
      return env;
  }
}

function getEnvironmentIcon(env: PublishTarget): string {
  switch (env) {
    case 'development':
      return '🔧';
    case 'staging':
      return '🧪';
    case 'production':
      return '🚀';
    default:
      return '⚙️';
  }
}

export default EnvironmentManagementPage;
