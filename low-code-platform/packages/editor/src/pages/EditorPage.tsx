import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';
import { config } from '../puck-config';
import { pageApi } from '../api/client';
import { i18n } from '../i18n';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { toast, confirm } from '../components/Toast';
import type { Data } from '@measured/puck';
import { useYjsCollab } from '../collab/useYjsCollab';

export default function EditorPage() {
  const [searchParams] = useSearchParams();
  const pageId = searchParams.get('id') ? parseInt(searchParams.get('id')!) : undefined;
  const t = i18n.t();

  const [data, setData] = useState<Data>({
    content: [],
    root: {},
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

  // Yjs 协同编辑
  const collab = useYjsCollab({
    pageId: pageId || 0,
    initialData: data,
    onChange: setData,
    enabled: !!pageId,
  });

  // 监听连接状态变化并提示用户
  useEffect(() => {
    if (!pageId) return;

    if (collab.connectionStatus === 'disconnected') {
      toast.warning('协同编辑连接断开，正在尝试重连...');
    } else if (collab.connectionStatus === 'connected' && collab.isConnected) {
      // 仅在重连成功时提示（初次连接不提示）
      const isReconnect = sessionStorage.getItem(`yjs-reconnect-${pageId}`);
      if (isReconnect) {
        toast.success('协同编辑已重新连接');
        sessionStorage.removeItem(`yjs-reconnect-${pageId}`);
      }
    }

    // 记录断开状态，用于判断是否为重连
    if (collab.connectionStatus === 'disconnected') {
      sessionStorage.setItem(`yjs-reconnect-${pageId}`, 'true');
    }
  }, [collab.connectionStatus, collab.isConnected, pageId]);

  // 加载页面数据
  useEffect(() => {
    if (pageId) {
      setLoading(true);
      pageApi
        .get(pageId)
        .then((page) => {
          console.log('编辑器加载的数据:', page);

          // 兼容后端可能返回 puck_state 或 puckState
          const rawState = (page as any).puck_state || page.puckState;

          // puckState 可能是对象或 JSON 字符串
          let puckState;
          if (typeof rawState === 'string') {
            puckState = JSON.parse(rawState);
          } else {
            puckState = rawState || { content: [], root: {} };
          }
          setData(puckState);
        })
        .catch((error) => {
          console.error(t.messages.loadFailed + ':', error);
          toast.error(t.messages.loadFailed + ': ' + error.message);
        })
        .finally(() => setLoading(false));
    }
  }, [pageId]);

  // 保存页面
  const handleSave = async () => {
    if (!pageId) {
      toast.warning(t.messages.noPageId);
      return;
    }

    console.log('保存数据:', data);
    console.log('页面ID:', pageId);

    setSaving(true);
    try {
      // 使用后端期望的字段名 puck_state（下划线）
      const payload: any = { puck_state: JSON.stringify(data) };
      console.log('发送请求:', payload);

      const result = await pageApi.update(pageId, payload);
      console.log('保存成功:', result);

      toast.success(t.messages.saveSuccess);
    } catch (error: any) {
      console.error(t.messages.saveFailed + ':', error);
      toast.error(t.messages.saveFailed + ': ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // 发布页面
  const handlePublish = async () => {
    if (!pageId) {
      toast.warning(t.messages.noPageId);
      return;
    }

    // 先保存
    await handleSave();

    setPublishing(true);
    try {
      await pageApi.publish(pageId);
      const url = `${window.location.origin}/preview?id=${pageId}`;
      setPublishedUrl(url);
      toast.success('发布成功！\n\n访问链接: ' + url);
    } catch (error: any) {
      console.error('发布失败:', error);
      toast.error('发布失败: ' + error.message);
    } finally {
      setPublishing(false);
    }
  };

  // 预览页面
  const handlePreview = () => {
    if (!pageId) {
      toast.warning(t.messages.noPageId);
      return;
    }
    window.open(`/preview?id=${pageId}`, '_blank');
  };

  // 复制链接
  const handleCopyLink = () => {
    if (publishedUrl) {
      navigator.clipboard.writeText(publishedUrl).then(() => {
        toast.success('链接已复制到剪贴板');
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">{t.editor.loading}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Puck 编辑器带自定义头部 */}
      <Puck
        config={config}
        data={data}
        onPublish={async (data: Data) => {
          setData(data);
          collab.updateData(data);
          await handleSave();
        }}
        onChange={(newData) => {
          setData(newData);
          collab.updateData(newData);
        }}
        overrides={{
          header: () => (
            <div className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between" style={{ minHeight: '64px' }}>
              <div className="flex items-center gap-4">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900">{t.editor.title}</h1>
                {pageId && <span className="hidden sm:inline-block text-sm text-gray-500">{t.editor.pageId}: {pageId}</span>}
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <LanguageSwitcher />
                {/* 连接状态指示器 */}
                {pageId && (
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm ${
                    collab.connectionStatus === 'connected'
                      ? 'bg-green-100 text-green-700'
                      : collab.connectionStatus === 'connecting'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${
                      collab.connectionStatus === 'connected'
                        ? 'bg-green-500 animate-pulse'
                        : collab.connectionStatus === 'connecting'
                        ? 'bg-yellow-500 animate-pulse'
                        : 'bg-red-500'
                    }`} />
                    <span>
                      {collab.connectionStatus === 'connected' && collab.userCount > 0 && `${collab.userCount} 人在线`}
                      {collab.connectionStatus === 'connected' && collab.userCount === 0 && '已连接'}
                      {collab.connectionStatus === 'connecting' && '连接中...'}
                      {collab.connectionStatus === 'disconnected' && '连接断开'}
                    </span>
                  </div>
                )}
                {publishedUrl && (
                  <button
                    onClick={handleCopyLink}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200 cursor-pointer font-medium shadow-sm hover:shadow"
                    title={publishedUrl}
                    aria-label={t.editor.copyLink}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span className="hidden md:inline">{t.editor.copyLink}</span>
                  </button>
                )}
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors duration-200 cursor-pointer font-medium shadow-sm hover:shadow"
                  aria-label={t.editor.preview}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="hidden sm:inline">{t.editor.preview}</span>
                </button>
                <button
                  onClick={handlePublish}
                  disabled={publishing}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer font-medium shadow-sm hover:shadow"
                  aria-label={t.editor.publish}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span className="hidden sm:inline">{publishing ? t.editor.publishing : t.editor.publish}</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer font-medium shadow-sm hover:shadow"
                  aria-label={t.editor.save}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  <span className="hidden sm:inline">{saving ? t.editor.saving : t.editor.save}</span>
                </button>
                <button
                  onClick={() => window.history.back()}
                  className="hidden md:flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200 cursor-pointer font-medium"
                  aria-label={t.editor.back}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  {t.editor.back}
                </button>
              </div>
            </div>
          ),
        }}
      />
    </div>
  );
}
