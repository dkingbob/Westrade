import { useEffect, useState } from 'react'

const FILES = [
  'initializing_neural_mesh.exe',
  'loading_cyberdeck_modules.js',
  'compiling_holographic_assets.wasm',
  'syncing_quantum_state.bin',
  'injecting_neon_protocols.dll',
  'bootstrapping_matrix_core.so',
  'establishing_uplink_channels.cfg',
  'finalizing_render_pipeline.glsl',
]

export default function Loader({ onComplete }) {
  const [pct, setPct] = useState(0)
  const [fileIdx, setFileIdx] = useState(0)

  useEffect(() => {
    let current = 0
    const interval = setInterval(() => {
      const inc = Math.random() * 3 + 0.8
      current = Math.min(current + inc, 100)
      setPct(Math.floor(current))
      setFileIdx((i) => (i + 1) % FILES.length)
      if (current >= 100) {
        clearInterval(interval)
        setTimeout(() => onComplete(), 400)
      }
    }, 40)
    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <div className="loader-overlay">
      <div className="loader-content">
        <div className="loader-title">
          <span className="loader-name-line">WES DE /</span>
          <span className="loader-name-line">KONING</span>
        </div>
        <div className="loader-bar-wrap">
          <div className="loader-bar" style={{ width: `${pct}%` }} />
        </div>
        <div className="loader-pct">{String(pct).padStart(3, '0')}%</div>
        <div className="loader-file">{FILES[fileIdx]}</div>
      </div>
    </div>
  )
}
