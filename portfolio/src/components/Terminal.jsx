import { useState, useEffect, useRef } from 'react'

const BOOT_LINES = [
  '> WESTRADE CYBERDECK v2.1.0',
  '> Neural interface connected',
  '> Type "help" for available commands',
  '',
]

const COMMANDS = {
  help: () => [
    '',
    '  AVAILABLE COMMANDS:',
    '  ─────────────────────────────────────────',
    '  help      — show this menu',
    '  about     — display info about Wes',
    '  skills    — list tech stack',
    '  projects  — recent projects',
    '  status    — system status',
    '  contact   — get in touch',
    '  clear     — clear terminal',
    '  exit      — close terminal',
    '',
  ],
  about: () => [
    '',
    '  WES DE KONING',
    '  Full-Stack Developer · Netherlands',
    '  ─────────────────────────────────────────',
    '  Building high-performance web apps,',
    '  AI integrations, algo-trading systems,',
    '  and real-time data pipelines.',
    '  Available for remote work worldwide.',
    '',
  ],
  skills: () => [
    '',
    '  TECH STACK:',
    '  ─────────────────────────────────────────',
    '  React/Next.js        ████████████ 92%',
    '  TypeScript/JS        █████████████ 95%',
    '  Node.js/Express      ████████████ 90%',
    '  Python               ███████████  85%',
    '  AI/LLM Integration   ████████████ 88%',
    '  Automation Pipelines ████████████ 91%',
    '  MetaTrader5          ███████████  80%',
    '  PostgreSQL           ███████████  83%',
    '  Docker/Cloud         ██████████   75%',
    '  WebSockets           ████████████ 87%',
    '',
  ],
  projects: () => [
    '',
    '  RECENT PROJECTS:',
    '  ─────────────────────────────────────────',
    '  [2025] Westrade              — Algo-trading platform',
    '  [2024] Sentiment Engine      — Real-time NLP analysis',
    '  [2024] Dashboard Framework   — WebSocket data viz',
    '  [2024] Pipeline Builder      — Automation workflows',
    '  [2023] E-Commerce Full-Stack — Headless commerce',
    '',
  ],
  status: () => [
    '',
    '  SYSTEM STATUS:',
    '  ─────────────────────────────────────────',
    `  TIMESTAMP    : ${new Date().toISOString()}`,
    '  AVAILABILITY : OPEN TO OPPORTUNITIES',
    '  LOCATION     : NETHERLANDS (REMOTE)',
    '  STATUS       : ONLINE & BUILDING',
    '  UPTIME       : 100%',
    '',
  ],
  contact: () => [
    '',
    '  CONTACT CHANNELS:',
    '  ─────────────────────────────────────────',
    '  EMAIL    : wes@dekoning.dev',
    '  GITHUB   : github.com/wesdekoning',
    '  LINKEDIN : linkedin.com/in/wesdekoning',
    '  LOCATION : Netherlands, remote worldwide',
    '',
  ],
  clear: () => null,
  exit: () => 'EXIT',
}

export default function Terminal({ open, onClose }) {
  const [lines, setLines] = useState(BOOT_LINES)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef = useRef(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleSubmit = (e) => {
    e.preventDefault()
    const cmd = input.trim().toLowerCase()
    if (!cmd) return

    const echo = `> ${cmd}`
    if (cmd === 'clear') {
      setLines(BOOT_LINES)
      setInput('')
      return
    }
    if (cmd === 'exit') {
      onClose()
      setInput('')
      return
    }

    const fn = COMMANDS[cmd]
    const result = fn ? fn() : [`  Command not found: "${cmd}". Type "help" for options.`, '']

    setLines((prev) => [...prev, echo, ...(result || [])])
    setHistory((h) => [cmd, ...h])
    setHistIdx(-1)
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(idx)
      setInput(history[idx] || '')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(histIdx - 1, -1)
      setHistIdx(idx)
      setInput(idx === -1 ? '' : history[idx])
    }
  }

  if (!open) return null

  return (
    <div className="terminal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="terminal-panel">
        <div className="terminal-titlebar">
          <span className="terminal-title">CYBERDECK // WES.DK TERMINAL</span>
          <button className="terminal-close" onClick={onClose}>✕</button>
        </div>
        <div className="terminal-body">
          {lines.map((line, i) => (
            <div key={i} className="terminal-line">{line}</div>
          ))}
          <form onSubmit={handleSubmit} className="terminal-form">
            <span className="terminal-prompt">{'>'}</span>
            <input
              ref={inputRef}
              className="terminal-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck="false"
              aria-label="Terminal input"
            />
          </form>
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
