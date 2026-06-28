// 国际化配置
export type Locale = 'zh-CN' | 'en-US';

export interface I18nMessages {
  // Puck 编辑器
  editor: {
    title: string;
    save: string;
    saving: string;
    back: string;
    publish: string;
    publishing: string;
    preview: string;
    copyLink: string;
    loading: string;
    pageId: string;
  };
  // 组件
  components: {
    container: string;
    text: string;
    button: string;
    image: string;
    table: string;
    formContainer: string;
    formilyField: string;
    card: string;
    divider: string;
    badge: string;
    alert: string;
    chart: string;
  };
  // 属性
  properties: {
    padding: string;
    maxWidth: string;
    text: string;
    size: string;
    align: string;
    variant: string;
    url: string;
    alt: string;
    width: string;
    columns: string;
    rows: string;
    striped: string;
    bordered: string;
    hoverable: string;
    title: string;
    content: string;
    type: string;
    color: string;
    closable: string;
    showIcon: string;
    chartType: string;
    height: string;
    dataSource: string;
    xField: string;
    yField: string;
  };
  // 选项值
  options: {
    none: string;
    small: string;
    medium: string;
    large: string;
    xLarge: string;
    left: string;
    center: string;
    right: string;
    primary: string;
    secondary: string;
    outline: string;
    auto: string;
    full: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    solid: string;
    dashed: string;
    dotted: string;
    horizontal: string;
    vertical: string;
    line: string;
    bar: string;
    pie: string;
    scatter: string;
    area: string;
  };
  // 默认值
  defaults: {
    enterText: string;
    clickMe: string;
    placeholderImage: string;
    tableHeader: string;
    tableCell: string;
    cardTitle: string;
    cardContent: string;
    badgeText: string;
    alertTitle: string;
    alertMessage: string;
  };
  // 消息
  messages: {
    saveSuccess: string;
    saveFailed: string;
    loadFailed: string;
    noPageId: string;
  };
  // 搜索
  search: {
    placeholder: string;
    clear: string;
    resultsCount: string;
    loading: string;
    noData: string;
  };
}

const zhCN: I18nMessages = {
  editor: {
    title: '低代码编辑器',
    save: '保存',
    saving: '保存中...',
    back: '返回',
    publish: '发布',
    publishing: '发布中...',
    preview: '预览',
    copyLink: '复制链接',
    loading: '加载中...',
    pageId: '页面 ID',
  },
  components: {
    container: '容器',
    text: '文本',
    button: '按钮',
    image: '图片',
    table: '表格',
    formContainer: '表单容器',
    formilyField: '表单字段',
    card: '卡片',
    divider: '分割线',
    badge: '徽章',
    alert: '提示',
    chart: '图表',
  },
  properties: {
    padding: '内边距',
    maxWidth: '最大宽度',
    text: '文本',
    size: '大小',
    align: '对齐',
    variant: '样式',
    url: '链接',
    alt: '替代文本',
    width: '宽度',
    columns: '列数',
    rows: '行数',
    striped: '斑马纹',
    bordered: '边框',
    hoverable: '悬停高亮',
    title: '标题',
    content: '内容',
    type: '类型',
    color: '颜色',
    closable: '可关闭',
    showIcon: '显示图标',
    chartType: '图表类型',
    height: '高度',
    dataSource: '数据源',
    xField: 'X轴字段',
    yField: 'Y轴字段',
  },
  options: {
    none: '无',
    small: '小',
    medium: '中',
    large: '大',
    xLarge: '超大',
    left: '左对齐',
    center: '居中',
    right: '右对齐',
    primary: '主要',
    secondary: '次要',
    outline: '轮廓',
    auto: '自动',
    full: '全宽',
    success: '成功',
    warning: '警告',
    error: '错误',
    info: '信息',
    solid: '实线',
    dashed: '虚线',
    dotted: '点线',
    horizontal: '水平',
    vertical: '垂直',
    line: '折线图',
    bar: '柱状图',
    pie: '饼图',
    scatter: '散点图',
    area: '面积图',
  },
  defaults: {
    enterText: '在此输入文本',
    clickMe: '点击我',
    placeholderImage: '占位图片',
    tableHeader: '表头',
    tableCell: '单元格',
    cardTitle: '卡片标题',
    cardContent: '卡片内容',
    badgeText: 'New',
    alertTitle: '提示信息',
    alertMessage: '这是一条提示消息',
  },
  messages: {
    saveSuccess: '页面保存成功！',
    saveFailed: '保存页面失败',
    loadFailed: '加载页面失败',
    noPageId: '未提供页面 ID',
  },
  search: {
    placeholder: '搜索...',
    clear: '清除',
    resultsCount: '共 {count} 条结果',
    loading: '加载中...',
    noData: '暂无数据',
  },
};

const enUS: I18nMessages = {
  editor: {
    title: 'Low-Code Editor',
    save: 'Save',
    saving: 'Saving...',
    back: 'Back',
    publish: 'Publish',
    publishing: 'Publishing...',
    preview: 'Preview',
    copyLink: 'Copy Link',
    loading: 'Loading...',
    pageId: 'Page ID',
  },
  components: {
    container: 'Container',
    text: 'Text',
    button: 'Button',
    image: 'Image',
    table: 'Table',
    formContainer: 'Form Container',
    formilyField: 'Form Field',
    card: 'Card',
    divider: 'Divider',
    badge: 'Badge',
    alert: 'Alert',
    chart: 'Chart',
  },
  properties: {
    padding: 'Padding',
    maxWidth: 'Max Width',
    text: 'Text',
    size: 'Size',
    align: 'Align',
    variant: 'Variant',
    url: 'URL',
    alt: 'Alt Text',
    width: 'Width',
    columns: 'Columns',
    rows: 'Rows',
    striped: 'Striped',
    bordered: 'Bordered',
    hoverable: 'Hoverable',
    title: 'Title',
    content: 'Content',
    type: 'Type',
    color: 'Color',
    closable: 'Closable',
    showIcon: 'Show Icon',
    chartType: 'Chart Type',
    height: 'Height',
    dataSource: 'Data Source',
    xField: 'X Field',
    yField: 'Y Field',
  },
  options: {
    none: 'None',
    small: 'Small',
    medium: 'Medium',
    large: 'Large',
    xLarge: 'XLarge',
    left: 'Left',
    center: 'Center',
    right: 'Right',
    primary: 'Primary',
    secondary: 'Secondary',
    outline: 'Outline',
    auto: 'Auto',
    full: 'Full',
    success: 'Success',
    warning: 'Warning',
    error: 'Error',
    info: 'Info',
    solid: 'Solid',
    dashed: 'Dashed',
    dotted: 'Dotted',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    line: 'Line',
    bar: 'Bar',
    pie: 'Pie',
    scatter: 'Scatter',
    area: 'Area',
  },
  defaults: {
    enterText: 'Enter text here',
    clickMe: 'Click me',
    placeholderImage: 'Placeholder image',
    tableHeader: 'Header',
    tableCell: 'Cell',
    cardTitle: 'Card Title',
    cardContent: 'Card content',
    badgeText: 'New',
    alertTitle: 'Alert Title',
    alertMessage: 'This is an alert message',
  },
  messages: {
    saveSuccess: 'Page saved successfully!',
    saveFailed: 'Failed to save page',
    loadFailed: 'Failed to load page',
    noPageId: 'No page ID provided',
  },
  search: {
    placeholder: 'Search...',
    clear: 'Clear',
    resultsCount: '{count} results',
    loading: 'Loading...',
    noData: 'No data',
  },
};

const messages: Record<Locale, I18nMessages> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

class I18n {
  private locale: Locale = 'zh-CN';

  setLocale(locale: Locale) {
    this.locale = locale;
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', locale);
    }
  }

  getLocale(): Locale {
    return this.locale;
  }

  t(): I18nMessages {
    return messages[this.locale];
  }

  initialize() {
    if (typeof window !== 'undefined') {
      const savedLocale = localStorage.getItem('locale') as Locale;
      if (savedLocale && messages[savedLocale]) {
        this.locale = savedLocale;
      }
    }
  }
}

export const i18n = new I18n();
i18n.initialize();
