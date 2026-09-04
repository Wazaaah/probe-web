import { useState } from 'react'
import { Icon } from '../components/Icon'
import type { Role } from '../data/types'
import { LEARNER, REVIEWER } from '../data/sample'

/** The mark opens like an aperture, then hands over to the app behind it. */
export function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div className={`splash${leaving ? ' out' : ''}`} aria-hidden="true">
      <div>
        <svg className="mark" viewBox="0 0 84 84">
          <circle cx="42" cy="42" r="35" />
        </svg>
        <p className="word title">Probe</p>
      </div>
    </div>
  )
}

const OPTIONS = [
  {
    role: 'learner' as const,
    icon: 'mic' as const,
    headline: "I'm being questioned",
    detail: "Upload your material, then answer out loud. You'll only ever see the angle your reviewer picked.",
    who: LEARNER.name,
  },
  {
    role: 'reviewer' as const,
    icon: 'fork' as const,
    headline: "I'm the reviewer",
    detail: 'Choose how hard someone gets pushed, edit the questions, then read what came back.',
    who: REVIEWER.name,
  },
]

/**
 * Which side of the handoff this browser is.
 *
 * Probe only works when someone else chooses your angle, so this is the first thing the
 * app asks. The pairing code is what ties this browser to the other one.
 */
export function RoleChooser({
  initialCode,
  onSignIn,
}: {
  initialCode: string
  onSignIn: (role: Role, code: string) => void
}) {
  const [picked, setPicked] = useState<Role | null>(null)
  const [code, setCode] = useState(initialCode)

  return (
    <div className="frame solo">
      <div className="pane">
        <div className="scroll pad" style={{ paddingTop: 28 }}>
          <span className="mark-sm" style={{ width: 52, height: 52, borderRadius: 16 }} />

          <h1 className="display" style={{ marginTop: 22 }}>
            Who are you
            <br />
            on this device?
          </h1>
          <p className="body dim" style={{ marginTop: 8 }}>
            Probe works between two people. Pick the side you're on — you'll stay signed in as it until you sign out.
          </p>

          <div className="stack gap-10" style={{ marginTop: 24 }}>
            {OPTIONS.map((option) => {
              const on = picked === option.role
              return (
                <button
                  key={option.role}
                  className={`card${on ? ' chosen lifted' : ''}`}
                  style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}
                  onClick={() => setPicked(option.role)}
                  aria-pressed={on}
                >
                  <span className={`tile${on ? ' solid' : ''}`} style={{ width: 44, height: 44 }}>
                    <Icon name={option.icon} size={22} />
                  </span>
                  <span className="grow stack gap-4">
                    <span className="card-title">{option.headline}</span>
                    <span className="meta dim">{option.detail}</span>
                    <span className="micro-med dimmer">You'll appear as {option.who}</span>
                  </span>
                  <span className={`radio${on ? ' on' : ''}`} style={{ marginTop: 4 }}>
                    {on && <Icon name="check" size={13} color="var(--surface)" />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="stack gap-10" style={{ marginTop: 24 }}>
            <label className="body-med" htmlFor="pairing">
              Pairing code
            </label>
            <p className="meta dim">Both browsers need the same code to see each other.</p>
            <input
              id="pairing"
              className="field"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="dock">
          <button
            className={`btn${picked ? '' : ' quiet'}`}
            disabled={!picked}
            onClick={() => picked && onSignIn(picked, code)}
          >
            {picked && <Icon name="check" size={19} color="var(--surface)" />}
            {picked ? `Continue as ${picked === 'learner' ? 'Learner' : 'Reviewer'}` : 'Pick a side'}
          </button>
        </div>
      </div>
    </div>
  )
}
