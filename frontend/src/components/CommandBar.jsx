import { useEffect, useMemo, useState } from 'react'
import { Command, CornerDownLeft, Search, X } from 'lucide-react'
import './CommandBar.css'

export default function CommandBar({ open, onOpenChange, onNavigate, onQuickAdd, onReplan, onCurrentDone, onCurrentSkip }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(true)
      }
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const commands = useMemo(() => [
    { id: 'today', label: 'Go to Today', hint: 'schedule', run: () => onNavigate('schedule') },
    { id: 'plan', label: 'Go to Plan', hint: 'new day', run: () => onNavigate('plan') },
    { id: 'week', label: 'Open Week', hint: 'review', run: () => onNavigate('week') },
    { id: 'settings', label: 'Open Settings', hint: 'handles', run: () => onNavigate('settings') },
    { id: 'add', label: 'Add task', hint: 'quick add', run: onQuickAdd },
    { id: 'replan', label: 'Replan remaining day', hint: 'AI', run: onReplan },
    { id: 'done', label: 'Mark current block done', hint: 'focus', run: onCurrentDone },
    { id: 'skip', label: 'Skip current block', hint: 'focus', run: onCurrentSkip },
  ], [onNavigate, onQuickAdd, onReplan, onCurrentDone, onCurrentSkip])

  const filtered = commands.filter(command =>
    `${command.label} ${command.hint}`.toLowerCase().includes(query.toLowerCase())
  )

  const run = (command) => {
    command.run?.()
    onOpenChange(false)
  }

  if (!open) return null

  return (
    <div className="command-backdrop" onMouseDown={() => onOpenChange(false)}>
      <div className="command-panel" onMouseDown={event => event.stopPropagation()}>
        <div className="command-search">
          <Search size={17} />
          <input
            autoFocus
            placeholder="Search command..."
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && filtered[0]) run(filtered[0])
            }}
          />
          <button onClick={() => onOpenChange(false)}><X size={16} /></button>
        </div>

        <div className="command-list">
          {filtered.map(command => (
            <button key={command.id} className="command-item" onClick={() => run(command)}>
              <span><Command size={14} /> {command.label}</span>
              <em>{command.hint}</em>
            </button>
          ))}
          {filtered.length === 0 && <p className="command-empty">No command found.</p>}
        </div>

        <div className="command-footer">
          <span><CornerDownLeft size={13} /> run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
