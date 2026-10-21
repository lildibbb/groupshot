"""
Generates Groupshot's texture assets into public/textures.

  pearl.webp    tileable pearl sheen: near-white with a faint, shifting iridescence
  grain.png     tileable photographic grain (alpha only), laid over paper surfaces
  softbox.webp  equirectangular studio for the 3D chrome logo to reflect: dark room, big softboxes
  bulb.webp     one vanity-mirror bulb, warm core and glow, for the booth frame

Run: python3 apps/web/scripts/generate-assets.py
"""

from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "textures"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def tileable_field(size: int, waves: int = 9) -> np.ndarray:
    """Sum of random integer-frequency waves, so the field tiles seamlessly."""
    y, x = np.mgrid[0:size, 0:size] / size * 2 * np.pi
    field = np.zeros((size, size))
    for _ in range(waves):
        fx, fy = rng.integers(1, 4, 2)
        phase = rng.uniform(0, 2 * np.pi)
        field += np.sin(fx * x + fy * y + phase) / (fx + fy)
    field -= field.min()
    return field / field.max()


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    choices = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]
    rgb = np.zeros(h.shape + (3,))
    for k, (r, g, b) in enumerate(choices):
        m = i == k
        rgb[m] = np.stack([r[m], g[m], b[m]], -1)
    return rgb


def pearl(size=1024):
    hue = 0.55 + tileable_field(size) * 0.37  # sky -> lilac -> pink, never yellow or green
    sat = 0.03 + 0.05 * tileable_field(size, 5)
    val = 0.965 + 0.035 * tileable_field(size, 6)
    rgb = hsv_to_rgb(hue, sat, val)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(OUT / "pearl.webp", quality=88)


def grain(size=256):
    noise = rng.normal(0.5, 0.5, (size, size)).clip(0, 1)
    alpha = (np.abs(noise - 0.5) * 2) ** 1.6 * 30  # mostly clear, sparse darker specks
    img = np.zeros((size, size, 4), np.uint8)
    img[..., :3] = 18
    img[..., 3] = alpha.clip(0, 255).astype(np.uint8)
    Image.fromarray(img, "RGBA").save(OUT / "grain.png", optimize=True)


def softbox(w=1024, h=512):
    """A bright white studio: pale walls, huge softboxes, and a few dark flags so chrome has contrast."""
    y, x = np.mgrid[0:h, 0:w]
    u, v = x / w, y / h
    img = np.full((h, w, 3), 0.62)
    img += (1 - v)[..., None] * 0.12  # brighter ceiling
    img[v > 0.6] = 0.78  # white floor sweep

    def box(cx, cy, bw, bh, power):
        d = np.maximum(np.abs(u - cx) / bw, np.abs(v - cy) / bh)
        return np.clip((1.15 - d) * 4, 0, 1)[..., None] * power

    img += box(0.25, 0.32, 0.09, 0.16, 1.4)
    img += box(0.72, 0.30, 0.11, 0.14, 1.2)
    img += box(0.5, 0.06, 0.32, 0.05, 0.8)
    # dark flags (black cards) give the metal its crisp reflections
    img -= box(0.47, 0.42, 0.03, 0.22, 0.75)
    img -= box(0.04, 0.5, 0.03, 0.3, 0.6)
    img -= box(0.88, 0.52, 0.02, 0.28, 0.5)
    # pearl tint: cool on one side, faintly pink on the other
    img[..., 2] += (u < 0.5) * 0.04
    img[..., 0] += (u >= 0.5) * 0.03
    Image.fromarray((img.clip(0, 1) * 255).astype(np.uint8)).save(OUT / "softbox.webp", quality=90)


def bulb(size=96):
    y, x = (np.mgrid[0:size, 0:size] - size / 2 + 0.5) / (size / 2)
    r = np.sqrt(x**2 + y**2)
    core = np.clip(1 - r / 0.32, 0, 1) ** 0.6
    glow = np.exp(-(r**2) / 0.18) * 0.85
    a = np.clip(core + glow, 0, 1)
    img = np.zeros((size, size, 4))
    img[..., 0] = 1.0
    img[..., 1] = 0.94 + 0.06 * core
    img[..., 2] = 0.82 + 0.18 * core
    img[..., 3] = a
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(OUT / "bulb.webp", quality=90)


if __name__ == "__main__":
    pearl()
    grain()
    softbox()
    bulb()
    for f in sorted(OUT.iterdir()):
        print(f.name, f.stat().st_size)
