import { useState, useEffect } from 'react'
import ThreeCanvas from './components/ThreeCanvas.jsx'
import Loader from './components/Loader.jsx'
import Nav from './components/Nav.jsx'
import Terminal from './components/Terminal.jsx'
import BottomBar from './components/BottomBar.jsx'
import Cursor from './components/Cursor.jsx'
import Hero from './components/sections/Hero.jsx'
import About from './components/sections/About.jsx'
import Skills from './components/sections/Skills.jsx'
import Services from './components/sections/Services.jsx'
import Projects from './components/sections/Projects.jsx'
import Contact from './components/sections/Contact.jsx'

export default function App() {
  const [loaded, setLoaded] = useState(false)
  const [termOpen, setTermOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !termOpen && e.target.tagName !== 'INPUT') {
        e.preventDefault()
        setTermOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [termOpen])

  return (
    <>
      <ThreeCanvas />
      {!loaded && <Loader onComplete={() => setLoaded(true)} />}
      {loaded && (
        <>
          <Cursor />
          <Nav onTermOpen={() => setTermOpen(true)} onMenuOpen={() => setMenuOpen((o) => !o)} />
          <main>
            <Hero />
            <About />
            <Skills />
            <Services />
            <Projects />
            <Contact />
          </main>
          <Terminal open={termOpen} onClose={() => setTermOpen(false)} />
          <BottomBar />
        </>
      )}
    </>
  )
}
