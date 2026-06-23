# Android Agent 工单提交后自动填充标题 - 修复说明

## 问题描述

在 Android Agent 端提交工单反馈后，表单被清空，但如果当前选中的工单类型定义了默认标题（`default_title`），该标题没有自动填充到标题输入框中。

## 问题原因

在提交成功后的清空逻辑中（`FeedbackActivity.kt` 第 436 行），代码清空了所有输入字段：

```kotlin
etTitle.setText(""); 
etDesc.setText(""); 
etBusinessNo.setText(""); 
etOtherCodes.setText("")
```

但之后没有调用 `autoFillTitle()` 方法来重新填充当前选中工单类型的默认标题。

## 解决方案

在清空表单后，添加一行代码重新填充默认标题：

```kotlin
runOnUiThread {
    dialog.dismiss()
    Toast.makeText(this, "已提交：${wo.optString("code")}", Toast.LENGTH_LONG).show()
    attachments.clear(); renderAttachments()
    etTitle.setText(""); etDesc.setText(""); etBusinessNo.setText(""); etOtherCodes.setText("")
    // 提交成功后重新填充当前类型的默认标题
    autoFillTitle(spinnerType.selectedItemPosition)
}
```

## 修改文件

- `/agent/app/src/main/java/com/appmanager/agent/ui/FeedbackActivity.kt` (第 437 行)

## 功能说明

### autoFillTitle 方法

```kotlin
private fun autoFillTitle(position: Int) {
    val def = types.getOrNull(position)?.defaultTitle.orEmpty()
    if (def.isNotBlank() && etTitle.text?.toString()?.trim().isNullOrEmpty()) {
        etTitle.setText(def)
    }
}
```

该方法的逻辑：
1. 获取指定位置工单类型的 `default_title`
2. 如果默认标题不为空 **且** 当前标题输入框为空
3. 则自动填充默认标题

## 用户体验改进

### 修复前
1. 用户选择"设备故障"类型（默认标题："设备无法正常启动"）
2. 提交工单
3. ❌ 标题输入框变为空白，需要用户重新输入

### 修复后
1. 用户选择"设备故障"类型（默认标题："设备无法正常启动"）
2. 提交工单
3. ✅ 标题输入框自动填充"设备无法正常启动"，用户可以直接使用或修改

## 其他相关逻辑

### 初始加载时的处理

在 `loadTypes()` 方法中，已经正确处理了初始加载时的默认标题填充：

```kotlin
spinnerType.setSelection(sel)
// 主动带出一次默认标题，否则首屏默认类型的标题永远空着
autoFillTitle(sel)
```

### 切换类型时的处理

在 `setupTypeAutoTitle()` 方法中，已经正确处理了切换工单类型时的标题填充：

```kotlin
override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
    types.getOrNull(position)?.let { saveLastTypeCode(it.code) }
    autoFillTitle(position)
}
```

## 测试建议

1. 在服务端配置一个工单类型，设置 `default_title`（如："设备无法正常启动"）
2. 在 Android Agent 中选择该类型
3. 验证标题自动填充
4. 提交工单
5. 验证提交成功后标题再次自动填充

## 相关字段

在工单类型表（`work_order_types`）中：

| 字段 | 说明 |
|------|------|
| `default_title` | 默认标题，选择该类型时自动带出 |
| `name` | 类型名称，显示在下拉列表中 |
| `code` | 类型编码，用于 API 提交 |

---

**修复日期**: 2026-06-21  
**影响范围**: Android Agent 端工单提交流程  
**向后兼容**: ✅ 完全兼容，不影响现有功能
