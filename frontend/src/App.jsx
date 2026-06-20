import { useState, useEffect } from 'react'
import PlanForm from './components/PlanForm'
import Schedule from './components/Schedule'
import Deadlines from './components/Deadlines'
import EveningReview from './components/EveningReview'
import CommandBar from './components/CommandBar'
import LiveClock from './components/LiveClock'
import Settings from './pages/Settings'
import Week from './pages/Week'
import Dashboard from './pages/Dashboard'
import { getTodayPlan } from './utils/api'
import './App.css'

export default function App() {
  const [view, setView] = useState('loading') // loading | plan | schedule | review | week | settings
  const [planData, setPlanData] = useState(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [scheduleActions, setScheduleActions] = useState({})

  const shouldShowReview = () => new Date().getHours() >= 17

  useEffect(() => {
    getTodayPlan().then(data => {
      if (data.exists) {
        setPlanData(data)
        setView(shouldShowReview() ? 'review' : 'schedule')
      } else {
        setView('plan')
      }
    }).catch(() => setView('plan'))
  }, [])

  const handlePlanGenerated = (result) => {
    getTodayPlan().then(data => {
      setPlanData(data)
      setView(shouldShowReview() ? 'review' : 'schedule')
    })
  }

  const handleReset = () => {
    setPlanData(null)
    setView('plan')
  }

  const handlePlanUpdated = (data) => {
    setPlanData(data)
  }

  if (view === 'loading') {
    return (
      <div className="app-loading">
        <div className="loading-dot" />
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo" onClick={() => setView(view === 'plan' ? 'schedule' : 'plan')}>
          <span className="logo-b">B</span>
          <span className="logo-clear">CLEAR</span>
        </div>
        <nav className="app-nav">
          <button
            className={`nav-btn ${view === 'plan' ? 'active' : ''}`}
            onClick={() => setView('plan')}
          >
            Plan
          </button>
          <button
            className={`nav-btn ${view === 'schedule' ? 'active' : ''}`}
            onClick={() => setView(planData ? 'schedule' : 'plan')}
          >
            Today
          </button>
          <button
            className={`nav-btn ${view === 'week' ? 'active' : ''}`}
            onClick={() => setView('week')}
          >
            Week
          </button>
          <button
            className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            Stats
          </button>
          <button
            className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
        <div className="app-tools">
          <button className="command-trigger" onClick={() => setCommandOpen(true)}>Ctrl K</button>
          <LiveClock />
        </div>
      </header>

      <main className={`app-main ${view === 'dashboard' ? 'full-width' : ''}`}>
        <div className="app-content">
          {view === 'plan' && (
            <PlanForm onPlanGenerated={handlePlanGenerated} />
          )}
          {view === 'schedule' && planData && (
            <Schedule
              schedule={planData.schedule}
              tasks={planData.tasks}
              stats={planData.stats}
              onPlanUpdated={handlePlanUpdated}
              onReset={handleReset}
              onRegisterActions={setScheduleActions}
            />
          )}
          {view === 'review' && planData && (
            <EveningReview
              onSaved={() => getTodayPlan().then(setPlanData)}
              onShowSchedule={() => setView('schedule')}
            />
          )}
          {view === 'week' && <Week />}
          {view === 'dashboard' && <Dashboard />}
          {view === 'settings' && <Settings onResetToday={handleReset} />}
        </div>

        {view !== 'dashboard' && (
          <aside className="app-sidebar">
            <Deadlines />
          </aside>
        )}
      </main>

      <CommandBar
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={setView}
        onQuickAdd={() => {
          setView('schedule')
          setTimeout(() => scheduleActions.openQuickAdd?.(), 0)
        }}
        onReplan={() => {
          setView('schedule')
          setTimeout(() => scheduleActions.openReplan?.(), 0)
        }}
        onCurrentDone={() => scheduleActions.markCurrentDone?.()}
        onCurrentSkip={() => scheduleActions.skipCurrent?.()}
      />
    </div>
  )
}
