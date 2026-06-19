import { useEffect, useState } from 'react'
import { Check, SkipForward, RotateCcw, Clock, Plus, X, Play, Pause, TimerReset, Activity } from 'lucide-react'
import { addMiddayTask, replanRemaining, updateTask } from '../utils/api'
import './Schedule.css'

const CATEGORY_COLORS = {
  cp:       { bg: '#7c6aff22', border: '#7c6aff', dot: '#7c6aff' },
  dsa:      { bg: '#6a9fff22', border: '#6a9fff', dot: '#6a9fff' },
  ml:       { bg: '#ff6aaa22', border: '#ff6aaa', dot: '#ff6aaa' },
  revision: { bg: '#facc1522', border: '#facc15', dot: '#facc15' },
  deadline: { bg: '#ff6a6a22', border: '#ff6a6a', dot: '#ff6a6a' },
  gym:      { bg: '#4ade8022', border: '#4ade80', dot: '#4ade80' },
  break:    { bg: '#3a3a4222', border: '#3a3a42', dot: '#3a3a42' },
  other:    { bg: '#ffffff11', border: '#555566', dot: '#555566' },
}

function parseBlockStart(time) {
  if (!time || time === 'Next') return null
  const match = String(time).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  const meridiem = match[3]?.toUpperCase()
  if (meridiem === 'PM' && hours < 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date
}

function getTimeState(block, status, now) {
  if (status !== 'pending') return null
  const start = parseBlockStart(block.time)
  if (!start) return null
  const end = new Date(start.getTime() + Number(block.duration_mins || 0) * 60 * 1000)
  if (now >= start && now < end) return 'current'
  if (now >= end) return 'missed'
  return 'upcoming'
}

function minutesUntil(target, now) {
  return Math.max(0, Math.ceil((target - now) / 60000))
}

function getBlockWindow(block) {
  const start = parseBlockStart(block.time)
  if (!start) return { start: null, end: null }
  return { start, end: new Date(start.getTime() + Number(block.duration_mins || 0) * 60 * 1000) }
}

function Block({ block, task, timeState, onStatusChange }) {
  const [showSkip, setShowSkip] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const colors = CATEGORY_COLORS[block.category] || CATEGORY_COLORS.other
  const isBreak = block.category === 'break'

  const handleDone = async () => {
    if (!task) return
    await updateTask(task.id, 'done')
    onStatusChange(task.id, 'done')
  }

  const handleSkip = async () => {
    if (!task) return
    await updateTask(task.id, 'skipped', skipReason || null)
    onStatusChange(task.id, 'skipped', skipReason)
    setShowSkip(false)
  }

  const status = task?.status || 'pending'
  const visualState = timeState || status

  return (
    <div
      className={`block timeline-block ${status} ${timeState || ''} ${isBreak ? 'break-block' : ''}`}
      style={{ '--block-bg': colors.bg, '--block-border': colors.border, '--block-dot': colors.dot }}
    >
      <div className="timeline-node" />
      <div className="block-time">
        <span className="mono">{block.time}</span>
        <span className="block-duration"><Clock size={11} /> {block.duration_mins}m</span>
      </div>

      <div className="block-body">
        <div className="block-dot" />
        <div className="block-content">
          <div className="block-title">{block.title}</div>
          {block.note && <div className="block-note">{block.note}</div>}
          {task?.skipped_reason && <div className="block-skip-reason">Skipped: {task.skipped_reason}</div>}

          {!isBreak && status === 'pending' && (
            <div className="block-actions">
              <button className="action-btn done" onClick={handleDone}><Check size={13} /> Done</button>
              <button className="action-btn skip" onClick={() => setShowSkip(!showSkip)}>
                <SkipForward size={13} /> Skip
              </button>
            </div>
          )}

          {showSkip && (
            <div className="skip-form">
              <input
                placeholder="Why? (optional)"
                value={skipReason}
                onChange={e => setSkipReason(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSkip()}
                autoFocus
              />
              <button onClick={handleSkip}>Skip it</button>
            </div>
          )}
        </div>

        {status === 'done' && <div className="status-badge done-badge"><Check size={12} /> Done</div>}
        {status === 'skipped' && <div className="status-badge skip-badge"><SkipForward size={12} /> Skipped</div>}
        {visualState === 'current' && <div className="status-badge current-badge">Now</div>}
        {visualState === 'missed' && <div className="status-badge missed-badge">Missed</div>}
      </div>
    </div>
  )
}

function StatsWidget({ stats }) {
  if (!stats?.cf && !stats?.lc) return null
  return (
    <div className="stats-row">
      {stats.cf && (
        <div className="stat-card">
          <span>Codeforces</span>
          <strong className="mono">{stats.cf.rating || 'unrated'}</strong>
          <em>{stats.cf.rank} · {stats.cf.recent_solved} recent AC</em>
        </div>
      )}
      {stats.lc && (
        <div className="stat-card">
          <span>LeetCode</span>
          <strong className="mono">{stats.lc.streak}d streak</strong>
          <em>E/M/H {stats.lc.easy}/{stats.lc.medium}/{stats.lc.hard}</em>
        </div>
      )}
    </div>
  )
}

function PlanQuality({ schedule, tasks }) {
  const workBlocks = schedule.filter(block => block.category !== 'break')
  const plannedMins = workBlocks.reduce((sum, block) => sum + Number(block.duration_mins || 0), 0)
  const longBlocks = workBlocks.filter(block => Number(block.duration_mins || 0) > 90).length
  const categorySwitches = workBlocks.reduce((count, block, index) => {
    if (index === 0) return count
    return block.category !== workBlocks[index - 1].category ? count + 1 : count
  }, 0)
  const skipped = tasks.filter(task => task.status === 'skipped').length
  const intensity = plannedMins >= 360 ? 'Heavy' : plannedMins >= 180 ? 'Balanced' : 'Light'
  const risk = longBlocks > 0 || skipped > 1 ? 'Watch' : 'Low'
  const switching = categorySwitches >= 4 ? 'High' : categorySwitches >= 2 ? 'Medium' : 'Low'

  return (
    <div className="quality-strip">
      <div><span>Intensity</span><strong>{intensity}</strong></div>
      <div><span>Deadline risk</span><strong>{risk}</strong></div>
      <div><span>Switching</span><strong>{switching}</strong></div>
    </div>
  )
}

function FocusPanel({ current, next, task, now, running, onToggle, onDone, onSkip, onReplan }) {
  const currentWindow = current ? getBlockWindow(current) : null
  const remaining = currentWindow?.end ? minutesUntil(currentWindow.end, now) : null

  return (
    <section className="focus-panel">
      <div className="focus-top">
        <div>
          <p className="form-date">Right now</p>
          <h2>{current ? current.title : 'No active block'}</h2>
        </div>
        <div className="focus-clock mono">
          {now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </div>
      </div>

      <p className="focus-note">
        {current?.note || (next ? `Next up: ${next.title}` : 'Your plan is clear for the moment.')}
      </p>

      <div className="focus-meter">
        <div>
          <span>Remaining</span>
          <strong className="mono">{remaining !== null ? `${remaining}m` : '--'}</strong>
        </div>
        <div>
          <span>Next</span>
          <strong>{next ? next.time : 'Done'}</strong>
        </div>
      </div>

      <div className="focus-actions">
        <button className="primary-btn" onClick={onToggle}>
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? 'Pause focus' : 'Start focus'}
        </button>
        <button className="secondary-btn" onClick={onDone} disabled={!task}><Check size={15} /> Done</button>
        <button className="secondary-btn" onClick={onSkip} disabled={!task}><SkipForward size={15} /> Skip</button>
        <button className="secondary-btn" onClick={onReplan}><TimerReset size={15} /> Replan</button>
      </div>
    </section>
  )
}

export default function Schedule({ schedule, tasks, stats, onPlanUpdated, onReset, onRegisterActions }) {
  const [taskStates, setTaskStates] = useState(
    Object.fromEntries(tasks.map(t => [t.id, t]))
  )
  const [quickOpen, setQuickOpen] = useState(false)
  const [replanOpen, setReplanOpen] = useState(false)
  const [quick, setQuick] = useState({ title: '', duration_mins: 45, mode: 'squeeze', urgent: false, replace_task_id: '' })
  const [replan, setReplan] = useState({ keep_completed: true, hours_left: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(new Date())
  const [focusRunning, setFocusRunning] = useState(false)
  const bufferedStartLabel = new Date(now.getTime() + 15 * 60 * 1000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })

  useEffect(() => {
    setTaskStates(Object.fromEntries(tasks.map(t => [t.id, t])))
  }, [tasks])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const handleStatusChange = (id, status, reason) => {
    setTaskStates(prev => ({ ...prev, [id]: { ...prev[id], status, skipped_reason: reason } }))
  }

  const done = Object.values(taskStates).filter(t => t.status === 'done').length
  const total = tasks.filter(t => {
    const block = schedule[t.block_index]
    return block?.category !== 'break'
  }).length
  const pendingTasks = tasks.filter(t => {
    const block = schedule[t.block_index]
    const state = taskStates[t.id] || t
    return state.status === 'pending' && block?.category !== 'break'
  })

  const enriched = schedule.map((block, index) => {
    const task = tasks.find(t => t.block_index === index)
    const taskWithState = task ? taskStates[task.id] || task : null
    const timeState = getTimeState(block, taskWithState?.status || 'pending', now)
    return { block, index, task: taskWithState, timeState }
  })
  const currentItem = enriched.find(item => item.timeState === 'current') || enriched.find(item => item.task?.status === 'pending' && item.block.category !== 'break')
  const nextItem = enriched.find(item => item.task?.status === 'pending' && item.block.category !== 'break' && item.index > (currentItem?.index ?? -1))

  const markTaskDone = async (task) => {
    if (!task) return
    await updateTask(task.id, 'done')
    handleStatusChange(task.id, 'done')
  }

  const skipTask = async (task, reason = 'Skipped from focus mode') => {
    if (!task) return
    await updateTask(task.id, 'skipped', reason)
    handleStatusChange(task.id, 'skipped', reason)
  }

  const submitQuick = async () => {
    if (!quick.title.trim()) return
    setBusy(true)
    try {
      const data = await addMiddayTask({
        title: quick.title,
        duration_mins: Number(quick.duration_mins),
        mode: quick.mode,
        urgent: quick.urgent,
        replace_task_id: quick.mode === 'replace' ? Number(quick.replace_task_id) : null
      })
      onPlanUpdated(data)
      setQuick({ title: '', duration_mins: 45, mode: 'squeeze', urgent: false, replace_task_id: '' })
      setQuickOpen(false)
    } finally {
      setBusy(false)
    }
  }

  const submitReplan = async () => {
    setBusy(true)
    try {
      const current = new Date()
      const bufferedStart = new Date(current.getTime() + 15 * 60 * 1000)
      const data = await replanRemaining({
        keep_completed: replan.keep_completed,
        hours_left: replan.hours_left ? Number(replan.hours_left) : null,
        note: replan.note || null,
        current_time: current.toISOString(),
        current_local_time: current.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
        plan_start_time: bufferedStart.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
      })
      onPlanUpdated(data)
      setReplanOpen(false)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    onRegisterActions?.({
      openQuickAdd: () => setQuickOpen(true),
      openReplan: () => setReplanOpen(true),
      markCurrentDone: () => markTaskDone(currentItem?.task),
      skipCurrent: () => skipTask(currentItem?.task, 'Skipped from command bar')
    })
  }, [onRegisterActions, currentItem?.task])

  return (
    <div className="schedule cockpit">
      <div className="schedule-header">
        <div>
          <p className="form-date mono">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h2>Today's plan</h2>
        </div>
        <div className="schedule-meta">
          <div className="progress-pill">
            <span className="mono accent">{done}/{total}</span> tasks done
          </div>
          <button className="reset-btn" onClick={onReset} title="Replan day">
            <RotateCcw size={14} /> Replan
          </button>
        </div>
      </div>

      <StatsWidget stats={stats} />
      <FocusPanel
        current={currentItem?.block}
        next={nextItem?.block}
        task={currentItem?.task}
        now={now}
        running={focusRunning}
        onToggle={() => setFocusRunning(prev => !prev)}
        onDone={() => markTaskDone(currentItem?.task)}
        onSkip={() => skipTask(currentItem?.task)}
        onReplan={() => setReplanOpen(true)}
      />
      <PlanQuality schedule={schedule} tasks={Object.values(taskStates)} />

      <div className="blocks-list">
        {enriched.map(({ block, index, task, timeState }) => {
          return (
            <Block
              key={index}
              block={block}
              task={task}
              timeState={timeState}
              onStatusChange={handleStatusChange}
            />
          )
        })}
      </div>

      <button className="quick-add-fab" onClick={() => setQuickOpen(true)} title="Add task">
        <Plus size={22} />
      </button>

      <div className="schedule-tools">
        <button className="secondary-btn" onClick={() => setReplanOpen(true)}>
          <RotateCcw size={14} /> Full replan
        </button>
      </div>

      {quickOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h3>Add mid-day task</h3>
              <button onClick={() => setQuickOpen(false)}><X size={16} /></button>
            </div>
            <input placeholder="Task" value={quick.title} onChange={e => setQuick({ ...quick, title: e.target.value })} />
            <input type="number" min="10" step="5" value={quick.duration_mins} onChange={e => setQuick({ ...quick, duration_mins: e.target.value })} />
            <div className="segmented">
              <button className={quick.mode === 'squeeze' ? 'active' : ''} onClick={() => setQuick({ ...quick, mode: 'squeeze' })}>Squeeze it in</button>
              <button className={quick.mode === 'replace' ? 'active' : ''} onClick={() => setQuick({ ...quick, mode: 'replace' })}>Replace a block</button>
            </div>
            {quick.mode === 'replace' && (
              <select value={quick.replace_task_id} onChange={e => setQuick({ ...quick, replace_task_id: e.target.value })}>
                <option value="">Pick a pending block</option>
                {pendingTasks.map(t => (
                  <option key={t.id} value={t.id}>{schedule[t.block_index]?.title}</option>
                ))}
              </select>
            )}
            <label className="check-row">
              <input type="checkbox" checked={quick.urgent} onChange={e => setQuick({ ...quick, urgent: e.target.checked })} />
              Urgent
            </label>
            <button className="primary-btn" onClick={submitQuick} disabled={busy}>Add task</button>
          </div>
        </div>
      )}

      {replanOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-head">
              <h3>Replan remaining day</h3>
              <button onClick={() => setReplanOpen(false)}><X size={16} /></button>
            </div>
            <p className="modal-help">New blocks will start after {bufferedStartLabel}.</p>
            <label className="check-row">
              <input type="checkbox" checked={replan.keep_completed} onChange={e => setReplan({ ...replan, keep_completed: e.target.checked })} />
              Keep completed blocks
            </label>
            <input type="number" min="0.5" step="0.5" placeholder="Hours left" value={replan.hours_left} onChange={e => setReplan({ ...replan, hours_left: e.target.value })} />
            <input placeholder="Context for AI" value={replan.note} onChange={e => setReplan({ ...replan, note: e.target.value })} />
            <button className="primary-btn" onClick={submitReplan} disabled={busy}>Replan the rest</button>
          </div>
        </div>
      )}
    </div>
  )
}
