/**
 * 工作流 call_interface 动作的接口调用实现。
 *
 * 复用 SCADA 现有数据接口调用路径：
 *  - 普通态：POST /api/data/interfaces/:id/invoke（JWT）
 *  - 分享态：POST /api/scada/share/interfaces/:id/invoke（share_token）
 * ifaceId 优先；仅有 ifaceCode 时无法直接命中 REST（后端按 id invoke），故要求配置 ifaceId。
 */
export interface CallInterfaceOptions {
  ifaceId?: number
  ifaceCode?: string
  params: Record<string, unknown>
}

export function makeCallInterface(shareToken?: string) {
  return async ({ ifaceId, params }: CallInterfaceOptions): Promise<unknown> => {
    if (ifaceId == null) return undefined
    const token = localStorage.getItem('token') ?? ''
    const url = shareToken
      ? `/api/scada/share/interfaces/${ifaceId}/invoke`
      : `/api/data/interfaces/${ifaceId}/invoke`
    const body = shareToken
      ? JSON.stringify({ share_token: shareToken, param_values: params, limit: 500 })
      : JSON.stringify({ param_values: params, limit: 500 })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(!shareToken && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    })
    if (!res.ok) throw new Error(`接口调用失败 HTTP ${res.status}`)
    const json = await res.json()
    return json?.data ?? json
  }
}
