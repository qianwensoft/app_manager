-- 修复工单菜单配置
-- 问题：show_on_agent_home 设置为 1，应该设置为 0（显示在后台菜单）

-- 查看当前配置
SELECT id, title, target_type, intent_action, show_on_agent_home, sort_order
FROM agent_menu_items
WHERE intent_action LIKE '%WORK_ORDER%';

-- 修复：将工单菜单设置为显示在后台菜单
UPDATE agent_menu_items
SET show_on_agent_home = 0
WHERE intent_action IN (
    'com.appmanager.agent.WORK_ORDER_LIST',
    'com.appmanager.agent.MY_WORK_ORDER_LIST'
);

-- 验证修复结果
SELECT id, title, target_type, intent_action, show_on_agent_home, sort_order
FROM agent_menu_items
WHERE intent_action LIKE '%WORK_ORDER%';
