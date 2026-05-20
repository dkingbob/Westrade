import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

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
    const ctx = gsap.context(() => {
      gsap.from('.skills-anim', {
        y: 40, opacity: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 75%' },
      })
      gsap.from('.cat-anim', {
        y: 30, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out',
        scrollTrigger: { trigger: '.skills-cats', start: 'top 80%' },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  const r1 = [...ROW1, ...ROW1]
  const r2 = [...ROW2, ...ROW2]

  return (
    <div id="skills" className="skills-wrap" ref={ref}>
      <div className="skills-header">
        <div className="sec-label skills-anim">03 — Skills</div>
        <h2 className="sec-heading skills-anim">Tech Stack</h2>
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
          <div className="skill-cat cat-anim" key={cat.title}>
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
