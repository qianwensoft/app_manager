/**
 * shadcn/ui 风格的 Array 组件（ArrayCards 和 ArrayTable）
 * 参考 @formily/antd 的 ArrayBase API，实现与 Formily 兼容的自增列表组件
 */
import { type ReactNode } from 'react'
import { observer, useField, useFieldSchema, RecursionField } from '@formily/react'
import { isArr, isFn } from '@formily/shared'
import { ArrayField } from '@formily/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2, Plus } from 'lucide-react'

/**
 * shadcn 风格的 ArrayCards（自增卡片）
 *
 * 用法示例：
 * {
 *   "type": "array",
 *   "x-component": "ArrayCards",
 *   "items": {
 *     "type": "object",
 *     "properties": { ... }
 *   }
 * }
 */
export const ShadcnArrayCards = observer((props: any) => {
  const field = useField<ArrayField>()
  const schema = useFieldSchema()
  const value = Array.isArray(field.value) ? field.value : []

  const handleAdd = () => {
    if (!field.value) {
      field.setValue([])
    }
    const newValue = [...(field.value || []), {}]
    field.setValue(newValue)
  }

  const handleRemove = (index: number) => {
    const newValue = [...(field.value || [])]
    newValue.splice(index, 1)
    field.setValue(newValue)
  }

  return (
    <div className="space-y-4">
      {value.map((item: any, index: number) => (
        <Card key={index} className="relative">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              #{index + 1}
            </CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(index)}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <RecursionField
              schema={schema.items as any}
              name={index}
            />
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        添加
      </Button>
    </div>
  )
})

/**
 * shadcn 风格的 ArrayTable（自增表格）
 *
 * 用法示例：
 * {
 *   "type": "array",
 *   "x-component": "ArrayTable",
 *   "items": {
 *     "type": "object",
 *     "properties": { ... }
 *   }
 * }
 */
export const ShadcnArrayTable = observer((props: any) => {
  const field = useField<ArrayField>()
  const schema = useFieldSchema()
  const value = Array.isArray(field.value) ? field.value : []

  const handleAdd = () => {
    if (!field.value) {
      field.setValue([])
    }
    const newValue = [...(field.value || []), {}]
    field.setValue(newValue)
  }

  const handleRemove = (index: number) => {
    const newValue = [...(field.value || [])]
    newValue.splice(index, 1)
    field.setValue(newValue)
  }

  // 从 schema 中提取列定义
  const itemsSchema = Array.isArray(schema.items) ? schema.items[0] : schema.items
  const columns = (itemsSchema as any)?.properties || {}
  const columnKeys = Object.keys(columns)

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs">
                #
              </th>
              {columnKeys.map((key) => (
                <th
                  key={key}
                  className="h-10 px-4 text-left align-middle font-medium text-muted-foreground text-xs"
                >
                  {columns[key].title || key}
                </th>
              ))}
              <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground text-xs w-20">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {value.length === 0 ? (
              <tr>
                <td
                  colSpan={columnKeys.length + 2}
                  className="h-24 text-center text-muted-foreground text-sm"
                >
                  暂无数据
                </td>
              </tr>
            ) : (
              value.map((item: any, index: number) => (
                <tr key={index} className="border-b transition-colors hover:bg-muted/50">
                  <td className="p-2 px-4 align-middle text-sm">
                    {index + 1}
                  </td>
                  {columnKeys.map((key) => (
                    <td key={key} className="p-2 px-4 align-middle">
                      <RecursionField
                        schema={columns[key]}
                        name={`${index}.${key}`}
                      />
                    </td>
                  ))}
                  <td className="p-2 px-4 align-middle text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(index)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handleAdd}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        添加
      </Button>
    </div>
  )
})
