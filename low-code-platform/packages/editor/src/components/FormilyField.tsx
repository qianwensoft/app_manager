import React from 'react';
import { createForm } from '@formily/core';
import { FormProvider, Field } from '@formily/react';
import {
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
import type { FormilyFieldSchema } from '@lowcode/schema';

interface FormilyFieldProps {
  fieldSchema: FormilyFieldSchema;
  fieldKey: string;
  value?: any;
  onChange?: (value: any) => void;
}

// Formily 字段组件（作为 Puck 组件使用）
export function FormilyField({ fieldSchema, fieldKey, value, onChange }: FormilyFieldProps) {
  const form = createForm({
    values: value ? { [fieldKey]: value } : undefined,
    effects() {
      // 监听字段变化
      if (onChange) {
        form.addEffects('onChange', () => {
          onChange(form.values[fieldKey]);
        });
      }
    },
  });

  return (
    <FormProvider form={form}>
      <Field
        name={fieldKey}
        title={fieldSchema.title}
        decorator={[FormItem]}
        component={[getFormilyComponent(fieldSchema['x-component'] || 'Input'), fieldSchema['x-component-props']]}
        required={fieldSchema['x-validator']?.some((v: any) => v.required)}
        {...fieldSchema}
      />
    </FormProvider>
  );
}

// 映射 Formily 组件
function getFormilyComponent(componentName: string) {
  const componentMap: Record<string, any> = {
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
  };

  return componentMap[componentName] || Input;
}

// Puck Config 中的 FormilyField 配置
export const FormilyFieldConfig = {
  fields: {
    fieldKey: {
      type: 'text',
      label: 'Field Key',
    },
    title: {
      type: 'text',
      label: 'Field Title',
    },
    component: {
      type: 'select',
      label: 'Component Type',
      options: [
        { label: 'Input', value: 'Input' },
        { label: 'TextArea', value: 'Input.TextArea' },
        { label: 'Number', value: 'InputNumber' },
        { label: 'Select', value: 'Select' },
        { label: 'DatePicker', value: 'DatePicker' },
        { label: 'DateRangePicker', value: 'DatePicker.RangePicker' },
        { label: 'TimePicker', value: 'TimePicker' },
        { label: 'Checkbox', value: 'Checkbox' },
        { label: 'Checkbox Group', value: 'Checkbox.Group' },
        { label: 'Radio Group', value: 'Radio.Group' },
        { label: 'Switch', value: 'Switch' },
        { label: 'Upload', value: 'Upload' },
        { label: 'TreeSelect', value: 'TreeSelect' },
        { label: 'Cascader', value: 'Cascader' },
        { label: 'Transfer', value: 'Transfer' },
      ],
    },
    required: {
      type: 'radio',
      label: 'Required',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ],
    },
    placeholder: {
      type: 'text',
      label: 'Placeholder',
    },
    // Select/Checkbox/Radio 选项
    options: {
      type: 'textarea',
      label: 'Options (JSON)',
    },
  },
  defaultProps: {
    fieldKey: 'field1',
    title: 'Field Label',
    component: 'Input',
    required: false,
    placeholder: '',
    options: '',
  },
  render: ({ fieldKey, title, component, required, placeholder, options }: any) => {
    // 解析选项
    let parsedOptions;
    try {
      parsedOptions = options ? JSON.parse(options) : undefined;
    } catch (e) {
      console.warn('Invalid options JSON:', options);
    }

    const fieldSchema: FormilyFieldSchema = {
      type: 'string',
      title,
      'x-component': component,
      'x-decorator': 'FormItem',
      'x-component-props': {
        placeholder,
        options: parsedOptions,
      },
      'x-validator': required ? [{ required: true, message: `${title} is required` }] : undefined,
    };

    return <FormilyField fieldSchema={fieldSchema} fieldKey={fieldKey} />;
  },
};
