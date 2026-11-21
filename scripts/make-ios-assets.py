# iOS のアプリアイコンと起動画面を、Web/Android と同じ public/icon.svg の図形から作る。
# 外部サービス・追加パッケージは使わない（Pillow だけ）。図形を変えたら icon.svg と同じ座標に直す。
#   python scripts/make-ios-assets.py
# 出力：
#   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  1024x1024・透過なし（角丸は iOS が付ける）
#   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png 2732x2732・背景 #F5F7FB の中央にアイコン
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "ios" / "App" / "App" / "Assets.xcassets"
SS = 4  # なめらかにするため4倍で描いて縮める


def draw_icon(size: int, rounded: bool) -> Image.Image:
    """icon.svg（viewBox 512）を size px で描く。rounded=False なら背景は角丸なしの正方形"""
    big = size * SS
    k = big / 512
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def box(x, y, w, h):
        return [x * k, y * k, (x + w) * k, (y + h) * k]

    if rounded:
        d.rounded_rectangle(box(0, 0, 512, 512), radius=96 * k, fill="#2563eb")
    else:
        d.rectangle(box(0, 0, 512, 512), fill="#2563eb")
    d.ellipse(box(164 - 54, 164 - 54, 108, 108), fill="#dcfce7")
    d.rounded_rectangle(box(208, 126, 158, 76), radius=38 * k, fill="#ffffff")
    d.rounded_rectangle(box(112, 246, 288, 44), radius=22 * k, fill="#ffffff")
    d.rounded_rectangle(box(112, 322, 224, 44), radius=22 * k, fill="#dbeafe")

    # チェックの線（stroke-width 28・角と端は丸）
    pts = [(146, 168), (176, 198), (240, 120)]
    w = 28 * k
    d.line([(x * k, y * k) for x, y in pts], fill="#15803d", width=round(w), joint="curve")
    r = w / 2
    for x, y in pts:
        d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill="#15803d")

    return im.resize((size, size), Image.LANCZOS)


def main() -> None:
    # アプリアイコン：App Store は透過（アルファ）付きの 1024 を受け付けないので RGB にする
    icon = draw_icon(1024, rounded=False).convert("RGB")
    icon.save(ASSETS / "AppIcon.appiconset" / "AppIcon-512@2x.png", optimize=True)

    # 起動画面：Web/Android の背景色に、角丸のアイコンを中央に置く（scaleAspectFill で端が切れても中央は残る）
    canvas = Image.new("RGB", (2732, 2732), "#F5F7FB")
    mark = draw_icon(560, rounded=True)
    off = (2732 - 560) // 2
    canvas.paste(mark, (off, off), mark)
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        canvas.save(ASSETS / "Splash.imageset" / name, optimize=True)

    print("ok: AppIcon 1024 RGB / Splash 2732 x3")


if __name__ == "__main__":
    main()
