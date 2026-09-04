import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Handoff, Role } from '../data/types'
import { TERM_SHEET } from '../data/sample'
import { backfill, publish, subscribe, type LinkState, type Subscription } from './pairing'
import { makeBrain, providerInfo, type Brain, type BrainConfig, type ProviderId } from './brain'

/* -- What this browser remembers ---------------------------------------- */

const KEYS = {
  role: 'probe.role',
  code: 'probe.code',
  provider: 'probe.provider',
  model: 'probe.model',
  apiKey: 'probe.apiKey',
  device: 'probe.device',
} as const

export const DEFAULT_CODE = 'probe-demo'

function read(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* private browsing; the session still works, it just will not be remembered */
  }
}

function deviceId(): string {
  const existing = read(KEYS.device)
  if (existing) return existing
  const made = Math.random().toString(36).slice(2, 12)
  write(KEYS.device, made)
  return made
}

export const BLANK_HANDOFF: Handoff = {
  status: 'awaiting',
  pathIndex: 1,
  pathName: '',
  score: null,
  nudged: false,
  document: TERM_SHEET,
  paths: null,
  result: null,
  from: '',
  at: 0,
}

/* -- The store ----------------------------------------------------------- */

export function useProbe() {
  const device = useMemo(deviceId, [])

  const [role, setRole] = useState<Role | null>(() => {
    const saved = read(KEYS.role)
    return saved === 'learner' || saved === 'reviewer' ? saved : null
  })
  const [code, setCode] = useState(() => read(KEYS.code, DEFAULT_CODE) || DEFAULT_CODE)
  const [provider, setProvider] = useState<ProviderId>(() => {
    const saved = read(KEYS.provider) as ProviderId
    return ['none', 'groq', 'gemini', 'claude'].includes(saved) ? saved : 'none'
  })
  const [model, setModel] = useState(() => read(KEYS.model))
  const [apiKey, setApiKey] = useState(() => read(KEYS.apiKey))

  const [handoff, setHandoff] = useState<Handoff>(BLANK_HANDOFF)
  const [link, setLink] = useState<LinkState>('offline')
  const subscriptionRef = useRef<Subscription | null>(null)

  /* Live pairing, for as long as this browser is signed in. */
  useEffect(() => {
    if (!role) {
      subscriptionRef.current?.close()
      subscriptionRef.current = null
      setLink('offline')
      return
    }
    let live = true

    // Catch up first, so a browser opened second still sees where things got to.
    void backfill(code).then((history) => {
      if (!live) return
      const latest = history.filter((h) => h.from !== device).pop()
      if (latest) setHandoff((prev) => (latest.at >= prev.at ? latest : prev))
    })

    const subscription = subscribe(
      code,
      (next) => {
        if (!live || next.from === device) return
        setHandoff((prev) => (next.at >= prev.at ? next : prev))
      },
      (state) => live && setLink(state),
    )
    subscriptionRef.current = subscription

    return () => {
      live = false
      subscription.close()
    }
  }, [role, code, device])

  /** Applied locally at once, then sent; the peer resolves by timestamp. */
  const push = useCallback(
    (patch: Partial<Handoff>) => {
      setHandoff((prev) => {
        const next: Handoff = { ...prev, ...patch, from: device, at: Date.now() }
        void publish(code, next)
        return next
      })
    },
    [code, device],
  )

  const brainConfig: BrainConfig = useMemo(
    () => ({ provider, model: model || providerInfo(provider).defaultModel, apiKey }),
    [provider, model, apiKey],
  )
  const brain: Brain | null = useMemo(() => makeBrain(brainConfig), [brainConfig])

  const signIn = useCallback((next: Role, pairingCode: string) => {
    const cleaned = pairingCode.trim() || DEFAULT_CODE
    write(KEYS.role, next)
    write(KEYS.code, cleaned)
    setCode(cleaned)
    setRole(next)
    setHandoff(BLANK_HANDOFF)
  }, [])

  const signOut = useCallback(() => {
    write(KEYS.role, '')
    setRole(null)
    setHandoff(BLANK_HANDOFF)
  }, [])

  const chooseProvider = useCallback((next: ProviderId) => {
    write(KEYS.provider, next)
    // A model name from another service is never right for this one.
    write(KEYS.model, providerInfo(next).defaultModel)
    setProvider(next)
    setModel(providerInfo(next).defaultModel)
  }, [])

  const saveBrain = useCallback((nextModel: string, nextKey: string) => {
    write(KEYS.model, nextModel)
    write(KEYS.apiKey, nextKey)
    setModel(nextModel)
    setApiKey(nextKey)
  }, [])

  return {
    device,
    role,
    code,
    handoff,
    link,
    push,
    brain,
    brainConfig,
    provider,
    model: model || providerInfo(provider).defaultModel,
    apiKey,
    signIn,
    signOut,
    chooseProvider,
    saveBrain,
  }
}

export type ProbeStore = ReturnType<typeof useProbe>
