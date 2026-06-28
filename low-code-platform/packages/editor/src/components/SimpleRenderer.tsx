import React from 'react';
import type { Data } from '@measured/puck';
import type { Config } from '@measured/puck';

interface SimpleRendererProps {
  data: Data;
  config: Config;
}

export const SimpleRenderer: React.FC<SimpleRendererProps> = ({ data, config }) => {
  console.log('SimpleRenderer rendering with data:', data);
  console.log('Available components:', Object.keys(config.components));

  const renderComponent = (item: any): React.ReactNode => {
    console.log('Rendering component:', item.type, item.props);

    const componentConfig = config.components[item.type];

    if (!componentConfig) {
      console.warn(`Unknown component type: ${item.type}`);
      return (
        <div className="border-2 border-yellow-500 p-4 bg-yellow-50">
          <p className="text-yellow-700 font-semibold">未知组件类型</p>
          <p className="text-sm text-yellow-600">{item.type}</p>
        </div>
      );
    }

    // 获取组件的 render 函数
    const Component = componentConfig.render;

    if (!Component || typeof Component !== 'function') {
      console.warn(`Component ${item.type} has no render function`);
      return (
        <div className="border-2 border-orange-500 p-4 bg-orange-50">
          <p className="text-orange-700 font-semibold">组件无渲染函数</p>
          <p className="text-sm text-orange-600">{item.type}</p>
        </div>
      );
    }

    // 处理 zones（子组件）
    const zones = data.zones || {};
    const itemZones = Object.keys(zones).filter(key => key.startsWith(item.props.id + ':'));

    // 创建简化的 puck 对象（用于 Container 等需要 renderDropZone 的组件）
    const puck = {
      renderDropZone: (zoneId: string) => {
        // 尝试多种可能的 zone key 格式
        const possibleKeys = [
          `${item.props.id}:${zoneId}`,      // Container-xxx:container
          `${item.props.id}:undefined`,       // Container-xxx:undefined
          `${item.props.id}`,                 // Container-xxx
        ];

        console.log(`renderDropZone called for ${zoneId}`);
        console.log('Possible keys:', possibleKeys);
        console.log('All zones:', zones);

        let zoneContent = null;
        let foundKey = null;

        for (const key of possibleKeys) {
          if (zones[key]) {
            zoneContent = zones[key];
            foundKey = key;
            break;
          }
        }

        console.log('Found zone key:', foundKey);
        console.log('Zone content:', zoneContent);

        if (!zoneContent || !Array.isArray(zoneContent)) {
          console.log('No zone content found');
          return null; // 返回 null 而不是提示，保持界面简洁
        }

        console.log(`Rendering ${zoneContent.length} children in zone`);

        return (
          <React.Fragment>
            {zoneContent.map((child) => (
              <React.Fragment key={child.props.id}>
                {renderComponent(child)}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      },
    };

    try {
      const rendered = <Component {...item.props} puck={puck} />;
      console.log('Component rendered successfully:', item.type);
      return rendered;
    } catch (error) {
      console.error(`Error rendering component ${item.type}:`, error);
      return (
        <div className="border-2 border-red-500 p-4 bg-red-50">
          <p className="text-red-700 font-semibold">渲染错误</p>
          <p className="text-sm text-red-600">{item.type}: {String(error)}</p>
        </div>
      );
    }
  };

  if (!data.content || data.content.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl text-gray-600">页面内容为空</p>
          <p className="text-sm text-gray-500 mt-2">请在编辑器中添加组件</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {data.content.map((item, index) => {
        console.log(`Rendering content item ${index}:`, item);
        return (
          <React.Fragment key={item.props?.id || index}>
            {renderComponent(item)}
          </React.Fragment>
        );
      })}
    </div>
  );
};
