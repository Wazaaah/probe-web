import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import type { Answer, ConceptScore, Person } from '../data/types'

/** The vocabulary every screen is built from. */

export function Avatar({ who, size = '', unread = false }: { who: Person; size?: string; unread?: boolean }) {
  return (
    <span className="avatar-wrap">
      <span className={`avatar ${size}`}>{who.initials}</span>
      {unread && <span className="unread" />}
    </span>
  )
}

export function TopBar({
  title,
  onBack,
  action,
  onAction,
  rule = true,
}: {
  title: string
  onBack?: () => void
  action?: IconName
  onAction?: () => void
  rule?: boolean
}) {
  return (
    <div className="top" style={rule ? { borderBottom: '1px solid var(--rule)' } : undefined}>
      {onBack ? (
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon name="back" size={22} />
        </button>
      ) : (
        <span className="spacer-48" />
      )}
      <span className="t-title">{title}</span>
      {action ? (
        <button className="icon-btn" onClick={onAction} aria-label={action}>
          <Icon name={action} size={20} color="var(--ink-700)" />
        </button>
      ) : (
        <span className="spacer-48" />
      )}
    </div>
  )
}

/** A concept's score: filled for solid, muted for shaky, an empty outline for a gap. */
export function Bars({ rows, legend = false }: { rows: ConceptScore[]; legend?: boolean }) {
  return (
    <div className="stack gap-12">
      <p className="body-med">Understanding by concept</p>
      {rows.map((row) => (
        <div className="stack gap-8" key={row.label}>
          <div className="between">
            <span className="body-med">{row.label}</span>
            <span className="micro" style={{ color: 'var(--ink-800)' }}>
              {row.state === 'solid' ? 'Solid' : row.state === 'shaky' ? 'Shaky' : 'Gap'}
            </span>
          </div>
          <div className={`bar${row.state === 'gap' ? ' is-gap' : ''}`}>
            <span
              className={row.state === 'shaky' ? 'shaky' : ''}
              style={{ width: `${row.state === 'gap' ? 0 : row.percent}%` }}
            />
          </div>
        </div>
      ))}
      {legend && (
        <div className="row gap-16" style={{ paddingTop: 4 }}>
          {(
            [
              ['Solid', 'var(--ink)', false],
              ['Shaky', 'var(--ink-600)', false],
              ['Gap', '#eeeeee', true],
            ] as const
          ).map(([label, colour, outlined]) => (
            <span className="row gap-6" key={label}>
              <span
                className="legend-swatch"
                style={{ background: colour, boxShadow: outlined ? 'inset 0 0 0 1px var(--rule)' : undefined }}
              />
              <span className="micro dim">{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The places the examiner refused to accept the first answer. */
export function ProbeMoment({ heading, caption, quote }: { heading: string; caption: string; quote: string }) {
  return (
    <div className="stack gap-10">
      <div className="row gap-8">
        <Icon name="fork" size={16} />
        <span className="body-med">{heading}</span>
      </div>
      <div className="notice stack gap-6">
        <p className="micro-med dim">{caption}</p>
        <p className="body-med">{quote}</p>
      </div>
    </div>
  )
}

export function Transcript({ answers }: { answers: Answer[] }) {
  return (
    <div className="stack gap-10">
      <p className="body-med">Transcript</p>
      <div className="rule" />
      <div className="stack gap-14" style={{ paddingTop: 12 }}>
        {answers.map((answer, index) => (
          <div className="stack gap-6" key={index}>
            <p className="body-med">Probe · “{answer.question}”</p>
            <p className="body dim">You · “{answer.spoken.trim()}”</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** A settings-style row: tile, label, current value, chevron. */
export function SettingRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="stack">
      <div className="row" style={{ padding: '13px 0' }}>
        <span className="tile">
          <Icon name={icon} size={19} />
        </span>
        <span className="body-med grow">{label}</span>
        <span className="micro dim">{value}</span>
        <Icon name="chev" size={15} color="var(--ink-600)" />
      </div>
      <div className="rule" />
    </div>
  )
}

export function ListRow({
  leading,
  title,
  meta,
  trailing,
  onClick,
}: {
  leading: ReactNode
  title: string
  meta: ReactNode
  trailing?: ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      {leading}
      <span className="grow stack gap-4">
        <span className="body-med truncate">{title}</span>
        {meta}
      </span>
      {trailing}
    </>
  )
  return (
    <div className="stack">
      {onClick ? (
        <button className="row" style={{ padding: '13px 0', width: '100%', textAlign: 'left' }} onClick={onClick}>
          {inner}
        </button>
      ) : (
        <div className="row" style={{ padding: '13px 0' }}>
          {inner}
        </div>
      )}
      <div className="rule" />
    </div>
  )
}

/**
 * The app's navigation, which is a bar along the bottom on a phone and a rail down the
 * side on a desktop — one element, switched by CSS, so both stay in step.
 */
export function Nav<T extends string>({
  items,
  active,
  onSelect,
  who,
  hidden = false,
}: {
  items: { id: T; icon: IconName; label: string; badge?: number }[]
  active: T
  onSelect: (id: T) => void
  who: Person
  hidden?: boolean
}) {
  return (
    <nav className={`nav${hidden ? ' away' : ''}`}>
      <span className="brand">
        <span className="mark-sm" />
        <span className="stack">
          <span className="body-semi">Probe</span>
          <span className="micro dim truncate">{who.name}</span>
        </span>
      </span>
      {items.map((item) => (
        <button
          key={item.id}
          className={active === item.id ? 'on' : ''}
          onClick={() => onSelect(item.id)}
          aria-current={active === item.id ? 'page' : undefined}
        >
          <span className="pill">
            <Icon name={item.icon} size={24} />
            {item.badge !== undefined && <span className="badge">{item.badge}</span>}
          </span>
          <span className="label">{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
