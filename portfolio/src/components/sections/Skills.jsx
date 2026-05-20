import { useEffect, useRef } from 'react'

const ROW1 = ['React', 'Next.js', 'TypeScript', 'Node.js', 'Python', 'PostgreSQL', 'Redis', 'Docker']
const ROW2 = ['FastAPI', 'WebSockets', 'Three.js', 'LLM APIs', 'MetaTrader5', 'D3.js', 'Stripe', 'Vercel']

const CATS = [
  { title: 'Frontend', items: ['React / Next.js', 'TypeScript', 'Three.js / WebGL', 'Tailwind CSS', 'D3.js'] },
  { title: 'Backend', items: ['Node.js / Express', 'Python / FastAPI', 'PostgreSQL', 'Redis', 'WebSockets'] },
  { title: 'AI & Data', items: ['LLM Integration', 'NLP Pipelines', 'ML Models', 'Data Analysis', 'Automation'] },
  { title: 'Fintech', items: ['Algo Trading', 'MetaTrader5', 'Backtesting', 'Risk Systems', 'Market Data'] },
]

export default function Skills() {
  const ref = useRef(null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('vis') }),
      { threshold: 0.1 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const r1 = [...ROW1, ...ROW1]
  const r2 = [...ROW2, ...ROW2]

  return (
    <div id="skills" className="skills-wrap" ref={ref}>
      <div className="skills-header">
        <div className="sec-label reveal">03 — Skills</div>
        <h2 className="sec-heading reveal">Tech Stack</h2>
      </div>

      <div className="marquee-outer">
        <div className="mq-track">
          {r1.map((item, i) => (
            <span className={`mq-item${i % 5 === 2 ? ' hi' : ''}`} key={i}>{item}</span>
          ))}
        </div>
      </div>
      <div className="marquee-outer">
        <div className="mq-track rev">
          {r2.map((item, i) => (
            <span className={`mq-item${i % 4 === 1 ? ' hi' : ''}`} key={i}>{item}</span>
          ))}
        </div>
      </div>

      <div className="skills-cats">
        {CATS.map((cat) => (
          <div className="skill-cat reveal" key={cat.title}>
            <div className="cat-title">{cat.title}</div>
            <ul className="cat-list">
              {cat.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
