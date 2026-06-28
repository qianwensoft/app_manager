import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Data } from '@measured/puck';

interface UseYjsCollabOptions {
  pageId: number;
  initialData: Data;
  onChange: (data: Data) => void;
  enabled?: boolean;
}

export function useYjsCollab({ pageId, initialData, onChange, enabled = true }: UseYjsCollabOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [userCount, setUserCount] = useState(0); // 初始值改为 0
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const onChangeRef = useRef(onChange);

  // 保持 onChange 引用最新
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || !pageId) return;

    // 创建 Y.Doc
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // 创建 WebSocket Provider
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 开发环境：连接到后端服务器 8080 端口
    const wsHost = process.env.NODE_ENV === 'development' ? 'localhost:8080' : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/yjs`;
    const roomName = `lowcode-page-${pageId}`;

    const provider = new WebsocketProvider(wsUrl, roomName, ydoc, {
      params: { token: localStorage.getItem('auth_token') || '' },
    });
    providerRef.current = provider;

    // 使用 Y.Map 存储单个 JSON 字符串
    const yData = ydoc.getMap('puckData');

    // 初始化数据（仅当为空时）
    if (!yData.has('json')) {
      ydoc.transact(() => {
        yData.set('json', JSON.stringify(initialData));
      }, 'local'); // 标记为本地事务
    }

    // 监听远程变更
    const observer = (event: Y.YMapEvent<any>, transaction: Y.Transaction) => {
      // 忽略本地事务
      if (transaction.origin === 'local') {
        console.log('[Yjs] Skipping observer - local transaction');
        return;
      }

      const jsonStr = yData.get('json');
      console.log('[Yjs] Received remote data, length:', jsonStr?.length);
      if (jsonStr && typeof jsonStr === 'string') {
        try {
          const data = JSON.parse(jsonStr);
          console.log('[Yjs] Applying remote data:', data);
          onChangeRef.current(data);
        } catch (e) {
          console.error('Failed to parse yjs data:', e, 'Raw data length:', jsonStr?.length);
        }
      }
    };
    yData.observe(observer);

    // 监听连接状态
    provider.on('status', ({ status }: { status: string }) => {
      console.log('[Yjs] Connection status changed:', status);
      setIsConnected(status === 'connected');
      setConnectionStatus(status as 'connecting' | 'connected' | 'disconnected');

      // 连接成功后设置本地 awareness 状态并更新在线人数
      if (status === 'connected') {
        // 设置本地 awareness 状态（这会触发 awareness change 事件）
        provider.awareness.setLocalState({
          user: {
            name: 'User',
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
          },
        });

        const count = provider.awareness.getStates().size;
        console.log('[Yjs] Connected, current user count:', count);
        setUserCount(count);
      }
    });

    // 监听在线用户数
    provider.awareness.on('change', () => {
      const count = provider.awareness.getStates().size;
      console.log('[Yjs] Awareness changed, user count:', count);
      setUserCount(count);
    });

    // 立即获取初始在线人数
    const initialCount = provider.awareness.getStates().size;
    console.log('[Yjs] Initial user count:', initialCount);
    setUserCount(initialCount);

    return () => {
      console.log('[Yjs] Cleaning up - removing awareness state');
      // 清除本地 awareness 状态
      provider.awareness.setLocalState(null);

      yData.unobserve(observer);
      provider.destroy();
      ydoc.destroy();
    };
  }, [pageId, enabled]);

  // 更新本地变更到 yjs
  const updateData = (data: Data) => {
    if (!ydocRef.current) {
      console.log('[Yjs] Skipping updateData - ydoc missing');
      return;
    }

    console.log('[Yjs] Updating local data to yjs:', data);
    const yData = ydocRef.current.getMap('puckData');

    // 使用 transaction origin 标记本地事务
    ydocRef.current.transact(() => {
      yData.set('json', JSON.stringify(data));
    }, 'local');
  };

  return {
    isConnected,
    connectionStatus,
    userCount,
    updateData,
    provider: providerRef.current,
    ydoc: ydocRef.current,
  };
}
