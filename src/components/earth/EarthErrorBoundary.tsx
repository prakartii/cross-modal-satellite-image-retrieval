import { Component, type ReactNode } from 'react'
import FallbackEarth from './FallbackEarth'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string
}

export default class EarthErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'Unknown render error',
    }
  }

  componentDidCatch(error: Error) {
    console.warn('[EarthErrorBoundary] caught:', error.message)
  }

  render() {
    if (this.state.hasError) {
      return <FallbackEarth message="3D globe unavailable — showing fallback" />
    }
    return this.props.children
  }
}
