type PageState = {
  pageKey: string
  params: Record<string, any>
}

class NavigationManager {
  private stack: PageState[] = []
  private listeners: Array<(state: PageState) => void> = []

  push(pageKey: string, params: Record<string, any> = {}) {
    const state = { pageKey, params }
    this.stack.push(state)
    this.notify(state)
  }

  pop(): PageState | null {
    if (this.stack.length > 1) {
      this.stack.pop()
      const prev = this.stack[this.stack.length - 1]
      this.notify(prev)
      return prev
    }
    return null
  }

  replace(pageKey: string, params: Record<string, any> = {}) {
    if (this.stack.length > 0) {
      this.stack[this.stack.length - 1] = { pageKey, params }
    } else {
      this.stack.push({ pageKey, params })
    }
    this.notify({ pageKey, params })
  }

  current(): PageState | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
  }

  canGoBack(): boolean {
    return this.stack.length > 1
  }

  clear() {
    this.stack = []
    this.listeners = []
  }

  onChange(listener: (state: PageState) => void) {
    this.listeners.push(listener)
    return () => {
      const idx = this.listeners.indexOf(listener)
      if (idx > -1) this.listeners.splice(idx, 1)
    }
  }

  private notify(state: PageState) {
    this.listeners.forEach(l => l(state))
  }
}

export const navigationManager = new NavigationManager()
