import { useEffect, useRef, useState } from 'react'

const SKILLS = [
  { name: 'TypeScript / JavaScript', pct: 95 },
  { name: 'React / Next.js', pct: 92 },
  { name: 'Automation Pipelines', pct: 91 },
  { name: 'Node.js / Express', pct: 90 },
  { name: 'WebSockets / Real-time', pct: 87 },
  { name: 'Python', pct: 85 },
  { name: 'PostgreSQL', pct: 83 },
  { name: 'AI / LLM Integration', pct: 88 },
  { name: 'MetaTrader5 / Algo Trading', pct: 80 },
  { name: 'Docker / Cloud', pct: 75 },
]

function SkillBar({ name, pct, visible }) {
  return (
    <div className="skill-item">
      <div className="skill-header">
        <span className="skill-name">{name}</span>
        <span className="skill-pct">{pct}%</span>
      </div>
      <div className="skill-track">
        <div className="skill-fill" style={{ width: visible ? `${pct}%` : '0%' }} />
      </div>
    </div>
  )
}

export default function Skills() {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true)
            e.target.querySelectorAll('.reveal').forEach((el) => el.classList.add('vis'))
          }
        })
      },
      { threshold: 0.2 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="skills" ref={ref}>
      <div className="reveal">
        <div className="section-tag">// 02 SKILLS</div>
        <h2 className="section-title">Tech <span>Stack</span></h2>
        <div className="section-line" />
      </div>
      <div className="skill-list reveal">
        {SKILLS.map((s) => (
          <SkillBar key={s.name} {...s} visible={visible} />
        ))}
      </div>
    </section>
  )
}
