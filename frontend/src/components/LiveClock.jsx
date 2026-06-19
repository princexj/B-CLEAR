import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import './LiveClock.css'

export default function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="live-clock" title="Current time">
      <Clock3 size={15} />
      <div>
        <strong className="mono">
          {now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </strong>
        <span>{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  )
}
