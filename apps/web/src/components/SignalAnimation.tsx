export type SignalState = 'waiting' | 'connecting' | 'ready' | 'error'

export function SignalAnimation({ state }: { state: SignalState }) {
  return (
    <span key={state} className="signal-animation" data-state={state} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}
