import { describe, it, expect, beforeEach } from 'vitest'
import { getLoadedLibs, resetLoadedLibs, loadLib, loadLibs } from './libLoader'
import type { WorkflowLib } from '@/types/workflow'

describe('libLoader — cache & guards (no DOM)', () => {
  beforeEach(() => resetLoadedLibs())

  it('starts empty', () => {
    expect(getLoadedLibs()).toEqual({})
  })

  it('resetLoadedLibs clears the cache', () => {
    resetLoadedLibs()
    expect(getLoadedLibs()).toEqual({})
  })

  it('loadLib rejects when name/url missing', async () => {
    await expect(loadLib({ name: '', source: 'url', url: '' } as WorkflowLib)).rejects.toThrow()
    await expect(loadLib({ name: 'x', source: 'url', url: '' } as WorkflowLib)).rejects.toThrow()
  })

  it('loadLibs resolves for empty/undefined lists', async () => {
    await expect(loadLibs(undefined)).resolves.toBeUndefined()
    await expect(loadLibs([])).resolves.toBeUndefined()
  })

  it('loadLibs swallows individual load errors (no DOM available)', async () => {
    // injectScript touches document; in node env this throws and is caught internally.
    await expect(loadLibs([{ name: 'foo', source: 'url', url: 'https://x/y.js' }])).resolves.toBeUndefined()
    // failed load leaves nothing registered
    expect(getLoadedLibs().foo).toBeUndefined()
  })
})
