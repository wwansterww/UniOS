"""Draws the app icon (white Narxoz "X" on a Narxoz-red tile) as PNGs. Run: python3 scripts/make-icons.py public"""
import struct, zlib, math, sys, os

OUTER = (142, 12, 37)   # deep Narxoz red
TILE = (196, 18, 51)    # Narxoz red #C41233
WHITE = (255, 255, 255)

def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - ax - t * dx, py - ay - t * dy)

def icon(size, maskable=False):
    px = bytearray()
    pad = size * (0.16 if maskable else 0.06)
    r = size * 0.2
    w = size - 2 * pad
    # bold "\" and a thin, slightly curved "/" — the Narxoz X
    a = (pad + w * 0.29, pad + w * 0.2, pad + w * 0.71, pad + w * 0.8, w * 0.095)
    # quadratic curve from top-right to bottom-left, bowing outward
    p0, p1, p2 = (pad + w * 0.74, pad + w * 0.2), (pad + w * 0.42, pad + w * 0.42), (pad + w * 0.27, pad + w * 0.8)
    pts = [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in [i / 16 for i in range(17)]]
    thin = w * 0.03
    for y in range(size):
        px.append(0)
        for x in range(size):
            fx, fy = x + .5, y + .5
            c = OUTER
            cx = min(max(fx, pad + r), size - pad - r); cy = min(max(fy, pad + r), size - pad - r)
            if pad <= fx <= size - pad and pad <= fy <= size - pad and math.hypot(fx - cx, fy - cy) <= r:
                c = TILE
                if seg_dist(fx, fy, *a[:4]) <= a[4] or any(seg_dist(fx, fy, *pts[i], *pts[i + 1]) <= thin for i in range(16)):
                    c = WHITE
            px.extend(c)
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(px), 9)) + chunk(b"IEND", b"")

out = sys.argv[1] if len(sys.argv) > 1 else "public"
for name, size, m in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)]:
    open(os.path.join(out, name), "wb").write(icon(size, m))
print("ok")
