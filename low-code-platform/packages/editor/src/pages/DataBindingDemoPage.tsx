/**
 * 数据绑定演示页面
 */

import React, { useState } from 'react';
import { DataBindingPanel } from '../bindings/DataBindingPanel';
import { DataPreview } from '../bindings/DataPreview';
import { useBindingContext, useInterfaceData, useDatasetData } from '../bindings/useDataBinding';
import type { DataBinding } from '../bindings/types';
import './DataBindingDemoPage.css';

export const DataBindingDemoPage: React.FC = () => {
  const [binding1, setBinding1] = useState<DataBinding | null>(null);
  const [binding2, setBinding2] = useState<DataBinding | null>(null);
  const { context, setVariable } = useBindingContext();

  // 演示：使用接口数据
  const { data: interfaceData, loading: interfaceLoading } = useInterfaceData('users', {
    page: 1,
    pageSize: 10,
  });

  // 演示：使用数据集数据
  const { data: datasetData, loading: datasetLoading } = useDatasetData(1, {
    status: 'active',
  });

  const handleSetVariable = () => {
    setVariable('demoVar', { message: 'Hello from variable!', timestamp: Date.now() });
  };

  return (
    <div className="data-binding-demo-page">
      <div className="page-header">
        <h1>数据绑定演示</h1>
        <p>演示数据绑定组件的各种功能</p>
      </div>

      <div className="demo-grid">
        {/* 演示 1: 数据绑定配置面板 */}
        <div className="demo-section">
          <h2>📋 数据绑定配置面板</h2>
          <p>为组件属性配置数据绑定</p>

          <div className="demo-content">
            <DataBindingPanel
              componentId="demo-component-1"
              propertyPath="data"
              currentBinding={binding1 || undefined}
              onBindingChange={(binding) => setBinding1(binding)}
            />

            {binding1 && (
              <div className="result-section">
                <h3>预览结果</h3>
                <DataPreview binding={binding1} maxHeight={300} />
              </div>
            )}
          </div>
        </div>

        {/* 演示 2: 另一个绑定配置 */}
        <div className="demo-section">
          <h2>🔗 多个数据绑定</h2>
          <p>同一页面可以有多个独立的数据绑定</p>

          <div className="demo-content">
            <DataBindingPanel
              componentId="demo-component-2"
              propertyPath="options"
              currentBinding={binding2 || undefined}
              onBindingChange={(binding) => setBinding2(binding)}
            />

            {binding2 && (
              <div className="result-section">
                <h3>预览结果</h3>
                <DataPreview binding={binding2} maxHeight={300} />
              </div>
            )}
          </div>
        </div>

        {/* 演示 3: 使用 Hook 直接获取数据 */}
        <div className="demo-section">
          <h2>🎣 使用 React Hook</h2>
          <p>使用 useInterfaceData 和 useDatasetData Hook</p>

          <div className="demo-content">
            <div className="hook-demo">
              <h3>useInterfaceData('users')</h3>
              {interfaceLoading ? (
                <div className="loading">加载中...</div>
              ) : interfaceData ? (
                <pre className="data-display">{JSON.stringify(interfaceData, null, 2)}</pre>
              ) : (
                <div className="empty">暂无数据</div>
              )}
            </div>

            <div className="hook-demo">
              <h3>useDatasetData(1)</h3>
              {datasetLoading ? (
                <div className="loading">加载中...</div>
              ) : datasetData ? (
                <pre className="data-display">{JSON.stringify(datasetData, null, 2)}</pre>
              ) : (
                <div className="empty">暂无数据</div>
              )}
            </div>
          </div>
        </div>

        {/* 演示 4: 绑定上下文 */}
        <div className="demo-section">
          <h2>🌐 绑定上下文</h2>
          <p>管理全局变量和上下文</p>

          <div className="demo-content">
            <button onClick={handleSetVariable} className="btn-primary">
              设置变量 demoVar
            </button>

            <div className="context-display">
              <h3>当前上下文</h3>
              <pre>{JSON.stringify(context, null, 2)}</pre>
            </div>
          </div>
        </div>

        {/* 演示 5: 表达式绑定 */}
        <div className="demo-section full-width">
          <h2>🧮 表达式绑定示例</h2>
          <p>使用表达式进行数据计算和转换</p>

          <div className="demo-content">
            <div className="expression-examples">
              <div className="example">
                <h4>变量引用</h4>
                <code>{`{{variables.userName}}`}</code>
              </div>

              <div className="example">
                <h4>对象属性</h4>
                <code>{`{{variables.user.profile.email}}`}</code>
              </div>

              <div className="example">
                <h4>数组过滤</h4>
                <code>variables.users.filter(u =&gt; u.status === 'active')</code>
              </div>

              <div className="example">
                <h4>数据映射</h4>
                <code>variables.items.map(item =&gt; ({`{ label: item.name, value: item.id }`}))</code>
              </div>

              <div className="example">
                <h4>条件判断</h4>
                <code>variables.count &gt; 10 ? 'High' : 'Low'</code>
              </div>

              <div className="example">
                <h4>URL 参数</h4>
                <code>{`{{queryParams.id}}`}</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="feature-list">
        <h2>✨ 核心特性</h2>
        <ul>
          <li>✅ 5 种绑定类型（静态/接口/数据集/变量/表达式）</li>
          <li>✅ 可视化配置界面</li>
          <li>✅ 实时数据预览（JSON/表格视图）</li>
          <li>✅ 变量解析和表达式支持</li>
          <li>✅ 数据转换功能</li>
          <li>✅ 自动刷新机制</li>
          <li>✅ 数据缓存策略</li>
          <li>✅ React Hooks API</li>
          <li>✅ 上下文管理</li>
          <li>✅ 多组件绑定</li>
        </ul>
      </div>
    </div>
  );
};
