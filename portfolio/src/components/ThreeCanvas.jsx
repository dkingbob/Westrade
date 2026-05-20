import { useEffect, useRef } from 'react'
import { initScene } from '../three/scene.js'

export default function ThreeCanvas() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cleanup = initScene(canvasRef.current)
    return cleanup
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
