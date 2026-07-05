-- 修复现有列表接口缺少 pagination 配置的问题
-- 使用方法：
-- 1. 查找所有 form_app 类别的 query 类型接口（列表接口）
-- 2. 检查 schema_json 中是否缺少 pagination 配置
-- 3. 更新 schema_json，添加 pagination 配置

-- 查看需要修复的接口（查询语句，不执行修改）
SELECT
    id,
    code,
    name,
    kind,
    category,
    schema_json,
    LENGTH(schema_json) - LENGTH(REPLACE(schema_json, 'pagination', '')) as has_pagination
FROM data_interfaces
WHERE category = 'form_app'
  AND kind = 'query'
  AND (schema_json NOT LIKE '%pagination%' OR schema_json IS NULL OR schema_json = '');

-- 更新语句（执行前请先备份数据库）
-- UPDATE data_interfaces
-- SET schema_json = JSON_SET(
--     COALESCE(NULLIF(schema_json, ''), '{}'),
--     '$.pagination',
--     JSON_OBJECT(
--         'pageParam', 'page',
--         'pageSizeParam', 'page_size',
--         'limitParam', 'limit',
--         'offsetParam', 'offset',
--         'defaultPageSize', 10
--     )
-- )
-- WHERE category = 'form_app'
--   AND kind = 'query'
--   AND code LIKE '%_list_%'
--   AND (schema_json NOT LIKE '%pagination%' OR schema_json IS NULL OR schema_json = '');

-- SQLite 版本（如果使用 SQLite）：
-- UPDATE data_interfaces
-- SET schema_json = json_patch(
--     COALESCE(NULLIF(schema_json, ''), '{}'),
--     '{"pagination":{"pageParam":"page","pageSizeParam":"page_size","limitParam":"limit","offsetParam":"offset","defaultPageSize":10}}'
-- )
-- WHERE category = 'form_app'
--   AND kind = 'query'
--   AND code LIKE '%_list_%'
--   AND (schema_json NOT LIKE '%pagination%' OR schema_json IS NULL OR schema_json = '');
