import type { ComponentConfig } from '@measured/puck';
import { AdvancedDataTable, type AdvancedDataTableProps } from './AdvancedDataTable';

export const AdvancedDataTableConfig: ComponentConfig<AdvancedDataTableProps> = {
  label: '高级表格',
  fields: {
    // 数据源配置
    dataSource: {
      type: 'select',
      label: '数据源',
      options: [
        { label: '静态数据', value: 'static' },
        { label: 'API 接口', value: 'api' },
        { label: '上下文数据', value: 'context' },
      ],
    },
    staticData: {
      type: 'textarea',
      label: '静态数据 (JSON)',
    } as any,
    apiUrl: {
      type: 'text',
      label: 'API 地址',
    },
    apiMethod: {
      type: 'select',
      label: 'HTTP 方法',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
      ],
    },
    apiHeaders: {
      type: 'textarea',
      label: 'API Headers (JSON)',
    } as any,
    apiParams: {
      type: 'textarea',
      label: 'API 参数 (JSON)',
    } as any,
    contextKey: {
      type: 'text',
      label: '上下文键名',
    },

    // 列配置
    columns: {
      type: 'array',
      label: '列配置',
      arrayFields: {
        id: {
          type: 'text',
          label: '列ID',
        },
        accessorKey: {
          type: 'text',
          label: '数据字段',
        },
        header: {
          type: 'text',
          label: '列标题',
        },
        size: {
          type: 'number',
          label: '列宽度',
        },
        editable: {
          type: 'radio',
          label: '可编辑',
          options: [
            { label: '是', value: true },
            { label: '否', value: false },
          ],
        },
        fixed: {
          type: 'select',
          label: '固定位置',
          options: [
            { label: '不固定', value: 'none' as any },
            { label: '固定左侧', value: 'left' },
            { label: '固定右侧', value: 'right' },
          ],
        },
        type: {
          type: 'select',
          label: '数据类型',
          options: [
            { label: '文本', value: 'text' },
            { label: '数字', value: 'number' },
            { label: '日期', value: 'date' },
          ],
        },
      },
      defaultItemProps: {
        id: 'col1',
        accessorKey: 'field1',
        header: '列标题',
        size: 150,
        editable: true,
        fixed: 'none',
        type: 'text',
      },
      getItemSummary: (col: any) => col.header || col.id,
    },

    // 功能开关
    enableEditing: {
      type: 'radio',
      label: '启用编辑',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enableFiltering: {
      type: 'radio',
      label: '启用过滤',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enableExport: {
      type: 'radio',
      label: '启用导出',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enablePagination: {
      type: 'radio',
      label: '启用分页',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enablePaste: {
      type: 'radio',
      label: '启用粘贴',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enableZebraStripes: {
      type: 'radio',
      label: '启用斑马纹',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },
    enableCrossHighlight: {
      type: 'radio',
      label: '启用交叉高亮',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },

    // 编辑配置
    editTriggerMode: {
      type: 'select',
      label: '编辑触发模式',
      options: [
        { label: '单击编辑', value: 'click' },
        { label: '双击编辑', value: 'doubleClick' },
      ],
    },
    autoSave: {
      type: 'radio',
      label: '自动保存',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },

    // 分页配置
    pageSize: {
      type: 'number',
      label: '每页条数',
    },
    serverSidePagination: {
      type: 'radio',
      label: '服务端分页',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },

    // 过滤配置
    serverSideFiltering: {
      type: 'radio',
      label: '服务端过滤',
      options: [
        { label: '是', value: true },
        { label: '否', value: false },
      ],
    },

    // 样式配置
    zebraStripeColor: {
      type: 'text',
      label: '斑马纹颜色',
    },
    crossHighlightColor: {
      type: 'text',
      label: '交叉高亮颜色',
    },

    // 表格 ID
    tableId: {
      type: 'text',
      label: '表格ID (用于配置持久化)',
    },
  },
  defaultProps: {
    dataSource: 'static',
    staticData: JSON.stringify([
      { id: 1, name: '张三', age: 28, city: '北京' },
      { id: 2, name: '李四', age: 32, city: '上海' },
      { id: 3, name: '王五', age: 25, city: '广州' },
    ], null, 2),
    apiUrl: '',
    apiMethod: 'GET',
    apiHeaders: '{}',
    apiParams: '{}',
    contextKey: '',
    columns: [
      { id: 'name', accessorKey: 'name', header: '姓名', size: 120, editable: true, type: 'text' },
      { id: 'age', accessorKey: 'age', header: '年龄', size: 80, editable: true, type: 'number' },
      { id: 'city', accessorKey: 'city', header: '城市', size: 120, editable: true, type: 'text' },
    ],
    enableEditing: false,
    enableFiltering: true,
    enableExport: true,
    enablePagination: false,
    enablePaste: false,
    enableZebraStripes: true,
    enableCrossHighlight: true,
    editTriggerMode: 'doubleClick',
    autoSave: false,
    pageSize: 20,
    serverSidePagination: false,
    serverSideFiltering: false,
    zebraStripeColor: '',
    crossHighlightColor: '',
    tableId: '',
  },
  render: (props) => {
    // 解析 JSON 字段
    let parsedStaticData: any[] = [];
    let parsedApiHeaders: Record<string, string> = {};
    let parsedApiParams: Record<string, any> = {};

    try {
      if (props.staticData && typeof props.staticData === 'string') {
        parsedStaticData = JSON.parse(props.staticData);
      } else if (Array.isArray(props.staticData)) {
        parsedStaticData = props.staticData;
      }
    } catch (e) {
      console.error('Failed to parse staticData:', e);
    }

    try {
      if (props.apiHeaders && typeof props.apiHeaders === 'string') {
        parsedApiHeaders = JSON.parse(props.apiHeaders);
      } else if (typeof props.apiHeaders === 'object') {
        parsedApiHeaders = props.apiHeaders as Record<string, string>;
      }
    } catch (e) {
      console.error('Failed to parse apiHeaders:', e);
    }

    try {
      if (props.apiParams && typeof props.apiParams === 'string') {
        parsedApiParams = JSON.parse(props.apiParams);
      } else if (typeof props.apiParams === 'object') {
        parsedApiParams = props.apiParams as Record<string, any>;
      }
    } catch (e) {
      console.error('Failed to parse apiParams:', e);
    }

    return (
      <AdvancedDataTable
        {...props}
        staticData={parsedStaticData}
        apiHeaders={parsedApiHeaders}
        apiParams={parsedApiParams}
        columns={props.columns.map((col: any) => ({
          ...col,
          fixed: col.fixed === 'none' ? undefined : col.fixed,
        }))}
      />
    );
  },
};

export { AdvancedDataTable };
