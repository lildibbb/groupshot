import { useMemo } from 'react'
import { qrMatrix, qrPath } from '@/lib/qr'

export function QrCode({ value, label, size = 160 }: { value: string; label: string; size?: number }) {
  const qr = useMemo(() => {
    try {
      return qrPath(qrMatrix(value))
    } catch {
      return null
    }
  }, [value])
  return (
    <figure className="qr">
      {qr ? (
        <svg
          viewBox={`0 0 ${qr.view} ${qr.view}`}
          width={size}
          height={size}
          role="img"
          aria-label={label}
          shapeRendering="crispEdges"
        >
          <rect width={qr.view} height={qr.view} fill="#fff" />
          <path d={qr.d} fill="#131317" />
        </svg>
      ) : (
        <div className="qr-fallback" style={{ width: size, height: size }} role="status">
          QR code unavailable
        </div>
      )}
      <figcaption>
        <span className="sr-only">Link: </span>
        <a href={value} target="_blank" rel="noreferrer" className="break-all">
          {value}
        </a>
      </figcaption>
    </figure>
  )
}
