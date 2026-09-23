import { useState } from 'react'
import './app.css'
import { Icon, type IconName } from '../../components/Icon'
import { ClassReport } from './ClassReport'
import { ExaminerVoice } from './ExaminerVoice'
import { Home } from './Home'
import { ModelSettings } from './ModelSettings'
import { Readings } from './Readings'
import { RunExam } from './RunExam'
import { Students } from './Students'
import { StudentRecord } from './StudentRecord'
import type { ProbeStore } from '../../lib/store'

export type Screen = 'home' | 'readings' | 'run' | 'students' | 'class' | 'voice' | 'model'

const NAV: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'run', label: 'Run an exam', icon: 'mic' },
  { id: 'readings', label: 'Readings', icon: 'book' },
  { id: 'students', label: 'Students', icon: 'people' },
  { id: 'class', label: 'Class report', icon: 'report' },
]

const SETTINGS: { id: Screen; label: string; icon: IconName }[] = [
  { id: 'voice', label: 'Examiner voice', icon: 'mic' },
  { id: 'model', label: 'Model & API key', icon: 'link' },
]

const COLLAPSE_KEY = 'probe.app.sidebarCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'yes'
  } catch {
    return false
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, value ? 'yes' : 'no')
  } catch {
    /* not remembered between reloads; the toggle still works this session */
  }
}

/**
 * The real app — entirely lecturer-facing, no student ever opens this, one login. This IS
 * the product; "Admin" in the sidebar names one narrow thing inside it (provider and key),
 * not the whole app. Ashesi's own palette (see app.css), a real desktop layout that uses
 * the window rather than a column marooned in the middle of it.
 */
export function ProbeApp({ store }: { store: ProbeStore }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [openStudent, setOpenStudent] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      writeCollapsed(!prev)
      return !prev
    })
  }

  const go = (next: Screen) => {
    setOpenStudent(null)
    setScreen(next)
  }

  let body: React.ReactNode
  if (screen === 'students' && openStudent) {
    body = <StudentRecord indexNumber={openStudent} onBack={() => setOpenStudent(null)} />
  } else if (screen === 'home') {
    body = <Home go={go} />
  } else if (screen === 'run') {
    body = <RunExam store={store} />
  } else if (screen === 'readings') {
    body = <Readings store={store} />
  } else if (screen === 'students') {
    body = <Students onOpen={setOpenStudent} />
  } else if (screen === 'class') {
    body = <ClassReport />
  } else if (screen === 'voice') {
    body = <ExaminerVoice />
  } else {
    body = <ModelSettings store={store} />
  }

  return (
    <div className="pa">
      <div className="pa-shell">
        <aside className={`pa-sidebar${collapsed ? ' collapsed' : ''}`}>
          <div className="pa-brand">
            <span className="pa-mark">
              <span className="pa-ring" />
            </span>
            <span className="pa-stack pa-gap-4" style={{ minWidth: 0 }}>
              <span className="pa-name">Probe</span>
              {/* Placeholder until real sign-in exists — becomes the signed-in
                  lecturer's name once Supabase auth is wired in. */}
              <span className="pa-who">Lecturer</span>
            </span>
          </div>
          <nav className="pa-nav">
            <div className="pa-nav-group">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  className={`pa-nav-item${screen === item.id ? ' active' : ''}`}
                  onClick={() => go(item.id)}
                  aria-current={screen === item.id ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="pa-nav-text">{item.label}</span>
                </button>
              ))}
            </div>
            <div className="pa-nav-group">
              <span className="pa-nav-label">Admin</span>
              {SETTINGS.map((item) => (
                <button
                  key={item.id}
                  className={`pa-nav-item${screen === item.id ? ' active' : ''}`}
                  onClick={() => go(item.id)}
                  aria-current={screen === item.id ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="pa-nav-text">{item.label}</span>
                </button>
              ))}
            </div>
          </nav>
          <button
            className="pa-collapse-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span style={{ display: 'flex', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>
              <Icon name="chev" size={14} color="currentColor" />
            </span>
            {!collapsed && <span className="pa-nav-text">Collapse</span>}
          </button>
        </aside>

        <div className="pa-main">
          {/* Left empty on purpose: the institutional mark lives in one place — next to
              "Probe" in the sidebar, not split off into a second mark over here. */}
          <div className="pa-topbar" />
          <div className="pa-content">
            <div className="pa-content-inner">{body}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
