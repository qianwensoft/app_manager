import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

export interface SlashMenuState {
  active: boolean
  pos: number
  query: string
}

export const slashMenuKey = new PluginKey<SlashMenuState>('slashMenu')

export function slashMenuPlugin(onUpdate: (state: SlashMenuState) => void) {
  return new Plugin<SlashMenuState>({
    key: slashMenuKey,

    state: {
      init() {
        return { active: false, pos: 0, query: '' }
      },

      apply(tr: Transaction, prev: SlashMenuState): SlashMenuState {
        // 如果有 meta 命令关闭菜单
        const closeMeta = tr.getMeta(slashMenuKey)
        if (closeMeta?.close) {
          return { active: false, pos: 0, query: '' }
        }

        // 如果菜单未激活，检测是否应该激活
        if (!prev.active) {
          const { $from } = tr.selection
          const textBefore = $from.parent.textBetween(
            Math.max(0, $from.parentOffset - 20),
            $from.parentOffset,
            null,
            '\ufffc'
          )

          // 检测是否在行首或空白后输入了 '/'
          const match = textBefore.match(/(^|\s)\/(\w*)$/)
          if (match && $from.parent.type.name === 'paragraph') {
            const query = match[2] || ''
            return {
              active: true,
              pos: $from.pos,
              query,
            }
          }
          return prev
        }

        // 菜单已激活，更新查询
        const { $from } = tr.selection
        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 20),
          $from.parentOffset,
          null,
          '\ufffc'
        )

        const match = textBefore.match(/(^|\s)\/(\w*)$/)
        if (match) {
          const query = match[2] || ''
          return {
            active: true,
            pos: $from.pos,
            query,
          }
        }

        // 不再匹配，关闭菜单
        return { active: false, pos: 0, query: '' }
      },
    },

    view() {
      return {
        update(view: EditorView, prevState: EditorState) {
          const state = slashMenuKey.getState(view.state)
          const prevPluginState = slashMenuKey.getState(prevState)

          if (state && state.active !== prevPluginState?.active) {
            onUpdate(state)
          } else if (state && state.active && state.query !== prevPluginState?.query) {
            onUpdate(state)
          }
        },
      }
    },
  })
}

// 关闭斜杠菜单的辅助函数
export function closeSlashMenu(view: EditorView) {
  const tr = view.state.tr.setMeta(slashMenuKey, { close: true })
  view.dispatch(tr)
}
