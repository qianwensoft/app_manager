import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { message } from '@/lib/message'
import { User, Lock, LogOut } from 'lucide-react'
import { useAuth } from '@/runtime/useAuth'
import { getRuntimeServerBase } from '@/runtime/runtimeAuth'

export default function ProfilePage() {
  const { token, user, isLoggedIn, loading, login, logout } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const serverBase = getRuntimeServerBase()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      message.error('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    try {
      await login(serverBase, username, password)
      message.success('登录成功')
      setUsername('')
      setPassword('')
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

  const getRoleBadgeStyle = (role?: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-800'
    if (role === 'operator') return 'bg-blue-100 text-blue-800'
    return 'bg-gray-100 text-gray-800'
  }

  return (
    <div style={{ maxWidth: 420, margin: '40px auto', padding: '0 16px' }}>
      <h2 className="text-xl font-semibold mb-6">个人中心</h2>

      {isLoggedIn ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-semibold shrink-0">
                {user?.username?.[0]?.toUpperCase() ?? 'U'}
              </div>
              <div>
                <div className="font-semibold text-base">{user?.username}</div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRoleBadgeStyle(user?.role)}`}>
                  {user?.role ?? '—'}
                </span>
              </div>
            </div>

            <hr className="my-3" />

            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1">Token（前 32 位）</p>
              <div className="font-mono text-xs bg-muted rounded p-2 break-all">
                {token ? token.slice(0, 32) + '…' : '—'}
              </div>
            </div>

            <Button
              variant="destructive"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              退出登录
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="username">用户名</Label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="用户名"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">密码</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="密码"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || loading}>
                登录
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
