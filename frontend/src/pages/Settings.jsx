import { useEffect, useState } from 'react'
import { Check, RotateCcw, Save } from 'lucide-react'
import { getCfStats, getSettings, resetTodayPlan, saveSettings } from '../utils/api'
import './Settings.css'

export default function Settings({ onResetToday }) {
  const [form, setForm] = useState({ cf_handle: '', lc_username: '', wake_time: '08:00', gym_time: '' })
  const [status, setStatus] = useState('')
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    getSettings().then(data => setForm({
      cf_handle: data.cf_handle || '',
      lc_username: data.lc_username || '',
      wake_time: data.wake_time || '08:00',
      gym_time: data.gym_time || ''
    }))
  }, [])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const verifyCf = async () => {
    if (!form.cf_handle.trim()) return
    setVerifying(true)
    setStatus('')
    try {
      const stats = await getCfStats(form.cf_handle.trim(), true)
      setStatus(`Codeforces verified: ${stats.handle}, ${stats.rating || 'unrated'} ${stats.rank}`)
    } catch {
      setStatus('Could not verify that Codeforces handle.')
    } finally {
      setVerifying(false)
    }
  }

  const save = async () => {
    await saveSettings(form)
    setStatus('Settings saved.')
  }

  const reset = async () => {
    await resetTodayPlan()
    onResetToday()
    setStatus("Today's plan was reset.")
  }

  return (
    <div className="settings-page">
      <div className="page-head">
        <p className="form-date">Preferences</p>
        <h1>Settings</h1>
      </div>

      <section className="settings-section">
        <label>Codeforces handle</label>
        <div className="settings-row">
          <input value={form.cf_handle} onChange={e => update('cf_handle', e.target.value)} placeholder="tourist" />
          <button className="secondary-btn" onClick={verifyCf} disabled={verifying}>
            <Check size={14} /> {verifying ? 'Checking' : 'Verify'}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <label>LeetCode username</label>
        <input value={form.lc_username} onChange={e => update('lc_username', e.target.value)} placeholder="username" />
      </section>

      <section className="settings-grid">
        <div className="settings-section">
          <label>Default wake time</label>
          <input type="time" value={form.wake_time} onChange={e => update('wake_time', e.target.value)} />
        </div>
        <div className="settings-section">
          <label>Default gym time</label>
          <input value={form.gym_time} onChange={e => update('gym_time', e.target.value)} placeholder="6:00 PM - 7:00 PM" />
        </div>
      </section>

      {status && <p className="settings-status">{status}</p>}

      <div className="settings-actions">
        <button className="primary-btn" onClick={save}><Save size={15} /> Save settings</button>
        <button className="danger-btn" onClick={reset}><RotateCcw size={15} /> Reset today's plan</button>
      </div>
    </div>
  )
}
