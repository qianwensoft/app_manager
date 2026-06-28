import React from 'react';
import { createForm } from '@formily/core';
import { FormProvider, Field } from '@formily/react';
import { FormItem, Input, NumberPicker, Select, Password } from '@formily/antd-v5';
import { Button, Space, message } from 'antd';

/**
 * 表单验证示例组件
 * 展示 Formily 的各种验证能力
 */
export default function ValidationExample() {
  const form = createForm({
    validateFirst: true, // 遇到第一个错误就停止验证
  });

  const handleSubmit = async () => {
    try {
      await form.submit(async (values) => {
        console.log('Form values:', values);
        message.success('表单验证通过并提交成功！');
      });
    } catch (error) {
      message.error('表单验证失败');
    }
  };

  return (
    <FormProvider form={form}>
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6">表单验证示例</h2>

        {/* 必填验证 */}
        <Field
          name="username"
          title="用户名"
          required
          decorator={[FormItem]}
          component={[Input, { placeholder: '请输入用户名' }]}
          validator={[
            { required: true, message: '用户名不能为空' },
            { min: 3, message: '用户名至少3个字符' },
            { max: 20, message: '用户名最多20个字符' },
          ]}
        />

        {/* 正则验证 */}
        <Field
          name="email"
          title="邮箱"
          required
          decorator={[FormItem]}
          component={[Input, { placeholder: '请输入邮箱' }]}
          validator={[
            { required: true, message: '邮箱不能为空' },
            { format: 'email', message: '邮箱格式不正确' },
          ]}
        />

        {/* 数字范围验证 */}
        <Field
          name="age"
          title="年龄"
          required
          decorator={[FormItem]}
          component={[NumberPicker, { placeholder: '请输入年龄', style: { width: '100%' } }]}
          validator={[
            { required: true, message: '年龄不能为空' },
            { minimum: 18, message: '年龄必须大于等于18' },
            { maximum: 100, message: '年龄必须小于等于100' },
          ]}
        />

        {/* 自定义验证 */}
        <Field
          name="password"
          title="密码"
          required
          decorator={[FormItem]}
          component={[Password, { placeholder: '请输入密码' }]}
          validator={[
            { required: true, message: '密码不能为空' },
            { min: 6, message: '密码至少6个字符' },
            {
              validator: (value: string) => {
                if (!/[A-Z]/.test(value)) {
                  return '密码必须包含至少一个大写字母';
                }
                if (!/[a-z]/.test(value)) {
                  return '密码必须包含至少一个小写字母';
                }
                if (!/[0-9]/.test(value)) {
                  return '密码必须包含至少一个数字';
                }
                return true;
              },
            },
          ]}
        />

        {/* 确认密码验证 */}
        <Field
          name="confirmPassword"
          title="确认密码"
          required
          decorator={[FormItem]}
          component={[Password, { placeholder: '请再次输入密码' }]}
          validator={[
            { required: true, message: '确认密码不能为空' },
            {
              validator: (value: string, rule, context) => {
                const password = context.field?.query('password').value();
                if (value !== password) {
                  return '两次输入的密码不一致';
                }
                return true;
              },
            },
          ]}
        />

        {/* 异步验证 */}
        <Field
          name="mobile"
          title="手机号"
          required
          decorator={[FormItem, { tooltip: '异步验证手机号是否已注册' }]}
          component={[Input, { placeholder: '请输入手机号' }]}
          validator={[
            { required: true, message: '手机号不能为空' },
            { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确' },
            {
              validator: async (value: string) => {
                // 模拟异步验证
                await new Promise((resolve) => setTimeout(resolve, 500));

                // 模拟已注册的手机号
                if (value === '13800138000') {
                  return '该手机号已注册';
                }
                return true;
              },
            },
          ]}
        />

        {/* 联动验证 */}
        <Field
          name="gender"
          title="性别"
          required
          decorator={[FormItem]}
          component={[
            Select,
            {
              placeholder: '请选择性别',
              options: [
                { label: '男', value: 'male' },
                { label: '女', value: 'female' },
                { label: '其他', value: 'other' },
              ],
            },
          ]}
          validator={[{ required: true, message: '性别不能为空' }]}
        />

        {/* 提交按钮 */}
        <FormItem>
          <Space>
            <Button type="primary" onClick={handleSubmit}>
              提交
            </Button>
            <Button onClick={() => form.reset()}>重置</Button>
            <Button onClick={() => form.validate()}>仅验证</Button>
          </Space>
        </FormItem>
      </div>
    </FormProvider>
  );
}
