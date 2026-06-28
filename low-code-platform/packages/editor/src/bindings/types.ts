/**
 * 数据绑定类型定义
 */

export interface DataBinding {
  // 绑定类型
  type: 'static' | 'interface' | 'dataset' | 'variable' | 'expression';

  // 静态数据
  staticValue?: any;

  // 数据接口绑定
  interfaceId?: number;
  interfaceSlug?: string;
  params?: Record<string, any>;

  // 数据集绑定
  datasetId?: number;
  datasetParams?: Record<string, any>;

  // 变量绑定
  variableName?: string;

  // 表达式绑定
  expression?: string;

  // 数据转换
  transform?: string; // JavaScript 代码

  // 刷新配置
  autoRefresh?: boolean;
  refreshInterval?: number; // 秒

  // 缓存配置
  cache?: boolean;
  cacheDuration?: number; // 秒
}

export interface DataBindingConfig {
  id: string;
  componentId: string;
  propertyPath: string; // 如 'data', 'options', 'value'
  binding: DataBinding;
  enabled: boolean;
}

export interface BindingContext {
  // 全局变量
  variables: Record<string, any>;

  // 页面参数
  pageParams: Record<string, any>;

  // URL 查询参数
  queryParams: Record<string, any>;

  // 用户信息
  user?: {
    id: number;
    name: string;
    roles: string[];
    [key: string]: any;
  };

  // 临时数据
  temp: Record<string, any>;
}

export interface DataBindingResult {
  success: boolean;
  data: any;
  error?: string;
  cached?: boolean;
  timestamp: number;
}

/**
 * 表达式变量提取
 */
export function extractVariables(expression: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = regex.exec(expression)) !== null) {
    variables.push(match[1].trim());
  }

  return variables;
}

/**
 * 表达式变量替换
 */
export function resolveExpression(expression: string, context: BindingContext): string {
  return expression.replace(/\{\{([^}]+)\}\}/g, (_, varPath) => {
    const path = varPath.trim();
    const value = getValueByPath(context, path);
    return value !== undefined ? String(value) : '';
  });
}

/**
 * 通过路径获取值
 */
export function getValueByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * 通过路径设置值
 */
export function setValueByPath(obj: any, path: string, value: any): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * 执行数据转换
 */
export function transformData(data: any, transformCode: string, context: BindingContext): any {
  try {
    // 创建安全的执行环境
    const func = new Function('data', 'context', `
      'use strict';
      ${transformCode}
    `);

    return func(data, context);
  } catch (error) {
    console.error('Transform error:', error);
    return data;
  }
}

/**
 * 评估 JavaScript 表达式
 */
export function evaluateExpression(expression: string, context: BindingContext): any {
  try {
    // 创建安全的执行环境
    const func = new Function('context', `
      'use strict';
      with (context) {
        return ${expression};
      }
    `);

    return func(context);
  } catch (error) {
    console.error('Expression evaluation error:', error);
    return undefined;
  }
}
