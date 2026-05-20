import { useEffect, useRef } from 'react'

const MARQUEE_ITEMS = [
  'AVAILABLE FOR NEW PROJECTS',
  'REMOTE WORLDWIDE',
  'FULL-STACK DEVELOPMENT',
  'AI & AUTOMATION',
  'ALGO TRADING',
  'CONTACT ME',
]

export default function Contact() {
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

  const doubled = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <section id="contact" ref={ref}>
      <div className="reveal">
        <div className="section-tag">// 05 CONTACT</div>
        <h2 className="section-title">Get In <span>Touch</span></h2>
        <div className="section-line" />
      </div>

      <div className="marquee-wrap reveal">
        <div className="marquee-track">
          {doubled.map((item, i) => (
            <span className="marquee-item" key={i}>// {item}</span>
          ))}
        </div>
      </div>

      <div className="contact-grid">
        <div className="contact-links reveal">
          <a className="contact-link" href="mailto:wes@dekoning.dev">
            <span className="contact-link-icon">✉</span>
            <div>
              <div className="contact-link-label">EMAIL</div>
              <div className="contact-link-val">wes@dekoning.dev</div>
            </div>
          </a>
          <a className="contact-link" href="https://github.com/wesdekoning" target="_blank" rel="noreferrer">
            <span className="contact-link-icon">⌥</span>
            <div>
              <div className="contact-link-label">GITHUB</div>
              <div className="contact-link-val">github.com/wesdekoning</div>
            </div>
          </a>
          <a className="contact-link" href="https://linkedin.com/in/wesdekoning" target="_blank" rel="noreferrer">
            <span className="contact-link-icon">◈</span>
            <div>
              <div className="contact-link-label">LINKEDIN</div>
              <div className="contact-link-val">linkedin.com/in/wesdekoning</div>
            </div>
          </a>
          <div className="contact-link">
            <span className="contact-link-icon">◎</span>
            <div>
              <div className="contact-link-label">LOCATION</div>
              <div className="contact-link-val">Netherlands — Remote Worldwide</div>
            </div>
          </div>
        </div>

        <div className="contact-avail reveal">
          <div className="avail-title">
            <span className="avail-dot" />
            AVAILABILITY STATUS
          </div>
          <div className="avail-text">
            Currently open to new freelance projects and contract work.
            Whether it's a greenfield project, a complex integration, or
            bringing your existing product to the next level — let's talk.
          </div>
          <a className="cta-btn solid" href="mailto:wes@dekoning.dev">
            Start a Project →
          </a>
        </div>
      </div>
    </section>
  )
}
