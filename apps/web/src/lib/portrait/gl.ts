export const VERT = `#version 300 es
in vec2 p;
out vec2 uv;
void main() { uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`

export interface Target {
  tex: WebGLTexture
  fbo: WebGLFramebuffer
  w: number
  h: number
}

export class GL {
  readonly gl: WebGL2RenderingContext
  readonly float: boolean
  private quad: WebGLBuffer
  private programs = new Map<string, { prog: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> }>()

  constructor(
    readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    attrs: WebGLContextAttributes = {},
  ) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      depth: false,
      ...attrs,
    }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 unavailable')
    this.gl = gl
    this.float = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  }

  program(name: string, frag: string) {
    const cached = this.programs.get(name)
    if (cached) return cached
    const { gl } = this
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${name}: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(prog, 0, 'p')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(prog)}`)
    const entry = { prog, uniforms: new Map<string, WebGLUniformLocation | null>() }
    this.programs.set(name, entry)
    return entry
  }

  texture(filter: number = this.gl.LINEAR) {
    const { gl } = this
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return tex
  }

  target(w: number, h: number): Target {
    const { gl } = this
    const tex = this.texture()
    if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { tex, fbo, w, h }
  }

  pass(
    name: string,
    frag: string,
    out: Target | null,
    textures: Record<string, WebGLTexture>,
    uniforms: Record<string, number | number[]> = {},
  ) {
    const { gl } = this
    const p = this.program(name, frag)
    gl.useProgram(p.prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, out?.fbo ?? null)
    gl.viewport(0, 0, out?.w ?? gl.drawingBufferWidth, out?.h ?? gl.drawingBufferHeight)
    const loc = (n: string) => {
      if (!p.uniforms.has(n)) p.uniforms.set(n, gl.getUniformLocation(p.prog, n))
      return p.uniforms.get(n) ?? null
    }
    Object.entries(textures).forEach(([n, tex], i) => {
      gl.activeTexture(gl.TEXTURE0 + i)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(loc(n), i)
    })
    for (const [n, v] of Object.entries(uniforms)) {
      const l = loc(n)
      if (typeof v === 'number') gl.uniform1f(l, v)
      else if (v.length === 2) gl.uniform2fv(l, v)
      else if (v.length === 3) gl.uniform3fv(l, v)
      else gl.uniform4fv(l, v)
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  upload(tex: WebGLTexture, source: TexImageSource) {
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  uploadMask(tex: WebGLTexture, data: Uint8Array, w: number, h: number) {
    const { gl } = this
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data)
  }
}
