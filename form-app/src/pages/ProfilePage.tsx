import { useState } from 'react'
import { Button, Card, Form, Input, Typography, Divider, Tag, message } from 'antd'
import { UserOutlined, LockOutlined, LogoutOutlined } from '@ant-design/icons'
import { useAuth } from '@/runtime/useAuth'
import { getRuntimeServerBase } from '@/runtime/runtimeAuth'

const { Title, Text } = Typography

export default function ProfilePage() {
  const { token, user, isLoggedIn, loading, login, logout } = useAuth()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const serverBase = getRuntimeServerBase()

  const handleLogin = async (values: { username: string; password: string }) => {
    setSubmitting(true)
    try {
      await login(serverBase, values.username, values.password)
      message.success('登录成功')
      form.resetFields()
    } catch (e: any) {
      message.error(e.message || '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = () => {
    logout()
    message.success('已退出登录')
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: '0 16px' }}>
      <Title level={4} style={{ marginBottom: 24 }}>个人中心</Title>

      {isLoggedIn ? (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#1677ff', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 600, flexShrink: 0,
            }}>
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{user?.username}</div>
              <Tag color={user?.role === 'admin' ? 'red' : user?.role === 'operator' ? 'blue' : 'default'}>
                {user?.role ?? '—'}
              </Tag>
            </div>
          </div>

          <Divider style={{ margin: '12px 0' }} />

          <div style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Token（前 32 位）</Text>
            <div style={{
              fontFamily: 'monospace', fontSize: 12,
              background: '#f5f5f5', borderRadius: 4,
              padding: '4px 8px', marginTop: 4,
              wordBreak: 'break-all',
            }}>
              {token ? token.slice(0, 32) + '…' : '—'}
            </div>
          </div>

          <Button
            danger
            icon={<LogoutOutlined />}
            block
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Card>
      ) : (
        <Card title="登录">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleLogin}
            autoComplete="off"
          >
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="密码" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block loading={submitting || loading}>
                登录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}
    </div>
  )
}
