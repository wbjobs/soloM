import React from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import PipelineList from './pages/PipelineList'
import RunDetail from './pages/RunDetail'

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0d1117',
    color: '#c9d1d9',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  },
  header: {
    background: '#161b22',
    borderBottom: '1px solid #30363d',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerLink: {
    color: '#58a6ff',
    textDecoration: 'none',
    fontSize: '20px',
    fontWeight: 600,
  },
  content: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px',
  },
} as const

export default function App() {
  return (
    <BrowserRouter>
      <div style={styles.container}>
        <header style={styles.header}>
          <Link to="/" style={styles.headerLink}>CI/CD Pipeline</Link>
        </header>
        <div style={styles.content}>
          <Routes>
            <Route path="/" element={<PipelineList />} />
            <Route path="/run/:id" element={<RunDetail />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
