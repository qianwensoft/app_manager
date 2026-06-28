/**
 * Phase 5: 应用发布 - 类型定义
 *
 * 定义应用、版本、构建相关的数据模型
 */

// ============================================================================
// 应用模型
// ============================================================================

/**
 * 应用状态
 */
export type AppStatus = 'draft' | 'published' | 'archived';

/**
 * 应用主题配置
 */
export interface AppTheme {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: string;
  borderRadius?: string;
  spacing?: string;
}

/**
 * 应用配置
 */
export interface AppConfig {
  title?: string;                    // 应用标题
  baseURL?: string;                  // API 基础 URL
  env?: Record<string, string>;      // 环境变量
  features?: string[];               // 启用的特性开关
  timeout?: number;                  // 请求超时时间（毫秒）
  debug?: boolean;                   // 调试模式
  analytics?: {                      // 分析配置
    enabled: boolean;
    trackingId?: string;
  };
  storage?: {                        // 存储配置
    type: 'localStorage' | 'sessionStorage' | 'memory';
    prefix?: string;
  };
}

/**
 * 页面引用
 */
export interface PageReference {
  pageId: number;
  order: number;                     // 页面顺序
  title?: string;                    // 页面标题（覆盖原标题）
  path?: string;                     // 页面路径
  visible?: boolean;                 // 是否在导航中显示
  icon?: string;                     // 页面图标
}

/**
 * 应用模型
 */
export interface App {
  id: number;
  code: string;                      // 应用唯一标识（URL 友好）
  name: string;                      // 应用名称
  description?: string;              // 应用描述
  icon?: string;                     // 应用图标 URL
  version: string;                   // 当前版本（semver）
  pages: PageReference[];            // 关联的页面列表
  startPageId?: number;              // 启动页面 ID
  theme?: AppTheme;                  // 主题配置
  config?: AppConfig;                // 应用配置
  status: AppStatus;                 // 应用状态
  tags?: string[];                   // 应用标签
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;              // 最后发布时间
  createdBy?: string;                // 创建者
  updatedBy?: string;                // 最后修改者
}

/**
 * 创建应用请求
 */
export interface CreateAppRequest {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  theme?: AppTheme;
  config?: AppConfig;
  tags?: string[];
}

/**
 * 更新应用请求
 */
export interface UpdateAppRequest {
  name?: string;
  description?: string;
  icon?: string;
  pages?: PageReference[];
  startPageId?: number;
  theme?: AppTheme;
  config?: AppConfig;
  status?: AppStatus;
  tags?: string[];
}

// ============================================================================
// 应用版本模型
// ============================================================================

/**
 * 应用版本
 */
export interface AppVersion {
  id: number;
  appId: number;
  version: string;                   // 版本号（semver）
  changelog?: string;                // 变更日志
  snapshot: AppSnapshot;             // 应用快照
  buildId?: number;                  // 关联的构建 ID
  tags?: string[];                   // 版本标签（如 stable, beta）
  createdBy: string;                 // 创建者
  createdAt: string;
}

/**
 * 应用快照（完整配置）
 */
export interface AppSnapshot {
  app: App;                          // 应用配置
  pages: any[];                      // 页面配置列表
  workflows?: any[];                 // 工作流配置列表
  dataSources?: any[];               // 数据源配置列表
  datasets?: any[];                  // 数据集配置列表
  dataInterfaces?: any[];            // 数据接口配置列表
  metadata?: {                       // 元数据
    snapshotAt: string;
    platform: string;
    editorVersion: string;
  };
}

/**
 * 创建版本请求
 */
export interface CreateVersionRequest {
  version: string;
  changelog?: string;
  tags?: string[];
}

/**
 * 版本比较结果
 */
export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: {
    type: 'added' | 'removed' | 'modified';
    category: 'app' | 'page' | 'workflow' | 'dataSource' | 'dataset' | 'dataInterface';
    path: string;                    // JSON path
    oldValue?: any;
    newValue?: any;
  }[];
}

// ============================================================================
// 应用构建模型
// ============================================================================

/**
 * 构建状态
 */
export type BuildStatus = 'pending' | 'building' | 'success' | 'failed' | 'cancelled';

/**
 * 构建类型
 */
export type BuildType = 'web' | 'android' | 'json';

/**
 * 构建输出
 */
export interface BuildOutput {
  size: number;                      // 文件大小（字节）
  url: string;                       // 下载 URL
  files: {                           // 产物文件列表
    path: string;
    size: number;
    url: string;
  }[];
  checksums?: {                      // 校验和
    md5?: string;
    sha256?: string;
  };
}

/**
 * 构建选项
 */
export interface BuildOptions {
  minify?: boolean;                  // 是否压缩
  sourcemap?: boolean;               // 是否生成 sourcemap
  target?: string;                   // 目标环境（如 es2015, es2020）
  publicPath?: string;               // 公共路径
  env?: Record<string, string>;      // 环境变量
  android?: {                        // Android 特定选项
    packageName?: string;
    versionCode?: number;
    versionName?: string;
    keystore?: string;
    keystorePassword?: string;
  };
}

/**
 * 应用构建
 */
export interface AppBuild {
  id: number;
  appId: number;
  version: string;
  status: BuildStatus;
  buildType: BuildType;
  options?: BuildOptions;
  output?: BuildOutput;
  logs?: string;                     // 构建日志
  error?: string;                    // 错误信息
  progress?: number;                 // 构建进度（0-100）
  startedAt: string;
  completedAt?: string;
  duration?: number;                 // 构建耗时（毫秒）
  createdBy?: string;
}

/**
 * 创建构建请求
 */
export interface CreateBuildRequest {
  version: string;
  buildType: BuildType;
  options?: BuildOptions;
}

/**
 * 构建日志条目
 */
export interface BuildLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

// ============================================================================
// 应用发布模型
// ============================================================================

/**
 * 发布目标
 */
export type PublishTarget = 'development' | 'staging' | 'production';

/**
 * 发布策略
 */
export type PublishStrategy = 'replace' | 'bluegreen' | 'canary';

/**
 * 发布请求
 */
export interface PublishRequest {
  version: string;
  target: PublishTarget;
  strategy?: PublishStrategy;
  notes?: string;                    // 发布说明
  rollbackEnabled?: boolean;         // 是否启用自动回滚
}

/**
 * 发布记录
 */
export interface PublishRecord {
  id: number;
  appId: number;
  version: string;
  target: PublishTarget;
  strategy: PublishStrategy;
  status: 'pending' | 'deploying' | 'success' | 'failed' | 'rolled_back';
  notes?: string;
  buildId: number;
  publishedBy: string;
  publishedAt: string;
  completedAt?: string;
  rollbackAt?: string;
  error?: string;
}

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * API 响应
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 分页请求
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 应用筛选参数
 */
export interface AppFilters extends PaginationParams {
  status?: AppStatus;
  tags?: string[];
  search?: string;                   // 搜索关键词
  createdBy?: string;
}

/**
 * 构建筛选参数
 */
export interface BuildFilters extends PaginationParams {
  status?: BuildStatus;
  buildType?: BuildType;
  version?: string;
}

/**
 * 版本筛选参数
 */
export interface VersionFilters extends PaginationParams {
  tags?: string[];
  version?: string;                  // 版本号模式匹配
}
