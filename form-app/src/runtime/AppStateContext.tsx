/**
 * AppState 的 React Context：按 formAppCode 实例化的应用级状态经此下发，
 * 供页面渲染器、事件 deps 取用。
 *
 * 详见 docs/第2步-AppState落地设计.md。
 */
import { createContext, useContext } from 'react'
import type { AppState } from './appState'

export const AppStateContext = createContext<AppState | null>(null)

/** 读取当前 form-app 的 AppState（无 Provider 时返回 null，调用方需兜底） */
export function useAppState(): AppState | null {
  return useContext(AppStateContext)
}
