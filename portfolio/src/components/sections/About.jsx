import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const STATS = [
  { n: '5+', l: 'Years Experience' },
  { n: '30+', l: 'Projects Shipped' },
  { n: '100%', l: 'Remote' },
  { n: '∞', l: 'Problems Solved' },
]

const DETAILS = [
  { k: 'Location', v: 'Netherlands' },
  { k: 'Availability', v: 'Open to projects' },
  { k: 'Work type', v: 'Remote worldwide' },
  { k: 'Focus', v: 'Web · AI · Fintech' },
  { k: 'Stack', v: 'React · Node · Python' },
  { k: 'Response', v: '< 24 hours' },
]

export default function About() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.about-anim', {
        y: 50,
        opacity: 0,
        duration: 1,
        stagger: 0.12,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: ref.current,
          start: 'top 75%',
        },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section id="about" className="section" ref={ref}>
      <div className="section-inner">
        <div className="about-anim">
          <div className="sec-label">01 — About</div>
          <h2 className="sec-heading">Building<br />Things That<br />Matter</h2>
        </div>

        <div className="about-grid">
          <div className="about-body">
            <p className="about-anim">
              I'm <strong>Wes de Koning</strong> — a full-stack developer based in the{' '}
              <strong>Netherlands</strong>, building high-performance web apps, AI-powered systems,
              and algorithmic trading platforms.
            </p>
            <p className="about-anim">
              My focus is shipping <strong>production-grade software</strong> that works at scale.
              Clean code, fast delivery, and full ownership from idea to deployment.
            </p>
            <div className="about-stats about-anim">
              {STATS.map((s) => (
                <div className="stat-box" key={s.l}>
                  <div className="stat-n">{s.n}</div>
                  <div className="stat-l">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="about-details">
            {DETAILS.map((d, i) => (
              <div className="detail-row about-anim" key={d.k} style={{ transitionDelay: `${i * 0.05}s` }}>
                <span className="d-key">{d.k}</span>
                <span className="d-val">{d.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
