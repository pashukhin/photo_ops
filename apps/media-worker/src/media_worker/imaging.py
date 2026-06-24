"""Image rendering pipeline: orient, fit, strip metadata, encode as JPEG."""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps

RENDITIONS: dict[str, int] = {"thumbnail": 320, "preview": 1600}


@dataclass
class RenderedVariant:
    data: bytes
    width: int
    height: int
    content_type: str


def render_variant(original: bytes, box: int) -> RenderedVariant:
    """Render a single display variant from raw image bytes.

    Steps:
    1. Open format-agnostically via Pillow.
    2. Bake EXIF orientation into pixels (exif_transpose).
    3. Convert to RGB (JPEG-safe; handles palette/RGBA/CMYK).
    4. Fit within box×box, never upscaling (thumbnail preserves aspect).
    5. Re-encode as JPEG q=82 with no EXIF metadata.

    Returns oriented, post-resize dimensions.
    """
    img: Image.Image = Image.open(io.BytesIO(original))
    # exif_transpose returns None on older Pillow when there is no orientation
    # tag; `or img` keeps the original in that case.
    img = ImageOps.exif_transpose(img) or img
    img = img.convert("RGB")
    img.thumbnail((box, box))

    out_buf = io.BytesIO()
    img.save(out_buf, format="JPEG", quality=82)
    return RenderedVariant(
        data=out_buf.getvalue(),
        width=img.width,
        height=img.height,
        content_type="image/jpeg",
    )
