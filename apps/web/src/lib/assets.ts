export type AssetId =
  | 'shared-frame-mark'
  | 'illustration-empty-shelf'
  | 'illustration-reconnecting-film'
  | 'illustration-strip-printer'
  | 'prop-postcard'
  | 'prop-film-camera'
  | 'prop-mug'
  | 'stamp-same-frame'
  | 'stamp-developed'
  | 'stamp-signal-found'
  | 'scene-studio'
  | 'illustration-strip-printer-ready'
  | 'illustration-strip-printer-failed'
  | 'illustration-connected-film'
  | 'texture-thermal-paper'
  | 'texture-film-edge'
  | 'y2k-frame-strip'
  | 'y2k-frame-grid'
  | 'y2k-frame-single'
  | 'y2k-sticker-star'
  | 'y2k-sticker-bubble'
  | 'y2k-sticker-disc'
  | 'y2k-sticker-burst'
  | 'y2k-bubble-frames'
  | 'y2k-phone-link'
  | 'y2k-disc-orbit'
  | 'y2k-desktop-loading'
  | 'y2k-sparkle-cluster'
  | 'y2k-anim-sparkle-burst'
  | 'y2k-anim-shutter'
  | 'y2k-anim-signal-connect'
  | 'y2k-anim-disc-spin'
  | 'y2k-anim-loading-bar'
  | `y2k-icon-${string}`
  | `y2k-3d-${string}`

export interface RuntimeAsset {
  id: AssetId
  status: 'approved'
  runtimePath: string
  width: number
  height: number
  sourceHash: string
  reducedMotionPath?: string
  outputs?: { path: string; format: string }[]
}

const manifests = import.meta.glob('../../public/assets/approved/*.manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, RuntimeAsset>

export function resolveAsset(id: AssetId): RuntimeAsset | undefined {
  return Object.values(manifests).find(
    (asset) => asset.id === id && asset.status === 'approved' && asset.runtimePath.startsWith('/assets/approved/'),
  )
}

export type AssetBitmaps = Partial<Record<AssetId, ImageBitmap>>
const decoded = new Map<AssetId, Promise<ImageBitmap | null>>()

export async function loadAssets(ids: (AssetId | undefined)[]): Promise<AssetBitmaps> {
  const entries = await Promise.all(
    [...new Set(ids)]
      .filter((id): id is AssetId => Boolean(id))
      .map(async (id) => {
        const asset = resolveAsset(id)
        if (!asset) return [id, null] as const
        let bitmap = decoded.get(id)
        if (!bitmap) {
          bitmap = fetch(asset.runtimePath)
            .then((response) => {
              if (!response.ok) throw new Error('Asset unavailable')
              return response.blob()
            })
            .then((blob) => createImageBitmap(blob))
            .catch(() => null)
          decoded.set(id, bitmap)
        }
        return [id, await bitmap] as const
      }),
  )
  return Object.fromEntries(entries.filter(([, bitmap]) => bitmap !== null)) as AssetBitmaps
}
