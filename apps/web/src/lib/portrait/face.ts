import type { FaceDetector } from '@mediapipe/tasks-vision'
import { fileset } from '../segmentation'

export interface Face {
  x: number
  eyeY: number
  height: number
}

export async function loadFaceDetector(): Promise<FaceDetector> {
  const { vision, fileset: fs } = await fileset()
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite', delegate },
    runningMode: 'VIDEO' as const,
    minDetectionConfidence: 0.5,
  })
  try {
    return await vision.FaceDetector.createFromOptions(fs, options('GPU'))
  } catch {
    return vision.FaceDetector.createFromOptions(fs, options('CPU'))
  }
}

export function detectFaces(detector: FaceDetector, video: HTMLVideoElement, now: number): Face[] {
  const result = detector.detectForVideo(video, now)
  const found: Face[] = []
  for (const d of result.detections) {
    const box = d.boundingBox
    if (!box) continue
    const eyes = d.keypoints.slice(0, 2)
    const eyeY =
      eyes.length === 2 ? ((eyes[0]!.y + eyes[1]!.y) / 2) * video.videoHeight : box.originY + box.height * 0.4
    const x = eyes.length === 2 ? ((eyes[0]!.x + eyes[1]!.x) / 2) * video.videoWidth : box.originX + box.width / 2
    found.push({ x, eyeY, height: box.height })
  }
  const biggest = Math.max(0, ...found.map((f) => f.height))
  return found.filter((f) => f.height > biggest * 0.55)
}
