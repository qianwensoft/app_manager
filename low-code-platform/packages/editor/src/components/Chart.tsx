import React from 'react';
import ReactECharts from 'echarts-for-react';
import type { ComponentConfig } from '@measured/puck';
import { i18n } from '../i18n';

export interface ChartProps {
  chartType: 'line' | 'bar' | 'pie' | 'scatter' | 'area';
  title?: string;
  height: string;
  data: any[];
  xField?: string;
  yField?: string;
}

export const ChartConfig: ComponentConfig<ChartProps> = {
  label: i18n.t().components.chart,
  fields: {
    chartType: {
      type: 'select',
      label: i18n.t().properties.chartType,
      options: [
        { label: i18n.t().options.line, value: 'line' },
        { label: i18n.t().options.bar, value: 'bar' },
        { label: i18n.t().options.pie, value: 'pie' },
        { label: i18n.t().options.scatter, value: 'scatter' },
        { label: i18n.t().options.area, value: 'area' },
      ],
    },
    title: {
      type: 'text',
      label: i18n.t().properties.title,
    },
    height: {
      type: 'select',
      label: i18n.t().properties.height,
      options: [
        { label: `${i18n.t().options.small} (200px)`, value: '200px' },
        { label: `${i18n.t().options.medium} (300px)`, value: '300px' },
        { label: `${i18n.t().options.large} (400px)`, value: '400px' },
        { label: `${i18n.t().options.xLarge} (500px)`, value: '500px' },
      ],
    },
    data: {
      type: 'textarea',
      label: i18n.t().properties.dataSource,
    },
    xField: {
      type: 'text',
      label: i18n.t().properties.xField,
    },
    yField: {
      type: 'text',
      label: i18n.t().properties.yField,
    },
  },
  defaultProps: {
    chartType: 'bar',
    title: '销售数据',
    height: '300px',
    data: [
      { name: '一月', value: 120 },
      { name: '二月', value: 200 },
      { name: '三月', value: 150 },
      { name: '四月', value: 180 },
      { name: '五月', value: 220 },
      { name: '六月', value: 250 },
    ],
    xField: 'name',
    yField: 'value',
  },
  render: ({ chartType, title, height, data, xField = 'name', yField = 'value' }) => {
    // 解析数据（如果是字符串）
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        parsedData = [];
      }
    }

    // 确保数据是数组
    if (!Array.isArray(parsedData)) {
      parsedData = [];
    }

    // 生成 ECharts 配置
    const getOption = () => {
      switch (chartType) {
        case 'line':
          return {
            title: { text: title, left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: {
              type: 'category',
              data: parsedData.map((item) => item[xField]),
            },
            yAxis: { type: 'value' },
            series: [
              {
                data: parsedData.map((item) => item[yField]),
                type: 'line',
                smooth: true,
              },
            ],
          };

        case 'bar':
          return {
            title: { text: title, left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: {
              type: 'category',
              data: parsedData.map((item) => item[xField]),
            },
            yAxis: { type: 'value' },
            series: [
              {
                data: parsedData.map((item) => item[yField]),
                type: 'bar',
                itemStyle: {
                  color: '#5470c6',
                },
              },
            ],
          };

        case 'pie':
          return {
            title: { text: title, left: 'center' },
            tooltip: { trigger: 'item' },
            series: [
              {
                type: 'pie',
                radius: '50%',
                data: parsedData.map((item) => ({
                  name: item[xField],
                  value: item[yField],
                })),
                emphasis: {
                  itemStyle: {
                    shadowBlur: 10,
                    shadowOffsetX: 0,
                    shadowColor: 'rgba(0, 0, 0, 0.5)',
                  },
                },
              },
            ],
          };

        case 'scatter':
          return {
            title: { text: title, left: 'center' },
            tooltip: { trigger: 'item' },
            xAxis: { type: 'value' },
            yAxis: { type: 'value' },
            series: [
              {
                type: 'scatter',
                data: parsedData.map((item) => [item[xField], item[yField]]),
                symbolSize: 10,
              },
            ],
          };

        case 'area':
          return {
            title: { text: title, left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: {
              type: 'category',
              data: parsedData.map((item) => item[xField]),
            },
            yAxis: { type: 'value' },
            series: [
              {
                data: parsedData.map((item) => item[yField]),
                type: 'line',
                areaStyle: {},
                smooth: true,
              },
            ],
          };

        default:
          return {};
      }
    };

    return (
      <div className="w-full">
        <ReactECharts
          option={getOption()}
          style={{ height }}
          opts={{ renderer: 'svg' }}
        />
      </div>
    );
  },
};
