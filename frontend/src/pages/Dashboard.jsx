import React, { useEffect, useState } from 'react'
import { getUnifiedStats, getSettings, getLinks, addLink, deleteLink } from '../utils/api'
import { ActivityCalendar } from 'react-activity-calendar'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Tooltip as ReactTooltip } from 'react-tooltip'
import 'react-tooltip/dist/react-tooltip.css'
import { Trophy, Code2, Activity, Plus, Trash2, ExternalLink } from 'lucide-react'
import './Dashboard.css'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [settings, setSettings] = useState(null)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  const loadData = (force = false) => {
    setLoading(true)
    Promise.all([getUnifiedStats(force), getSettings(), getLinks()]).then(([s, setts, lks]) => {
      setStats(s)
      setSettings(setts)
      setLinks(lks)
      setLoading(false)
    }).catch(console.error)
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleAddLink = async (e) => {
    e.preventDefault()
    if (!newLinkTitle || !newLinkUrl) return
    await addLink({ title: newLinkTitle, url: newLinkUrl })
    setNewLinkTitle('')
    setNewLinkUrl('')
    loadData()
  }

  const handleDeleteLink = async (id) => {
    await deleteLink(id)
    loadData()
  }

  if (loading) return <div className="app-loading"><div className="loading-dot"/></div>
  
  if (!stats?.cf && !stats?.lc && !stats?.cc) {
    return (
      <div className="dashboard-empty">
        <Trophy size={48} className="dim" />
        <h2>No Accounts Linked</h2>
        <p className="dim">Go to Settings to link Codeforces, LeetCode, or CodeChef.</p>
      </div>
    )
  }

  const lcEasy = stats.lc?.easy || 0
  const lcMed = stats.lc?.medium || 0
  const lcHard = stats.lc?.hard || 0
  const cfSolved = stats.cf?.recent_solved || 0
  
  const totalSolved = lcEasy + lcMed + lcHard + cfSolved
  const cfRating = stats.cf?.rating || 0
  const ccRating = stats.cc?.rating || 0
  
  const dsaData = [
    { name: 'Easy', value: lcEasy, color: '#10b981' },
    { name: 'Medium', value: lcMed, color: '#f59e0b' },
    { name: 'Hard', value: lcHard, color: '#f43f5e' }
  ]

  // Combine heat maps
  const heatMapDict = {}
  const processHeatMap = (hm) => {
    if (!hm) return
    hm.forEach(item => {
      heatMapDict[item.date] = (heatMapDict[item.date] || 0) + item.value
    })
  }

  processHeatMap(stats.lc?.heat_map)
  processHeatMap(stats.cf?.heat_map)
  processHeatMap(stats.cc?.heat_map)

  const combinedHeatData = Object.keys(heatMapDict).map(date => ({
    date,
    count: heatMapDict[date],
    level: Math.min(heatMapDict[date], 4)
  })).sort((a, b) => new Date(a.date) - new Date(b.date))

  if (combinedHeatData.length === 0) {
    combinedHeatData.push({ date: new Date().toISOString().split('T')[0], count: 0, level: 0 })
  }

  return (
    <div className="dashboard-page">
      <div className="dash-sidebar">
        <div className="dash-profile-card glass-panel">
          <div className="avatar">{settings?.lc_username?.[0]?.toUpperCase() || settings?.cf_handle?.[0]?.toUpperCase() || 'U'}</div>
          <h2>{settings?.lc_username || settings?.cf_handle || 'User'}</h2>
          <div className="dash-badges">
            {stats.lc && (
              <a href={`https://leetcode.com/u/${settings.lc_username}`} target="_blank" rel="noreferrer" className="badge lc-badge">LeetCode</a>
            )}
            {stats.cf && (
              <a href={`https://codeforces.com/profile/${settings.cf_handle}`} target="_blank" rel="noreferrer" className="badge cf-badge">CodeForces</a>
            )}
            {stats.cc && (
              <a href={`https://www.codechef.com/users/${settings.cc_username}`} target="_blank" rel="noreferrer" className="badge cc-badge">CodeChef</a>
            )}
          </div>
          <button className="secondary-btn w-full mt-4" onClick={() => loadData(true)}>Refresh Stats</button>
        </div>

        <div className="glass-panel links-panel">
          <h4 className="mb-4 flex align-center gap-2"><ExternalLink size={16} className="dim" /> Useful Links</h4>
          <form onSubmit={handleAddLink} className="add-link-form">
            <input 
              placeholder="Title" 
              value={newLinkTitle} 
              onChange={e => setNewLinkTitle(e.target.value)} 
              className="link-input"
            />
            <input 
              placeholder="URL" 
              value={newLinkUrl} 
              onChange={e => setNewLinkUrl(e.target.value)} 
              className="link-input"
            />
            <button type="submit" className="primary-btn mt-2 w-full"><Plus size={14} /> Add Link</button>
          </form>
          <div className="links-list mt-4">
            {links.map(link => (
              <div key={link.id} className="link-item">
                <a href={link.url} target="_blank" rel="noreferrer" className="link-title">{link.title}</a>
                <button onClick={() => handleDeleteLink(link.id)} className="link-delete"><Trash2 size={14} /></button>
              </div>
            ))}
            {links.length === 0 && <p className="dim text-xs text-center mt-4">No links saved yet.</p>}
          </div>
        </div>
      </div>

      <div className="dash-main">
        <div className="dash-top-metrics">
          <div className="metric-card glass-panel">
            <Code2 className="metric-icon accent" />
            <div>
                <p className="dim text-sm">Total Questions</p>
                <h3>{totalSolved > 0 ? totalSolved : '--'}</h3>
            </div>
          </div>
          <div className="metric-card glass-panel">
            <Activity className="metric-icon green" />
            <div>
                <p className="dim text-sm">LC Streak</p>
                <h3>{stats.lc?.streak || 0} Days</h3>
            </div>
          </div>
          <div className="heatmap-card glass-panel">
            <p className="dim mb-2 text-sm">Unified Activity Heatmap</p>
            {stats.cf?.heat_map || stats.lc?.heat_map ? (
              <>
               <ActivityCalendar 
                 data={combinedHeatData} 
                 theme={{ light: ['#27272a', '#10b981'], dark: ['#27272a', '#10b981'] }}
                 labels={{ legend: { less: 'Less', more: 'More' } }}
                 renderBlock={(block, activity) => (
                   React.cloneElement(block, {
                     key: activity.date,
                     'data-tooltip-id': 'heatmap-tooltip',
                     'data-tooltip-content': `${activity.count} questions solved on ${activity.date}`
                   })
                 )}
               />
               <ReactTooltip id="heatmap-tooltip" className="glass-panel" style={{ zIndex: 100, backgroundColor: 'var(--surface)' }} />
              </>
            ) : (
               <div className="h-full flex items-center justify-center dim">Activity Heatmap Unavailable</div>
            )}
          </div>
        </div>

        <div className="dash-grid-2">
          <div className="contests-card glass-panel">
            <h4 className="mb-4">Platform Ratings</h4>
            <div className="platform-row">
              <span className="plat-name">Codeforces</span>
              <span className="plat-score cf-color">{cfRating || 'Unrated'}</span>
            </div>
            <div className="platform-row">
              <span className="plat-name">CodeChef</span>
              <span className="plat-score cc-color">{ccRating || 'Unrated'}</span>
            </div>
            {stats.upcoming_contest ? (
              <div className="last-contest mt-4 pt-4 border-t border-border">
                <p className="dim text-xs">Upcoming CF Contest</p>
                <p className="text-sm">{stats.upcoming_contest}</p>
              </div>
            ) : (stats.cf?.last_contest && (
              <div className="last-contest mt-4 pt-4 border-t border-border">
                <p className="dim text-xs">Last CF Contest</p>
                <p className="text-sm">{stats.cf.last_contest}</p>
              </div>
            ))}
            {stats.cf?.weak_topics && (
              <div className="last-contest mt-2">
                <p className="dim text-xs">Weak Topics</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {stats.cf.weak_topics.map(t => <span key={t} className="text-xs bg-surface px-2 py-1 rounded">{t}</span>)}
                </div>
              </div>
            )}
          </div>

          <div className="problems-card glass-panel">
            <h4 className="mb-4">DSA Breakdown (LeetCode)</h4>
            <div className="dsa-chart-container">
              <ResponsiveContainer width="50%" height={160}>
                <PieChart>
                  <Pie
                    data={dsaData}
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {dsaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--text)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="dsa-legend">
                {dsaData.map(d => (
                  <div key={d.name} className="dsa-legend-item">
                    <span className="dot" style={{ background: d.color }}></span>
                    <span className="dim text-sm">{d.name}</span>
                    <span className="ml-auto font-mono">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
