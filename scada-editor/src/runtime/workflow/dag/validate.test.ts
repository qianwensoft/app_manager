import { describe, it, expect } from 'vitest'
import { detectCycle, validateGraph } from './validate'
import type { FlowGraph } from '@/types/workflow'

const g = (nodes: string[], edges: [string, string][]): FlowGraph => ({
  nodes: nodes.map((id) => ({ id, kind: 'tool' as const })),
  edges: edges.map(([source, target], i) => ({ id: `e${i}`, source, target })),
})

describe('detectCycle', () => {
  it('returns null for acyclic graph', () => {
    expect(detectCycle(g(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]))).toBeNull()
  })
  it('detects a simple cycle', () => {
    const cycle = detectCycle(g(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]))
    expect(cycle).not.toBeNull()
    expect(cycle!.length).toBeGreaterThan(0)
  })
  it('detects self-loop', () => {
    expect(detectCycle(g(['a'], [['a', 'a']]))).not.toBeNull()
  })
})

describe('validateGraph', () => {
  it('ok for valid graph', () => {
    const r = validateGraph(g(['a', 'b'], [['a', 'b']]))
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })
  it('flags missing source/target', () => {
    const r = validateGraph(g(['a'], [['a', 'ghost']]))
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.includes('ghost'))).toBe(true)
  })
  it('flags cycle with path', () => {
    const r = validateGraph(g(['a', 'b'], [['a', 'b'], ['b', 'a']]))
    expect(r.ok).toBe(false)
    expect(r.cycle).toBeDefined()
  })
})
