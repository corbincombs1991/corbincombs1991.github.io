"""Generate the PNG favicon and touch-icon set from the site's CC mark."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "icons"
FONT_CANDIDATES = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
)


def font_for(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, round(size * 0.40))
    return ImageFont.load_default()


def generate(size: int, name: str) -> None:
    image = Image.new("RGB", (size, size), "#060a08")
    draw = ImageDraw.Draw(image)
    radius = round(size * 0.22)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill="#060a08")

    font = font_for(size)
    main = "CC"
    dot = "."
    main_box = draw.textbbox((0, 0), main, font=font)
    dot_box = draw.textbbox((0, 0), dot, font=font)
    total_width = (main_box[2] - main_box[0]) + (dot_box[2] - dot_box[0])
    x = (size - total_width) / 2
    y = (size - (main_box[3] - main_box[1])) / 2 - main_box[1]
    draw.text((x, y), main, font=font, fill="#eef0f4")
    draw.text((x + main_box[2] - main_box[0], y), dot, font=font, fill="#52ff93")
    image.save(OUTPUT / name, optimize=True)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for icon_size, filename in (
        (32, "favicon-32.png"),
        (180, "apple-touch-icon.png"),
        (192, "favicon-192.png"),
        (512, "favicon-512.png"),
    ):
        generate(icon_size, filename)
