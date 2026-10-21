import QRCode from 'qrcode'

export interface QrMatrix {
  size: number
  dark: boolean[]
}

export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, dark: Array.from(modules.data, Boolean) }
}

export function qrPath({ size, dark }: QrMatrix, margin = 2) {
  let d = ''
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (dark[y * size + x]) d += `M${x + margin} ${y + margin}h1v1h-1z`
  }
  return { d, view: size + margin * 2 }
}
