#!/bin/bash
# 验证所有项目的依赖漏洞情况

echo "🔍 扫描所有项目的依赖漏洞..."
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -d "web" ]; then
    echo -e "${RED}错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

# 检查项目函数
check_project() {
    local project=$1
    echo -e "${BLUE}=== $project ===${NC}"
    cd $project
    
    # 运行 npm audit
    npm audit --json > /tmp/audit-$project.json 2>&1 || true
    
    # 解析结果
    local critical=$(cat /tmp/audit-$project.json | grep -o '"critical":[0-9]*' | grep -o '[0-9]*' || echo "0")
    local high=$(cat /tmp/audit-$project.json | grep -o '"high":[0-9]*' | grep -o '[0-9]*' || echo "0")
    local moderate=$(cat /tmp/audit-$project.json | grep -o '"moderate":[0-9]*' | grep -o '[0-9]*' || echo "0")
    local low=$(cat /tmp/audit-$project.json | grep -o '"low":[0-9]*' | grep -o '[0-9]*' || echo "0")
    local total=$((critical + high + moderate + low))
    
    echo -e "  严重 (Critical): ${RED}$critical${NC}"
    echo -e "  高危 (High):     ${YELLOW}$high${NC}"
    echo -e "  中危 (Moderate): ${YELLOW}$moderate${NC}"
    echo -e "  低危 (Low):      ${GREEN}$low${NC}"
    echo -e "  总计:            $total"
    
    # 显示前5个漏洞
    echo ""
    echo -e "${YELLOW}  Top 5 漏洞:${NC}"
    npm audit | head -n 30
    
    cd ..
    echo ""
}

# 检查所有项目
check_project "web"
check_project "scada-editor"
check_project "form-app"

# 汇总
echo -e "${BLUE}=== 汇总 ===${NC}"
echo "详细报告已保存到:"
echo "  /tmp/audit-web.json"
echo "  /tmp/audit-scada-editor.json"
echo "  /tmp/audit-form-app.json"
echo ""
echo -e "${YELLOW}建议:${NC}"
echo "  1. 优先修复严重和高危漏洞"
echo "  2. 运行修复脚本: ./scripts/fix-critical-vulnerabilities.sh"
echo "  3. 测试后运行: ./scripts/fix-moderate-vulnerabilities.sh"
