import { useEffect, useRef } from 'react'

const PROJECTS = [
  {
    year: '2025',
    title: 'Westrade',
    desc: 'Algorithmic trading platform with MetaTrader5 integration, real-time WebSocket data feeds, backtesting engine, and automated strategy execution.',
    tech: ['Python', 'React', 'WebSockets', 'MT5', 'PostgreSQL'],
    status: 'LIVE',
  },
  {
    year: '2024',
    title: 'Sentiment Analysis Engine',
    desc: 'Real-time NLP pipeline processing financial news and social data to generate trading signals using LLM APIs and custom ML models.',
    tech: ['Python', 'LLM APIs', 'FastAPI', 'Redis'],
    status: 'DEPLOYED',
  },
  {
    year: '2024',
    title: 'Real-time Dashboard Framework',
    desc: 'Composable dashboard system with live WebSocket data streams, configurable widgets, and multi-tenant support for fintech clients.',
    tech: ['React', 'Node.js', 'WebSockets', 'D3.js'],
    status: 'DEPLOYED',
  },
  {
    year: '2024',
    title: 'Automated Pipeline Builder',
    desc: 'Visual workflow automation platform with 50+ integrations, conditional logic, error handling, and scheduled execution.',
    tech: ['Next.js', 'TypeScript', 'Node.js', 'Docker'],
    status: 'DEPLOYED',
  },
  {
    year: '2023',
    title: 'E-Commerce Full-Stack App',
    desc: 'Headless e-commerce platform with custom storefront, inventory management, payment integration, and admin dashboard.',
    tech: ['Next.js', 'Stripe', 'PostgreSQL', 'Vercel'],
    status: 'LIVE',
  },
]

export default function Projects() {
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('vis'))
      }),
      { threshold: 0.05 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="projects" ref={ref}>
      <div className="reveal">
        <div className="section-tag">// 04 PROJECTS</div>
        <h2 className="section-title">Recent <span>Work</span></h2>
        <div className="section-line" />
      </div>
      <div className="proj-list">
        {PROJECTS.map((p, i) => (
          <div className="proj-card reveal" key={i} style={{ transitionDelay: `${i * 0.08}s` }}>
            <div className="proj-year">[{p.year}]</div>
            <div>
              <div className="proj-title">{p.title}</div>
              <div className="proj-desc">{p.desc}</div>
              <div className="proj-tech">
                {p.tech.map((t) => <span key={t}>{t}</span>)}
              </div>
            </div>
            <div className="proj-status">{p.status}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
