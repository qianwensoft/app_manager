import React, { useEffect, useState } from 'react';
import type { ComponentConfig } from '@measured/puck';
import { i18n } from '../i18n';

// Custom debounce hook for search input
function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export interface TableColumn {
  key: string;
  label: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: string; // JavaScript 表达式，用于自定义渲染
}

export interface DataTableProps {
  // 数据源配置
  dataSource: 'static' | 'api' | 'context';
  staticData?: string; // JSON 字符串
  apiUrl?: string;
  apiMethod?: 'GET' | 'POST';
  apiParams?: string; // JSON 字符串
  contextPath?: string; // 从上下文读取数据的路径

  // 列配置
  columns: TableColumn[];

  // 分页配置
  pagination: boolean;
  pageSize: number;
  pageSizeOptions?: number[];

  // 搜索配置
  enableSearch?: boolean;
  searchPlaceholder?: string;
  searchableColumns?: string;
  searchParamName?: string;
  searchDebounceMs?: number;

  // 样式配置
  striped: boolean;
  bordered: boolean;
  hoverable: boolean;
  compact: boolean;

  // 加载状态
  loading?: boolean;
  emptyText?: string;
}

export const DataTable: React.FC<DataTableProps> = ({
  dataSource = 'static',
  staticData = '[]',
  apiUrl = '',
  apiMethod = 'GET',
  apiParams = '{}',
  contextPath = '',
  columns = [],
  pagination = true,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  enableSearch = true,
  searchPlaceholder = '',
  searchableColumns = '',
  searchParamName = 'search',
  searchDebounceMs = 300,
  striped = true,
  bordered = true,
  hoverable = true,
  compact = false,
  emptyText = '',
}) => {
  const t = i18n.t();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(pageSize);
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce search term for API calls
  const debouncedSearchTerm = useDebounce(searchTerm, searchDebounceMs);

  // Parse searchable columns from comma-separated string
  const searchableColumnsArray = searchableColumns
    ? searchableColumns.split(',').map(col => col.trim()).filter(Boolean)
    : columns.map(col => col.key);

  // Use i18n defaults if not provided
  const finalSearchPlaceholder = searchPlaceholder || t.search.placeholder;
  const finalEmptyText = emptyText || t.search.noData;

  // 加载数据
  useEffect(() => {
    loadData();
  }, [dataSource, staticData, apiUrl, apiMethod, apiParams, currentPage, currentPageSize, debouncedSearchTerm]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    if (searchTerm) {
      setCurrentPage(1);
    }
  }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      let result: any[] = [];

      if (dataSource === 'static') {
        // 静态数据
        try {
          result = JSON.parse(staticData || '[]');

          // Apply search filter
          if (debouncedSearchTerm) {
            const searchLower = debouncedSearchTerm.toLowerCase();
            result = result.filter(row =>
              searchableColumnsArray.some(key =>
                String(row[key] || '').toLowerCase().includes(searchLower)
              )
            );
          }

          setTotal(result.length);
        } catch (e) {
          console.error('Failed to parse static data:', e);
          result = [];
        }
      } else if (dataSource === 'api') {
        // API 数据源
        if (!apiUrl) {
          result = [];
        } else {
          try {
            const params = JSON.parse(apiParams || '{}');

            // Add search parameter if search term exists
            const searchParams = debouncedSearchTerm
              ? { [searchParamName]: debouncedSearchTerm }
              : {};

            const paginationParams = pagination
              ? { page: currentPage, pageSize: currentPageSize }
              : {};

            const allParams = { ...params, ...paginationParams, ...searchParams };

            const url =
              apiMethod === 'GET'
                ? `${apiUrl}?${new URLSearchParams(allParams).toString()}`
                : apiUrl;

            const response = await fetch(url, {
              method: apiMethod,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
              },
              body: apiMethod === 'POST' ? JSON.stringify(allParams) : undefined,
            });

            const json = await response.json();

            // 支持多种响应格式
            if (json.data) {
              result = Array.isArray(json.data) ? json.data : [json.data];
              setTotal(json.total || json.data.length);
            } else if (Array.isArray(json)) {
              result = json;
              setTotal(json.length);
            } else {
              result = [];
            }
          } catch (e) {
            console.error('Failed to fetch API data:', e);
            result = [];
          }
        }
      } else if (dataSource === 'context') {
        // 上下文数据源（从全局状态或父组件传递的数据）
        // 这里需要实现上下文获取逻辑
        result = [];

        // Apply search filter
        if (debouncedSearchTerm && result.length > 0) {
          const searchLower = debouncedSearchTerm.toLowerCase();
          result = result.filter(row =>
            searchableColumnsArray.some(key =>
              String(row[key] || '').toLowerCase().includes(searchLower)
            )
          );
        }

        setTotal(result.length);
      }

      setData(result);
      if (!pagination) {
        setTotal(result.length);
      }
    } finally {
      setLoading(false);
    }
  };

  // 渲染单元格内容
  const renderCell = (row: any, column: TableColumn) => {
    try {
      if (column.render) {
        // 使用自定义渲染表达式
        const func = new Function('row', 'value', `return ${column.render}`);
        return func(row, row[column.key]);
      } else {
        // 默认渲染
        return row[column.key]?.toString() || '';
      }
    } catch (e) {
      console.error('Failed to render cell:', e);
      return row[column.key]?.toString() || '';
    }
  };

  // 分页数据
  const paginatedData = pagination
    ? data.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize)
    : data;

  const totalPages = pagination ? Math.ceil(total / currentPageSize) : 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-500">{t.search.loading}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 border border-gray-300 rounded">
        <div className="text-gray-400">{finalEmptyText}</div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Search Bar */}
      {enableSearch && (
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={finalSearchPlaceholder}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label={t.search.placeholder}
            />
            {/* Search Icon */}
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {/* Clear Button */}
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={t.search.clear}
              >
                ✕
              </button>
            )}
          </div>
          {/* Result Count */}
          {searchTerm && !loading && (
            <span className="text-sm text-gray-600 whitespace-nowrap">
              {t.search.resultsCount.replace('{count}', String(total))}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={`min-w-full ${bordered ? 'border border-gray-300' : ''}`}>
          <thead className="bg-gray-100">
            <tr>
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className={`${compact ? 'px-2 py-1' : 'px-4 py-2'} text-${
                    column.align || 'left'
                  } text-sm font-semibold text-gray-700 ${bordered ? 'border-b border-gray-300' : ''}`}
                  style={{ width: column.width }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={`${striped && rowIdx % 2 === 1 ? 'bg-gray-50' : ''} ${
                  hoverable ? 'hover:bg-gray-100' : ''
                }`}
              >
                {columns.map((column, colIdx) => (
                  <td
                    key={colIdx}
                    className={`${compact ? 'px-2 py-1' : 'px-4 py-2'} text-sm text-gray-700 text-${
                      column.align || 'left'
                    } ${bordered ? 'border-b border-gray-300' : ''}`}
                  >
                    {renderCell(row, column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页控制 */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              共 {total} 条，每页
            </span>
            <select
              value={currentPageSize}
              onChange={(e) => {
                setCurrentPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-600">条</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              上一页
            </button>
            <span className="text-sm text-gray-600">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const DataTableConfig: ComponentConfig<DataTableProps> = {
  label: i18n.t().components.table,
  fields: {
    dataSource: {
      type: 'radio',
      label: '数据源',
      options: [
        { label: '静态数据', value: 'static' },
        { label: 'API 接口', value: 'api' },
        { label: '上下文数据', value: 'context' },
      ],
    },
    staticData: {
      type: 'textarea',
      label: '静态数据（JSON）',
    },
    apiUrl: {
      type: 'text',
      label: 'API 地址',
    },
    apiMethod: {
      type: 'radio',
      label: 'HTTP 方法',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
      ],
    },
    apiParams: {
      type: 'textarea',
      label: 'API 参数（JSON）',
    },
    contextPath: {
      type: 'text',
      label: '上下文路径',
    },
    columns: {
      type: 'array',
      label: '列配置',
      arrayFields: {
        key: {
          type: 'text',
          label: '字段名',
        },
        label: {
          type: 'text',
          label: '列标题',
        },
        width: {
          type: 'text',
          label: '宽度',
        },
        align: {
          type: 'radio',
          label: '对齐',
          options: [
            { label: '左', value: 'left' },
            { label: '中', value: 'center' },
            { label: '右', value: 'right' },
          ],
        },
        render: {
          type: 'textarea',
          label: '自定义渲染（JS 表达式）',
        },
      },
      defaultItemProps: {
        key: 'field',
        label: '列',
        align: 'left',
      },
    },
    pagination: {
      type: 'radio',
      label: '分页',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    pageSize: {
      type: 'number',
      label: '每页条数',
    },
    enableSearch: {
      type: 'radio',
      label: '启用搜索',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    searchPlaceholder: {
      type: 'text',
      label: '搜索框占位符',
    },
    searchableColumns: {
      type: 'text',
      label: '可搜索字段（逗号分隔，留空则全部）',
    },
    searchParamName: {
      type: 'text',
      label: 'API 搜索参数名',
    },
    searchDebounceMs: {
      type: 'number',
      label: '搜索防抖延迟（毫秒）',
    },
    striped: {
      type: 'radio',
      label: '斑马纹',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    bordered: {
      type: 'radio',
      label: '边框',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    hoverable: {
      type: 'radio',
      label: '悬停高亮',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    compact: {
      type: 'radio',
      label: '紧凑模式',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    emptyText: {
      type: 'text',
      label: '空数据提示',
    },
  },
  defaultProps: {
    dataSource: 'static',
    staticData: JSON.stringify(
      [
        { id: 1, name: '张三', age: 25, city: '北京' },
        { id: 2, name: '李四', age: 30, city: '上海' },
        { id: 3, name: '王五', age: 28, city: '广州' },
      ],
      null,
      2
    ),
    apiUrl: '/api/data',
    apiMethod: 'GET',
    apiParams: '{}',
    contextPath: 'tableData',
    columns: [
      { key: 'id', label: 'ID', width: '80px', align: 'center' },
      { key: 'name', label: '姓名', align: 'left' },
      { key: 'age', label: '年龄', width: '100px', align: 'center' },
      { key: 'city', label: '城市', align: 'left' },
    ],
    pagination: true,
    pageSize: 10,
    enableSearch: true,
    searchPlaceholder: '',
    searchableColumns: '',
    searchParamName: 'search',
    searchDebounceMs: 300,
    striped: true,
    bordered: true,
    hoverable: true,
    compact: false,
    emptyText: '',
  },
  render: (props) => <DataTable {...props} />,
};
