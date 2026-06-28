# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: yjs-collaboration.spec.ts >> Yjs 协同编辑功能 >> 应该正确处理 WebSocket 消息
- Location: tests/yjs-collaboration.spec.ts:202:7

# Error details

```
Error: expect(received).toBeTruthy()

Received: null
```

# Test source

```ts
  142 |     await pageA.waitForLoadState('networkidle');
  143 |     await pageB.waitForLoadState('networkidle');
  144 | 
  145 |     // 等待连接建立
  146 |     await pageA.waitForTimeout(2000);
  147 |     await pageB.waitForTimeout(2000);
  148 | 
  149 |     // 用户 A 进行编辑操作（具体操作取决于编辑器 UI）
  150 |     // 这里是示例，需要根据实际编辑器调整
  151 |     console.log('📝 用户 A 正在编辑...');
  152 | 
  153 |     // 模拟添加一个组件或修改内容
  154 |     // 例如：点击添加按钮，拖拽组件等
  155 |     // const addButton = pageA.locator('button:has-text("添加")');
  156 |     // if (await addButton.isVisible()) {
  157 |     //   await addButton.click();
  158 |     // }
  159 | 
  160 |     // 等待同步
  161 |     await pageA.waitForTimeout(1000);
  162 | 
  163 |     // 验证用户 B 收到了变更
  164 |     // 这里需要根据实际的编辑器 UI 来验证
  165 |     // 例如：检查某个组件是否出现
  166 |     console.log('👀 验证用户 B 是否看到了变更...');
  167 | 
  168 |     // 清理
  169 |     await contextA.close();
  170 |     await contextB.close();
  171 | 
  172 |     console.log('✅ 内容同步测试通过');
  173 |   });
  174 | 
  175 |   test('应该显示正确的连接状态', async ({ page }) => {
  176 |     // 先登录
  177 |     await login(page);
  178 | 
  179 |     await page.goto('/editor?id=1');
  180 |     await page.waitForLoadState('networkidle');
  181 | 
  182 |     // 等待连接建立
  183 |     await page.waitForTimeout(3000);
  184 | 
  185 |     // 检查连接状态（绿色 = 已连接）- 使用更灵活的选择器
  186 |     const connectedIndicator = page.locator('div.rounded-lg').filter({ hasText: /已连接|人在线/ }).first();
  187 |     await expect(connectedIndicator).toBeVisible({ timeout: 10000 });
  188 | 
  189 |     // 检查是否显示绿色状态（通过 CSS 类或颜色）
  190 |     const hasGreenBg = await connectedIndicator.evaluate((el) => {
  191 |       const styles = window.getComputedStyle(el);
  192 |       return styles.backgroundColor.includes('green') ||
  193 |              el.className.includes('green');
  194 |     });
  195 | 
  196 |     console.log('🟢 连接状态显示为已连接:', hasGreenBg);
  197 |     expect(hasGreenBg).toBeTruthy();
  198 | 
  199 |     console.log('✅ 连接状态测试通过');
  200 |   });
  201 | 
  202 |   test('应该正确处理 WebSocket 消息', async ({ page }) => {
  203 |     // 监听 WebSocket 消息
  204 |     const wsMessages: any[] = [];
  205 |     let yjsWsUrl: string | null = null;
  206 | 
  207 |     page.on('websocket', (ws) => {
  208 |       const url = ws.url();
  209 |       console.log('🔌 WebSocket 连接建立:', url);
  210 | 
  211 |       // 只监听 Yjs WebSocket（排除 Vite HMR）
  212 |       if (url.includes('/ws/yjs/')) {
  213 |         yjsWsUrl = url;
  214 | 
  215 |         ws.on('framereceived', (frame) => {
  216 |           wsMessages.push({
  217 |             type: 'received',
  218 |             payload: frame.payload,
  219 |           });
  220 |         });
  221 | 
  222 |         ws.on('framesent', (frame) => {
  223 |           wsMessages.push({
  224 |             type: 'sent',
  225 |             payload: frame.payload,
  226 |           });
  227 |         });
  228 |       }
  229 |     });
  230 | 
  231 |     // 先登录
  232 |     await login(page);
  233 | 
  234 |     await page.goto('/editor?id=1');
  235 |     await page.waitForLoadState('networkidle');
  236 | 
  237 |     // 等待 WebSocket 消息
  238 |     await page.waitForTimeout(5000);
  239 | 
  240 |     // 验证连接到了 Yjs WebSocket
  241 |     console.log('🔌 Yjs WebSocket URL:', yjsWsUrl);
> 242 |     expect(yjsWsUrl).toBeTruthy();
      |                      ^ Error: expect(received).toBeTruthy()
  243 | 
  244 |     // 验证收到了 WebSocket 消息
  245 |     console.log('📨 WebSocket 消息数量:', wsMessages.length);
  246 |     expect(wsMessages.length).toBeGreaterThan(0);
  247 | 
  248 |     // 验证有 sync 或 awareness 消息（消息类型 0 或 1）
  249 |     const hasYjsMessage = wsMessages.some(msg => {
  250 |       if (msg.payload instanceof Buffer) {
  251 |         const msgType = msg.payload[0];
  252 |         return msgType === 0 || msgType === 1; // Sync 或 Awareness
  253 |       }
  254 |       return false;
  255 |     });
  256 | 
  257 |     console.log('📡 收到 Yjs 协议消息:', hasYjsMessage);
  258 |     expect(hasYjsMessage).toBeTruthy();
  259 | 
  260 |     console.log('✅ WebSocket 消息处理测试通过');
  261 |   });
  262 | });
  263 | 
  264 | test.afterAll(async () => {
  265 |   console.log('✨ Yjs 协同编辑测试完成！');
  266 | });
  267 | 
```