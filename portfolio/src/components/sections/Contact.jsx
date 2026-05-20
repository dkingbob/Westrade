import { useEffect, useRef } from 'react'

export default function Contact() {
  const ref = useRef(null)

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('vis') }),
      { threshold: 0.1 }
    )
    ref.current?.querySelectorAll('.reveal').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div id="contact" className="contact-wrap" ref={ref}>
      <div className="contact-inner">
        <h2 className="contact-heading reveal">
          Let's<br /><span>Work</span><br />Together
        </h2>

        <a className="contact-mail reveal" href="mailto:wes@dekoning.dev">
          wes@dekoning.dev
        </a>

        <div className="contact-foot reveal">
          <div className="contact-socials">
            <a className="c-social" href="https://github.com/wesdekoning" target="_blank" rel="noreferrer">GitHub</a>
            <a className="c-social" href="https://linkedin.com/in/wesdekoning" target="_blank" rel="noreferrer">LinkedIn</a>
            <a className="c-social" href="mailto:wes@dekoning.dev">Email</a>
          </div>
          <span className="contact-copy">© 2025 Wes de Koning — Netherlands</span>
        </div>
      </div>
    </div>
  )
}
