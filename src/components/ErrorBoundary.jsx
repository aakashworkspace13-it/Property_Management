import { Component } from 'react'

// Shows a friendly message instead of a blank page if a screen crashes.
// Saved data is not affected; reloading usually fixes a one-off problem.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(previous) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="page">
        <div className="card section">
          <h1>Something went wrong on this screen</h1>
          <p className="muted">Your saved records are safe. Reload the page, or go back and try again.</p>
          <p className="error small">{String(this.state.error.message ?? this.state.error)}</p>
          <button type="button" className="button primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </section>
    )
  }
}
