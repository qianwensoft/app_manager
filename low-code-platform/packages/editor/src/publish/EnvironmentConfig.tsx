import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { environmentApi } from './environmentApi';
import type { Environment, EnvironmentVariable } from './types';
import './EnvironmentConfig.css';

export function EnvironmentConfig() {
  const { id } = useParams<{ id: string }>();
  const appId = parseInt(id || '0');

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string>('development');
  const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddVar, setShowAddVar] = useState(false);
  const [newVar, setNewVar] = useState({
    key: '',
    value: '',
    description: '',
    secret: false,
  });

  // 加载环境列表
  useEffect(() => {
    loadEnvironments();
  }, [appId]);

  // 加载环境变量
  useEffect(() => {
    if (selectedEnv) {
      loadVariables(selectedEnv);
    }
  }, [selectedEnv]);

  const loadEnvironments = async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const data = await environmentApi.listEnvironments(appId);
      setEnvironments(data);
    } catch (error) {
      console.error('Failed to load environments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadVariables = async (env: string) => {
    if (!appId) return;
    try {
      const data = await environmentApi.getEnvironmentVariables(appId, env);
      setVariables(data);
    } catch (error) {
      console.error('Failed to load variables:', error);
    }
  };

  // 创建/更新环境
  const handleSaveEnvironment = async (env: Partial<Environment>) => {
    if (!appId) return;

    try {
      if (env.id) {
        await environmentApi.updateEnvironment(appId, env.id, env);
      } else {
        await environmentApi.createEnvironment(appId, env as Environment);
      }
      loadEnvironments();
    } catch (error) {
      console.error('Failed to save environment:', error);
      alert('保存环境失败');
    }
  };

  // 添加环境变量
  const handleAddVariable = async () => {
    if (!appId || !newVar.key) return;

    try {
      await environmentApi.setEnvironmentVariable(appId, selectedEnv, newVar);
      setShowAddVar(false);
      setNewVar({ key: '', value: '', description: '', secret: false });
      loadVariables(selectedEnv);
    } catch (error) {
      console.error('Failed to add variable:', error);
      alert('添加变量失败');
    }
  };

  // 删除环境变量
  const handleDeleteVariable = async (key: string) => {
    if (!confirm(`确定要删除环境变量 "${key}" 吗？`)) return;

    try {
      await environmentApi.deleteEnvironmentVariable(appId, selectedEnv, key);
      loadVariables(selectedEnv);
    } catch (error) {
      console.error('Failed to delete variable:', error);
      alert('删除变量失败');
    }
  };

  // 切换环境
  const handleSwitchEnvironment = async (env: string) => {
    if (!confirm(`确定要切换到 "${env}" 环境吗？`)) return;

    try {
      await environmentApi.switchEnvironment(appId, env);
      alert('切换成功！');
    } catch (error) {
      console.error('Failed to switch environment:', error);
      alert('切换失败');
    }
  };

  if (loading) {
    return (
      <div className="environment-config">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  const currentEnv = environments.find((e) => e.name === selectedEnv);

  return (
    <div className="environment-config">
      <div className="page-header">
        <h1>环境配置</h1>
      </div>

      <div className="env-layout">
        {/* 左侧：环境列表 */}
        <div className="env-sidebar">
          <h3>环境列表</h3>
          <div className="env-list">
            {environments.map((env) => (
              <div
                key={env.name}
                className={`env-item ${selectedEnv === env.name ? 'active' : ''}`}
                onClick={() => setSelectedEnv(env.name)}
              >
                <div className="env-info">
                  <div className="env-name">{env.displayName || env.name}</div>
                  <div className="env-meta">
                    {env.active && <span className="badge-active">当前</span>}
                    <span className="env-url">{env.apiBaseUrl}</span>
                  </div>
                </div>
                {env.active && (
                  <div className="env-indicator">
                    <span className="dot active"></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：环境详情和变量 */}
        <div className="env-content">
          {currentEnv && (
            <>
              {/* 环境基本信息 */}
              <div className="env-section">
                <div className="section-header">
                  <h3>环境信息</h3>
                  <button
                    className="btn-switch"
                    onClick={() => handleSwitchEnvironment(currentEnv.name)}
                    disabled={currentEnv.active}
                  >
                    切换到此环境
                  </button>
                </div>

                <div className="env-details">
                  <div className="detail-row">
                    <span className="label">环境名称:</span>
                    <span className="value">{currentEnv.displayName || currentEnv.name}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">API 地址:</span>
                    <span className="value">{currentEnv.apiBaseUrl}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">状态:</span>
                    <span className="value">
                      {currentEnv.active ? (
                        <span className="status-active">活动</span>
                      ) : (
                        <span className="status-inactive">未激活</span>
                      )}
                    </span>
                  </div>
                  {currentEnv.description && (
                    <div className="detail-row">
                      <span className="label">描述:</span>
                      <span className="value">{currentEnv.description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 环境变量 */}
              <div className="env-section">
                <div className="section-header">
                  <h3>环境变量</h3>
                  <button className="btn-add" onClick={() => setShowAddVar(true)}>
                    + 添加变量
                  </button>
                </div>

                <div className="variables-table">
                  {variables.length > 0 ? (
                    <table>
                      <thead>
                        <tr>
                          <th>变量名</th>
                          <th>变量值</th>
                          <th>描述</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variables.map((variable) => (
                          <tr key={variable.key}>
                            <td>
                              <code>{variable.key}</code>
                            </td>
                            <td>
                              {variable.secret ? (
                                <span className="secret-value">••••••••</span>
                              ) : (
                                <code>{variable.value}</code>
                              )}
                            </td>
                            <td>{variable.description || '-'}</td>
                            <td>
                              <button
                                className="btn-delete-small"
                                onClick={() => handleDeleteVariable(variable.key)}
                              >
                                删除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="empty-variables">
                      <p>暂无环境变量</p>
                      <button className="btn-primary" onClick={() => setShowAddVar(true)}>
                        添加第一个变量
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 添加变量弹窗 */}
      {showAddVar && (
        <div className="modal-overlay" onClick={() => setShowAddVar(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>添加环境变量</h2>

            <div className="form-group">
              <label>变量名 *</label>
              <input
                type="text"
                placeholder="例如: API_KEY"
                value={newVar.key}
                onChange={(e) => setNewVar({ ...newVar, key: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>变量值 *</label>
              <input
                type={newVar.secret ? 'password' : 'text'}
                placeholder="输入变量值"
                value={newVar.value}
                onChange={(e) => setNewVar({ ...newVar, value: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>描述</label>
              <input
                type="text"
                placeholder="描述此变量的用途"
                value={newVar.description}
                onChange={(e) => setNewVar({ ...newVar, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newVar.secret}
                  onChange={(e) => setNewVar({ ...newVar, secret: e.target.checked })}
                />
                <span>标记为敏感信息（隐藏显示）</span>
              </label>
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowAddVar(false)}>
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleAddVariable}
                disabled={!newVar.key || !newVar.value}
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
