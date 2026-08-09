#!/bin/bash
set -e

echo "🔧 开始修复中危漏洞..."
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

# Web 前端
echo -e "${YELLOW}📦 修复 web 中危漏洞...${NC}"
cd web
npm install echarts@^6.1.0 \
            monaco-editor@^0.56.0
echo -e "${GREEN}✅ web 中危漏洞修复完成${NC}"
cd ..
echo ""

# SCADA Editor
echo -e "${YELLOW}📦 修复 scada-editor 中危漏洞...${NC}"
cd scada-editor
npm install echarts@^6.1.0 \
            react-router-dom@^7.18.0 \
            @logicflow/core@^1.2.28 \
            @logicflow/extension@^1.2.28
npm install @babel/core@^7.29.1 --save-dev
echo -e "${GREEN}✅ scada-editor 中危漏洞修复完成${NC}"
cd ..
echo ""

# Form App
echo -e "${YELLOW}📦 修复 form-app 中危漏洞...${NC}"
cd form-app
npm install react-router-dom@^7.18.0
echo -e "${GREEN}✅ form-app 中危漏洞修复完成${NC}"
cd ..
echo ""

echo -e "${GREEN}✅ 中危漏洞修复完成！${NC}"
echo ""
echo -e "${YELLOW}⚠️  主版本升级项目：${NC}"
echo "  - monaco-editor: 0.55.x → 0.56.x (需测试代码编辑器)"
echo "  - react-router-dom: 6.x → 7.18.x (需测试路由导航)"
echo "  - @logicflow: 2.x → 1.2.28 (降级，需测试工作流画布)"
echo ""
echo -e "${YELLOW}🧪 请运行完整测试套件${NC}"
echo ""
echo -e "${YELLOW}🔍 验证所有漏洞修复：${NC}"
echo "  cd web && npm audit"
echo "  cd scada-editor && npm audit"
echo "  cd form-app && npm audit"
