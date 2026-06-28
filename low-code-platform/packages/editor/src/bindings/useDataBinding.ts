/**
 * 数据绑定 React Hooks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dataBindingManager } from './DataBindingManager';
import type { DataBinding, DataBindingConfig, BindingContext, DataBindingResult } from './types';

/**
 * 使用数据绑定
 */
export function useDataBinding(bindingId: string, dependencies: any[] = []) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    try {
      const result = await dataBindingManager.executeBinding(bindingId, forceRefresh);
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [bindingId]);

  useEffect(() => {
    execute();
  }, [execute, ...dependencies]);

  const refresh = useCallback(() => {
    execute(true);
  }, [execute]);

  return { data, loading, error, refresh };
}

/**
 * 使用组件数据绑定
 */
export function useComponentBindings(componentId: string) {
  const [bindings, setBindings] = useState<DataBindingConfig[]>([]);
  const [boundData, setBoundData] = useState<Record<string, any>>({});

  useEffect(() => {
    const componentBindings = dataBindingManager.getComponentBindings(componentId);
    setBindings(componentBindings);

    // 执行所有绑定
    const executeAll = async () => {
      const results: Record<string, any> = {};

      for (const binding of componentBindings) {
        if (binding.enabled) {
          const result = await dataBindingManager.executeBinding(binding.id);
          if (result.success) {
            results[binding.propertyPath] = result.data;
          }
        }
      }

      setBoundData(results);
    };

    executeAll();
  }, [componentId]);

  return { bindings, boundData };
}

/**
 * 使用绑定上下文
 */
export function useBindingContext() {
  const [context, setContextState] = useState<BindingContext>(dataBindingManager.getContext());

  const updateContext = useCallback((updates: Partial<BindingContext>) => {
    dataBindingManager.updateContext(updates);
    setContextState(dataBindingManager.getContext());
  }, []);

  const setVariable = useCallback((name: string, value: any) => {
    const newContext = dataBindingManager.getContext();
    newContext.variables[name] = value;
    dataBindingManager.updateContext(newContext);
    setContextState(newContext);
  }, []);

  const getVariable = useCallback((name: string) => {
    return dataBindingManager.getContext().variables[name];
  }, []);

  return {
    context,
    updateContext,
    setVariable,
    getVariable,
  };
}

/**
 * 使用动态数据（根据配置动态获取）
 */
export function useDynamicData(binding: DataBinding, dependencies: any[] = []) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bindingIdRef = useRef<string>(`dynamic-${Date.now()}`);

  useEffect(() => {
    const bindingId = bindingIdRef.current;

    // 注册临时绑定
    dataBindingManager.registerBinding({
      id: bindingId,
      componentId: 'dynamic',
      propertyPath: 'data',
      binding,
      enabled: true,
    });

    const execute = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await dataBindingManager.executeBinding(bindingId, true);
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Unknown error');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    execute();

    // 清理
    return () => {
      dataBindingManager.unregisterBinding(bindingId);
    };
  }, [JSON.stringify(binding), ...dependencies]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await dataBindingManager.executeBinding(bindingIdRef.current, true);
      if (result.success) {
        setData(result.data);
      } else {
        setError(result.error || 'Unknown error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, refresh };
}

/**
 * 使用接口数据
 */
export function useInterfaceData(
  slug: string,
  params?: Record<string, any>,
  options?: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    cache?: boolean;
  }
) {
  const binding: DataBinding = {
    type: 'interface',
    interfaceSlug: slug,
    params,
    autoRefresh: options?.autoRefresh,
    refreshInterval: options?.refreshInterval,
    cache: options?.cache,
  };

  return useDynamicData(binding, [slug, JSON.stringify(params)]);
}

/**
 * 使用数据集数据
 */
export function useDatasetData(
  datasetId: number,
  params?: Record<string, any>,
  options?: {
    autoRefresh?: boolean;
    refreshInterval?: number;
    cache?: boolean;
  }
) {
  const binding: DataBinding = {
    type: 'dataset',
    datasetId,
    datasetParams: params,
    autoRefresh: options?.autoRefresh,
    refreshInterval: options?.refreshInterval,
    cache: options?.cache,
  };

  return useDynamicData(binding, [datasetId, JSON.stringify(params)]);
}
