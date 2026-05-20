import { useEffect, useRef } from 'react'

export default function About() {
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('vis')
      }),
      { threshold: 0.15 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="about" ref={ref}>
      <div className="about-inner">
        <div className="reveal">
          <div className="section-tag">// 01 ABOUT</div>
          <h2 className="section-title">Who I <span>Am</span></h2>
          <div className="section-line" />
        </div>
        <p className="about-text reveal">
          I'm <strong>Wes de Koning</strong> — a full-stack developer based in the <strong>Netherlands</strong>,
          building everything from high-performance web applications to AI-powered automation systems
          and algorithmic trading platforms. I work remotely with clients worldwide.
        </p>
        <p className="about-text reveal">
          My focus: shipping <strong>production-grade software</strong> that actually works at scale.
          Whether it's a real-time data pipeline, an LLM integration, or a trading algorithm —
          I care about the details that make systems reliable.
        </p>

        <div className="info-grid">
          <div className="info-card reveal">
            <h3>LOCATION</h3>
            <p>Netherlands — available for remote work worldwide</p>
          </div>
          <div className="info-card reveal">
            <h3>FOCUS AREAS</h3>
            <p>Web apps, AI integrations, automation, fintech & trading systems</p>
          </div>
          <div className="info-card reveal">
            <h3>APPROACH</h3>
            <p>Clean code, fast delivery, full ownership from idea to deployment</p>
          </div>
          <div className="info-card reveal">
            <h3>AVAILABILITY</h3>
            <p>Open to new projects — freelance & contract work</p>
          </div>
        </div>

        <div className="stats-row">
          {[
            { num: '5+', label: 'YEARS EXP' },
            { num: '30+', label: 'PROJECTS' },
            { num: '100%', label: 'REMOTE' },
            { num: '10+', label: 'TECH STACK' },
          ].map((s) => (
            <div className="stat-item reveal" key={s.label}>
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
