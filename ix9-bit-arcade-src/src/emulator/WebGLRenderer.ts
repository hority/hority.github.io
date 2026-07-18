const WIDTH = 256;
const HEIGHT = 240;

const vertexSource = `#version 300 es
in vec2 aPosition;
in vec2 aTexCoord;
out vec2 vTexCoord;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
  vTexCoord = aTexCoord;
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform float uTime;
in vec2 vTexCoord;
out vec4 outColor;

void main() {
  vec2 centered = vTexCoord * 2.0 - 1.0;
  float radius = dot(centered, centered);
  vec2 curved = centered * (1.0 + radius * 0.014);
  vec2 uv = curved * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outColor = vec4(0.005, 0.008, 0.01, 1.0);
    return;
  }
  vec3 color = texture(uFrame, uv).rgb;
  float scanline = 0.94 + 0.06 * sin(uv.y * 240.0 * 3.14159265);
  float grille = 0.985 + 0.015 * sin(uv.x * 256.0 * 3.14159265 + uTime * 0.3);
  float vignette = 1.0 - smoothstep(0.62, 1.35, radius) * 0.22;
  color *= scanline * grille * vignette;
  color = pow(color, vec3(0.92));
  outColor = vec4(color, 1.0);
}`;

export class WebGLRenderer {
  readonly contextName = 'WEBGL2';
  private readonly gl: WebGL2RenderingContext;
  private readonly texture: WebGLTexture;
  private readonly timeLocation: WebGLUniformLocation | null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2を初期化できませんでした。対応ブラウザでお試しください。');
    this.gl = gl;
    const program = this.createProgram(vertexSource, fragmentSource);
    gl.useProgram(program);

    const vertices = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
      -1,  1, 0, 0,
       1, -1, 1, 1,
       1,  1, 1, 0,
    ]);
    const buffer = gl.createBuffer();
    if (!buffer) throw new Error('WebGLバッファを作成できませんでした。');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const position = gl.getAttribLocation(program, 'aPosition');
    const texCoord = gl.getAttribLocation(program, 'aTexCoord');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(texCoord);
    gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    const texture = gl.createTexture();
    if (!texture) throw new Error('WebGLテクスチャを作成できませんでした。');
    this.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.uniform1i(gl.getUniformLocation(program, 'uFrame'), 0);
    this.timeLocation = gl.getUniformLocation(program, 'uTime');
    this.resize();
  }

  render(frame: Uint8Array, time = performance.now()): void {
    const { gl } = this;
    if (this.canvas.width !== this.canvas.clientWidth * devicePixelRatio || this.canvas.height !== this.canvas.clientHeight * devicePixelRatio) {
      this.resize();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, WIDTH, HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
    gl.uniform1f(this.timeLocation, time / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  clear(): void {
    this.gl.clearColor(0.005, 0.008, 0.01, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  private resize(): void {
    const width = Math.max(1, Math.round(this.canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * devicePixelRatio));
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  private compile(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('WebGLシェーダーを作成できませんでした。');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) ?? 'WebGLシェーダーのコンパイルに失敗しました。');
    }
    return shader;
  }

  private createProgram(vertex: string, fragment: string): WebGLProgram {
    const program = this.gl.createProgram();
    if (!program) throw new Error('WebGLプログラムを作成できませんでした。');
    this.gl.attachShader(program, this.compile(this.gl.VERTEX_SHADER, vertex));
    this.gl.attachShader(program, this.compile(this.gl.FRAGMENT_SHADER, fragment));
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program) ?? 'WebGLプログラムのリンクに失敗しました。');
    }
    return program;
  }
}
