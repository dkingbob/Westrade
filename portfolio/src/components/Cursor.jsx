import { useEffect, useRef } from 'react'

export default function Cursor() {
  const dotRef = useRef(null)
  const ringRef = useRef(null)
  const hLineRef = useRef(null)
  const vLineRef = useRef(null)

  useEffect(() => {
    // Don't show on touch devices
    if ('ontouchstart' in window) return

    let cx = window.innerWidth / 2
    let cy = window.innerHeight / 2
    let rx = cx
    let ry = cy
    let hovering = false
    let frameId

    const onMove = (e) => {
      cx = e.clientX
      cy = e.clientY
    }

    const onEnter = () => { hovering = true }
    const onLeave = () => { hovering = false }

    document.querySelectorAll('a, button, [data-hover]').forEach((el) => {
      el.addEventListener('mouseenter', onEnter)
      el.addEventListener('mouseleave', onLeave)
    })

    // Also delegate via body class
    document.body.addEventListener('mouseover', (e) => {
      const el = e.target.closest('a, button, [data-hover]')
      if (el) hovering = true
    })
    document.body.addEventListener('mouseout', (e) => {
      const el = e.target.closest('a, button, [data-hover]')
      if (el) hovering = false
    })

    window.addEventListener('mousemove', onMove)

    const lerp = (a, b, t) => a + (b - a) * t

    const loop = () => {
      frameId = requestAnimationFrame(loop)
      rx = lerp(rx, cx, 0.15)
      ry = lerp(ry, cy, 0.15)

      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`
      }
      if (ringRef.current) {
        const scale = hovering ? 1.8 : 1
        ringRef.current.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%) scale(${scale})`
      }
      if (hLineRef.current) {
        hLineRef.current.style.transform = `translate(0, ${cy}px) translateY(-50%)`
      }
      if (vLineRef.current) {
        vLineRef.current.style.transform = `translate(${cx}px, 0) translateX(-50%)`
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <>
      <div className="cursor-hline" ref={hLineRef} />
      <div className="cursor-vline" ref={vLineRef} />
      <div className="cursor-dot" ref={dotRef} />
      <div className="cursor-ring" ref={ringRef} />
    </>
  )
}
