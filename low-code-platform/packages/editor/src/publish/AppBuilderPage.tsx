/**
 * Phase 5: 应用发布 - 应用构建页
 *
 * 构建应用，查看构建日志，下载构建产物
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from './appStore';
import { buildApi } from './buildApi';
import type { AppBuild, BuildLogEntry, BuildType } from './types';
import './AppBuilderPage.css';

export const AppBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const appId = parseInt(id || '0');

  const { currentApp, fetchApp, builds, fetchBuilds, createBuild } = useAppStore();

  const [buildType, setBuildType] = useState<BuildType>('web');
  const [version, setVersion] = useState('');
  const [building, setBuilding] = useState(false);
  const [currentBuildId, setCurrentBuildId] = useState<number | null>(null);
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = React.useRef<HTMLDivElement>(null);

  // 加载应用和构建历史
  useEffect(() => {
    if (appId) {
      fetchApp(appId);
      fetchBuilds(appId);
    }
  }, [appId]);

  // 初始化版本号
  useEffect(() => {
    if (currentApp && !version) {
      setVersion(currentApp.version);
    }
  }, [currentApp]);

  // 自动滚动日志
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleStartBuild = async () => {
    if (!version.trim()) {
      alert('请输入版本号');
      return;
    }

    setBuilding(true);
    setLogs([]);

    try {
      const build = await createBuild(appId, version, buildType);
      setCurrentBuildId(build.id);

      // 订阅构建日志流
      const unsubscribe = buildApi.streamLogs(
        appId,
        build.id,
        (log) => {
          setLogs((prev) => [...prev, log]);
        },
        (error) => {
          console.error('Log stream error:', error);
          setBuilding(false);
        },
        () => {
          setBuilding(false);
          fetchBuilds(appId);
        }
      );

      // 组件卸载时取消订阅
      return () => {
        unsubscribe();
      };
    } catch (error: any) {
      alert(`构建失败: ${error.message}`);
      setBuilding(false);
    }
  };

  const handleDownload = async (build: AppBuild) => {
    try {
      const blob = await buildApi.download(appId, build.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentApp?.code}-${build.version}-${build.buildType}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`下载失败: ${error.message}`);
    }
  };

  const handleViewLogs = async (build: AppBuild) => {
    try {
      const buildLogs = await buildApi.getLogs(appId, build.id);
      setLogs(buildLogs);
      setCurrentBuildId(build.id);
    } catch (error: any) {
      alert(`获取日志失败: ${error.message}`);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'failed':
        return '❌';
      case 'building':
        return '⏳';
      case 'cancelled':
        return '🚫';
      default:
        return '⏸️';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'status-success';
      case 'failed':
        return 'status-failed';
      case 'building':
        return 'status-building';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return 'status-pending';
    }
  };

  const getBuildTypeLabel = (type: string) => {
    switch (type) {
      case 'web':
        return 'Web 应用';
      case 'android':
        return 'Android APK';
      case 'json':
        return 'JSON 配置';
      default:
        return type;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!currentApp) {
    return (
      <div className="app-builder-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-builder-page">
      <div className="builder-header">
        <button className="btn-back" onClick={() => navigate('/publish/apps')}>
          ← 返回
        </button>
        <h1>构建应用: {currentApp.name}</h1>
      </div>

      <div className="builder-content">
        {/* 构建配置区 */}
        <section className="builder-section">
          <h2>构建配置</h2>

          <div className="build-form">
            <div className="form-field">
              <label>版本号</label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                disabled={building}
              />
            </div>

            <div className="form-field">
              <label>构建类型</label>
              <div className="build-type-options">
                <label className={buildType === 'web' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="buildType"
                    value="web"
                    checked={buildType === 'web'}
                    onChange={(e) => setBuildType(e.target.value as BuildType)}
                    disabled={building}
                  />
                  <span className="option-icon">🌐</span>
                  <span className="option-label">Web 应用</span>
                  <span className="option-desc">打包为可部署的 Web 应用</span>
                </label>

                <label className={buildType === 'android' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="buildType"
                    value="android"
                    checked={buildType === 'android'}
                    onChange={(e) => setBuildType(e.target.value as BuildType)}
                    disabled={building}
                  />
                  <span className="option-icon">📱</span>
                  <span className="option-label">Android APK</span>
                  <span className="option-desc">打包为 Android 安装包</span>
                </label>

                <label className={buildType === 'json' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="buildType"
                    value="json"
                    checked={buildType === 'json'}
                    onChange={(e) => setBuildType(e.target.value as BuildType)}
                    disabled={building}
                  />
                  <span className="option-icon">📄</span>
                  <span className="option-label">JSON 配置</span>
                  <span className="option-desc">导出为 JSON 配置文件</span>
                </label>
              </div>
            </div>

            <button
              className="btn-primary btn-build"
              onClick={handleStartBuild}
              disabled={building || !version.trim()}
            >
              {building ? '🔨 构建中...' : '🚀 开始构建'}
            </button>
          </div>
        </section>

        {/* 构建日志区 */}
        {logs.length > 0 && (
          <section className="builder-section">
            <div className="section-header">
              <h2>构建日志</h2>
              <label className="auto-scroll-toggle">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                />
                自动滚动
              </label>
            </div>

            <div className="build-logs">
              {logs.map((log, index) => (
                <div key={index} className={`log-entry log-${log.level}`}>
                  <span className="log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="log-level">[{log.level.toUpperCase()}]</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </section>
        )}

        {/* 构建历史区 */}
        <section className="builder-section">
          <h2>构建历史</h2>

          {builds.length === 0 ? (
            <div className="empty-state">
              <p>暂无构建记录</p>
            </div>
          ) : (
            <div className="builds-list">
              {builds.map((build) => (
                <div key={build.id} className="build-item">
                  <div className="build-item-header">
                    <span className={`build-status ${getStatusColor(build.status)}`}>
                      {getStatusIcon(build.status)} {build.status}
                    </span>
                    <span className="build-type">{getBuildTypeLabel(build.buildType)}</span>
                    <span className="build-version">v{build.version}</span>
                  </div>

                  <div className="build-item-meta">
                    <span>开始: {new Date(build.startedAt).toLocaleString()}</span>
                    <span>耗时: {formatDuration(build.duration)}</span>
                    {build.output && (
                      <span>大小: {formatSize(build.output.size)}</span>
                    )}
                  </div>

                  <div className="build-item-actions">
                    {build.logs && (
                      <button onClick={() => handleViewLogs(build)}>查看日志</button>
                    )}
                    {build.status === 'success' && build.output && (
                      <button
                        className="btn-primary"
                        onClick={() => handleDownload(build)}
                      >
                        📥 下载
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AppBuilderPage;
