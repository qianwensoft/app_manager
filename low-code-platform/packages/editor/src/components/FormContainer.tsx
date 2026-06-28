import React, { useState, useEffect } from 'react';
import { createForm } from '@formily/core';
import { FormProvider } from '@formily/react';

interface FormContainerProps {
  formKey: string;
  dataInterfaceCode?: string;
  initialValues?: any;
  onSubmit?: (values: any) => Promise<void>;
  children: React.ReactNode;
}

/**
 * 表单容器组件
 * 用于 Puck 中包裹多个 FormilyField，统一管理表单状态和提交
 */
export function FormContainer({
  formKey,
  dataInterfaceCode,
  initialValues,
  onSubmit,
  children,
}: FormContainerProps) {
  const [form] = useState(() =>
    createForm({
      values: initialValues,
    })
  );

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      await form.validate();
      const values = form.values;

      if (dataInterfaceCode) {
        // 调用 DataInterface 提交数据
        const response = await fetch(`/api/data/interfaces/invoke/${dataInterfaceCode}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ param_values: values }),
        });

        if (!response.ok) {
          throw new Error('Failed to submit form');
        }

        const result = await response.json();
        console.log('Form submitted successfully:', result);
        alert('提交成功！');
      }

      // 自定义提交处理
      if (onSubmit) {
        await onSubmit(values);
      }
    } catch (error: any) {
      console.error('Form submission error:', error);
      alert(`提交失败: ${error.message}`);
    }
  };

  return (
    <FormProvider form={form}>
      <div className="form-container">
        {children}
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            提交
          </button>
          <button
            type="button"
            onClick={() => form.reset()}
            className="ml-2 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            重置
          </button>
        </div>
      </div>
    </FormProvider>
  );
}

// Puck Config 中的 FormContainer 配置
export const FormContainerConfig = {
  fields: {
    formKey: {
      type: 'text',
      label: 'Form Key',
    },
    dataInterfaceCode: {
      type: 'text',
      label: 'Data Interface Code',
    },
    submitButtonText: {
      type: 'text',
      label: 'Submit Button Text',
    },
    resetButtonText: {
      type: 'text',
      label: 'Reset Button Text',
    },
  },
  defaultProps: {
    formKey: 'form1',
    dataInterfaceCode: '',
    submitButtonText: '提交',
    resetButtonText: '重置',
  },
  render: ({ formKey, dataInterfaceCode, submitButtonText, resetButtonText, puck }: any) => {
    return (
      <FormContainer formKey={formKey} dataInterfaceCode={dataInterfaceCode}>
        {puck.renderDropZone(`form-${formKey}`)}
      </FormContainer>
    );
  },
};
