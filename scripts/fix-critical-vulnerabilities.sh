#!/bin/bash
set -e

echo "🔧 开始修复严重和高危漏洞..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -f "package.json" ] && [ ! -d "web" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 备份 package-lock.json
echo -e "${YELLOW}📦 备份 package-lock.json 文件...${NC}"
[ -f web/package-lock.json ] && cp web/package-lock.json web/package-lock.json.backup
[ -f scada-editor/package-lock.json ] && cp scada-editor/package-lock.json scada-editor/package-lock.json.backup
[ -f form-app/package-lock.json ] && cp form-app/package-lock.json form-app/package-lock.json.backup
echo -e "${GREEN}✅ 备份完成${NC}"
echo ""

# Web 前端
echo -e "${YELLOW}📦 修复 web 依赖...${NC}"
cd web
npm install axios@^1.18.0 \
            vite@^6.5.0 \
            postcss@^8.5.23 \
            form-data@^4.0.6 \
            lodash@^4.17.24 \
            lodash-es@^4.17.24 \
            nanoid@^3.3.17 \
            follow-redirects@^1.15.12
echo -e "${GREEN}✅ web 依赖更新完成${NC}"
cd ..
echo ""

# SCADA Editor
echo -e "${YELLOW}📦 修复 scada-editor 依赖...${NC}"
cd scada-editor
npm install axios@^1.18.0 \
            vite@^6.5.0 \
            postcss@^8.5.23 \
            form-data@^4.0.6 \
            nanoid@^3.3.17 \
            websocket-driver@^0.7.5
npm install vitest@^4.1.10 --save-dev
echo -e "${GREEN}✅ scada-editor 依赖更新完成${NC}"
cd ..
echo ""

# Form App
echo -e "${YELLOW}📦 修复 form-app 依赖...${NC}"
cd form-app
npm install vite@^6.5.0 \
            postcss@^8.5.23 \
            nanoid@^3.3.17 \
            image-size@^2.0.3
npm install vitest@^4.1.10 --save-dev
echo -e "${GREEN}✅ form-app 依赖更新完成${NC}"
cd ..
echo ""

echo -e "${GREEN}✅ 严重和高危漏洞修复完成！${NC}"
echo ""
echo -e "${YELLOW}🧪 请运行以下命令测试：${NC}"
echo "  cd web && npm run dev && npm run build"
echo "  cd scada-editor && npm run dev && npm run build"
echo "  cd form-app && npm run dev && npm run build"
echo ""
echo -e "${YELLOW}🔍 验证漏洞修复：${NC}"
echo "  cd web && npm audit"
echo "  cd scada-editor && npm audit"
echo "  cd form-app && npm audit"
echo ""
echo -e "${YELLOW}🔄 如需回滚，运行：${NC}"
echo "  cp web/package-lock.json.backup web/package-lock.json && cd web && npm ci"
echo "  cp scada-editor/package-lock.json.backup scada-editor/package-lock.json && cd scada-editor && npm ci"
echo "  cp form-app/package-lock.json.backup form-app/package-lock.json && cd form-app && npm ci"
