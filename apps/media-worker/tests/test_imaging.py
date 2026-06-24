import io

from PIL import Image

from src.media_worker.imaging import render_variant


def _jpeg(w: int, h: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 40, 200)).save(buf, format="JPEG")
    return buf.getvalue()


def test_downscales_within_box_preserving_aspect() -> None:
    out = render_variant(_jpeg(4000, 2000), 320)
    assert max(out.width, out.height) == 320
    assert (out.width, out.height) == (320, 160)
    assert out.content_type == "image/jpeg"


def test_does_not_upscale_small_images() -> None:
    out = render_variant(_jpeg(100, 50), 320)
    assert (out.width, out.height) == (100, 50)


def test_strips_exif_from_output() -> None:
    out = render_variant(_jpeg(800, 600), 320)
    assert Image.open(io.BytesIO(out.data)).getexif() == Image.Exif()  # empty
