import * as THREE from 'three'

export interface Arm {
  up: number
  fwd: number
  twist?: number
  bend: number
  hand?: 'open' | 'fist' | 'peace' | 'ell'
}
export interface Figure {
  x: number
  turn?: number
  lean?: number
  bow?: number
  head?: { tilt?: number; turn?: number; nod?: number }
  look?: number
  mood?: 'smile' | 'open' | 'flat'
  right: Arm
  left: Arm
  color: number
}
export type Prop = { kind: 'heart' | 'spark' | 'arrow'; x: number; y: number; z?: number; s?: number; rot?: number }
export interface Rig {
  figures: Figure[]
  props?: Prop[]
}

const PINK = 0xff7eb6
const BLUE = 0x7cc4ff
const LILAC = 0xb99bff
const rest: Arm = { up: 8, fwd: 0, bend: 10, hand: 'open' }

export const rigs: Rig[] = [
  {
    figures: [
      {
        x: 0,
        head: { tilt: 10 },
        right: { up: 18, fwd: 68, bend: 112, hand: 'peace' },
        left: { up: 18, fwd: 68, bend: 112, hand: 'peace' },
        color: PINK,
      },
    ],
  },
  {
    figures: [
      {
        x: -0.3,
        lean: -6,
        head: { tilt: -8 },
        right: rest,
        left: { up: 168, fwd: 8, twist: 90, bend: 62, hand: 'open' },
        color: PINK,
      },
      {
        x: 0.3,
        lean: 6,
        head: { tilt: 8 },
        right: { up: 168, fwd: 8, twist: 90, bend: 62, hand: 'open' },
        left: rest,
        color: BLUE,
      },
    ],
    props: [{ kind: 'heart', x: 0, y: 1.32, s: 1.1 }],
  },
  {
    figures: [
      {
        x: 0,
        turn: 55,
        head: { turn: -42, nod: 12 },
        mood: 'flat',
        right: { up: 6, fwd: 0, bend: 6, hand: 'fist' },
        left: { up: 6, fwd: 0, bend: 6, hand: 'fist' },
        color: LILAC,
      },
    ],
  },
  {
    figures: [
      {
        x: 0,
        mood: 'open',
        head: { tilt: -6 },
        right: rest,
        left: { up: 24, fwd: 96, bend: 30, hand: 'open' },
        color: BLUE,
      },
    ],
    props: [
      { kind: 'spark', x: 0.42, y: 0.92, s: 0.7 },
      { kind: 'spark', x: 0.5, y: 0.7, s: 0.5 },
    ],
  },
  {
    figures: [
      {
        x: 0,
        head: { tilt: -8 },
        right: rest,
        left: { up: 22, fwd: 66, bend: 118, hand: 'fist' },
        color: PINK,
      },
    ],
    props: [{ kind: 'heart', x: 0.26, y: 0.98, z: 0.3, s: 0.45 }],
  },
  {
    figures: [
      {
        x: 0,
        right: { up: -6, fwd: 60, bend: 92, hand: 'ell' },
        left: { up: 120, fwd: 30, twist: -90, bend: 95, hand: 'ell' },
        color: LILAC,
      },
    ],
  },
  {
    figures: [
      { x: -0.26, turn: -70, head: { turn: 55 }, right: rest, left: rest, color: PINK },
      { x: 0.26, turn: 70, head: { turn: -55 }, right: rest, left: rest, color: BLUE },
    ],
    props: [
      { kind: 'arrow', x: -0.72, y: 0.6, rot: 180 },
      { kind: 'arrow', x: 0.72, y: 0.6 },
    ],
  },
  {
    figures: [
      { x: -0.3, head: { turn: 6 }, look: 1, mood: 'flat', right: rest, left: rest, color: PINK },
      { x: 0.3, head: { turn: -6 }, look: -1, mood: 'flat', right: rest, left: rest, color: BLUE },
    ],
  },
  {
    figures: [
      {
        x: 0,
        head: { tilt: 6 },
        right: { up: -22, fwd: 58, bend: 98, hand: 'open' },
        left: { up: -22, fwd: 58, bend: 98, hand: 'open' },
        color: PINK,
      },
    ],
    props: [
      { kind: 'spark', x: -0.24, y: 0.66, z: 0.25, s: 0.45 },
      { kind: 'spark', x: 0.24, y: 0.66, z: 0.25, s: 0.45 },
    ],
  },
  {
    figures: [{ x: 0, mood: 'open', right: rest, left: rest, color: LILAC }],
    props: [{ kind: 'spark', x: 0.34, y: 1.06, s: 0.6 }],
  },
  {
    figures: [
      { x: -0.25, lean: 10, head: { tilt: 16 }, right: rest, left: rest, color: PINK },
      { x: 0.25, lean: -10, head: { tilt: -16 }, right: rest, left: rest, color: BLUE },
    ],
    props: [
      { kind: 'arrow', x: -0.66, y: 0.5 },
      { kind: 'arrow', x: 0.66, y: 0.5, rot: 180 },
    ],
  },
  {
    figures: [
      {
        x: 0,
        bow: 10,
        mood: 'open',
        right: { up: -16, fwd: 56, bend: 104, hand: 'fist' },
        left: { up: -16, fwd: 56, bend: 104, hand: 'fist' },
        color: BLUE,
      },
    ],
  },
]

const D = THREE.MathUtils.degToRad
const SHOULDER_Y = 0.56
const UPPER = 0.27
const FORE = 0.25

interface ArmParts {
  shoulder: THREE.Group
  twist: THREE.Group
  elbow: THREE.Group
  hands: Record<NonNullable<Arm['hand']>, THREE.Object3D>
}
interface Built {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  pupils: THREE.Mesh[]
  mouths: Record<NonNullable<Figure['mood']>, THREE.Object3D>
  right: ArmParts
  left: ArmParts
  shirt: THREE.MeshStandardMaterial
}

const ink = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5 })
const skinTone = new THREE.MeshStandardMaterial({ color: 0xffe2cf, roughness: 0.6 })
const hairMat = new THREE.MeshStandardMaterial({ color: 0x2a2233, roughness: 0.45, metalness: 0.1 })
const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff9db8, roughness: 0.8 })

function capsule(r: number, len: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), mat)
  m.position.y = -len / 2
  return m
}

function buildHand(kind: NonNullable<Arm['hand']>) {
  const g = new THREE.Group()
  g.position.y = -FORE - 0.02
  const palm = new THREE.Mesh(new THREE.SphereGeometry(kind === 'fist' ? 0.058 : 0.052, 14, 10), skinTone)
  palm.scale.set(1, kind === 'open' ? 1.25 : 1, 0.7)
  g.add(palm)
  const finger = (angle: number, len: number) => {
    const f = new THREE.Group()
    f.rotation.z = D(angle)
    const c = capsule(0.016, len, skinTone)
    c.position.y -= 0.04
    f.add(c)
    g.add(f)
  }
  if (kind === 'peace') {
    finger(14, 0.08)
    finger(-14, 0.08)
  } else if (kind === 'ell') {
    finger(0, 0.08)
    finger(90, 0.06)
  } else if (kind === 'open') {
    for (const a of [-24, -8, 8, 24]) finger(a, 0.05)
  }
  return g
}

function buildArm(side: 1 | -1, mat: THREE.Material): ArmParts {
  const shoulder = new THREE.Group()
  shoulder.position.set(side * 0.21, SHOULDER_Y, 0)
  const twist = new THREE.Group()
  shoulder.add(twist)
  twist.add(capsule(0.052, UPPER, mat))
  const elbow = new THREE.Group()
  elbow.position.y = -UPPER
  twist.add(elbow)
  elbow.add(capsule(0.045, FORE, skinTone))
  const hands = {
    open: buildHand('open'),
    fist: buildHand('fist'),
    peace: buildHand('peace'),
    ell: buildHand('ell'),
  }
  for (const h of Object.values(hands)) elbow.add(h)
  return { shoulder, twist, elbow, hands }
}

function buildFigure(color: number): Built {
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 })
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.3, 8, 20), shirt)
  torso.scale.set(1.12, 1, 0.72)
  torso.position.y = 0.33
  body.add(torso)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 12), skinTone)
  neck.position.y = 0.66
  body.add(neck)

  const head = new THREE.Group()
  head.position.y = 0.72
  body.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.135, 28, 20), skinTone)
  skull.scale.set(0.95, 1.06, 0.98)
  skull.position.y = 0.11
  head.add(skull)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat)
  hair.position.y = 0.125
  hair.rotation.x = D(-18)
  head.add(hair)
  const pupils: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), ink)
    eye.position.set(s * 0.048, 0.12, 0.125)
    head.add(eye)
    pupils.push(eye)
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), cheekMat)
    cheek.scale.set(1.3, 0.7, 0.4)
    cheek.position.set(s * 0.078, 0.075, 0.115)
    head.add(cheek)
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 16, Math.PI), ink)
  smile.rotation.z = Math.PI
  smile.position.set(0, 0.07, 0.128)
  const open = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), ink)
  open.scale.set(0.9, 1.15, 0.4)
  open.position.set(0, 0.055, 0.128)
  const flat = new THREE.Mesh(new THREE.CapsuleGeometry(0.007, 0.04, 4, 6), ink)
  flat.rotation.z = Math.PI / 2
  flat.position.set(0, 0.06, 0.13)
  const mouths = { smile, open, flat }
  for (const m of Object.values(mouths)) head.add(m)

  const right = buildArm(-1, shirt)
  const left = buildArm(1, shirt)
  body.add(right.shoulder, left.shoulder)
  return { root, body, head, pupils, mouths, right, left, shirt }
}

function heartShape() {
  const s = new THREE.Shape()
  s.moveTo(0, -0.1)
  s.bezierCurveTo(-0.02, -0.08, -0.12, -0.02, -0.12, 0.04)
  s.bezierCurveTo(-0.12, 0.1, -0.05, 0.12, 0, 0.07)
  s.bezierCurveTo(0.05, 0.12, 0.12, 0.1, 0.12, 0.04)
  s.bezierCurveTo(0.12, -0.02, 0.02, -0.08, 0, -0.1)
  return s
}

function buildProp(p: Prop) {
  let mesh: THREE.Object3D
  if (p.kind === 'heart') {
    mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(heartShape(), {
        depth: 0.04,
        bevelEnabled: true,
        bevelSize: 0.012,
        bevelThickness: 0.012,
      }),
      new THREE.MeshStandardMaterial({ color: 0xff3d8b, roughness: 0.25, metalness: 0.2, emissive: 0x5a0024 }),
    )
  } else if (p.kind === 'spark') {
    const s = new THREE.Shape()
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 0.03 : 0.11
      const a = (i / 8) * Math.PI * 2 + Math.PI / 2
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.3, emissive: 0x6a5200 }),
    )
  } else {
    const g = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5 })
    const shaft = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.16, 4, 8), mat)
    shaft.rotation.z = Math.PI / 2
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.09, 12), mat)
    tip.rotation.z = -Math.PI / 2
    tip.position.x = 0.12
    g.add(shaft, tip)
    mesh = g
  }
  mesh.position.set(p.x, p.y, p.z ?? 0)
  mesh.scale.setScalar(p.s ?? 1)
  mesh.rotation.z = D(p.rot ?? 0)
  return mesh
}

export class MannequinScene {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 20)
  private turntable = new THREE.Group()
  private figures: Built[] = []
  private props = new THREE.Group()
  private target: Rig = rigs[0]!
  settled = false

  constructor() {
    this.camera.position.set(0, 0.62, 3.1)
    this.camera.lookAt(0, 0.6, 0)
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c8ff, 2.2))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(1.5, 2.5, 3)
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.2)
    rim.position.set(-2, 1.5, -2)
    this.scene.add(key, rim, this.turntable)
    this.turntable.add(this.props)
    for (let i = 0; i < 2; i++) {
      const f = buildFigure(PINK)
      this.figures.push(f)
      this.turntable.add(f.root)
    }
  }

  set spin(deg: number) {
    this.turntable.rotation.y = D(deg)
  }

  pose(index: number, instant = false) {
    this.target = rigs[index % rigs.length]!
    this.props.clear()
    for (const p of this.target.props ?? []) this.props.add(buildProp(p))
    this.figures.forEach((f, i) => {
      const spec = this.target.figures[i]
      f.root.visible = Boolean(spec)
      if (!spec) return
      f.shirt.color.setHex(spec.color)
      for (const [k, m] of Object.entries(f.mouths)) m.visible = k === (spec.mood ?? 'smile')
      for (const side of ['right', 'left'] as const)
        for (const [k, h] of Object.entries(f[side].hands)) h.visible = k === (spec[side].hand ?? 'open')
    })
    const wide = this.target.figures.length > 1
    this.camera.position.set(0, 0.72, wide ? 3.0 : 2.45)
    this.camera.lookAt(0, 0.7, 0)
    this.settled = false
    if (instant) this.step(1)
  }

  mood(mood: NonNullable<Figure['mood']>) {
    for (const f of this.figures) for (const [k, m] of Object.entries(f.mouths)) m.visible = k === mood
  }

  step(amount = 0.16) {
    let moving = 0
    const ease = (obj: THREE.Object3D, axis: 'x' | 'y' | 'z', to: number) => {
      const d = to - obj.rotation[axis]
      obj.rotation[axis] += d * amount
      moving += Math.abs(d)
    }
    const easePos = (obj: THREE.Object3D, to: number) => {
      const d = to - obj.position.x
      obj.position.x += d * amount
      moving += Math.abs(d)
    }
    this.figures.forEach((f, i) => {
      const spec = this.target.figures[i]
      if (!spec) return
      easePos(f.root, spec.x)
      ease(f.root, 'y', D(spec.turn ?? 0))
      ease(f.body, 'z', D(-(spec.lean ?? 0)))
      ease(f.body, 'x', D(spec.bow ?? 0))
      ease(f.head, 'z', D(-(spec.head?.tilt ?? 0)))
      ease(f.head, 'y', D(spec.head?.turn ?? 0))
      ease(f.head, 'x', D(spec.head?.nod ?? 0))
      for (const p of f.pupils) {
        const d = 0.048 * Math.sign(p.position.x)
        const to = d + (spec.look ?? 0) * 0.022
        p.position.x += (to - p.position.x) * amount
      }
      for (const side of ['right', 'left'] as const) {
        const arm = spec[side]
        const s = side === 'left' ? 1 : -1
        const parts = f[side]
        ease(parts.shoulder, 'z', D(s * arm.up))
        ease(parts.shoulder, 'x', D(-arm.fwd))
        ease(parts.twist, 'y', D(-s * (arm.twist ?? 0)))
        ease(parts.elbow, 'x', D(-arm.bend))
      }
    })
    this.settled = moving < 0.002
    return !this.settled
  }
}

let shared: { renderer: THREE.WebGLRenderer; stage: MannequinScene } | null | undefined
const stills = new Map<number, Promise<string>>()

export function poseStill(index: number): Promise<string> {
  const hit = stills.get(index)
  if (hit) return hit
  const job = new Promise<string>((resolve, reject) => {
    if (shared === undefined) {
      try {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
        renderer.setPixelRatio(1)
        renderer.setSize(480, 360, false)
        renderer.outputColorSpace = THREE.SRGBColorSpace
        shared = { renderer, stage: new MannequinScene() }
      } catch {
        shared = null
      }
    }
    if (!shared) return reject(new Error('WebGL unavailable'))
    const { renderer, stage } = shared
    stage.pose(index, true)
    stage.spin = -14
    renderer.render(stage.scene, stage.camera)
    renderer.domElement.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('No image'))))
  })
  stills.set(index, job)
  job.catch(() => stills.delete(index))
  return job
}
