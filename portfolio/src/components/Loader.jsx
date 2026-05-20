import { useEffect, useState } from 'react'

export default function Loader({ onComplete }) {
  const [p, setP] = useState(0)
  const [out, setOut] = useState(false)

  useEffect(() => {
    const start = Date.now()
    const dur = 1100
    const step = () => {
      const prog = Math.min((Date.now() - start) / dur, 1)
      setP(Math.floor(prog * 100))
      if (prog < 1) {
        requestAnimationFrame(step)
      } else {
        setOut(true)
        setTimeout(onComplete, 380)
      }
    }
    requestAnimationFrame(step)
  }, [])

  return (
    <div className={`loader${out ? ' out' : ''}`}>
      <div className="loader-name">Wes de Koning</div>
      <div className="loader-bar">
        <div className="loader-fill" style={{ transform: `scaleX(${p / 100})` }} />
      </div>
      <div className="loader-pct">{p}%</div>
    </div>
  )
}
