import { useEffect, useRef } from 'react'

const SERVICES = [
  {
    icon: '⬡',
    title: 'Frontend Development',
    desc: 'High-performance React & Next.js apps with pixel-perfect UIs, animations, and real-time features.',
    tags: ['React', 'Next.js', 'TypeScript', 'Three.js'],
  },
  {
    icon: '⬢',
    title: 'Backend & Full-Stack',
    desc: 'Scalable Node.js APIs, REST & GraphQL services, database design, and cloud deployments.',
    tags: ['Node.js', 'PostgreSQL', 'Docker', 'REST'],
  },
  {
    icon: '◈',
    title: 'AI & Automation',
    desc: 'LLM integrations, automated data pipelines, workflow automation, and intelligent agent systems.',
    tags: ['Python', 'LLM APIs', 'n8n', 'Pipelines'],
  },
  {
    icon: '◇',
    title: 'Trading & Fintech',
    desc: 'Algorithmic trading bots, MetaTrader5 integration, real-time market data dashboards.',
    tags: ['MetaTrader5', 'Python', 'WebSockets', 'Data'],
  },
]

export default function Services() {
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('vis'))
      }),
      { threshold: 0.1 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="services" ref={ref}>
      <div className="reveal">
        <div className="section-tag">// 03 SERVICES</div>
        <h2 className="section-title">What I <span>Build</span></h2>
        <div className="section-line" />
      </div>
      <div className="svc-grid">
        {SERVICES.map((s, i) => (
          <div className="svc-card reveal" key={i} style={{ transitionDelay: `${i * 0.1}s` }}>
            <span className="svc-icon" style={{ color: ['#00ffff','#00ff88','#8844ff','#ff3366'][i] }}>
              {s.icon}
            </span>
            <div className="svc-title">{s.title}</div>
            <div className="svc-desc">{s.desc}</div>
            <div className="svc-tags">
              {s.tags.map((t) => <span className="svc-tag" key={t}>{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
