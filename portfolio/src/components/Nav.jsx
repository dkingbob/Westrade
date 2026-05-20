import { useState, useEffect } from 'react'

const NAV_LINKS = ['About', 'Skills', 'Services', 'Projects', 'Contact']

export default function Nav({ onTermOpen }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollTo = (id) => {
    const el = document.getElementById(id.toLowerCase())
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMenuOpen(false)
  }

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="nav-inner">
        <a href="#hero" className="nav-logo" onClick={(e) => { e.preventDefault(); scrollTo('hero') }}>
          <span className="nav-logo-bracket">[</span>
          Wes<span className="nav-logo-accent">.dk</span>
          <span className="nav-logo-bracket">]</span>
        </a>

        <div className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}>
          {NAV_LINKS.map((l) => (
            <button key={l} className="nav-link" onClick={() => scrollTo(l)}>
              {l}
            </button>
          ))}
          <button className="nav-terminal-btn" onClick={() => { onTermOpen(); setMenuOpen(false) }}>
            [/ Terminal]
          </button>
        </div>

        <button
          className={`nav-hamburger${menuOpen ? ' nav-hamburger--open' : ''}`}
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </div>
    </nav>
  )
}
