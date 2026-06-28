// ============================================
// useEvent - React Hook for Event Management
// ============================================

import { useEffect, useRef, useCallback } from 'react';
import { EventManager, EventType, EventPayload } from './EventManager';

/**
 * 监听事件的 Hook
 */
export function useEventListener(
  type: EventType,
  handler: (payload: EventPayload) => void | Promise<void>,
  options?: { once?: boolean; priority?: number; enabled?: boolean }
): void {
  const handlerRef = useRef(handler);
  const handlerIdRef = useRef<string>();

  // 更新 handler 引用
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const enabled = options?.enabled ?? true;
    if (!enabled) {
      return;
    }

    // 注册事件处理器
    const wrappedHandler = (payload: EventPayload) => {
      return handlerRef.current(payload);
    };

    handlerIdRef.current = EventManager.on(type, wrappedHandler, {
      once: options?.once,
      priority: options?.priority,
    });

    // 清理函数
    return () => {
      if (handlerIdRef.current) {
        EventManager.off(handlerIdRef.current);
      }
    };
  }, [type, options?.once, options?.priority, options?.enabled]);
}

/**
 * 触发事件的 Hook
 */
export function useEventEmitter() {
  return useCallback(
    (
      type: EventType,
      data?: any,
      options?: { source?: string; metadata?: Record<string, any> }
    ) => {
      return EventManager.emit(type, data, options);
    },
    []
  );
}

/**
 * 页面生命周期事件 Hook
 */
export function usePageLifecycle(
  pageId: number,
  callbacks?: {
    onLoad?: () => void | Promise<void>;
    onUnload?: () => void | Promise<void>;
    onShow?: () => void | Promise<void>;
    onHide?: () => void | Promise<void>;
  }
): void {
  const emit = useEventEmitter();

  // 页面加载
  useEffect(() => {
    const loadHandler = async () => {
      await emit('page:load', { pageId }, { source: `page:${pageId}` });
      if (callbacks?.onLoad) {
        await callbacks.onLoad();
      }
    };

    loadHandler();

    // 页面卸载
    return () => {
      const unloadHandler = async () => {
        await emit('page:unload', { pageId }, { source: `page:${pageId}` });
        if (callbacks?.onUnload) {
          await callbacks.onUnload();
        }
      };
      unloadHandler();
    };
  }, [pageId, emit]);

  // 页面显示/隐藏（使用 Page Visibility API）
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        await emit('page:hide', { pageId }, { source: `page:${pageId}` });
        if (callbacks?.onHide) {
          await callbacks.onHide();
        }
      } else {
        await emit('page:show', { pageId }, { source: `page:${pageId}` });
        if (callbacks?.onShow) {
          await callbacks.onShow();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [pageId, emit, callbacks]);
}

/**
 * 组件事件 Hook
 */
export function useComponentEvents(componentId: string) {
  const emit = useEventEmitter();

  const onClick = useCallback(
    async (data?: any) => {
      await emit('component:click', data, { source: componentId });
    },
    [componentId, emit]
  );

  const onChange = useCallback(
    async (data?: any) => {
      await emit('component:change', data, { source: componentId });
    },
    [componentId, emit]
  );

  const onFocus = useCallback(
    async (data?: any) => {
      await emit('component:focus', data, { source: componentId });
    },
    [componentId, emit]
  );

  const onBlur = useCallback(
    async (data?: any) => {
      await emit('component:blur', data, { source: componentId });
    },
    [componentId, emit]
  );

  return {
    onClick,
    onChange,
    onFocus,
    onBlur,
  };
}

/**
 * 表单事件 Hook
 */
export function useFormEvents(formId: string) {
  const emit = useEventEmitter();

  const onSubmit = useCallback(
    async (data: any) => {
      await emit('form:submit', data, { source: formId });
    },
    [formId, emit]
  );

  const onReset = useCallback(
    async () => {
      await emit('form:reset', {}, { source: formId });
    },
    [formId, emit]
  );

  return {
    onSubmit,
    onReset,
  };
}

/**
 * 数据事件 Hook
 */
export function useDataEvents(dataSourceId: string) {
  const emit = useEventEmitter();

  const onSuccess = useCallback(
    async (data: any) => {
      await emit('data:success', data, { source: dataSourceId });
    },
    [dataSourceId, emit]
  );

  const onError = useCallback(
    async (error: any) => {
      await emit('data:error', error, { source: dataSourceId });
    },
    [dataSourceId, emit]
  );

  const onLoading = useCallback(
    async (loading: boolean) => {
      await emit('data:loading', { loading }, { source: dataSourceId });
    },
    [dataSourceId, emit]
  );

  return {
    onSuccess,
    onError,
    onLoading,
  };
}

/**
 * 扫描事件 Hook
 */
export function useScanEvents() {
  const emit = useEventEmitter();

  const onBarcodeScan = useCallback(
    async (code: string, metadata?: Record<string, any>) => {
      await emit('scan:barcode', { code }, { metadata });
    },
    [emit]
  );

  const onQRCodeScan = useCallback(
    async (code: string, metadata?: Record<string, any>) => {
      await emit('scan:qrcode', { code }, { metadata });
    },
    [emit]
  );

  const onNFCScan = useCallback(
    async (data: any, metadata?: Record<string, any>) => {
      await emit('scan:nfc', data, { metadata });
    },
    [emit]
  );

  return {
    onBarcodeScan,
    onQRCodeScan,
    onNFCScan,
  };
}

/**
 * 工作流事件 Hook
 */
export function useWorkflowEvents(workflowId?: string) {
  const emit = useEventEmitter();

  const onStart = useCallback(
    async (data?: any) => {
      await emit('workflow:start', data, { source: workflowId });
    },
    [workflowId, emit]
  );

  const onComplete = useCallback(
    async (data?: any) => {
      await emit('workflow:complete', data, { source: workflowId });
    },
    [workflowId, emit]
  );

  const onError = useCallback(
    async (error: any) => {
      await emit('workflow:error', error, { source: workflowId });
    },
    [workflowId, emit]
  );

  return {
    onStart,
    onComplete,
    onError,
  };
}

/**
 * 外部事件 Hook
 */
export function useExternalEvents() {
  const emit = useEventEmitter();

  const onWebhook = useCallback(
    async (data: any, metadata?: Record<string, any>) => {
      await emit('external:webhook', data, { metadata });
    },
    [emit]
  );

  const onStomp = useCallback(
    async (data: any, metadata?: Record<string, any>) => {
      await emit('external:stomp', data, { metadata });
    },
    [emit]
  );

  const onMqtt = useCallback(
    async (data: any, metadata?: Record<string, any>) => {
      await emit('external:mqtt', data, { metadata });
    },
    [emit]
  );

  return {
    onWebhook,
    onStomp,
    onMqtt,
  };
}

/**
 * 事件历史 Hook
 */
export function useEventHistory(filter?: { type?: EventType; limit?: number }) {
  const [history, setHistory] = React.useState<EventPayload[]>([]);

  useEffect(() => {
    // 初始加载历史
    setHistory(EventManager.getHistory(filter));

    // 监听所有事件以更新历史
    const updateHistory = () => {
      setHistory(EventManager.getHistory(filter));
    };

    // 如果有指定类型，只监听该类型
    if (filter?.type) {
      const handlerId = EventManager.on(filter.type, updateHistory, { priority: -1000 });
      return () => EventManager.off(handlerId);
    }

    // 否则需要监听所有可能的事件类型
    // 这里简化处理，实际项目中可以优化
    const interval = setInterval(updateHistory, 1000);
    return () => clearInterval(interval);
  }, [filter?.type, filter?.limit]);

  return history;
}

// 导入 React（用于 useEventHistory）
import * as React from 'react';
