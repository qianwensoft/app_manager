import React, { useMemo } from 'react';
import { createForm, onFormSubmit } from '@formily/core';
import { FormProvider, createSchemaField } from '@formily/react';
import {
  Form,
  FormItem,
  Input,
  Select,
  DatePicker,
  NumberPicker,
  Checkbox,
  Radio,
  Switch,
  Upload,
  TreeSelect,
  Cascader,
  Transfer,
  TimePicker,
} from '@formily/antd-v5';
import { Button, Space, message } from 'antd';
import type { ISchema } from '@formily/react';

interface FormRendererProps {
  schema: ISchema;
  onSubmit?: (values: any) => Promise<void> | void;
  onValuesChange?: (values: any) => void;
  initialValues?: any;
  layout?: 'horizontal' | 'vertical' | 'inline';
  labelCol?: number;
  wrapperCol?: number;
}

// 创建 Schema Field
const SchemaField = createSchemaField({
  components: {
    FormItem,
    Input,
    'Input.TextArea': Input.TextArea,
    InputNumber: NumberPicker,
    NumberPicker,
    Select,
    DatePicker,
    'DatePicker.RangePicker': DatePicker.RangePicker,
    TimePicker,
    Checkbox,
    'Checkbox.Group': Checkbox.Group,
    Radio,
    'Radio.Group': Radio.Group,
    Switch,
    Upload,
    TreeSelect,
    Cascader,
    Transfer,
  },
});

/**
 * 表单渲染器
 * 基于 Formily Schema 渲染完整的表单，支持数据绑定、验证、联动等
 */
export default function FormRenderer({
  schema,
  onSubmit,
  onValuesChange,
  initialValues,
  layout = 'vertical',
  labelCol,
  wrapperCol,
}: FormRendererProps) {
  // 创建表单实例
  const form = useMemo(() => {
    const formInstance = createForm({
      initialValues,
      effects() {
        // 监听表单提交
        onFormSubmit(async (form) => {
          const values = form.values;
          try {
            await onSubmit?.(values);
            message.success('提交成功');
          } catch (error: any) {
            message.error(`提交失败: ${error.message}`);
            throw error;
          }
        });

        // 监听表单值变化
        if (onValuesChange) {
          form.addEffects('onValuesChange', () => {
            onValuesChange(form.values);
          });
        }
      },
    });

    return formInstance;
  }, [initialValues, onSubmit, onValuesChange]);

  return (
    <FormProvider form={form}>
      <Form
        form={form}
        layout={layout}
        labelCol={labelCol ? { span: labelCol } : undefined}
        wrapperCol={wrapperCol ? { span: wrapperCol } : undefined}
      >
        <SchemaField schema={schema} />

        <FormItem>
          <Space>
            <Button type="primary" htmlType="submit">
              提交
            </Button>
            <Button onClick={() => form.reset()}>
              重置
            </Button>
          </Space>
        </FormItem>
      </Form>
    </FormProvider>
  );
}
