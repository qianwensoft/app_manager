import { Schema } from 'prosemirror-model'
import { schema as baseSchema, defaultMarkdownParser } from 'prosemirror-markdown'
import { tableNodes } from 'prosemirror-tables'
import { MarkdownParser, MarkdownSerializer } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'

// 扩展基础 schema，添加 Notion 风格的节点类型
const nodes = baseSchema.spec.nodes
  // 添加任务列表节点（在 bullet_list 之后）
  .addBefore('ordered_list', 'task_list', {
    group: 'block',
    content: 'task_item+',
    parseDOM: [{ tag: 'ul.task-list' }],
    toDOM() {
      return ['ul', { class: 'task-list' }, 0]
    },
  })
  .addBefore('ordered_list', 'task_item', {
    content: 'paragraph block*',
    attrs: { checked: { default: false } },
    defining: true,
    parseDOM: [
      {
        tag: 'li.task-item',
        getAttrs(dom) {
          return {
            checked: (dom as HTMLElement).getAttribute('data-checked') === 'true',
          }
        },
      },
    ],
    toDOM(node) {
      return [
        'li',
        {
          class: 'task-item' + (node.attrs.checked ? ' checked' : ''),
          'data-checked': node.attrs.checked,
        },
        0,
      ]
    },
  })
  // 添加 Callout 节点（在 blockquote 之后）
  .addBefore('code_block', 'callout', {
    content: 'block+',
    group: 'block',
    attrs: {
      type: { default: 'info' }, // info | warning | error | success
    },
    parseDOM: [
      {
        tag: 'div.callout',
        getAttrs(dom) {
          const el = dom as HTMLElement
          const type = el.getAttribute('data-type') || 'info'
          return { type }
        },
      },
    ],
    toDOM(node) {
      return [
        'div',
        {
          class: `callout callout-${node.attrs.type}`,
          'data-type': node.attrs.type,
        },
        0,
      ]
    },
  })
  // 添加折叠块节点
  .addBefore('code_block', 'toggle_list', {
    group: 'block',
    content: 'toggle_item+',
    parseDOM: [{ tag: 'div.toggle-list' }],
    toDOM() {
      return ['div', { class: 'toggle-list' }, 0]
    },
  })
  .addBefore('code_block', 'toggle_item', {
    content: 'toggle_summary toggle_content',
    defining: true,
    attrs: { open: { default: true } },
    parseDOM: [
      {
        tag: 'details.toggle-item',
        getAttrs(dom) {
          return { open: (dom as HTMLElement).hasAttribute('open') }
        },
      },
    ],
    toDOM(node) {
      const attrs: any = { class: 'toggle-item' }
      if (node.attrs.open) attrs.open = ''
      return ['details', attrs, 0]
    },
  })
  .addBefore('code_block', 'toggle_summary', {
    content: 'inline*',
    parseDOM: [{ tag: 'summary' }],
    toDOM() {
      return ['summary', 0]
    },
  })
  .addBefore('code_block', 'toggle_content', {
    content: 'block+',
    parseDOM: [{ tag: 'div.toggle-content' }],
    toDOM() {
      return ['div', { class: 'toggle-content' }, 0]
    },
  })
  // 添加表格节点（使用 prosemirror-tables）
  .append(tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }))

// 使用扩展后的节点和原有 marks 创建新 schema
export const notionSchema = new Schema({
  nodes,
  marks: baseSchema.spec.marks,
})

// ============ Markdown Parser ============

// 自定义 tokens 解析规则
const tokens = {
  ...baseSchema.spec.nodes.get('paragraph')!.spec,
  // 任务列表解析
  task_list: {
    block: 'task_list',
  },
  task_item: {
    block: 'task_item',
    getAttrs: (tok: any) => ({
      checked: tok.attrGet('checked') === 'true',
    }),
  },
  // Callout 解析（:::info 语法）
  callout: {
    block: 'callout',
    getAttrs: (tok: any) => ({
      type: tok.info || 'info',
    }),
  },
  // 折叠块解析（<details> 标签）
  toggle_item: {
    block: 'toggle_item',
    getAttrs: (tok: any) => ({
      open: tok.attrGet('open') !== 'false',
    }),
  },
  toggle_summary: { block: 'toggle_summary' },
  toggle_content: { block: 'toggle_content' },
}

// 创建自定义 Markdown 解析器
export const notionMarkdownParser = new MarkdownParser(
  notionSchema,
  new MarkdownIt({ html: true }),
  {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'list_item' },
    bullet_list: { block: 'bullet_list' },
    ordered_list: { block: 'ordered_list', getAttrs: (tok: any) => ({ order: +tok.attrGet('start')! || 1 }) },
    heading: { block: 'heading', getAttrs: (tok: any) => ({ level: +tok.tag.slice(1) }) },
    code_block: { block: 'code_block', noCloseToken: true },
    fence: {
      block: 'code_block',
      getAttrs: (tok: any) => ({ params: tok.info || '' }),
      noCloseToken: true,
    },
    hr: { node: 'horizontal_rule' },
    image: {
      node: 'image',
      getAttrs: (tok: any) => ({
        src: tok.attrGet('src'),
        title: tok.attrGet('title') || null,
        alt: (tok.children && tok.children[0] && tok.children[0].content) || null,
      }),
    },
    hardbreak: { node: 'hard_break' },
    // Marks
    em: { mark: 'em' },
    strong: { mark: 'strong' },
    link: {
      mark: 'link',
      getAttrs: (tok: any) => ({
        href: tok.attrGet('href'),
        title: tok.attrGet('title') || null,
      }),
    },
    code_inline: { mark: 'code', noCloseToken: true },
    // 扩展节点
    task_list: { block: 'task_list' },
    task_item: {
      block: 'task_item',
      getAttrs: (tok: any) => ({
        checked: tok.attrGet('data-checked') === 'true',
      }),
    },
    callout: {
      block: 'callout',
      getAttrs: (tok: any) => ({
        type: tok.info || tok.attrGet('data-type') || 'info',
      }),
    },
    html_block: {
      node: 'paragraph',
      getAttrs: () => ({}),
    },
    html_inline: { mark: 'code', noCloseToken: true },
  }
)

// ============ Markdown Serializer ============

// 创建自定义 Markdown 序列化器
export const notionMarkdownSerializer = new MarkdownSerializer(
  {
    // 基础块节点
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node))
    },
    code_block(state, node) {
      state.write('```' + (node.attrs.params || '') + '\n')
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write('```')
      state.closeBlock(node)
    },
    heading(state, node) {
      state.write(state.repeat('#', node.attrs.level) + ' ')
      state.renderInline(node)
      state.closeBlock(node)
    },
    horizontal_rule(state, node) {
      state.write(node.attrs.markup || '---')
      state.closeBlock(node)
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', () => (node.attrs.bullet || '-') + ' ')
    },
    ordered_list(state, node) {
      const start = node.attrs.order || 1
      const maxW = String(start + node.childCount - 1).length
      const space = state.repeat(' ', maxW + 2)
      state.renderList(node, space, (i) => {
        const nStr = String(start + i)
        return state.repeat(' ', maxW - nStr.length) + nStr + '. '
      })
    },
    list_item(state, node) {
      state.renderContent(node)
    },
    paragraph(state, node) {
      state.renderInline(node)
      state.closeBlock(node)
    },
    image(state, node) {
      state.write(
        '![' +
          state.esc(node.attrs.alt || '') +
          '](' +
          state.esc(node.attrs.src) +
          (node.attrs.title ? ' "' + state.esc(node.attrs.title) + '"' : '') +
          ')'
      )
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n')
          return
        }
      }
    },
    text(state, node) {
      state.text(node.text!)
    },

    // 扩展节点：任务列表
    task_list(state, node) {
      state.renderList(node, '  ', () => '- ')
    },
    task_item(state, node) {
      const checkbox = node.attrs.checked ? '[x] ' : '[ ] '
      state.write(checkbox)
      state.renderContent(node)
    },

    // 扩展节点：Callout（使用 ::: 语法）
    callout(state, node) {
      state.write(':::' + node.attrs.type + '\n')
      state.renderContent(node)
      state.ensureNewLine()
      state.write(':::')
      state.closeBlock(node)
    },

    // 扩展节点：折叠块（使用 HTML <details> 标签）
    toggle_list(state, node) {
      state.renderContent(node)
    },
    toggle_item(state, node) {
      state.write('<details' + (node.attrs.open ? ' open' : '') + '>\n')
      state.renderContent(node)
      state.write('</details>')
      state.closeBlock(node)
    },
    toggle_summary(state, node) {
      state.write('<summary>')
      state.renderInline(node)
      state.write('</summary>\n')
    },
    toggle_content(state, node) {
      state.renderContent(node)
    },

    // 表格节点（GFM 语法）
    table(state, node) {
      const firstRow = node.firstChild
      if (!firstRow) return

      // 渲染表头
      state.write('|')
      firstRow.forEach((cell) => {
        state.write(' ')
        state.renderInline(cell)
        state.write(' |')
      })
      state.write('\n')

      // 渲染分隔符
      state.write('|')
      firstRow.forEach(() => {
        state.write(' --- |')
      })
      state.write('\n')

      // 渲染表体
      for (let i = 1; i < node.childCount; i++) {
        const row = node.child(i)
        state.write('|')
        row.forEach((cell) => {
          state.write(' ')
          state.renderInline(cell)
          state.write(' |')
        })
        state.write('\n')
      }
      state.closeBlock(node)
    },
    table_row(state, node) {
      // 由 table 节点统一处理
    },
    table_cell(state, node) {
      state.renderInline(node)
    },
    table_header(state, node) {
      state.renderInline(node)
    },
  },
  {
    // Marks
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open(_state, mark, parent, index) {
        return '['
      },
      close(state, mark, parent, index) {
        return '](' + state.esc(mark.attrs.href) + (mark.attrs.title ? ' "' + state.esc(mark.attrs.title) + '"' : '') + ')'
      },
      mixable: true,
    },
    code: { open: '`', close: '`', escape: false },
  }
)
