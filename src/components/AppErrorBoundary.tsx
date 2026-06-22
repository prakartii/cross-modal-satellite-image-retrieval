import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unexpected error' }
  }

  componentDidCatch(error: Error) {
    console.error('[AppErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-canvas flex flex-col items-center justify-center gap-4 p-8">
          <div className="w-10 h-10 rounded-xl bg-danger/15 border border-danger/30 flex items-center justify-center">
            <span className="text-danger text-lg">!</span>
          </div>
          <div className="text-center">
            <div className="text-heading-2 text-text-primary mb-1">Application Error</div>
            <div className="text-body-s text-text-tertiary max-w-sm">{this.state.message}</div>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="btn-primary mt-2"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
