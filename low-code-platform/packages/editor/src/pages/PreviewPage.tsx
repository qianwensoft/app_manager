import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { config } from '../puck-config';
import { auth } from '../api/client';
import { SimpleRenderer } from '../components/SimpleRenderer';
import type { Data } from '@measured/puck';

export default function PreviewPage() {
  const [searchParams] = useSearchParams();
  const pageId = searchParams.get('id') ? parseInt(searchParams.get('id')!) : undefined;

  const [data, setData] = useState<Data>({
    content: [],
    root: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pageId) {
      setError('缺少页面 ID');
      setLoading(false);
      return;
    }

    // 预览页面专用的 API 请求（不自动跳转到登录页）
    const fetchPage = async () => {
      try {
        const token = auth.getToken();

        // 添加 10 秒超时
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`/api/lowcode/pages/${pageId}`, {
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('此页面需要登录才能预览');
          }
          throw new Error(`加载失败: ${response.statusText}`);
        }

        const result = await response.json();
        const page = result.data || result;

        console.log('预览页面加载的数据:', page);

        // 兼容后端可能返回 puck_state 或 puckState
        const rawState = (page as any).puck_state || page.puckState;
        console.log('原始状态:', rawState);

        // puckState 可能是对象或 JSON 字符串
        let puckState;
        if (!rawState || rawState === '' || rawState === null) {
          throw new Error('页面内容为空，请先在编辑器中添加内容并保存');
        }

        if (typeof rawState === 'string') {
          try {
            puckState = JSON.parse(rawState);
          } catch (e) {
            throw new Error('页面数据格式错误');
          }
        } else {
          puckState = rawState;
        }

        console.log('解析后的状态:', puckState);
        setData(puckState);
      } catch (err: any) {
        console.error('加载页面失败:', err);
        if (err.name === 'AbortError') {
          setError('请求超时，请检查网络连接');
        } else {
          setError(err.message || '加载页面失败');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [pageId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">预览失败</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          {error.includes('登录') && (
            <p className="text-sm text-gray-500 mb-4">
              提示：请在编辑器页面点击"预览"按钮，这样可以自动携带登录凭证
            </p>
          )}
          {error.includes('内容为空') && (
            <p className="text-sm text-gray-500 mb-4">
              提示：请在编辑器中拖入组件，编辑内容后点击"保存"，然后再预览
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            返回
          </button>
          <button
            onClick={() => window.location.href = `/editor?id=${pageId}`}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            打开编辑器
          </button>
        </div>
      </div>
    );
  }

  console.log('Puck config:', config);
  console.log('Data to render:', data);

  // 使用简单渲染器（不依赖 Puck 的 Render 组件）
  return (
    <div className="min-h-screen bg-gray-50">
      <SimpleRenderer data={data} config={config} />
    </div>
  );
}
