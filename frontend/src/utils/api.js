const BASE = 'http://localhost:8001'

export async function generatePlan(payload) {
  const res = await fetch(`${BASE}/plan/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getTodayPlan() {
  const res = await fetch(`${BASE}/plan/today`)
  return res.json()
}

export async function resetTodayPlan() {
  const res = await fetch(`${BASE}/plan/today`, { method: 'DELETE' })
  return res.json()
}

export async function getSettings() {
  const res = await fetch(`${BASE}/settings`)
  return res.json()
}

export async function saveSettings(payload) {
  const res = await fetch(`${BASE}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getCfStats(handle, force = false) {
  const res = await fetch(`${BASE}/cf/stats?handle=${encodeURIComponent(handle)}&force=${force}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getLcStats(username, force = false) {
  const res = await fetch(`${BASE}/lc/stats?username=${encodeURIComponent(username)}&force=${force}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateTask(id, status, reason = null) {
  const res = await fetch(`${BASE}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, skipped_reason: reason })
  })
  return res.json()
}

export async function addMiddayTask(payload) {
  const res = await fetch(`${BASE}/midday-task`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function replanRemaining(payload) {
  const res = await fetch(`${BASE}/plan/replan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDeadlines() {
  const res = await fetch(`${BASE}/deadlines`)
  return res.json()
}

export async function addDeadline(payload) {
  const res = await fetch(`${BASE}/deadlines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return res.json()
}

export async function markDeadlineDone(id) {
  const res = await fetch(`${BASE}/deadlines/${id}/done`, { method: 'PATCH' })
  return res.json()
}

export async function deleteDeadline(id) {
  const res = await fetch(`${BASE}/deadlines/${id}`, { method: 'DELETE' })
  return res.json()
}

export async function saveReview(payload) {
  const res = await fetch(`${BASE}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getReview(date) {
  const res = await fetch(`${BASE}/review/${date}`)
  return res.json()
}

export async function getWeek(fromDate) {
  const qs = fromDate ? `?from_date=${encodeURIComponent(fromDate)}` : ''
  const res = await fetch(`${BASE}/week${qs}`)
  return res.json()
}

export async function getInsights() {
  const res = await fetch(`${BASE}/insights`)
  return res.json()
}

export async function getCarryForward() {
  const res = await fetch(`${BASE}/carry-forward`)
  return res.json()
}
