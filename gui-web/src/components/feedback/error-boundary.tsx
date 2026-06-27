/**
 * ErrorBoundary — catch render errors and report which component failed
 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  name: string
}

interface State {
  error: Error | null
  info: string | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[${this.props.name}] crashed:`, error.message)
    console.error('Component stack:', info.componentStack)
    this.setState({ info: info.componentStack })
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'monospace',
            background: '#fee',
            border: '2px solid #c00',
            margin: 16,
            borderRadius: 8,
          }}
        >
          <h2 style={{ color: '#c00', marginTop: 0 }}>
            {this.props.name} crashed
          </h2>
          <pre style={{ background: '#fff', padding: 12, overflow: 'auto' }}>
            {String(this.state.error.message)}
            {'\n\n'}
            {this.state.info ?? ''}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}