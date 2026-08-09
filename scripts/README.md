# 依赖漏洞修复脚本

本目录包含用于修复项目依赖漏洞的自动化脚本。

## 📋 脚本列表

### 1. check-vulnerabilities.sh
检查所有项目的依赖漏洞情况。

**用途**: 了解当前漏洞状态
```bash
./scripts/check-vulnerabilities.sh
```

### 2. fix-critical-vulnerabilities.sh
自动修复所有严重和高危漏洞。

**修复内容**:
- ✅ vitest（严重 DoS 漏洞）
- ✅ websocket-driver（消息损坏）
- ✅ axios（多个高危漏洞）
- ✅ vite（路径遍历）
- ✅ postcss（文件读取）
- ✅ form-data（CRLF 注入）
- ✅ lodash（代码注入）
- ✅ nanoid（无限循环）
- ✅ image-size（DoS）

**用途**: 第一阶段修复
```bash
./scripts/fix-critical-vulnerabilities.sh
```

**注意**: 会自动备份 `package-lock.json` 文件

### 3. fix-moderate-vulnerabilities.sh
修复中危漏洞（包含主版本升级）。

**修复内容**:
- ✅ echarts（XSS）
- ✅ monaco-editor（通过 dompurify）
- ✅ react-router-dom（开放重定向）
- ✅ @logicflow（降级到 1.x）
- ✅ @babel/core（文件读取）

**用途**: 第二阶段修复
```bash
./scripts/fix-moderate-vulnerabilities.sh
```

**⚠️ 警告**: 包含主版本升级，需要详细测试

## 🚀 快速开始

### 步骤 1: 检查当前状态
```bash
./scripts/check-vulnerabilities.sh
```

### 步骤 2: 修复严重和高危漏洞
```bash
./scripts/fix-critical-vulnerabilities.sh
```

### 步骤 3: 测试
```bash
# 测试 web
cd web
npm run dev
# 在浏览器测试功能
npm run build

# 测试 scada-editor
cd scada-editor
npm run dev
npm run build

# 测试 form-app
cd form-app
npm run dev
npm run build
```

### 步骤 4: 修复中危漏洞
```bash
./scripts/fix-moderate-vulnerabilities.sh
```

### 步骤 5: 完整测试
参考 `docs/security-vulnerability-fix-plan.md` 中的测试清单

### 步骤 6: 验证修复
```bash
./scripts/check-vulnerabilities.sh
```

## 🔄 回滚方法

### 方式 1: 使用备份文件
```bash
# 回滚 web
cp web/package-lock.json.backup web/package-lock.json
cd web && npm ci

# 回滚 scada-editor
cp scada-editor/package-lock.json.backup scada-editor/package-lock.json
cd scada-editor && npm ci

# 回滚 form-app
cp form-app/package-lock.json.backup form-app/package-lock.json
cd form-app && npm ci
```

### 方式 2: Git 回滚
```bash
git checkout HEAD -- web/package.json web/package-lock.json
git checkout HEAD -- scada-editor/package.json scada-editor/package-lock.json
git checkout HEAD -- form-app/package.json form-app/package-lock.json

cd web && npm install
cd scada-editor && npm install
cd form-app && npm install
```

## 📊 预期结果

### 修复前
```
Web:          12 个漏洞 (0 严重, 7 高危, 5 中危)
SCADA Editor: 18 个漏洞 (2 严重, 5 高危, 10 中危, 1 低危)
Form App:     11 个漏洞 (1 严重, 5 高危, 5 中危)
总计:         41 个漏洞
```

### 修复后（第一阶段）
```
Web:          5 个漏洞 (0 严重, 0 高危, 5 中危)
SCADA Editor: 11 个漏洞 (0 严重, 0 高危, 10 中危, 1 低危)
Form App:     5 个漏洞 (0 严重, 0 高危, 5 中危)
总计:         21 个漏洞
```

### 修复后（第二阶段）
```
Web:          0-2 个漏洞 (仅低危)
SCADA Editor: 0-2 个漏洞 (仅低危)
Form App:     0-2 个漏洞 (仅低危)
总计:         0-6 个漏洞
```

## ⚠️ 注意事项

### 主版本升级项目

以下包涉及主版本升级，需要特别注意：

1. **monaco-editor** (0.55.x → 0.56.x)
   - 影响: 代码编辑器功能
   - 测试: 语法高亮、自动完成、主题

2. **react-router-dom** (6.x → 7.18.x)
   - 影响: 路由导航
   - 测试: 所有页面跳转、`<Link>`、`useNavigate()`

3. **@logicflow** (2.x → 1.2.28)
   - 影响: 工作流画布编辑器
   - 测试: 节点拖拽、连线、保存

4. **vite** (可选升级到 8.x)
   - 影响: 构建流程
   - 测试: 开发服务器、热更新、生产构建

### Breaking Changes 检查

运行修复脚本后，请检查以下内容：

- [ ] TypeScript 编译无错误
- [ ] ESLint 无新增错误
- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 手动功能测试通过

## 📚 相关文档

- [完整修复计划](../docs/security-vulnerability-fix-plan.md)
- [Web Serial 串口扫码](../docs/web-serial-port-selection.md)
- [SCADA 工作流测试](../docs/test-serial-scanner-workflow.md)

## 🆘 常见问题

### Q: 脚本运行失败怎么办？
A: 检查错误信息，通常是网络问题或 npm 源问题。尝试切换 npm 源：
```bash
npm config set registry https://registry.npmmirror.com
```

### Q: 修复后某个功能不工作了？
A: 使用回滚方法恢复，然后逐个修复依赖，定位问题包

### Q: 是否必须全部修复？
A: 建议至少修复严重和高危漏洞。中危漏洞可根据实际情况决定

### Q: 多久需要重新检查？
A: 建议每月运行一次 `check-vulnerabilities.sh`

## 📞 技术支持

如遇问题，请查看：
1. GitHub Dependabot 警告详情
2. npm audit 完整报告
3. 包的 CHANGELOG 和迁移指南

---

**创建时间**: 2026-08-09  
**维护者**: 开发团队
