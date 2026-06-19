import { useEffect, useState } from 'react'
import { Loader, Plus, RotateCcw, X } from 'lucide-react'
import { generatePlan, getCarryForward, getInsights } from '../utils/api'
import './PlanForm.css'

const PRESETS = ['CP practice', 'DSA revision', 'ML chapter', 'Revise graphs', 'Revise DP', 'Gym', 'Project work', 'Contest prep']

function formatClock(date) {
  return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function getSuggestedHours() {
  const hour = new Date().getHours()
  if (hour >= 20) return 2
  if (hour >= 17) return 3
  if (hour >= 14) return 4
  return 5
}

export default function PlanForm({ onPlanGenerated }) {
  const [dayType, setDayType] = useState('free')
  const [energy, setEnergy] = useState('medium')
  const [hours, setHours] = useState(getSuggestedHours)
  const [priorities, setPriorities] = useState([])
  const [customInput, setCustomInput] = useState('')
  const [instructions, setInstructions] = useState('')
  const [energyCurve, setEnergyCurve] = useState(new Date().getHours() >= 17 ? 'evening' : 'morning')
  const [planningMode, setPlanningMode] = useState('balanced')
  const [carryForward, setCarryForward] = useState([])
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const isEvening = new Date().getHours() >= 17

  useEffect(() => {
    getInsights().then(data => setInsights(data.insights || [])).catch(() => setInsights([]))
    getCarryForward().then(data => setCarryForward(data || [])).catch(() => setCarryForward([]))
  }, [])

  const addPriority = (item) => {
    if (!priorities.includes(item) && priorities.length < 5) {
      setPriorities([...priorities, item])
    }
  }

  const addCustom = () => {
    const val = customInput.trim()
    if (val && !priorities.includes(val) && priorities.length < 5) {
      setPriorities([...priorities, val])
      setCustomInput('')
    }
  }

  const removePriority = (item) => setPriorities(priorities.filter(p => p !== item))

  const handleSubmit = async () => {
    if (priorities.length === 0) {
      setError('Add at least one priority')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const now = new Date()
      const bufferedStart = new Date(now.getTime() + 15 * 60 * 1000)
      const result = await generatePlan({
        day_type: dayType,
        energy,
        available_hours: hours,
        priorities,
        instructions: instructions.trim() || null,
        energy_curve: energyCurve,
        planning_mode: planningMode,
        current_time: now.toISOString(),
        current_local_time: formatClock(now),
        plan_start_time: formatClock(bufferedStart)
      })
      onPlanGenerated(result)
    } catch {
      setError('Failed to generate plan. Check your API key and backend.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="plan-form">
      <div className="form-header">
        <p className="form-date">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h1>{isEvening ? 'Planning your evening?' : 'Plan your day'}</h1>
        <p className="form-sub">
          {isEvening ? 'We will start from now and keep the workload lighter.' : 'Build a schedule around your actual energy.'}
        </p>
      </div>

      {insights.length > 0 && (
        <div className="insight-card">
          <span className="mono">Nudge</span>
          <p>{insights[0]}</p>
        </div>
      )}

      <div className="form-section">
        <label>What kind of day is it?</label>
        <div className="pill-group">
          {[['free', 'Free day'], ['class', 'Class day'], ['deadline', 'Deadline day']].map(([val, label]) => (
            <button key={val} className={`pill ${dayType === val ? 'active' : ''}`} onClick={() => setDayType(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <label>Energy level today?</label>
        <div className="pill-group">
          {[['high', 'High'], ['medium', 'Medium'], ['low', 'Low']].map(([val, label]) => (
            <button key={val} className={`pill ${energy === val ? 'active' : ''}`} onClick={() => setEnergy(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <label>When is your brain best today?</label>
        <div className="pill-group wrap">
          {[
            ['morning', 'Morning strong'],
            ['afternoon', 'Afternoon push'],
            ['evening', 'Evening focus'],
            ['night', 'Night productive']
          ].map(([val, label]) => (
            <button key={val} className={`pill small ${energyCurve === val ? 'active' : ''}`} onClick={() => setEnergyCurve(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <label>Planning mode</label>
        <div className="pill-group wrap">
          {[
            ['balanced', 'Balanced'],
            ['deep_work', 'Deep work'],
            ['submission', 'Submission mode'],
            ['recovery', 'Recovery']
          ].map(([val, label]) => (
            <button key={val} className={`pill small ${planningMode === val ? 'active' : ''}`} onClick={() => setPlanningMode(val)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-section">
        <label>Hours available for work <span className="mono accent">{hours}h</span></label>
        <input
          type="range"
          min={1}
          max={12}
          step={0.5}
          value={hours}
          onChange={e => setHours(parseFloat(e.target.value))}
          className="slider"
        />
        <div className="slider-labels"><span>1h</span><span>12h</span></div>
      </div>

      <div className="form-section">
        <label>What matters today? <span className="dim">(pick up to 5)</span></label>

        {priorities.length > 0 && (
          <div className="selected-pills">
            {priorities.map((p, i) => (
              <span key={p} className="selected-pill">
                {i + 1}. {p}
                <button onClick={() => removePriority(p)}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="pill-group wrap">
          {PRESETS.filter(p => !priorities.includes(p)).map(p => (
            <button key={p} className="pill small" onClick={() => addPriority(p)}>{p}</button>
          ))}
        </div>

        <div className="custom-input">
          <input
            placeholder="Something else..."
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()}
          />
          <button onClick={addCustom}><Plus size={16} /></button>
        </div>
      </div>

      {carryForward.length > 0 && (
        <div className="form-section">
          <label>Carry forward? <span className="dim">(from skipped work)</span></label>
          <div className="carry-list">
            {carryForward.slice(0, 4).map(item => (
              <button key={`${item.date}-${item.title}`} className="carry-item" onClick={() => addPriority(item.title)}>
                <RotateCcw size={13} />
                <span>{item.title}</span>
                <em>{item.duration_mins}m</em>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="form-section">
        <label>Any specific instructions? <span className="dim">(optional)</span></label>
        <textarea
          className="instruction-input"
          placeholder="Example: Submission work needs at least 2 hours, final submit before 9 PM."
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      {error && <p className="form-error">{error}</p>}

      <button className="generate-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? <><Loader size={16} className="spin" /> Building your day...</> : 'Build my day ->'}
      </button>
    </div>
  )
}
