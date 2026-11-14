"""アプリのアイコン（PWA・ホーム画面用）を生成する。
   python3 scripts/generate-icons.py
緑の背景に白いボールと赤い縫い目。maskable 用は端を切り取られても良いよう、ボールを小さめにする。
出力：public/icons/（icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-32.png）
"""
import math
import os

from PIL import Image, ImageDraw

BG = (20, 83, 45)  # 深い緑
BALL = (250, 250, 247)
STITCH = (200, 32, 46)
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')


def draw_icon(size: int, ball_ratio: float, rounded: bool = False) -> Image.Image:
    scale = 4  # アンチエイリアスのため大きく描いて縮小する
    s = size * scale
    img = Image.new('RGBA', (s, s), BG + (255,))
    r = s * ball_ratio / 2
    cx = cy = s / 2
    ball_box = [cx - r, cy - r, cx + r, cy + r]
    ImageDraw.Draw(img).ellipse(ball_box, fill=BALL)

    # 縫い目は別のレイヤーに描き、ボールの円で切り抜いて重ねる（はみ出さないように）
    seams = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(seams)
    w = max(2, int(r * 0.05))
    for side in (-1, 1):
        ox = cx + side * r * 1.25  # 弧の中心はボールの外側
        rr = r * 0.85
        d.ellipse([ox - rr, cy - rr, ox + rr, cy + rr], outline=STITCH, width=w)
        # 縫い目の短い線：弧を斜めに横切る短い線（左右で向きを反転）
        for t in range(-4, 5):
            ang = math.radians((0 if side == -1 else 180) + t * 11)
            px = ox + rr * math.cos(ang)
            py = cy + rr * math.sin(ang)
            tilt = math.radians(35 * side)
            dx = math.cos(ang + tilt)
            dy = math.sin(ang + tilt)
            L = r * 0.07
            d.line([px - dx * L, py - dy * L, px + dx * L, py + dy * L], fill=STITCH, width=max(1, int(w * 0.6)))
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse(ball_box, fill=255)
    img.paste(seams, (0, 0), Image.composite(seams.getchannel('A'), Image.new('L', (s, s), 0), mask))

    img = img.resize((size, size), Image.LANCZOS)
    if rounded:
        rmask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(rmask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.18, fill=255)
        img.putalpha(rmask)
    return img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    draw_icon(192, 0.72).save(os.path.join(OUT, 'icon-192.png'))
    draw_icon(512, 0.72).save(os.path.join(OUT, 'icon-512.png'))
    # maskable：重要な部分を中央80%の円に収める
    draw_icon(512, 0.56).save(os.path.join(OUT, 'icon-maskable-512.png'))
    # iOS のホーム画面（透過なし。角丸は iOS が付ける）
    draw_icon(180, 0.72).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
    draw_icon(32, 0.8, rounded=True).save(os.path.join(OUT, 'favicon-32.png'))


if __name__ == '__main__':
    main()
