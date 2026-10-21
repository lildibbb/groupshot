import serifItalic from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2?url'
import serif from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2?url'
import pixel from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url'
import mono from '@fontsource/space-mono/files/space-mono-latin-700-normal.woff2?url'
import display from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url'

export interface FontSpec {
  family: string
  url: string
  descriptors?: FontFaceDescriptors
}

export const FONT_SPECS: FontSpec[] = [
  { family: 'GS Display', url: display, descriptors: { weight: '200 800' } },
  { family: 'GS Serif', url: serif },
  { family: 'GS Serif', url: serifItalic, descriptors: { style: 'italic' } },
  { family: 'GS Pixel', url: pixel },
  { family: 'GS Mono', url: mono, descriptors: { weight: '100 900' } },
]

export async function loadFonts(set: FontFaceSet | undefined, specs: FontSpec[], base: string) {
  if (!set) return
  await Promise.allSettled(
    specs.map(async (s) => {
      const face = new FontFace(s.family, `url(${new URL(s.url, base).href})`, s.descriptors)
      set.add(await face.load())
    }),
  )
}
