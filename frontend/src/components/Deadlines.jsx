import { useState, useEffect } from 'react'
import { Plus, Check, Trash2, AlertCircle } from 'lucide-react'
import { getDeadlines, addDeadline, markDeadlineDone, deleteDeadline } from '../utils/api'
import './Deadlines.css'

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr)
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24))
}

function urgencyClass(days) {
  if (days <= 1) return 'urgent'
  if (days <= 3) return 'soon'
  return 'normal'
}

export default function Deadlines() {
  const [deadlines, setDeadlines] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', due_date: '', category: 'other', notes: '' })

  const load = async () => {
    const data = await getDeadlines()
    setDeadlines(data)
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.title || !form.due_date) return
    await addDeadline(form)
    setForm({ title: '', due_date: '', category: 'other', notes: '' })
    setShowForm(false)
    load()
  }

  const handleDone = async (id) => {
    await markDeadlineDone(id)
    load()
  }

  const handleDelete = async (id) => {
    await deleteDeadline(id)
    load()
  }

  return (
    <div className="deadlines">
      <div className="dl-header">
        <h3>Deadlines</h3>
        <button className="dl-add-btn" onClick={() => setShowForm(!showForm)}>
          <Plus size={14} />
        </button>
      </div>

      {showForm && (
        <div className="dl-form">
          <input
            placeholder="What's due?"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <input
            type="date"
            value={form.due_date}
            onChange={e => setForm({ ...form, due_date: e.target.value })}
          />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            <option value="cp">CP</option>
            <option value="ml">ML</option>
            <option value="dsa">DSA</option>
            <option value="other">Other</option>
          </select>
          <div className="dl-form-actions">
            <button className="dl-save" onClick={handleAdd}>Add deadline</button>
            <button className="dl-cancel" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {deadlines.length === 0 ? (
        <p className="dl-empty">No upcoming deadlines. Add one to track it.</p>
      ) : (
        <div className="dl-list">
          {deadlines.map(dl => {
            const days = daysUntil(dl.due_date)
            const cls = urgencyClass(days)
            return (
              <div key={dl.id} className={`dl-item ${cls}`}>
                <div className="dl-item-main">
                  {cls === 'urgent' && <AlertCircle size={13} className="urgent-icon" />}
                  <div className="dl-info">
                    <div className="dl-title">{dl.title}</div>
                    <div className="dl-meta mono">
                      {days === 0 ? 'Due today' : days === 1 ? 'Tomorrow' : `${days} days`}
                      {dl.category && ` · ${dl.category}`}
                    </div>
                  </div>
                </div>
                <div className="dl-actions">
                  <button className="dl-done" onClick={() => handleDone(dl.id)} title="Mark done">
                    <Check size={13} />
                  </button>
                  <button className="dl-delete" onClick={() => handleDelete(dl.id)} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
