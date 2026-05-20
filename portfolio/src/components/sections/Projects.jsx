import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const PROJECTS = [
  {
    num: '01', year: '2025', title: 'Westrade',
    desc: 'Algorithmic trading platform with MetaTrader5 integration, real-time WebSocket data feeds, backtesting engine, and automated strategy execution.',
    tech: ['Python', 'React', 'WebSockets', 'MT5', 'PostgreSQL'],
  },
  {
    num: '02', year: '2024', title: 'Sentiment Analysis Engine',
    desc: 'Real-time NLP pipeline processing financial news and social data to generate trading signals using LLM APIs and custom ML models.',
    tech: ['Python', 'LLM APIs', 'FastAPI', 'Redis'],
  },
  {
    num: '03', year: '2024', title: 'Dashboard Framework',
    desc: 'Composable real-time dashboard system with live WebSocket data streams, configurable widgets, and multi-tenant support for fintech clients.',
    tech: ['React', 'Node.js', 'WebSockets', 'D3.js'],
  },
  {
    num: '04', year: '2024', title: 'Pipeline Builder',
    desc: 'Visual workflow automation platform with 50+ integrations, conditional logic, error handling, and scheduled execution.',
    tech: ['Next.js', 'TypeScript', 'Node.js', 'Docker'],
  },
  {
    num: '05', year: '2023', title: 'E-Commerce Platform',
    desc: 'Headless e-commerce with custom storefront, inventory management, payment integration, and admin dashboard.',
    tech: ['Next.js', 'Stripe', 'PostgreSQL', 'Vercel'],
  },
]

export default function Projects() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.proj-anim-hd', {
        y: 40, opacity: 0, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 75%' },
      })
      gsap.from('.proj-anim-row', {
        y: 30, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out',
        scrollTrigger: { trigger: '.proj-list', start: 'top 80%' },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section id="work" className="section" ref={ref}>
      <div className="section-inner">
        <div className="proj-anim-hd">
          <div className="sec-label">02 — Work</div>
          <h2 className="sec-heading">Selected<br />Projects</h2>
        </div>

        <div className="proj-list">
          {PROJECTS.map((p, i) => (
            <div className="proj-row proj-anim-row" key={i}>
              <div className="proj-num">{p.num}</div>
              <div className="proj-info">
                <div className="proj-name">{p.title}</div>
                <div className="proj-desc">{p.desc}</div>
                <div className="proj-chips">
                  {p.tech.map((t) => <span className="proj-chip" key={t}>{t}</span>)}
                </div>
              </div>
              <div className="proj-aside">
                <span className="proj-year">{p.year}</span>
                <span className="proj-status">Live</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
