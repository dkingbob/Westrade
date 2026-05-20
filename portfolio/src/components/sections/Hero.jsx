import { useEffect, useRef, useState } from 'react'

const SUBTITLES = [
  'Full-Stack Developer',
  'AI & Automation Engineer',
  'Algo-Trading Systems',
]

export default function Hero() {
  const [subtitle, setSubtitle] = useState('')
  const [subIdx, setSubIdx] = useState(0)
  const [typing, setTyping] = useState(true)

  useEffect(() => {
    let timeout
    const current = SUBTITLES[subIdx]
    if (typing) {
      if (subtitle.length < current.length) {
        timeout = setTimeout(() => setSubtitle(current.slice(0, subtitle.length + 1)), 60)
      } else {
        timeout = setTimeout(() => setTyping(false), 2200)
      }
    } else {
      if (subtitle.length > 0) {
        timeout = setTimeout(() => setSubtitle(subtitle.slice(0, -1)), 35)
      } else {
        setSubIdx((i) => (i + 1) % SUBTITLES.length)
        setTyping(true)
      }
    }
    return () => clearTimeout(timeout)
  }, [subtitle, subIdx, typing])

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="hero">
      <div className="hero-hud hero-hud-tl">
        <div>LOCATION // NL</div>
        <div>STATUS // ONLINE</div>
      </div>
      <div className="hero-hud hero-hud-tr">
        <div>AVAILABLE FOR HIRE</div>
        <div>REMOTE WORLDWIDE</div>
      </div>
      <div className="hero-hud hero-hud-bl">
        <div>FULL-STACK</div>
        <div>DEV & AI ENG</div>
      </div>
      <div className="hero-hud hero-hud-br">
        <div>v2.1.0 // 2025</div>
        <div>WES.DK</div>
      </div>

      <div className="hero-inner">
        <div className="hero-pre">// PORTFOLIO ONLINE //</div>
        <h1 className="hero-name">
          <span className="hero-name-line">WES DE</span>
          <span className="hero-name-line"><span>KONING</span></span>
        </h1>
        <div className="hero-typewriter">
          {subtitle}
          <span className="hero-typewriter-cursor" />
        </div>
        <div className="hero-cta">
          <button className="cta-btn solid" onClick={() => scrollTo('projects')}>
            View Projects
          </button>
          <button className="cta-btn" onClick={() => scrollTo('contact')}>
            Get In Touch
          </button>
        </div>
      </div>

      <div className="hero-scroll-hint">
        <div className="hero-scroll-line" />
        <div className="hero-scroll-label">SCROLL</div>
      </div>
    </section>
  )
}
