import { useEffect, useState } from 'react'
import { RoleChooser, Splash } from './screens/Onboarding'
import { Learner } from './screens/learner/Learner'
import { Reviewer } from './screens/reviewer/Reviewer'
import { Trial } from './screens/Trial'
import { useProbe } from './lib/store'

/**
 * Open it, watch the mark draw, pick a side. That choice is kept until you sign out,
 * and everything after it depends on which side this browser is.
 *
 * One door sits outside that: #trial, which is the console for running a handful of
 * people through the same reading and getting the transcripts back. It is addressed by
 * hash rather than put on screen because it is not part of using Probe — it is part of
 * finding out whether Probe works, and nobody arriving to be examined should meet it.
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

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#trial') {
    return (
      <Trial
        onLeave={() => {
          window.location.hash = ''
          setHash('')
        }}
      />
    )
  }

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
