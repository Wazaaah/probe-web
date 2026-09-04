import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// No StrictMode: its double-invoked effects would speak every question twice and publish
// every handoff twice in development, which is exactly the behaviour a demo must not have.
createRoot(document.getElementById('root')!).render(<App />)
