import { useEffect, useRef } from 'react'
import { createScene } from '../three/scene.js'

export default function ThreeCanvas() {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const cleanup = createScene(container)
    return cleanup
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
