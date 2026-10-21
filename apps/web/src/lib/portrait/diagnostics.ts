export interface FrameSample {
  at: number
  ms: number
}

export interface PortraitDiagnostics {
  fps: number
  frameMs: number
  segmentationMs: number
}

export function summarizeFrames(samples: FrameSample[], segmentationMs: number): PortraitDiagnostics {
  const elapsed = samples.length > 1 ? samples.at(-1)!.at - samples[0]!.at : 0
  const frameMs = samples.length ? samples.reduce((sum, sample) => sum + sample.ms, 0) / samples.length : 0
  return {
    fps: elapsed > 0 ? ((samples.length - 1) * 1000) / elapsed : 0,
    frameMs,
    segmentationMs,
  }
}
