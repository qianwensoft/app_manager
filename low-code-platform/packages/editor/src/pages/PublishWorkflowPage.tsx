import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import publishWorkflowApi, {
  type PublishConfig,
  type PublishRecord,
  type PrePublishCheckResult,
  type PublishProgress,
  type PublishStatistics,
  type CheckStatus,
  type PublishStatus,
} from '../publish/publishWorkflowApi';
import { type PublishTarget } from '../publish/types';
import './PublishWorkflowPage.css';

export const PublishWorkflowPage: React.FC = () => {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const [configs, setConfigs] = useState<PublishConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<PublishConfig | null>(null);
  const [checkResult, setCheckResult] = useState<PrePublishCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishRecords, setPublishRecords] = useState<PublishRecord[]>([]);
  const [currentProgress, setCurrentProgress] = useState<PublishProgress | null>(null);
  const [statistics, setStatistics] = useState<PublishStatistics | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'history' | 'statistics'>('config');
  const [showNewConfigModal, setShowNewConfigModal] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<PublishRecord | null>(null);
  const [deployNotes, setDeployNotes] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');
  const [filterEnvironment, setFilterEnvironment] = useState<PublishTarget | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<PublishStatus | 'all'>('all');

  // 新配置表单
  const [newConfig, setNewConfig] = useState({
    versionId: 0,
    environmentId: 0,
    buildId: undefined as number | undefined,
    autoRollback: true,
    notifyOnSuccess: true,
    notifyOnFailure: true,
  });

  useEffect(() => {
    if (appId) {
      loadConfigs();
      loadPublishRecords();
      loadStatistics();
    }
  }, [appId]);

  useEffect(() => {
    let interval: number | undefined;
    if (currentProgress && currentProgress.status === 'publishing') {
      interval = window.setInterval(() => {
        refreshProgress();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentProgress]);

  const loadConfigs = async () => {
    try {
      const data = await publishWorkflowApi.listPublishConfigs(Number(appId));
      setConfigs(data);
      if (data.length > 0 && !selectedConfig) {
        setSelectedConfig(data[0]);
      }
    } catch (error) {
      console.error('加载发布配置失败:', error);
      alert('加载发布配置失败');
    }
  };

  const loadPublishRecords = async () => {
    try {
      const params: any = {};
      if (filterEnvironment !== 'all') params.environment = filterEnvironment;
      if (filterStatus !== 'all') params.status = filterStatus;
      const { records } = await publishWorkflowApi.listPublishRecords(Number(appId), params);
      setPublishRecords(records);
    } catch (error) {
      console.error('加载发布记录失败:', error);
    }
  };

  const loadStatistics = async () => {
    try {
      const data = await publishWorkflowApi.getPublishStatistics(Number(appId));
      setStatistics(data);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  };

  const handleCreateConfig = async () => {
    if (!newConfig.versionId || !newConfig.environmentId) {
      alert('请选择版本和环境');
      return;
    }
    try {
      await publishWorkflowApi.createPublishConfig(Number(appId), newConfig);
      setShowNewConfigModal(false);
      setNewConfig({
        versionId: 0,
        environmentId: 0,
        buildId: undefined,
        autoRollback: true,
        notifyOnSuccess: true,
        notifyOnFailure: true,
      });
      loadConfigs();
    } catch (error) {
      console.error('创建配置失败:', error);
      alert('创建配置失败');
    }
  };

  const handleDeleteConfig = async (configId: number) => {
    if (!confirm('确定要删除此发布配置吗？')) return;
    try {
      await publishWorkflowApi.deletePublishConfig(configId);
      loadConfigs();
      if (selectedConfig?.id === configId) {
        setSelectedConfig(null);
        setCheckResult(null);
      }
    } catch (error) {
      console.error('删除配置失败:', error);
      alert('删除配置失败');
    }
  };

  const handleRunCheck = async () => {
    if (!selectedConfig) return;
    setIsChecking(true);
    try {
      const result = await publishWorkflowApi.executePrePublishCheck(selectedConfig.id);
      setCheckResult(result);
    } catch (error) {
      console.error('检查失败:', error);
      alert('检查失败');
    } finally {
      setIsChecking(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedConfig) return;
    if (!checkResult || !checkResult.canPublish) {
      alert('请先通过发布前检查');
      return;
    }
    if (!confirm('确定要发布此版本吗？')) return;

    setIsPublishing(true);
    try {
      const record = await publishWorkflowApi.executePublish({
        configId: selectedConfig.id,
        deployNotes,
      });
      setCurrentProgress({
        recordId: record.id,
        status: 'publishing',
        progress: 0,
        currentStep: '初始化...',
        totalSteps: 5,
        completedSteps: 0,
        startedAt: record.startedAt,
      });
      setDeployNotes('');
      loadPublishRecords();
    } catch (error) {
      console.error('发布失败:', error);
      alert('发布失败');
      setIsPublishing(false);
    }
  };

  const refreshProgress = async () => {
    if (!currentProgress) return;
    try {
      const progress = await publishWorkflowApi.getPublishProgress(currentProgress.recordId);
      setCurrentProgress(progress);
      if (progress.status === 'success' || progress.status === 'failed') {
        setIsPublishing(false);
        loadPublishRecords();
        loadStatistics();
      }
    } catch (error) {
      console.error('刷新进度失败:', error);
    }
  };

  const handleRollback = async () => {
    if (!selectedRecord) return;
    try {
      await publishWorkflowApi.executeRollback({
        recordId: selectedRecord.id,
        reason: rollbackReason,
      });
      setShowRollbackModal(false);
      setSelectedRecord(null);
      setRollbackReason('');
      loadPublishRecords();
      loadStatistics();
      alert('回滚成功');
    } catch (error) {
      console.error('回滚失败:', error);
      alert('回滚失败');
    }
  };

  const handleQuickRollback = async (environment: PublishTarget) => {
    if (!confirm(`确定要回滚 ${getEnvironmentName(environment)} 环境到上一个成功版本吗？`)) return;
    try {
      await publishWorkflowApi.quickRollback(Number(appId), environment);
      loadPublishRecords();
      loadStatistics();
      alert('快速回滚成功');
    } catch (error) {
      console.error('快速回滚失败:', error);
      alert('快速回滚失败');
    }
  };

  const getStatusIcon = (status: CheckStatus | PublishStatus): string => {
    const iconMap: Record<string, string> = {
      pending: '⏳',
      checking: '🔄',
      passed: '✅',
      warning: '⚠️',
      failed: '❌',
      ready: '✅',
      publishing: '🚀',
      success: '✅',
      rolled_back: '↩️',
      rolling_back: '🔄',
    };
    return iconMap[status] || '❓';
  };

  const getStatusColor = (status: CheckStatus | PublishStatus): string => {
    const colorMap: Record<string, string> = {
      pending: '#999',
      checking: '#1890ff',
      passed: '#52c41a',
      warning: '#faad14',
      failed: '#f5222d',
      ready: '#52c41a',
      publishing: '#1890ff',
      success: '#52c41a',
      rolled_back: '#722ed1',
      rolling_back: '#1890ff',
    };
    return colorMap[status] || '#999';
  };

  const getStatusText = (status: CheckStatus | PublishStatus): string => {
    const textMap: Record<string, string> = {
      pending: '待检查',
      checking: '检查中',
      passed: '通过',
      warning: '警告',
      failed: '失败',
      ready: '准备就绪',
      publishing: '发布中',
      success: '发布成功',
      rolled_back: '已回滚',
      rolling_back: '回滚中',
    };
    return textMap[status] || status;
  };

  const getEnvironmentName = (env: PublishTarget): string => {
    const names: Record<PublishTarget, string> = {
      development: '开发环境',
      staging: '预发布环境',
      production: '生产环境',
    };
    return names[env];
  };

  const getEnvironmentIcon = (env: PublishTarget): string => {
    const icons: Record<PublishTarget, string> = {
      development: '🔧',
      staging: '🧪',
      production: '🚀',
    };
    return icons[env];
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
  };

  const formatDateTime = (dateStr: string): string => {
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const renderConfigTab = () => (
    <div className="config-tab">
      <div className="config-section">
        <div className="section-header">
          <h3>📋 发布配置</h3>
          <button className="btn-primary" onClick={() => setShowNewConfigModal(true)}>
            ➕ 新建配置
          </button>
        </div>
        <div className="config-list">
          {configs.map((config) => (
            <div
              key={config.id}
              className={`config-card ${selectedConfig?.id === config.id ? 'active' : ''}`}
              onClick={() => setSelectedConfig(config)}
            >
              <div className="config-header">
                <span className="config-title">
                  {getEnvironmentIcon(config.environment)} {getEnvironmentName(config.environment)} - v{config.versionNumber}
                </span>
                <button
                  className="btn-icon btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConfig(config.id);
                  }}
                >
                  🗑️
                </button>
              </div>
              <div className="config-meta">
                <span>自动回滚: {config.autoRollback ? '✅' : '❌'}</span>
                <span>通知: {config.notifyOnSuccess || config.notifyOnFailure ? '🔔' : '🔕'}</span>
              </div>
            </div>
          ))}
          {configs.length === 0 && (
            <div className="empty-state">
              <p>暂无发布配置</p>
              <button className="btn-primary" onClick={() => setShowNewConfigModal(true)}>
                创建第一个配置
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedConfig && (
        <>
          <div className="check-section">
            <div className="section-header">
              <h3>🔍 发布前检查</h3>
              <button
                className="btn-primary"
                onClick={handleRunCheck}
                disabled={isChecking}
              >
                {isChecking ? '检查中...' : '运行检查'}
              </button>
            </div>
            {checkResult ? (
              <div className="check-result">
                <div className="check-summary" style={{ borderColor: getStatusColor(checkResult.overallStatus) }}>
                  <div className="summary-status">
                    <span className="status-icon" style={{ fontSize: '32px' }}>
                      {getStatusIcon(checkResult.overallStatus)}
                    </span>
                    <span className="status-text" style={{ color: getStatusColor(checkResult.overallStatus) }}>
                      {getStatusText(checkResult.overallStatus)}
                    </span>
                  </div>
                  <div className="summary-meta">
                    <span>检查时间: {formatDateTime(checkResult.checkedAt)}</span>
                    <span className={checkResult.canPublish ? 'can-publish' : 'cannot-publish'}>
                      {checkResult.canPublish ? '✅ 可以发布' : '❌ 不可发布'}
                    </span>
                  </div>
                </div>
                <div className="check-items">
                  {checkResult.checks.map((check, index) => (
                    <div key={index} className="check-item" style={{ borderLeftColor: getStatusColor(check.status) }}>
                      <div className="check-item-header">
                        <span className="check-icon">{getStatusIcon(check.status)}</span>
                        <span className="check-name">{check.name}</span>
                        <span className="check-status" style={{ color: getStatusColor(check.status) }}>
                          {getStatusText(check.status)}
                        </span>
                      </div>
                      {check.message && <div className="check-message">{check.message}</div>}
                    </div>
                  ))}
                </div>
                {checkResult.warnings.length > 0 && (
                  <div className="check-warnings">
                    <h4>⚠️ 警告</h4>
                    <ul>
                      {checkResult.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {checkResult.errors.length > 0 && (
                  <div className="check-errors">
                    <h4>❌ 错误</h4>
                    <ul>
                      {checkResult.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <p>点击"运行检查"按钮进行发布前检查</p>
              </div>
            )}
          </div>

          <div className="publish-section">
            <div className="section-header">
              <h3>🚀 执行发布</h3>
            </div>
            <div className="publish-form">
              <div className="form-group">
                <label>部署说明（可选）</label>
                <textarea
                  className="form-control"
                  placeholder="记录本次发布的内容和注意事项..."
                  value={deployNotes}
                  onChange={(e) => setDeployNotes(e.target.value)}
                  rows={3}
                  disabled={isPublishing}
                />
              </div>
              <button
                className="btn-publish"
                onClick={handlePublish}
                disabled={!checkResult || !checkResult.canPublish || isPublishing}
              >
                {isPublishing ? '发布中...' : '🚀 立即发布'}
              </button>
            </div>
            {currentProgress && (
              <div className="publish-progress">
                <div className="progress-header">
                  <span>{currentProgress.currentStep}</span>
                  <span>{currentProgress.completedSteps} / {currentProgress.totalSteps}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${currentProgress.progress}%`,
                      backgroundColor: getStatusColor(currentProgress.status),
                    }}
                  />
                </div>
                <div className="progress-meta">
                  <span>开始时间: {formatDateTime(currentProgress.startedAt)}</span>
                  {currentProgress.estimatedCompletion && (
                    <span>预计完成: {formatDateTime(currentProgress.estimatedCompletion)}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderHistoryTab = () => (
    <div className="history-tab">
      <div className="section-header">
        <h3>📜 发布历史</h3>
        <div className="filter-group">
          <select
            className="form-control"
            value={filterEnvironment}
            onChange={(e) => {
              setFilterEnvironment(e.target.value as any);
              loadPublishRecords();
            }}
          >
            <option value="all">所有环境</option>
            <option value="development">开发环境</option>
            <option value="staging">预发布环境</option>
            <option value="production">生产环境</option>
          </select>
          <select
            className="form-control"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as any);
              loadPublishRecords();
            }}
          >
            <option value="all">所有状态</option>
            <option value="success">发布成功</option>
            <option value="failed">发布失败</option>
            <option value="rolled_back">已回滚</option>
          </select>
        </div>
      </div>
      <div className="history-timeline">
        {publishRecords.map((record) => (
          <div key={record.id} className="timeline-item">
            <div className="timeline-marker" style={{ backgroundColor: getStatusColor(record.status) }}>
              {getStatusIcon(record.status)}
            </div>
            <div className="timeline-content">
              <div className="timeline-header">
                <div className="timeline-title">
                  {getEnvironmentIcon(record.environment)} {getEnvironmentName(record.environment)} - v{record.versionNumber}
                </div>
                <div className="timeline-meta">
                  <span className="timeline-status" style={{ color: getStatusColor(record.status) }}>
                    {getStatusText(record.status)}
                  </span>
                  <span className="timeline-time">{formatDateTime(record.startedAt)}</span>
                </div>
              </div>
              {record.deployNotes && (
                <div className="timeline-notes">{record.deployNotes}</div>
              )}
              <div className="timeline-details">
                <span>发布人: {record.publishedBy}</span>
                {record.duration && <span>耗时: {formatDuration(record.duration)}</span>}
              </div>
              {record.errorMessage && (
                <div className="timeline-error">❌ {record.errorMessage}</div>
              )}
              {record.status === 'success' && (
                <div className="timeline-actions">
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setSelectedRecord(record);
                      setShowRollbackModal(true);
                    }}
                  >
                    ↩️ 回滚到此版本
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {publishRecords.length === 0 && (
          <div className="empty-state">
            <p>暂无发布记录</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStatisticsTab = () => (
    <div className="statistics-tab">
      <div className="section-header">
        <h3>📊 发布统计</h3>
      </div>
      {statistics ? (
        <div className="statistics-grid">
          <div className="stat-card">
            <div className="stat-value">{statistics.totalPublishes}</div>
            <div className="stat-label">总发布次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#52c41a' }}>{statistics.successCount}</div>
            <div className="stat-label">成功次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#f5222d' }}>{statistics.failureCount}</div>
            <div className="stat-label">失败次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#722ed1' }}>{statistics.rollbackCount}</div>
            <div className="stat-label">回滚次数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatDuration(statistics.averageDuration)}</div>
            <div className="stat-label">平均耗时</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {statistics.lastPublishAt ? formatDateTime(statistics.lastPublishAt) : '-'}
            </div>
            <div className="stat-label">最后发布</div>
          </div>
          {(['development', 'staging', 'production'] as PublishTarget[]).map((env) => {
            const envStat = statistics.environments[env];
            return envStat ? (
              <div key={env} className="stat-card env-stat">
                <div className="stat-header">
                  {getEnvironmentIcon(env)} {getEnvironmentName(env)}
                </div>
                <div className="stat-details">
                  <div className="stat-row">
                    <span>发布次数:</span>
                    <span>{envStat.count}</span>
                  </div>
                  <div className="stat-row">
                    <span>成功率:</span>
                    <span style={{ color: envStat.successRate >= 0.9 ? '#52c41a' : '#faad14' }}>
                      {(envStat.successRate * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="stat-row">
                    <span>最后发布:</span>
                    <span>{envStat.lastPublishAt ? formatDateTime(envStat.lastPublishAt) : '-'}</span>
                  </div>
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => handleQuickRollback(env)}
                  disabled={!envStat.count}
                >
                  ↩️ 快速回滚
                </button>
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p>加载统计数据中...</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="publish-workflow-page">
      <div className="page-header">
        <button className="btn-back" onClick={() => navigate(`/publish/apps/${appId}`)}>
          ← 返回
        </button>
        <h1>🚀 发布流程</h1>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          📋 发布配置
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 发布历史
        </button>
        <button
          className={`tab ${activeTab === 'statistics' ? 'active' : ''}`}
          onClick={() => setActiveTab('statistics')}
        >
          📊 统计分析
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'config' && renderConfigTab()}
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'statistics' && renderStatisticsTab()}
      </div>

      {showNewConfigModal && (
        <div className="modal-overlay" onClick={() => setShowNewConfigModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新建发布配置</h3>
              <button className="btn-close" onClick={() => setShowNewConfigModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>版本 ID *</label>
                <input
                  type="number"
                  className="form-control"
                  value={newConfig.versionId || ''}
                  onChange={(e) => setNewConfig({ ...newConfig, versionId: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>环境 ID *</label>
                <input
                  type="number"
                  className="form-control"
                  value={newConfig.environmentId || ''}
                  onChange={(e) => setNewConfig({ ...newConfig, environmentId: Number(e.target.value) })}
                />
              </div>
              <div className="form-group">
                <label>构建 ID（可选）</label>
                <input
                  type="number"
                  className="form-control"
                  value={newConfig.buildId || ''}
                  onChange={(e) => setNewConfig({ ...newConfig, buildId: Number(e.target.value) || undefined })}
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newConfig.autoRollback}
                    onChange={(e) => setNewConfig({ ...newConfig, autoRollback: e.target.checked })}
                  />
                  <span>自动回滚（发布失败时）</span>
                </label>
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newConfig.notifyOnSuccess}
                    onChange={(e) => setNewConfig({ ...newConfig, notifyOnSuccess: e.target.checked })}
                  />
                  <span>发布成功通知</span>
                </label>
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newConfig.notifyOnFailure}
                    onChange={(e) => setNewConfig({ ...newConfig, notifyOnFailure: e.target.checked })}
                  />
                  <span>发布失败通知</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowNewConfigModal(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleCreateConfig}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {showRollbackModal && selectedRecord && (
        <div className="modal-overlay" onClick={() => setShowRollbackModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认回滚</h3>
              <button className="btn-close" onClick={() => setShowRollbackModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                确定要回滚到 <strong>v{selectedRecord.versionNumber}</strong> 吗？
              </p>
              <div className="form-group">
                <label>回滚原因（可选）</label>
                <textarea
                  className="form-control"
                  placeholder="记录回滚原因..."
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowRollbackModal(false)}>
                取消
              </button>
              <button className="btn-danger" onClick={handleRollback}>
                ↩️ 确认回滚
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
