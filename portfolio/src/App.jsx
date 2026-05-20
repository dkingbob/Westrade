import { useState, useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ThreeCanvas from './components/ThreeCanvas.jsx'
import Cursor from './components/Cursor.jsx'
import Loader from './components/Loader.jsx'
import Nav from './components/Nav.jsx'
import Hero from './components/sections/Hero.jsx'
import About from './components/sections/About.jsx'
import Projects from './components/sections/Projects.jsx'
import Skills from './components/sections/Skills.jsx'
import Contact from './components/sections/Contact.jsx'

gsap.registerPlugin(ScrollTrigger)

export default function App() {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) return

    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true })

    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add((t) => lenis.raf(t * 1000))
    gsap.ticker.lagSmoothing(0)

    return () => {
      lenis.destroy()
      gsap.ticker.remove((t) => lenis.raf(t * 1000))
    }
  }, [loaded])

  return (
    <>
      <Loader onComplete={() => setLoaded(true)} />
      {loaded && (
        <>
          <ThreeCanvas />
          <Cursor />
          <Nav />
          <main style={{ position: 'relative', zIndex: 1 }}>
            <Hero />
            <About />
            <Projects />
            <Skills />
            <Contact />
          </main>
        </>
      )}
    </>
  )
}
