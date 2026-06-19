import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { getWeek } from '../utils/api'
import './Week.css'

function labelDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })
}

export default function Week() {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    getWeek().then(result => {
      setData(result)
      setSelected(result.days.find(d => d.exists) || result.days[0])
    })
  }, [])

  if (!data) return <div className="week-page"><div className="loading-dot" /></div>

  return (
    <div className="week-page">
      <div className="week-head">
        <div>
          <p className="form-date">Last 7 days</p>
          <h1>Week</h1>
        </div>
        <div className="week-streak">
          <CalendarDays size={16} />
          <span className="mono">{data.streak}</span> day streak
        </div>
      </div>

      <div className="week-grid">
        {data.days.map(day => (
          <button
            key={day.date}
            className={`week-day ${selected?.date === day.date ? 'active' : ''}`}
            onClick={() => setSelected(day)}
          >
            <div className="week-day-top">
              <span>{labelDate(day.date)}</span>
              <strong className="mono">{day.completion}%</strong>
            </div>
            <div className="week-bar">
              <span style={{ width: `${Math.min(day.completion, 100)}%` }} />
            </div>
            <div className="week-day-meta">
              {day.completed} done / {day.skipped} skipped
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <section className="week-detail">
          <div className="week-detail-head">
            <h2>{labelDate(selected.date)}</h2>
            <span className="mono">{selected.actual_hours}h / {selected.planned_hours}h</span>
          </div>
          <div className="hours-bar">
            <span style={{ width: `${selected.planned_hours ? Math.min((selected.actual_hours / selected.planned_hours) * 100, 100) : 0}%` }} />
          </div>
          {selected.schedule.length === 0 ? (
            <p className="week-empty">No plan saved for this day.</p>
          ) : (
            <div className="week-blocks">
              {selected.schedule.map((block, index) => {
                const task = selected.tasks.find(t => t.block_index === index)
                return (
                  <div key={`${block.title}-${index}`} className={`week-block ${task?.status || 'pending'}`}>
                    <span className="mono">{block.time}</span>
                    <strong>{block.title}</strong>
                    <em>{task?.status || 'pending'}</em>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
