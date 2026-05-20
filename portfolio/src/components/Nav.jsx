import { useState, useEffect } from 'react'

const LINKS = ['About', 'Work', 'Skills', 'Contact']

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const go = (id) => {
    document.getElementById(id.toLowerCase())?.scrollIntoView({ behavior: 'smooth' })
    setOpen(false)
  }

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav-inner">
        <button className="nav-logo" onClick={() => go('hero')}>WDK</button>
        <div className={`nav-links${open ? ' open' : ''}`}>
          {LINKS.map(l => (
            <button key={l} className="nav-link" onClick={() => go(l)}>{l}</button>
          ))}
          <a className="nav-cta" href="mailto:wes@dekoning.dev">Hire Me</a>
        </div>
        <button className={`nav-burger${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>
    </nav>
  )
}
