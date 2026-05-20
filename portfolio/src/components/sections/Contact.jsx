import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function Contact() {
  const ref = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.contact-anim', {
        y: 50, opacity: 0, duration: 1, stagger: 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: ref.current, start: 'top 75%' },
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <div id="contact" className="contact-wrap" ref={ref}>
      <div className="contact-inner">
        <h2 className="contact-heading contact-anim">
          Let's<br /><span>Work</span><br />Together
        </h2>

        <a className="contact-mail contact-anim" href="mailto:wes@dekoning.dev">
          wes@dekoning.dev
        </a>

        <div className="contact-foot contact-anim">
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
