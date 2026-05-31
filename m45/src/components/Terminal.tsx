import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface TerminalProps {
  onCommand: (command: string) => Promise<{ stdout: string; stderr: string }>
}

const TerminalComponent: React.FC<TerminalProps> = ({ onCommand }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const commandBufferRef = useRef('')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const isProcessingRef = useRef(false)

  useEffect(() => {
    if (terminalRef.current && !xtermRef.current) {
      xtermRef.current = new XTerm({
        theme: {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#ffffff',
        },
        fontFamily: 'Consolas, "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
      })

      fitAddonRef.current = new FitAddon()
      xtermRef.current.loadAddon(fitAddonRef.current)
      xtermRef.current.open(terminalRef.current)
      fitAddonRef.current.fit()

      showPrompt()

      xtermRef.current.onData((data) => {
        handleInput(data)
      })

      const handleResize = () => {
        fitAddonRef.current?.fit()
      }
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
        xtermRef.current?.dispose()
      }
    }
  }, [])

  const showPrompt = () => {
    xtermRef.current?.write('\r\n$ ')
  }

  const handleInput = async (data: string) => {
    if (!xtermRef.current || isProcessingRef.current) return

    const code = data.charCodeAt(0)

    if (code === 13) {
      const command = commandBufferRef.current.trim()
      if (command) {
        historyRef.current.push(command)
        historyIndexRef.current = historyRef.current.length
        await executeCommand(command)
      }
      commandBufferRef.current = ''
      showPrompt()
    } else if (code === 127 || code === 8) {
      if (commandBufferRef.current.length > 0) {
        commandBufferRef.current = commandBufferRef.current.slice(0, -1)
        xtermRef.current.write('\b \b')
      }
    } else if (code === 27) {
      if (data === '\u001b[A') {
        if (historyIndexRef.current > 0) {
          historyIndexRef.current--
          const oldLength = commandBufferRef.current.length
          commandBufferRef.current = historyRef.current[historyIndexRef.current] || ''
          xtermRef.current.write('\b \b'.repeat(oldLength))
          xtermRef.current.write(commandBufferRef.current)
        }
      } else if (data === '\u001b[B') {
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current++
          const oldLength = commandBufferRef.current.length
          commandBufferRef.current = historyRef.current[historyIndexRef.current] || ''
          xtermRef.current.write('\b \b'.repeat(oldLength))
          xtermRef.current.write(commandBufferRef.current)
        } else if (historyIndexRef.current === historyRef.current.length - 1) {
          historyIndexRef.current = historyRef.current.length
          const oldLength = commandBufferRef.current.length
          commandBufferRef.current = ''
          xtermRef.current.write('\b \b'.repeat(oldLength))
        }
      }
    } else if (code >= 32) {
      commandBufferRef.current += data
      xtermRef.current.write(data)
    }
  }

  const executeCommand = async (command: string) => {
    if (!xtermRef.current) return

    isProcessingRef.current = true
    xtermRef.current.write('\r\n')

    try {
      const result = await onCommand(command)
      if (result.stdout) {
        xtermRef.current.write(result.stdout.replace(/\n/g, '\r\n'))
      }
      if (result.stderr) {
        xtermRef.current.write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`)
      }
    } catch (error: any) {
      xtermRef.current.write(`\x1b[31mError: ${error.message}\x1b[0m`)
    }

    isProcessingRef.current = false
  }

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <h2>Docker 终端</h2>
        <span className="terminal-hint">输入 Docker 命令（无需 docker 前缀）</span>
      </div>
      <div className="terminal-wrapper" ref={terminalRef}></div>
    </div>
  )
}

export default TerminalComponent
