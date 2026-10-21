export type PrinterState = 'collecting' | 'developing' | 'ready' | 'failed'

export function printerState(input: { collecting: boolean; failed: boolean; ready: boolean }): PrinterState {
  if (input.failed) return 'failed'
  if (input.collecting) return 'collecting'
  return input.ready ? 'ready' : 'developing'
}

const labels: Record<PrinterState, string> = {
  collecting: 'Collecting everyone’s photos…',
  developing: 'Developing your strip…',
  ready: 'Your strip is ready',
  failed: 'Your strip could not be developed',
}

export function PrinterAnimation({ state }: { state: PrinterState }) {
  return (
    <div className="printer-status" data-state={state} role="status">
      <span className="stamp muted">{labels[state]}</span>
    </div>
  )
}
