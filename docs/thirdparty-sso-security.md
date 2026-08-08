# 第三方平台 SSO 跳转安全（P0）

> 修复目标：阻止第三方平台跳转登录后的 `redirect_to` 被攻击者篡改或指向恶意站点（open-redirect / 钓鱼 / 反射型 XSS）。

## 1. 风险描述

`web/public/auth-eteams-callback.html` 接收 `redirect_to` query 后 `setTimeout(() => location.href = redirectTo)`，**没有任何白名单与签名校验**。第三方平台的 eTeams / FreePass / 钉钉 / 飞书 / 企微 在跳转时会被攻击者替换为 `?redirect_to=https://evil.com/...` 或 `?redirect_to=javascript:...`，从而绕过同源策略把已登录用户引导到钓鱼站。

## 2. 修复方案

新增两道防线：

| 防线 | 实现位置 | 作用 |
|---|---|---|
| **redirect_to 白名单** | `ThirdPartyProvider.redirect_allowlist_json`（Provider 级）> `server.sso.redirect_to_whitelist`（系统级）> 内置兜底 `[/]` | 只允许跳到指定前缀；拒绝 `//evil.com` / `javascript:` / `data:` 等危险路径 |
| **HMAC-SHA256 签名** | Provider 自身 `hmac_secret` > `server.sso.hmac_secret`；`SSO_HMAC_SECRET` 环境变量可覆盖 | 第三方平台跳转链接必须由后端 `/api/thirdparty/:id/sso/sign` 签发；前端永不接触密钥 |

签名 payload：`HMAC-SHA256(secret, baseURL + "|" + path + "|" + exp + "|" + providerID)`。

- `baseURL`：本系统浏览器可达基址（用于跨域隔离，第三方无法伪造）
- `path`：跳转目标 path（query 与 fragment 不参与签名）
- `exp`：签名过期 unix 秒（默认 5 分钟，最大 24 小时）
- `providerID`：第三方平台 ID（防止一个 Provider 的签名被复用到另一个 Provider）

## 3. 兼容性策略

| 场景 | 行为 |
|---|---|
| `redirect_allow_enabled = false`（旧 Provider 兼容开关） | **完全跳过白名单 + 签名校验**，等同于修复前（不建议生产启用） |
| 启用白名单但未配置 `hmac_secret` 且系统密钥也未配置 | **fail-closed**：拒绝签发链接 + 拒绝所有签名链接 |
| 启用白名单且已配置密钥但前端不带 `sig/exp` | 放行（仅白名单校验），保证老的静态测试链接仍可工作 |
| 启用白名单且密钥齐全，但链接过期 / 篡改 | 拒绝登录（HTTP 403） |

升级后**新创建的 Provider** 默认 `redirect_allow_enabled = true`，但旧 Provider 因迁移默认值也是 `true`，所以**强烈建议升级后立即在每个 Provider 的"编辑"中**：
1. 填一个 ≥ 32 字节随机 `HMAC` 密钥，或确认 `server.sso.hmac_secret` 已配
2. 配置 `redirect_allowlist_json`（如 `["/", "/devices", "/work-orders/*", "/embed/work-orders/*"]`）
3. 用新的「测试 SSO」按钮生成跳转链接，旧的人工拼接 URL 全部失效

## 4. 配置方式

### 4.1 系统级（推荐统一管理）

`config.yaml`：

```yaml
server:
  public_base_url: https://app.example.com   # 兜底 baseURL
sso:
  enabled: true
  redirect_to_whitelist:
    - "/"
    - "/devices"
    - "/devices/*"
    - "/work-orders/*"
    - "/embed/work-orders/*"
  hmac_secret: "change-me-32-bytes-random-string-aaaaaa"
  hmac_clock_skew_sec: 300
```

或用环境变量：

```bash
SSO_HMAC_SECRET=$(openssl rand -hex 32)
```

### 4.2 Provider 级（按平台覆盖）

在 **系统管理 → 第三方平台 → 编辑** 中：

- **启用白名单校验**：默认开（`true`）
- **redirect_to 白名单**：JSON 数组，例如 `["/", "/devices", "/work-orders/*"]`，也支持逗号 / 换行分隔的纯列表
- **HMAC 签名密钥**：留空 → 用系统密钥；填写 → 覆盖系统密钥；勾选"清空本 Provider 密钥" → 回退到系统密钥
- **时钟偏移容忍**：默认 300 秒（5 分钟），可按需调到 0-3600

### 4.3 第三方平台后台

把第三方平台后台的"免登回调地址"或"redirect_uri"换成由「测试 SSO」按钮生成的完整 callback URL（已带 `sig` / `exp` / `kid` 参数）。

> 不要手工拼接。手工拼接必然过期或被篡改。

## 5. API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/thirdparty/:id/sso/sign` | 签发带 HMAC 的 callback URL（admin/operator） |
| GET | `/api/thirdparty/:id/sso/allowlist` | 预览 Provider 当前生效的白名单（admin/operator） |

POST `/api/thirdparty/:id/sso/sign` 请求体：

```json
{
  "redirect_to": "/work-orders/123",
  "base_url": "https://app.example.com",   // 可选，缺省从 Origin/Referer 取
  "ttl_seconds": 300                         // 可选，最大 86400
}
```

返回：

```json
{
  "callback_url": "https://app.example.com/auth-eteams-callback.html?provider_id=1&redirect_to=%2Fwork-orders%2F123&exp=1754089999&sig=abc...&kid=global",
  "sig": "abc...",
  "exp": 1754089999,
  "key_id": "global",          // 或 "provider:1" 表示用 Provider 自身密钥
  "effective_allowlist": ["/", "/devices", "/work-orders/*"],
  "ttl_seconds": 300
}
```

## 6. 链接生成 → 登录完整链路

```
[Admin UI]
   ↓ 点「测试 SSO」选 /work-orders/123
[前端] POST /api/thirdparty/1/sso/sign  {redirect_to, ttl_seconds: 300}
   ↓ 后端校验白名单 + 签发 HMAC
   ↓ 返回 callback_url = https://app.example.com/auth-eteams-callback.html?provider_id=1&redirect_to=...&exp=...&sig=...
[前端] 拼接 eTeams 免登入口 → 显示完整 SSO 链接
   ↓ Admin 复制到 eTeams IM
[eTeams 用户]
   ↓ 点链接 → 浏览器跳到 https://eTeams.com/api/bs/open/auth/third?app_key=...&redirect_uri=<callback_url>
[eTeams] 用户确认 → 重定向回 callback_url
   ↓ 浏览器落地 /auth-eteams-callback.html
[HTML] POST /api/auth/thirdparty/login {provider_id, eteams_token, redirect_to, sig, exp, base_url: window.location.origin}
   ↓ 后端 VerifyRedirect：白名单 + HMAC 验签（providerID 隔离 + baseURL 校验 + exp 防过期）
   ↓ 通过 → 落库 / 写 localStorage.token / 倒计时跳到 redirect_to
   ↓ 失败 → HTTP 403 + 友好提示
```

## 7. 单元测试

`server/api/sso_security_test.go` 已覆盖：

- 12 种白名单匹配场景（精确 / 通配 / protocol-relative / javascript / data / 跨协议 / query / fragment / 空路径 / 兜底）
- HMAC 签名正向用例（生成 → 校验通过）
- HMAC 签名反向用例（过期 / 篡改路径 / 篡改 providerID / 密钥为空）
- 向后兼容（`redirect_allow_enabled = false` 跳过校验）

运行：

```bash
cd server && go test ./api/ -run 'TestIsRedirectAllowed|TestVerifyRedirect|TestBuildSignedRedirect' -v
```

## 8. 数据库迁移

启动时会自动执行 `MigrateThirdPartySSOSecurity`，为 `third_party_providers` 表新增 4 个字段（幂等）：

- `redirect_allowlist_json TEXT`
- `redirect_allow_enabled BOOLEAN NOT NULL DEFAULT 1`
- `hmac_secret VARCHAR(128) NOT NULL DEFAULT ''`
- `hmac_clock_skew_sec INTEGER NOT NULL DEFAULT 300`

无破坏性变更；旧 Provider 升级后默认 `redirect_allow_enabled = true`，需手动配置密钥 / 白名单后才可生成新的安全链接。

## 9. 故障排查

| 现象 | 排查 |
|---|---|
| 「登录失败：redirect_to rejected (allowlist size=N)」 | 在第三方平台编辑中检查 `redirect_allowlist_json` 是否包含跳转目标路径（注意：精确路径需写全，前缀通配需以 `/*` 结尾） |
| 「signature invalid or expired」 | 1) 链接过期 → 重新生成；2) 系统时间漂移 → 同步 NTP；3) Provider 改了密钥 → 用新密钥重新生成；4) ProviderID 不匹配（极少） |
| 「hmac_secret not configured」 | 编辑 Provider 填一个 ≥ 32 字节随机密钥，或在 `config.yaml` `sso.hmac_secret` 配置系统密钥 |
| 旧的非签名链接突然 403 | 旧链接视为"未签名"放行（仅白名单校验）；若 403 是白名单拒绝，需把路径加入 `redirect_allowlist_json` |
| 升级后某个 Provider 完全无法跳转 | 该 Provider `redirect_allow_enabled = true` 但白名单 / 密钥都没配；临时把开关关掉恢复兼容（仅供迁移期） |

## 10. 安全建议

1. **密钥管理**：用 `openssl rand -hex 32` 生成密钥并放进密钥管理（Vault / K8s Secret），不要写进 git
2. **密钥轮换**：每月轮换一次 `sso.hmac_secret`；轮换后旧签名链接自然过期（最长 24h）
3. **TTL**：业务方 URL 短期有效（5 分钟即可）；长期留存的跳转链接必须重新签发
4. **审计**：所有 `/api/auth/thirdparty/login` 与 `/api/thirdparty/:id/sso/sign` 都应接入审计日志（已在 audit_logs 表覆盖）
5. **监控**：对 `redirect_to rejected` 错误率设置告警（> 5% 提示可能存在攻击）
6. **CORS**：本系统主域 + eTeams / 钉钉 / 飞书 / 企微白名单域名，签名绑定 baseURL 防止跨域劫持