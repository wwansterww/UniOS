"""Draws the app icon (the official white Narxoz "X" on a Narxoz-red tile) as PNGs. Run: python3 scripts/make-icons.py public"""
import struct, zlib, sys, os

TILE = (196, 18, 51)    # Narxoz red #C41233
WHITE = (255, 255, 255)

# The X glyph from the university's vector logo (components/logo.tsx X_PATH): a polygon, straight edges only.
X = [(429.8, 123.9), (376.1, 43.7), (405.4, 43.7), (444.9, 104.8), (469, 67.9), (497.5, 67.9), (459.4, 123.5),
     (533.3, 232.8), (504, 232.8), (444.2, 142.7), (418.5, 181.8), (390.1, 181.8)]
BOX = (376.1, 43.7, 157.2, 189.1)
SS = 4  # supersampling per axis


def coverage(size, scale, ox, oy):
    """Fraction of each pixel covered by the X, via even-odd scanlines on a supersampled grid."""
    pts = [(ox + (x - BOX[0]) * scale, oy + (y - BOX[1]) * scale) for x, y in X]
    edges = list(zip(pts, pts[1:] + pts[:1]))
    cov = [[0.0] * size for _ in range(size)]
    for sy in range(size * SS):
        y = (sy + 0.5) / SS
        xs = sorted(ax + (y - ay) * (bx - ax) / (by - ay) for (ax, ay), (bx, by) in edges if (ay <= y < by) or (by <= y < ay))
        row = cov[sy // SS]
        for a, b in zip(xs[::2], xs[1::2]):
            for sx in range(max(0, int(a * SS)), min(size * SS, int(b * SS) + 1)):
                if a <= (sx + 0.5) / SS < b:
                    row[sx // SS] += 1 / (SS * SS)
    return cov


def icon(size, maskable=False, rounded=True):
    # The glyph fills ~62% of the tile height (less for maskable icons, which get cropped to a circle).
    h = size * (0.5 if maskable else 0.62)
    scale = h / BOX[3]
    ox, oy = (size - BOX[2] * scale) / 2, (size - h) / 2
    cov = coverage(size, scale, ox, oy)
    r = 0 if maskable or not rounded else size * 0.22
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            # rounded tile: transparent outside the corner radius
            cx = min(max(x + 0.5, r), size - r)
            cy = min(max(y + 0.5, r), size - r)
            inside = r == 0 or (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r
            c = cov[y][x]
            col = [round(TILE[i] * (1 - c) + WHITE[i] * c) for i in range(3)]
            raw += bytes(col + [255 if inside else 0])
    return png(size, raw)


def png(size, raw):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "public"
    for name, size, maskable in [("icon-192.png", 192, False), ("icon-512.png", 512, False), ("icon-maskable-512.png", 512, True)]:
        with open(os.path.join(out, name), "wb") as f:
            f.write(icon(size, maskable))
        print("wrote", name)
    # Apple adds its own rounded corners: give it a full square tile.
    with open(os.path.join(out, "apple-icon.png"), "wb") as f:
        f.write(icon(180, rounded=False))
    print("wrote apple-icon.png")
