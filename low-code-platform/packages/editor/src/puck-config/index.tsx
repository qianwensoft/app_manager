import type { Config } from '@measured/puck';
import { FormilyFieldConfig } from '../components/FormilyField';
import { FormContainerConfig } from '../components/FormContainer';
import { DataTableConfig } from '../components/DataTable';
import { AdvancedDataTableConfig } from '../components/AdvancedDataTableConfig';
import { ChartConfig } from '../components/Chart';
import { i18n } from '../i18n';

// 基础组件配置
export const config: Config = {
  components: {
    // 表格容器
    FormContainer: FormContainerConfig,

    // Formily 字段组件
    FormilyField: FormilyFieldConfig,

    // 数据表格组件
    DataTable: DataTableConfig,

    // 高级表格组件
    AdvancedTable: AdvancedDataTableConfig,

    // 图表组件
    Chart: ChartConfig,

    // 布局组件
    Container: {
      label: i18n.t().components.container,
      fields: {
        padding: {
          type: 'select',
          label: i18n.t().properties.padding,
          options: [
            { label: i18n.t().options.none, value: 'none' },
            { label: i18n.t().options.small, value: 'small' },
            { label: i18n.t().options.medium, value: 'medium' },
            { label: i18n.t().options.large, value: 'large' },
          ],
        },
        maxWidth: {
          type: 'select',
          label: i18n.t().properties.maxWidth,
          options: [
            { label: i18n.t().options.none, value: 'none' },
            { label: `${i18n.t().options.small} (640px)`, value: 'sm' },
            { label: `${i18n.t().options.medium} (768px)`, value: 'md' },
            { label: `${i18n.t().options.large} (1024px)`, value: 'lg' },
            { label: `${i18n.t().options.xLarge} (1280px)`, value: 'xl' },
          ],
        },
      },
      defaultProps: {
        padding: 'medium',
        maxWidth: 'lg',
      },
      render: ({ padding, maxWidth, puck }) => {
        const paddingClass = {
          none: '',
          small: 'p-2',
          medium: 'p-4',
          large: 'p-8',
        }[padding];

        const maxWidthClass = {
          none: '',
          sm: 'max-w-sm',
          md: 'max-w-md',
          lg: 'max-w-lg',
          xl: 'max-w-xl',
        }[maxWidth];

        return (
          <div className={`${paddingClass} ${maxWidthClass} mx-auto`}>
            {puck.renderDropZone ? puck.renderDropZone('container') : null}
          </div>
        );
      },
    },

    // 文本组件
    Text: {
      label: i18n.t().components.text,
      fields: {
        text: {
          type: 'textarea',
          label: i18n.t().properties.text,
        },
        size: {
          type: 'select',
          label: i18n.t().properties.size,
          options: [
            { label: i18n.t().options.small, value: 'sm' },
            { label: i18n.t().options.medium, value: 'md' },
            { label: i18n.t().options.large, value: 'lg' },
            { label: i18n.t().options.xLarge, value: 'xl' },
          ],
        },
        align: {
          type: 'select',
          label: i18n.t().properties.align,
          options: [
            { label: i18n.t().options.left, value: 'left' },
            { label: i18n.t().options.center, value: 'center' },
            { label: i18n.t().options.right, value: 'right' },
          ],
        },
      },
      defaultProps: {
        text: i18n.t().defaults.enterText,
        size: 'md',
        align: 'left',
      },
      render: ({ text, size, align }) => {
        const sizeClass = {
          sm: 'text-sm',
          md: 'text-base',
          lg: 'text-lg',
          xl: 'text-xl',
        }[size];

        const alignClass = {
          left: 'text-left',
          center: 'text-center',
          right: 'text-right',
        }[align];

        return <p className={`${sizeClass} ${alignClass}`}>{text}</p>;
      },
    },

    // 按钮组件
    Button: {
      label: i18n.t().components.button,
      fields: {
        text: {
          type: 'text',
          label: i18n.t().properties.text,
        },
        variant: {
          type: 'select',
          label: i18n.t().properties.variant,
          options: [
            { label: i18n.t().options.primary, value: 'primary' },
            { label: i18n.t().options.secondary, value: 'secondary' },
            { label: i18n.t().options.outline, value: 'outline' },
          ],
        },
        size: {
          type: 'select',
          label: i18n.t().properties.size,
          options: [
            { label: i18n.t().options.small, value: 'sm' },
            { label: i18n.t().options.medium, value: 'md' },
            { label: i18n.t().options.large, value: 'lg' },
          ],
        },
      },
      defaultProps: {
        text: i18n.t().defaults.clickMe,
        variant: 'primary',
        size: 'md',
      },
      render: ({ text, variant, size }) => {
        const baseClass = 'px-4 py-2 rounded font-medium transition-colors';

        const variantClass = {
          primary: 'bg-blue-500 text-white hover:bg-blue-600',
          secondary: 'bg-gray-500 text-white hover:bg-gray-600',
          outline: 'border-2 border-blue-500 text-blue-500 hover:bg-blue-50',
        }[variant];

        const sizeClass = {
          sm: 'text-sm px-3 py-1',
          md: 'text-base px-4 py-2',
          lg: 'text-lg px-6 py-3',
        }[size];

        return (
          <button className={`${baseClass} ${variantClass} ${sizeClass}`}>
            {text}
          </button>
        );
      },
    },

    // 图片组件
    Image: {
      label: i18n.t().components.image,
      fields: {
        url: {
          type: 'text',
          label: i18n.t().properties.url,
        },
        alt: {
          type: 'text',
          label: i18n.t().properties.alt,
        },
        width: {
          type: 'select',
          label: i18n.t().properties.width,
          options: [
            { label: i18n.t().options.auto, value: 'auto' },
            { label: i18n.t().options.full, value: 'full' },
            { label: '1/2', value: '1/2' },
            { label: '1/3', value: '1/3' },
          ],
        },
      },
      defaultProps: {
        url: 'https://via.placeholder.com/400x300',
        alt: i18n.t().defaults.placeholderImage,
        width: 'full',
      },
      render: ({ url, alt, width }) => {
        const widthClass = {
          auto: 'w-auto',
          full: 'w-full',
          '1/2': 'w-1/2',
          '1/3': 'w-1/3',
        }[width];

        return (
          <img
            src={url}
            alt={alt}
            className={`${widthClass} h-auto object-cover rounded`}
          />
        );
      },
    },

    // 卡片组件
    Card: {
      label: i18n.t().components.card,
      fields: {
        title: {
          type: 'text',
          label: i18n.t().properties.title,
        },
        content: {
          type: 'textarea',
          label: i18n.t().properties.content,
        },
        bordered: {
          type: 'radio',
          label: i18n.t().properties.bordered,
          options: [
            { label: i18n.t().options.none, value: false },
            { label: '有边框', value: true },
          ],
        },
      },
      defaultProps: {
        title: i18n.t().defaults.cardTitle,
        content: i18n.t().defaults.cardContent,
        bordered: true,
      },
      render: ({ title, content, bordered }) => {
        return (
          <div
            className={`bg-white rounded-lg p-4 ${
              bordered ? 'border border-gray-200 shadow-sm' : 'shadow-md'
            }`}
          >
            {title && (
              <h3 className="text-lg font-semibold mb-2 text-gray-900">
                {title}
              </h3>
            )}
            {content && <p className="text-gray-600">{content}</p>}
          </div>
        );
      },
    },

    // 分割线组件
    Divider: {
      label: i18n.t().components.divider,
      fields: {
        type: {
          type: 'select',
          label: i18n.t().properties.type,
          options: [
            { label: i18n.t().options.solid, value: 'solid' },
            { label: i18n.t().options.dashed, value: 'dashed' },
            { label: i18n.t().options.dotted, value: 'dotted' },
          ],
        },
        orientation: {
          type: 'select',
          label: '方向',
          options: [
            { label: i18n.t().options.horizontal, value: 'horizontal' },
            { label: i18n.t().options.vertical, value: 'vertical' },
          ],
        },
      },
      defaultProps: {
        type: 'solid',
        orientation: 'horizontal',
      },
      render: ({ type, orientation }) => {
        const borderStyle = {
          solid: 'border-solid',
          dashed: 'border-dashed',
          dotted: 'border-dotted',
        }[type];

        if (orientation === 'horizontal') {
          return (
            <div className={`border-t border-gray-300 ${borderStyle} my-4`} />
          );
        } else {
          return (
            <div
              className={`border-l border-gray-300 ${borderStyle} mx-4 h-16 inline-block`}
            />
          );
        }
      },
    },

    // 徽章组件
    Badge: {
      label: i18n.t().components.badge,
      fields: {
        text: {
          type: 'text',
          label: i18n.t().properties.text,
        },
        color: {
          type: 'select',
          label: i18n.t().properties.color,
          options: [
            { label: i18n.t().options.primary, value: 'primary' },
            { label: i18n.t().options.success, value: 'success' },
            { label: i18n.t().options.warning, value: 'warning' },
            { label: i18n.t().options.error, value: 'error' },
            { label: i18n.t().options.info, value: 'info' },
          ],
        },
      },
      defaultProps: {
        text: i18n.t().defaults.badgeText,
        color: 'primary',
      },
      render: ({ text, color }) => {
        const colorClass = {
          primary: 'bg-blue-100 text-blue-800',
          success: 'bg-green-100 text-green-800',
          warning: 'bg-yellow-100 text-yellow-800',
          error: 'bg-red-100 text-red-800',
          info: 'bg-gray-100 text-gray-800',
        }[color];

        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}
          >
            {text}
          </span>
        );
      },
    },

    // 提示组件
    Alert: {
      label: i18n.t().components.alert,
      fields: {
        type: {
          type: 'select',
          label: i18n.t().properties.type,
          options: [
            { label: i18n.t().options.info, value: 'info' },
            { label: i18n.t().options.success, value: 'success' },
            { label: i18n.t().options.warning, value: 'warning' },
            { label: i18n.t().options.error, value: 'error' },
          ],
        },
        title: {
          type: 'text',
          label: i18n.t().properties.title,
        },
        message: {
          type: 'textarea',
          label: i18n.t().properties.content,
        },
        showIcon: {
          type: 'radio',
          label: i18n.t().properties.showIcon,
          options: [
            { label: '显示', value: true },
            { label: '隐藏', value: false },
          ],
        },
      },
      defaultProps: {
        type: 'info',
        title: i18n.t().defaults.alertTitle,
        message: i18n.t().defaults.alertMessage,
        showIcon: true,
      },
      render: ({ type, title, message, showIcon }) => {
        const typeConfig = {
          info: {
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            text: 'text-blue-800',
            icon: 'ℹ️',
          },
          success: {
            bg: 'bg-green-50',
            border: 'border-green-200',
            text: 'text-green-800',
            icon: '✓',
          },
          warning: {
            bg: 'bg-yellow-50',
            border: 'border-yellow-200',
            text: 'text-yellow-800',
            icon: '⚠',
          },
          error: {
            bg: 'bg-red-50',
            border: 'border-red-200',
            text: 'text-red-800',
            icon: '✕',
          },
        }[type];

        return (
          <div
            className={`${typeConfig.bg} ${typeConfig.border} border rounded-lg p-4`}
          >
            <div className="flex">
              {showIcon && (
                <div className="flex-shrink-0 text-2xl mr-3">
                  {typeConfig.icon}
                </div>
              )}
              <div className="flex-1">
                {title && (
                  <h3 className={`text-sm font-medium ${typeConfig.text} mb-1`}>
                    {title}
                  </h3>
                )}
                {message && (
                  <p className={`text-sm ${typeConfig.text}`}>{message}</p>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
  },
};
