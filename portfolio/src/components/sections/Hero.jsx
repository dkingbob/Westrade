export default function Hero() {
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section id="hero" className="hero">
      <div className="hero-bg">
        <div className="hero-blob hero-blob-1" />
        <div className="hero-blob hero-blob-2" />
      </div>

      <div className="hero-content">
        <div className="hero-eyebrow">
          <span className="hero-pulse" />
          Available for new projects
          <span style={{ margin: '0 0.2rem', opacity: 0.3 }}>·</span>
          Netherlands
        </div>

        <h1 className="hero-name">
          <span>Wes De</span><br />
          <span className="hero-name-outline">Koning</span>
        </h1>

        <div className="hero-rule" />

        <div className="hero-roles">
          <span className="hero-role">Full-Stack Developer</span>
          <span className="hero-sep" />
          <span className="hero-role">AI &amp; Automation</span>
          <span className="hero-sep" />
          <span className="hero-role">Algo Trading</span>
        </div>
      </div>

      <div className="hero-bottom">
        <div className="hero-scroll" onClick={() => go('about')}>
          <div className="hero-scroll-line" />
          <span className="hero-scroll-txt">Scroll</span>
        </div>
        <div className="hero-meta">
          <span>Netherlands</span>
          <span>Est. 2020</span>
        </div>
      </div>
    </section>
  )
}
