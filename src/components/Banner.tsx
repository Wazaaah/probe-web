import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { notify } from '../lib/notify'
import type { Handoff } from '../data/types'

export interface Alert {
  icon: IconName
  title: string
  detail: string
  action?: string
}

/** Drops in from the top, the way a push notification would, and leaves on its own. */
export function Banner({ alert, onAction, onDismiss }: { alert: Alert; onAction?: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 6500)
    return () => window.clearTimeout(timer)
  }, [alert, onDismiss])

  return (
    <div className="banner">
      <span className="tile solid">
        <Icon name={alert.icon} size={19} />
      </span>
      <span className="grow stack gap-4">
        <span className="body-semi">{alert.title}</span>
        <span className="meta dim">{alert.detail}</span>
      </span>
      {alert.action && onAction ? (
        <button className="btn small" onClick={onAction}>
          {alert.action}
        </button>
      ) : (
        <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={18} color="var(--ink-700)" />
        </button>
      )}
    </div>
  )
}

/**
 * Watches the shared handoff and raises an alert when the *other* browser moved it.
 *
 * The two roles care about different transitions, so each passes its own reading of
 * what just happened; this only decides that something did.
 */
export function useHandoffAlert(handoff: Handoff, device: string, read: (previous: Handoff, next: Handoff) => Alert | null) {
  const [alert, setAlert] = useState<Alert | null>(null)
  const previous = useRef<Handoff>(handoff)
  const readRef = useRef(read)
  readRef.current = read

  useEffect(() => {
    const before = previous.current
    previous.current = handoff
    // Our own writes come back through the same state; they are not news.
    if (handoff.from === device || handoff.at === before.at) return
    const next = readRef.current(before, handoff)
    if (!next) return
    setAlert(next)
    notify(next.title, next.detail)
  }, [handoff, device])

  return { alert, dismiss: () => setAlert(null) }
}
