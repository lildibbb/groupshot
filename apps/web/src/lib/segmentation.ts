import type { ImageSegmenter } from '@mediapipe/tasks-vision'

type Vision = typeof import('@mediapipe/tasks-vision')
let files:
  | Promise<{ vision: Vision; fileset: Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>> }>
  | undefined

export function fileset() {
  files ??= import('@mediapipe/tasks-vision')
    .then(async (vision) => ({ vision, fileset: await vision.FilesetResolver.forVisionTasks('/models/wasm') }))
    .catch((error) => {
      files = undefined
      throw error
    })
  return files
}

export async function loadSegmenter(only?: 'CPU'): Promise<ImageSegmenter> {
  const { vision, fileset: fs } = await fileset()
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: '/models/selfie_segmenter.tflite', delegate },
    runningMode: 'VIDEO' as const,
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  })
  if (only === 'CPU') return vision.ImageSegmenter.createFromOptions(fs, options('CPU'))
  try {
    return await Promise.race([
      vision.ImageSegmenter.createFromOptions(fs, options('GPU')),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GPU segmenter timed out')), 8_000)),
    ])
  } catch {
    return vision.ImageSegmenter.createFromOptions(fs, options('CPU'))
  }
}

export function confidenceAlpha(confidence: number) {
  const t = Math.max(0, Math.min(1, (confidence - 0.35) / 0.35))
  return Math.round(t * t * (3 - 2 * t) * 255)
}
