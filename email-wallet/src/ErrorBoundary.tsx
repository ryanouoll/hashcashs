import type { ReactNode } from 'react'
import React from 'react'

type Props = { children: ReactNode }
type State = { error?: Error }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-dvh px-4 pb-16 pt-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-red-400/30 bg-red-400/10 p-5 text-white">
            <div className="text-sm text-white/70">前端發生錯誤（已攔截，避免整頁消失）</div>
            <div className="mt-2 text-lg font-semibold">請把以下錯誤訊息貼給我</div>
            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/30 p-3 text-xs text-white/80">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      </div>
    )
  }
}

