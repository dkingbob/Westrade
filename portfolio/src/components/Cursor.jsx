import { useEffect, useRef } from 'react'

export default function Cursor() {
  const dot = useRef(null)
  const ring = useRef(null)

  useEffect(() => {
    let rx = 0, ry = 0, tx = 0, ty = 0, raf

    const onMove = (e) => { tx = e.clientX; ty = e.clientY }
    const tick = () => {
      rx += (tx - rx) * 0.16
      ry += (ty - ry) * 0.16
      if (dot.current) {
        dot.current.style.left = `${tx}px`
        dot.current.style.top = `${ty}px`
      }
      if (ring.current) {
        ring.current.style.left = `${rx}px`
        ring.current.style.top = `${ry}px`
      }
      raf = requestAnimationFrame(tick)
    }
    const addHov = (e) => { if (e.target.closest('a,button')) ring.current?.classList.add('hov') }
    const remHov = (e) => { if (e.target.closest('a,button')) ring.current?.classList.remove('hov') }

    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', addHov)
    document.addEventListener('mouseout', remHov)
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', addHov)
      document.removeEventListener('mouseout', remHov)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <>
      <div className="cur-dot" ref={dot} />
      <div className="cur-ring" ref={ring} />
    </>
  )
}
