import { useEffect, useState } from 'react'
import { RoleChooser, Splash } from './screens/Onboarding'
import { Learner } from './screens/learner/Learner'
import { Reviewer } from './screens/reviewer/Reviewer'
import { useProbe } from './lib/store'

/**
 * Open it, watch the mark draw, pick a side. That choice is kept until you sign out,
 * and everything after it depends on which side this browser is.
 */
export function App() {
  const store = useProbe()
  const [splash, setSplash] = useState<'in' | 'out' | 'gone'>('in')

  useEffect(() => {
    const leave = window.setTimeout(() => setSplash('out'), 1250)
    const remove = window.setTimeout(() => setSplash('gone'), 1700)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(remove)
    }
  }, [])

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
