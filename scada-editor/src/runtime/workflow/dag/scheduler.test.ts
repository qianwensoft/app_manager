import { describe, it, expect } from 'vitest'
import { runGraph, type RunNode } from './scheduler'
import type { FlowGraph, FlowNode } from '@/types/workflow'
import type { WorkflowContext } from '../types'

function ctx(over: Partial<WorkflowContext> = {}): WorkflowContext {
  return { event: undefined, point: {}, global: {}, workflow: {}, nodeOutputs: {}, ...over }
}

const clock = () => 0

describe('runGraph — topological execution', () => {
  it('runs nodes in dependency order', async () => {
    const order: string[] = []
    const graph: FlowGraph = {
      nodes: [
        { id: 'a', kind: 'run_script' },
        { id: 'b', kind: 'run_script' },
        { id: 'c', kind: 'run_script' },
      ],
      edges: [
        { id: 'e0', source: 'a', target: 'b' },
        { id: 'e1', source: 'b', target: 'c' },
      ],
    }
    const runNode: RunNode = async (node: FlowNode) => { order.push(node.id); return { ok: node.id } }
    const { outputs, traces } = await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(outputs.a).toEqual({ ok: 'a' })
    expect(traces.filter((t) => t.status === 'ok').length).toBe(3)
  })

  it('exposes upstream outputs via ctx.nodeOutputs', async () => {
    const seen: Record<string, unknown> = {}
    const graph: FlowGraph = {
      nodes: [
        { id: 'a', kind: 'run_script' },
        { id: 'b', kind: 'run_script' },
      ],
      edges: [{ id: 'e0', source: 'a', target: 'b' }],
    }
    const runNode: RunNode = async (node, nodeCtx) => {
      if (node.id === 'a') return { value: 42 }
      seen.b = nodeCtx.nodeOutputs?.a
      return {}
    }
    await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(seen.b).toEqual({ value: 42 })
  })

  it('condition node prunes edges whose condition fails', async () => {
    const ran: string[] = []
    const graph: FlowGraph = {
      nodes: [
        { id: 'cond', kind: 'condition' },
        { id: 'yes', kind: 'run_script' },
        { id: 'no', kind: 'run_script' },
      ],
      edges: [
        { id: 'e0', source: 'cond', target: 'yes', condition: { left_src: '$workflow.go', operator: 'eq', value: '1' } },
        { id: 'e1', source: 'cond', target: 'no', condition: { left_src: '$workflow.go', operator: 'eq', value: '0' } },
      ],
    }
    const runNode: RunNode = async (node) => { ran.push(node.id); return {} }
    const { traces } = await runGraph(graph, ctx({ workflow: { go: '1' } }), runNode, undefined, undefined, clock)
    expect(ran).toContain('yes')
    expect(ran).not.toContain('no')
    expect(traces.find((t) => t.nodeId === 'no')?.status).toBe('skipped')
  })

  it('runs independent nodes (parallel fan-out) both', async () => {
    const ran = new Set<string>()
    const graph: FlowGraph = {
      nodes: [
        { id: 'root', kind: 'parallel' },
        { id: 'x', kind: 'run_script' },
        { id: 'y', kind: 'run_script' },
      ],
      edges: [
        { id: 'e0', source: 'root', target: 'x' },
        { id: 'e1', source: 'root', target: 'y' },
      ],
    }
    const runNode: RunNode = async (node) => { ran.add(node.id); return {} }
    await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(ran.has('x')).toBe(true)
    expect(ran.has('y')).toBe(true)
  })

  it('aborts on error by default (onError undefined)', async () => {
    const ran: string[] = []
    const graph: FlowGraph = {
      nodes: [
        { id: 'a', kind: 'tool', action: { type: 'toast', message_src: '' } },
        { id: 'b', kind: 'run_script' },
      ],
      edges: [{ id: 'e0', source: 'a', target: 'b' }],
    }
    const runNode: RunNode = async (node) => {
      ran.push(node.id)
      if (node.id === 'a') throw new Error('boom')
      return {}
    }
    const { traces } = await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(ran).toEqual(['a'])
    expect(traces.find((t) => t.nodeId === 'a')?.status).toBe('failed')
  })

  it('continues past error when action.onError=continue', async () => {
    const ran: string[] = []
    const graph: FlowGraph = {
      nodes: [
        { id: 'a', kind: 'tool', action: { type: 'toast', message_src: '', onError: 'continue' } },
        { id: 'b', kind: 'run_script' },
      ],
      edges: [{ id: 'e0', source: 'a', target: 'b' }],
    }
    const runNode: RunNode = async (node) => {
      ran.push(node.id)
      if (node.id === 'a') throw new Error('boom')
      return {}
    }
    await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(ran).toEqual(['a', 'b'])
  })

  it('returns early on invalid graph (cycle)', async () => {
    const graph: FlowGraph = {
      nodes: [{ id: 'a', kind: 'run_script' }, { id: 'b', kind: 'run_script' }],
      edges: [{ id: 'e0', source: 'a', target: 'b' }, { id: 'e1', source: 'b', target: 'a' }],
    }
    let called = 0
    const runNode: RunNode = async () => { called++; return {} }
    const { traces } = await runGraph(graph, ctx(), runNode, undefined, undefined, clock)
    expect(called).toBe(0)
    expect(traces).toEqual([])
  })
})
