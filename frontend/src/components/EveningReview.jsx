import { useState } from 'react'
import { Save } from 'lucide-react'
import { saveReview } from '../utils/api'
import './EveningReview.css'

export default function EveningReview({ onSaved, onShowSchedule }) {
  const [form, setForm] = useState({
    rating: 3,
    went_well: '',
    skipped_reason: '',
    energy_accuracy: 'accurate',
    notes: ''
  })
  const [saved, setSaved] = useState(false)

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async () => {
    await saveReview(form)
    setSaved(true)
    onSaved?.()
  }

  return (
    <div className="review-page">
      <div className="page-head">
        <p className="form-date">Evening review</p>
        <h1>How did today land?</h1>
      </div>

      <section className="review-section">
        <label>Overall rating</label>
        <div className="rating-row">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} className={`rating-btn ${form.rating === n ? 'active' : ''}`} onClick={() => update('rating', n)}>
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="review-section">
        <label>What went well?</label>
        <textarea value={form.went_well} onChange={e => update('went_well', e.target.value)} />
      </section>

      <section className="review-section">
        <label>What got skipped and why?</label>
        <textarea value={form.skipped_reason} onChange={e => update('skipped_reason', e.target.value)} />
      </section>

      <section className="review-section">
        <label>Energy estimate</label>
        <select value={form.energy_accuracy} onChange={e => update('energy_accuracy', e.target.value)}>
          <option value="too_high">Too high</option>
          <option value="accurate">Accurate</option>
          <option value="too_low">Too low</option>
        </select>
      </section>

      <section className="review-section">
        <label>Notes</label>
        <textarea value={form.notes} onChange={e => update('notes', e.target.value)} />
      </section>

      {saved && <p className="review-saved">Review saved. Tomorrow's plan will use this.</p>}

      <div className="review-actions">
        <button className="primary-btn" onClick={submit}><Save size={15} /> Save review</button>
        <button className="secondary-btn" onClick={onShowSchedule}>View schedule</button>
      </div>
    </div>
  )
}
