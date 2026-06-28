import React, { useEffect, useState, useCallback } from 'react';
import { AdvancedTable, type ColumnFilters, type FilterCondition } from './AdvancedTable';
import type { ColumnDef } from '@tanstack/react-table';

export interface AdvancedDataTableProps {
  // 数据源配置
  dataSource: 'static' | 'api' | 'context';
  staticData?: any[];
  apiUrl?: string;
  apiMethod?: 'GET' | 'POST';
  apiHeaders?: Record<string, string>;
  apiParams?: Record<string, any>;
  contextKey?: string;

  // 列配置
  columns: Array<{
    id: string;
    accessorKey: string;
    header: string;
    size?: number;
    editable?: boolean;
    fixed?: 'left' | 'right';
    type?: 'text' | 'number' | 'date';
  }>;

  // 表格功能开关
  enableEditing?: boolean;
  enableFiltering?: boolean;
  enableExport?: boolean;
  enablePagination?: boolean;
  enablePaste?: boolean;
  enableZebraStripes?: boolean;
  enableCrossHighlight?: boolean;

  // 编辑配置
  editTriggerMode?: 'click' | 'doubleClick';
  autoSave?: boolean;

  // 分页配置
  pageSize?: number;
  serverSidePagination?: boolean;

  // 过滤配置
  serverSideFiltering?: boolean;

  // 样式配置
  zebraStripeColor?: string;
  crossHighlightColor?: string;

  // 回调
  onDataChange?: (data: any[]) => void;
  onFilterChange?: (filters: ColumnFilters) => void;
  onPageChange?: (page: number) => void;

  // 表格 ID（用于配置持久化）
  tableId?: string;
}

export const AdvancedDataTable: React.FC<AdvancedDataTableProps> = ({
  dataSource = 'static',
  staticData = [],
  apiUrl = '',
  apiMethod = 'GET',
  apiHeaders = {},
  apiParams = {},
  contextKey = '',
  columns = [],
  enableEditing = false,
  enableFiltering = true,
  enableExport = true,
  enablePagination = false,
  enablePaste = false,
  enableZebraStripes = true,
  enableCrossHighlight = true,
  editTriggerMode = 'doubleClick',
  autoSave = false,
  pageSize = 20,
  serverSidePagination = false,
  serverSideFiltering = false,
  zebraStripeColor,
  crossHighlightColor,
  onDataChange,
  onFilterChange,
  onPageChange,
  tableId,
}) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentFilters, setCurrentFilters] = useState<ColumnFilters>({});

  // 转换列配置为 AdvancedTable 格式
  const tableColumns: ColumnDef<any>[] = columns.map((col) => ({
    id: col.id,
    accessorKey: col.accessorKey,
    header: col.header,
    size: col.size || 150,
    meta: {
      editable: col.editable !== false,
      fixed: col.fixed,
      type: col.type,
    },
  }));

  // 加载数据函数
  const loadData = useCallback(async () => {
    if (dataSource === 'static') {
      setData(staticData);
      setTotalCount(staticData.length);
      return;
    }

    if (dataSource === 'api' && apiUrl) {
      setLoading(true);
      setError(null);

      try {
        // 构建请求参数
        const params: Record<string, any> = { ...apiParams };

        // 添加分页参数
        if (serverSidePagination && enablePagination) {
          params.page = currentPage + 1;
          params.pageSize = pageSize;
        }

        // 添加过滤参数
        if (serverSideFiltering && enableFiltering) {
          // 将 ColumnFilters 转换为 API 参数
          Object.entries(currentFilters).forEach(([columnId, filters]) => {
            filters.forEach((filter, index) => {
              const prefix = `filter_${columnId}_${index}`;
              params[`${prefix}_operator`] = filter.operator;
              if (filter.value !== undefined) {
                params[`${prefix}_value`] = filter.value;
              }
            });
          });
        }

        let response: Response;

        if (apiMethod === 'GET') {
          const queryString = new URLSearchParams(
            Object.entries(params).reduce((acc, [key, value]) => {
              acc[key] = String(value);
              return acc;
            }, {} as Record<string, string>)
          ).toString();
          const url = queryString ? `${apiUrl}?${queryString}` : apiUrl;
          response = await fetch(url, {
            headers: apiHeaders,
          });
        } else {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...apiHeaders,
            },
            body: JSON.stringify(params),
          });
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        // 支持多种响应格式
        if (Array.isArray(result)) {
          setData(result);
          setTotalCount(result.length);
        } else if (result.data && Array.isArray(result.data)) {
          setData(result.data);
          setTotalCount(result.total || result.data.length);
        } else {
          throw new Error('Invalid API response format');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '加载数据失败';
        setError(errorMsg);
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    }

    if (dataSource === 'context') {
      // TODO: 从上下文获取数据
      console.warn('Context data source not yet implemented');
    }
  }, [
    dataSource,
    staticData,
    apiUrl,
    apiMethod,
    apiHeaders,
    apiParams,
    contextKey,
    currentPage,
    pageSize,
    currentFilters,
    serverSidePagination,
    serverSideFiltering,
    enablePagination,
    enableFiltering,
  ]);

  // 初始加载和依赖变化时重新加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 处理数据变化
  const handleDataChange = useCallback((newData: any[]) => {
    setData(newData);
    onDataChange?.(newData);
  }, [onDataChange]);

  // 处理过滤变化
  const handleFilterChange = useCallback(
    (columnId: string, filters: FilterCondition[], allFilters: ColumnFilters) => {
      setCurrentFilters(allFilters);
      onFilterChange?.(allFilters);

      // 如果是服务端过滤，重置到第一页并重新加载
      if (serverSideFiltering) {
        setCurrentPage(0);
      }
    },
    [onFilterChange, serverSideFiltering]
  );

  // 处理分页变化
  const handlePageChange = useCallback(
    (pageIndex: number) => {
      setCurrentPage(pageIndex);
      onPageChange?.(pageIndex);
    },
    [onPageChange]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-500">错误: {error}</div>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">请配置表格列</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AdvancedTable
        data={data}
        columns={tableColumns}
        onDataChange={handleDataChange}
        onFilterChange={handleFilterChange}
        enableEditing={enableEditing}
        enableFiltering={enableFiltering}
        enableExport={enableExport}
        enablePaste={enablePaste}
        enableZebraStripes={enableZebraStripes}
        enableCrossHighlight={enableCrossHighlight}
        editTriggerMode={editTriggerMode}
        autoSave={autoSave}
        zebraStripeColor={zebraStripeColor}
        crossHighlightColor={crossHighlightColor}
        enablePagination={enablePagination}
        pagination={
          enablePagination
            ? {
                pageIndex: currentPage,
                pageSize: pageSize,
                totalCount: totalCount,
              }
            : undefined
        }
        onPageChange={handlePageChange}
        tableId={tableId}
      />
    </div>
  );
};
