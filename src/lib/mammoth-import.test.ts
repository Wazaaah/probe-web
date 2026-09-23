import { describe, expect, it } from 'vitest'

/**
 * mammoth is a CommonJS `export =` module, and whether `extractRawText` lands as a named
 * export or only on `.default` depends on interop settings that TypeScript can get right
 * at the type level while the bundler disagrees at runtime — exactly the kind of mismatch
 * that would make every Word upload fail with "extractRawText is not a function" no test
 * would have run against before shipping. This checks the actual shape, not the type.
 */
describe('the mammoth import shape doc.ts relies on', () => {
  it('exposes extractRawText as a callable function on the module namespace', async () => {
    const mod = await import('mammoth')
    expect(typeof mod.extractRawText).toBe('function')
    // 30s, not the 5s default: the first time anything imports a freshly-added dependency,
    // Vite has to pre-bundle it before the import resolves — a one-time cost (confirmed
    // here at ~7s cold, ~0.2s warm) that a tight timeout would misreport as a hang.
  }, 30000)
})
