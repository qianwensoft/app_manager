import { Plugin } from 'prosemirror-state'
import { 
  tableEditing, 
  columnResizing, 
  goToNextCell,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  toggleHeaderRow,
  toggleHeaderColumn,
  toggleHeaderCell,
  setCellAttr,
  deleteTable
} from 'prosemirror-tables'
import { keymap } from 'prosemirror-keymap'

// 表格编辑相关插件
export function tablePlugins() {
  return [
    columnResizing(),
    tableEditing(),
    keymap({
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
    }),
  ]
}

// 表格命令导出，供工具栏使用
export const tableCommands = {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  toggleHeaderRow,
  toggleHeaderColumn,
  toggleHeaderCell,
  setCellAttr,
  deleteTable,
}
