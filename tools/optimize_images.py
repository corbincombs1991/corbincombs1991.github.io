"""Create modern, web-sized derivatives while retaining JPEG fallbacks."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "img"


def save_webp(source: str, destination: str, size: tuple[int, int] | None = None) -> None:
    with Image.open(IMAGE_DIR / source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        if size:
            image.thumbnail(size, Image.Resampling.LANCZOS)
        image.save(IMAGE_DIR / destination, "WEBP", quality=82, method=6)


if __name__ == "__main__":
    save_webp("hero-band.jpg", "hero-band.webp")
    save_webp("corbin-portrait.jpg", "corbin-portrait.webp")
    save_webp("photo-1.jpg", "photo-1.webp")
    save_webp("photo-2.jpg", "photo-2.webp")
    save_webp("rip-wade-boggs-thumb.jpg", "rip-wade-boggs-thumb-640.webp", (640, 360))
