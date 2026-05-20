import { useState, useEffect } from 'react'

const SECTIONS = ['hero', 'about', 'skills', 'services', 'projects', 'contact']

function pad(n) {
  return String(n).padStart(2, '0')
}

export default function BottomBar() {
  const [section, setSection] = useState('HERO')
  const [clock, setClock] = useState('')
  const [scrollPct, setScrollPct] = useState(0)

  // Live clock
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Scroll tracking
  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      const pct = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 0
      setScrollPct(pct)

      // Find active section
      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const el = document.getElementById(SECTIONS[i])
        if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.5) {
          setSection(SECTIONS[i].toUpperCase())
          return
        }
      }
      setSection('HERO')
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-left">
        <span className="bottom-bar-label">SECTION</span>
        <span className="bottom-bar-value">{section}</span>
      </div>
      <div className="bottom-bar-center">
        <span className="bottom-bar-brand">WES DE KONING // FULL-STACK DEV</span>
      </div>
      <div className="bottom-bar-right">
        <span className="bottom-bar-label">TIME</span>
        <span className="bottom-bar-value">{clock}</span>
        <span className="bottom-bar-sep">|</span>
        <span className="bottom-bar-label">SCROLL</span>
        <span className="bottom-bar-value">{scrollPct}%</span>
      </div>
    </div>
  )
}
