import { Icon } from '../../components/Icon'
import { Avatar, Bars, ListRow } from '../../components/ui'
import { LEARNER, PEOPLE, REPORT_BARS } from '../../data/sample'
import type { Handoff } from '../../data/types'

/** Everyone this reviewer sends angles to. Only the paired one is live. */
export function People({ handoff }: { handoff: Handoff }) {
  return (
    <div className="scroll pad">
      <h1 className="screen-title" style={{ padding: '12px 0 4px' }}>
        People
      </h1>
      <p className="body dim" style={{ marginBottom: 16 }}>
        One of these is on the other device. The rest are here so the list reads like a real one.
      </p>

      <div className="stack">
        {PEOPLE.map((person) => {
          const live = person.name === LEARNER.name
          return (
            <ListRow
              key={person.name}
              leading={<Avatar who={person} unread={live && handoff.status === 'done'} />}
              title={person.name}
              meta={<span className="meta dim truncate">{person.meta}</span>}
              trailing={
                live ? (
                  <span className="chip solid">Paired</span>
                ) : (
                  <Icon name="chev" size={15} color="var(--ink-600)" />
                )
              }
            />
          )
        })}
      </div>
      <div style={{ height: 12 }} />
    </div>
  )
}

/** A worked example of what a report looks like when it is not this session's. */
export function Reports() {
  return (
    <div className="scroll pad">
      <h1 className="screen-title" style={{ padding: '12px 0 4px' }}>
        Reports
      </h1>
      <p className="body dim" style={{ marginBottom: 20 }}>
        Sessions you have already read, kept with the document they came from.
      </p>

      <div className="card stack gap-14">
        <div className="row">
          <span className="tile">
            <Icon name="doc" size={19} />
          </span>
          <span className="grow stack gap-4">
            <span className="body-med truncate">New Hire Security Policy</span>
            <span className="meta dim">Lena Sørensen · Aug 28 · Stress-test the definitions</span>
          </span>
          <span className="body-semi">84</span>
        </div>
        <div className="rule" />
        <Bars rows={REPORT_BARS} legend />
      </div>

      <p className="micro dimmer" style={{ marginTop: 16, textAlign: 'center' }}>
        Sample report. Live sessions land in the Inbox.
      </p>
    </div>
  )
}
