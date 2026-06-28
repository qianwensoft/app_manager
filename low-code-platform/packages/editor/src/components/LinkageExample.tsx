import React from 'react';
import { createForm, onFieldValueChange, onFieldReact } from '@formily/core';
import { FormProvider, Field } from '@formily/react';
import { FormItem, Input, Select, DatePicker, Checkbox, Radio, NumberPicker } from '@formily/antd-v5';
import { Button, Space, message } from 'antd';

/**
 * 表单联动示例组件
 * 展示 Formily 的字段联动能力：依赖、显示/隐藏、级联选择等
 */
export default function LinkageExample() {
  const form = createForm({
    effects() {
      // 示例1: 根据地区显示/隐藏城市
      onFieldValueChange('region', (field) => {
        const cityField = field.query('city').take();
        if (field.value === 'domestic') {
          cityField?.setDisplay('visible');
          cityField?.setComponentProps({
            options: [
              { label: '北京', value: 'beijing' },
              { label: '上海', value: 'shanghai' },
              { label: '广州', value: 'guangzhou' },
              { label: '深圳', value: 'shenzhen' },
            ],
          });
        } else if (field.value === 'international') {
          cityField?.setDisplay('visible');
          cityField?.setComponentProps({
            options: [
              { label: 'New York', value: 'newyork' },
              { label: 'London', value: 'london' },
              { label: 'Tokyo', value: 'tokyo' },
              { label: 'Paris', value: 'paris' },
            ],
          });
        } else {
          cityField?.setDisplay('hidden');
        }
      });

      // 示例2: 根据用户类型显示不同字段
      onFieldValueChange('userType', (field) => {
        const companyField = field.query('company').take();
        const studentIdField = field.query('studentId').take();

        if (field.value === 'employee') {
          companyField?.setDisplay('visible');
          studentIdField?.setDisplay('hidden');
        } else if (field.value === 'student') {
          companyField?.setDisplay('hidden');
          studentIdField?.setDisplay('visible');
        } else {
          companyField?.setDisplay('hidden');
          studentIdField?.setDisplay('hidden');
        }
      });

      // 示例3: 根据是否包邮计算总价
      onFieldReact('*(shippingFee,totalPrice)', (field) => {
        const freeShipping = field.query('freeShipping').value();
        const productPrice = field.query('productPrice').value() || 0;
        const shippingFeeField = field.query('shippingFee').take();
        const totalPriceField = field.query('totalPrice').take();

        if (freeShipping) {
          shippingFeeField?.setValue(0);
          shippingFeeField?.setComponentProps({ disabled: true });
          totalPriceField?.setValue(productPrice);
        } else {
          shippingFeeField?.setComponentProps({ disabled: false });
          const shippingFee = shippingFeeField?.value || 0;
          totalPriceField?.setValue(productPrice + shippingFee);
        }
      });

      // 示例4: 级联选择 - 省市区
      onFieldValueChange('province', (field) => {
        const cityField = field.query('city2').take();
        const districtField = field.query('district').take();

        // 清空下级选项
        cityField?.setValue(undefined);
        districtField?.setValue(undefined);

        // 根据省份设置城市选项
        const cityOptions = getCitiesByProvince(field.value);
        cityField?.setComponentProps({ options: cityOptions });
      });

      onFieldValueChange('city2', (field) => {
        const districtField = field.query('district').take();

        // 清空下级选项
        districtField?.setValue(undefined);

        // 根据城市设置区县选项
        const districtOptions = getDistrictsByCity(field.value);
        districtField?.setComponentProps({ options: districtOptions });
      });

      // 示例5: 动态必填 - 勾选协议后邮箱变为必填
      onFieldValueChange('agreeTerms', (field) => {
        const emailField = field.query('email').take();
        if (field.value) {
          emailField?.setRequired(true);
        } else {
          emailField?.setRequired(false);
        }
      });
    },
  });

  const handleSubmit = async () => {
    try {
      await form.submit(async (values) => {
        console.log('Form values:', values);
        message.success('表单提交成功！');
      });
    } catch (error) {
      message.error('表单验证失败');
    }
  };

  return (
    <FormProvider form={form}>
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6">表单联动示例</h2>

        {/* 示例1: 地区-城市联动 */}
        <div className="mb-8 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">示例1: 地区-城市联动</h3>
          <Field
            name="region"
            title="地区"
            decorator={[FormItem]}
            component={[
              Select,
              {
                placeholder: '请选择地区',
                options: [
                  { label: '国内', value: 'domestic' },
                  { label: '国际', value: 'international' },
                ],
              },
            ]}
          />
          <Field
            name="city"
            title="城市"
            decorator={[FormItem]}
            component={[Select, { placeholder: '请先选择地区' }]}
          />
        </div>

        {/* 示例2: 用户类型联动 */}
        <div className="mb-8 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">示例2: 根据用户类型显示不同字段</h3>
          <Field
            name="userType"
            title="用户类型"
            decorator={[FormItem]}
            component={[
              Radio.Group,
              {
                options: [
                  { label: '职员', value: 'employee' },
                  { label: '学生', value: 'student' },
                  { label: '其他', value: 'other' },
                ],
              },
            ]}
          />
          <Field
            name="company"
            title="公司名称"
            decorator={[FormItem]}
            component={[Input, { placeholder: '请输入公司名称' }]}
          />
          <Field
            name="studentId"
            title="学号"
            decorator={[FormItem]}
            component={[Input, { placeholder: '请输入学号' }]}
          />
        </div>

        {/* 示例3: 价格计算联动 */}
        <div className="mb-8 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">示例3: 价格计算联动</h3>
          <Field
            name="productPrice"
            title="商品价格"
            decorator={[FormItem]}
            component={[NumberPicker, { placeholder: '请输入商品价格', style: { width: '100%' } }]}
          />
          <Field
            name="freeShipping"
            title="包邮"
            decorator={[FormItem]}
            component={[Checkbox, { children: '包邮' }]}
          />
          <Field
            name="shippingFee"
            title="运费"
            decorator={[FormItem]}
            component={[NumberPicker, { placeholder: '运费', style: { width: '100%' } }]}
          />
          <Field
            name="totalPrice"
            title="总价"
            decorator={[FormItem]}
            component={[NumberPicker, { disabled: true, style: { width: '100%' } }]}
          />
        </div>

        {/* 示例4: 省市区级联 */}
        <div className="mb-8 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">示例4: 省市区级联</h3>
          <Field
            name="province"
            title="省份"
            decorator={[FormItem]}
            component={[
              Select,
              {
                placeholder: '请选择省份',
                options: [
                  { label: '广东省', value: 'guangdong' },
                  { label: '浙江省', value: 'zhejiang' },
                  { label: '江苏省', value: 'jiangsu' },
                ],
              },
            ]}
          />
          <Field
            name="city2"
            title="城市"
            decorator={[FormItem]}
            component={[Select, { placeholder: '请先选择省份' }]}
          />
          <Field
            name="district"
            title="区县"
            decorator={[FormItem]}
            component={[Select, { placeholder: '请先选择城市' }]}
          />
        </div>

        {/* 示例5: 动态必填 */}
        <div className="mb-8 p-4 bg-gray-50 rounded">
          <h3 className="text-lg font-semibold mb-4">示例5: 动态必填</h3>
          <Field
            name="agreeTerms"
            title="同意条款"
            decorator={[FormItem]}
            component={[Checkbox, { children: '我已阅读并同意服务条款' }]}
          />
          <Field
            name="email"
            title="邮箱"
            decorator={[FormItem, { tooltip: '勾选同意条款后邮箱变为必填' }]}
            component={[Input, { placeholder: '请输入邮箱' }]}
            validator={[{ format: 'email', message: '邮箱格式不正确' }]}
          />
        </div>

        {/* 提交按钮 */}
        <FormItem>
          <Space>
            <Button type="primary" onClick={handleSubmit}>
              提交
            </Button>
            <Button onClick={() => form.reset()}>重置</Button>
          </Space>
        </FormItem>
      </div>
    </FormProvider>
  );
}

// 模拟数据
function getCitiesByProvince(province: string) {
  const cityMap: Record<string, any[]> = {
    guangdong: [
      { label: '广州市', value: 'guangzhou' },
      { label: '深圳市', value: 'shenzhen' },
      { label: '珠海市', value: 'zhuhai' },
    ],
    zhejiang: [
      { label: '杭州市', value: 'hangzhou' },
      { label: '宁波市', value: 'ningbo' },
      { label: '温州市', value: 'wenzhou' },
    ],
    jiangsu: [
      { label: '南京市', value: 'nanjing' },
      { label: '苏州市', value: 'suzhou' },
      { label: '无锡市', value: 'wuxi' },
    ],
  };
  return cityMap[province] || [];
}

function getDistrictsByCity(city: string) {
  const districtMap: Record<string, any[]> = {
    guangzhou: [
      { label: '天河区', value: 'tianhe' },
      { label: '越秀区', value: 'yuexiu' },
      { label: '海珠区', value: 'haizhu' },
    ],
    shenzhen: [
      { label: '福田区', value: 'futian' },
      { label: '南山区', value: 'nanshan' },
      { label: '宝安区', value: 'baoan' },
    ],
    hangzhou: [
      { label: '西湖区', value: 'xihu' },
      { label: '滨江区', value: 'binjiang' },
      { label: '余杭区', value: 'yuhang' },
    ],
  };
  return districtMap[city] || [];
}
