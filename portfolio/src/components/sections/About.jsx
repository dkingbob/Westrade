import { useEffect, useRef } from 'react'

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

function useReveal(ref) {
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('vis') }),
      { threshold: 0.12 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])
}

export default function About() {
  const ref = useRef(null)
  useReveal(ref)

  return (
    <section id="about" className="section" ref={ref}>
      <div className="section-inner">
        <div className="reveal">
          <div className="sec-label">01 — About</div>
          <h2 className="sec-heading">Building<br />Things That<br />Matter</h2>
        </div>

        <div className="about-grid">
          <div className="about-body">
            <p className="reveal">
              I'm <strong>Wes de Koning</strong> — a full-stack developer based in the{' '}
              <strong>Netherlands</strong>, building high-performance web apps, AI-powered systems,
              and algorithmic trading platforms.
            </p>
            <p className="reveal">
              My focus is shipping <strong>production-grade software</strong> that works at scale.
              Clean code, fast delivery, and full ownership from idea to deployment.
            </p>
            <div className="about-stats reveal">
              {STATS.map((s) => (
                <div className="stat-box" key={s.l}>
                  <div className="stat-n">{s.n}</div>
                  <div className="stat-l">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="about-details reveal">
            {DETAILS.map((d) => (
              <div className="detail-row" key={d.k}>
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
