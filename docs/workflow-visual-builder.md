# 工单工作流可视化配置

## 概述

工单工作流系统现在提供了可视化配置界面，特别是针对"调用数据接口"动作类型。用户无需手动编写 JSON，可以通过图形界面选择接口、映射参数，并使用模板变量。

## 功能特性

### 1. 数据接口选择器

- **接口下拉列表**：显示所有可用的数据接口，包括接口名称和代码
- **可搜索**：支持模糊搜索快速定位接口
- **实时加载**：自动从后端获取最新的接口列表

### 2. 参数映射界面

当选择数据接口后，系统会自动加载该接口的参数定义，并显示：

- **参数名称**：清晰显示每个参数的名称
- **必填标识**：必填参数会显示红色"必填"标签
- **参数类型**：显示参数的数据类型（string、number 等）
- **参数描述**：如果接口定义中包含描述信息，会显示在参数旁边

### 3. 模板变量插入

每个参数输入框都提供了快捷插入菜单，包含常用的工单字段模板变量：

- `{{code}}` - 工单编号
- `{{title}}` - 工单标题
- `{{description}}` - 工单描述
- `{{device_id}}` - 设备 ID
- `{{status}}` - 工单状态
- `{{priority}}` - 优先级
- `{{assignee_id}}` - 指派人 ID
- `{{other_codes}}` - 其他编码
- `{{created_at}}` - 创建时间
- `{{updated_at}}` - 更新时间

### 4. 枚举值选择

如果参数定义包含枚举值（enum），系统会自动显示下拉选择器，而不是文本输入框。

### 5. 双向同步

- **自动生成 JSON**：可视化配置会实时生成 JSON 配置
- **手动编辑支持**：可以随时切换到手动 JSON 模式进行高级配置
- **配置保留**：切换模式时已有配置会被保留

## 使用步骤

### 创建调用数据接口的工作流动作

1. **进入工作流配置页面**
   - 导航至：工单设置 → 工单工作流
   - 点击"新建工作流"或编辑现有工作流

2. **添加动作**
   - 在"动作配置"区域，点击"添加动作"
   - 在"动作类型"下拉框中选择"调用数据接口"

3. **切换到可视化配置**
   - 在 JSON 配置区域下方，点击"切换到可视化配置"按钮
   - 系统会自动解析现有的 JSON 配置（如果有）

4. **选择数据接口**
   - 在"选择数据接口"下拉框中搜索并选择目标接口
   - 系统会自动加载该接口的参数定义

5. **配置参数映射**
   - 对于每个参数，可以：
     - 直接输入固定值
     - 使用右侧下拉菜单插入模板变量
     - 混合使用固定值和模板变量（如：`prefix_{{code}}_suffix`）
   - 必填参数会用红色标签标识

6. **查看生成的配置**
   - "生成的配置"区域会实时显示自动生成的 JSON
   - 这个 JSON 是只读的，由可视化配置自动生成

7. **保存工作流**
   - 完成配置后，点击"保存"按钮
   - 系统会验证配置的正确性

### 切换模式

#### 从 JSON 模式切换到可视化模式

1. 点击 JSON 配置提示下方的"切换到可视化配置"按钮
2. 系统会尝试解析现有的 JSON：
   - 如果 JSON 包含 `interface_id` 和 `params`，会自动填充到可视化界面
   - 如果 JSON 格式不符合预期，会显示空白的可视化配置界面

#### 从可视化模式切换到 JSON 模式

1. 点击"切换到手动 JSON 模式"按钮
2. 可以直接编辑 JSON 配置
3. 适用于需要高级配置或复杂逻辑的场景

## 配置示例

### 示例 1：简单参数映射

**场景**：调用设备查询接口，传入工单关联的设备 ID

可视化配置：
- 接口：`设备信息查询 (device_info_query)`
- 参数：
  - `device_id`: `{{device_id}}`

生成的 JSON：
```json
{
  "interface_id": 5,
  "params": {
    "device_id": "{{device_id}}"
  }
}
```

### 示例 2：多参数组合

**场景**：创建外部系统工单，传入多个字段

可视化配置：
- 接口：`外部工单创建 (external_ticket_create)`
- 参数：
  - `ticket_code`: `{{code}}`
  - `title`: `{{title}}`
  - `priority`: `{{priority}}`
  - `device_serial`: `{{device_id}}`
  - `created_time`: `{{created_at}}`

生成的 JSON：
```json
{
  "interface_id": 12,
  "params": {
    "ticket_code": "{{code}}",
    "title": "{{title}}",
    "priority": "{{priority}}",
    "device_serial": "{{device_id}}",
    "created_time": "{{created_at}}"
  }
}
```

### 示例 3：混合固定值和变量

**场景**：生成带前缀的工单编号

可视化配置：
- 接口：`工单同步 (ticket_sync)`
- 参数：
  - `external_code`: `EXT_{{code}}`
  - `source_system`: `app-manager`（固定值）

生成的 JSON：
```json
{
  "interface_id": 8,
  "params": {
    "external_code": "EXT_{{code}}",
    "source_system": "app-manager"
  }
}
```

## 技术实现

### 前端组件结构

```vue
<template>
  <!-- 可视化配置模式 -->
  <template v-if="action.type === 'call_data_interface' && action.useBuilder">
    <!-- 接口选择器 -->
    <el-select v-model="action.builder.interfaceId" @change="onInterfaceSelected">
      ...
    </el-select>
    
    <!-- 参数映射 -->
    <div v-for="param in action.builder.paramList">
      <!-- 参数输入框 + 模板变量下拉菜单 -->
      <el-input v-model="action.builder.params[param.name]">
        <template #append>
          <el-dropdown @command="insertTemplate">
            <!-- 模板变量菜单 -->
          </el-dropdown>
        </template>
      </el-input>
    </div>
    
    <!-- 生成的 JSON（只读） -->
    <el-input v-model="action.configJSON" readonly />
  </template>
</template>
```

### 核心方法

- `onInterfaceSelected(idx)`: 接口选择时加载参数定义
- `loadInterfaceParams(idx, interfaceId)`: 调用后端 API 获取参数 schema
- `insertTemplate(idx, paramName, template)`: 插入模板变量
- `updateBuilderJSON(idx)`: 实时更新 JSON 配置
- `initBuilder(idx)`: 从现有 JSON 初始化可视化配置

### 后端 API

**获取接口参数定义**
```
GET /api/data/interfaces/:id/param-schema
```

响应格式：
```json
{
  "params": [
    {
      "name": "device_id",
      "type": "string",
      "description": "设备 ID",
      "required": true,
      "enum": []
    },
    ...
  ],
  "result_fields": ["id", "name", "status", ...]
}
```

## 注意事项

1. **参数类型验证**：可视化界面不进行严格的类型验证，建议在工作流测试时验证参数的正确性

2. **模板变量展开**：模板变量（如 `{{code}}`）会在工作流执行时被实际的工单字段值替换

3. **JSON 兼容性**：可视化配置生成的 JSON 与手动编写的 JSON 完全兼容，可以无缝切换

4. **参数缺失**：如果接口需要的参数在可视化界面中未配置，工作流执行时可能失败

5. **复杂逻辑**：对于需要条件判断、循环等复杂逻辑的场景，建议使用手动 JSON 模式或"执行 JavaScript"动作类型

## 未来改进

- [ ] 支持其他动作类型的可视化配置（调用连接器、更新工单等）
- [ ] 参数类型验证和输入提示
- [ ] 模板变量智能提示（根据工单类型动态加载可用字段）
- [ ] 参数默认值自动填充
- [ ] 接口调用结果预览
- [ ] 工作流可视化流程图
