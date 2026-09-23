import { useEffect, useState } from 'react'
import { RoleChooser, Splash } from './screens/Onboarding'
import { Learner } from './screens/learner/Learner'
import { Reviewer } from './screens/reviewer/Reviewer'
import { Trial } from './screens/Trial'
import { Review } from './screens/Review'
import { TrialApp } from './screens/TrialApp'
import { ProbeApp } from './screens/app/ProbeApp'
import { useProbe } from './lib/store'

/**
 * The real app is what opens by default now — no hash needed. It's the product; the
 * original paired reviewer/learner demo (pick a side, pair over a code) is the earlier
 * prototype this grew out of, kept reachable at #demo rather than deleted, in case it's
 * still useful for showing someone the original concept.
 *
 * Except in the judge-testing build. `npm run build:trial` sets VITE_TRIAL and the app
 * opens instead on the one sequence an afternoon of testing needs — key, reading, angle,
 * then people taking turns. There is no role to choose there because there is only one
 * machine and one reading, and every screen a participant has to be walked past before
 * answering a question is a chance for the session to start badly.
 *
 * The ordinary build keeps the same console at #trial, for running the same exercise
 * without a separate deployment.
 */
export function App() {
  const store = useProbe()
  const [splash, setSplash] = useState<'in' | 'out' | 'gone'>('in')
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const leave = window.setTimeout(() => setSplash('out'), 1250)
    const remove = window.setTimeout(() => setSplash('gone'), 1700)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(remove)
    }
  }, [])

  const go = (next: string) => {
    window.location.hash = next
    setHash(next)
  }

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (import.meta.env.VITE_TRIAL === '1') {
    return (
      <>
        <TrialApp store={store} />
        {splash !== 'gone' && <Splash leaving={splash === 'out'} />}
      </>
    )
  }

  if (hash === '#review') {
    return <Review onLeave={() => go('#trial')} brain={store.brain} />
  }

  if (hash === '#trial') {
    return <Trial onLeave={() => go('')} onReview={() => go('#review')} />
  }

  if (hash === '#demo') {
    return (
      <>
        {store.role === null ? (
          <RoleChooser initialCode={store.code} onSignIn={store.signIn} />
        ) : store.role === 'learner' ? (
          <Learner store={store} />
        ) : (
          <Reviewer store={store} />
        )}
        {splash !== 'gone' && <Splash leaving={splash === 'out'} />}
      </>
    )
  }

  return <ProbeApp store={store} />
}
