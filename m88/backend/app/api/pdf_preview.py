from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from loguru import logger
import io
import os

from ..core.config import settings

router = APIRouter(prefix="/api/pdf", tags=["pdf"])


@router.get("/preview/{doc_id}")
async def preview_pdf_page(
    doc_id: str,
    page: int = Query(default=1, ge=1),
    dpi: int = Query(default=150, ge=72, le=300)
):
    try:
        upload_dir = settings.UPLOAD_DIR
        pdf_path = None

        for ext in ['.pdf']:
            candidate = os.path.join(upload_dir, f"{doc_id}{ext}")
            if os.path.exists(candidate):
                pdf_path = candidate
                break

        if not pdf_path:
            raise HTTPException(status_code=404, detail="PDF file not found")

        import fitz

        doc = fitz.open(pdf_path)

        if page > doc.page_count:
            doc.close()
            raise HTTPException(
                status_code=400,
                detail=f"Page {page} out of range (1-{doc.page_count})"
            )

        page_obj = doc[page - 1]
        pix = page_obj.get_pixmap(dpi=dpi)

        img_bytes = pix.tobytes("png")

        doc.close()

        return StreamingResponse(
            io.BytesIO(img_bytes),
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Content-Disposition": f"inline; filename={doc_id}_page{page}.png"
            }
        )

    except HTTPException:
        raise
    except ImportError:
        logger.error("PyMuPDF (fitz) not installed for PDF preview")
        raise HTTPException(status_code=500, detail="PDF preview not available")
    except Exception as e:
        logger.error(f"PDF preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info/{doc_id}")
async def get_pdf_info(doc_id: str):
    try:
        upload_dir = settings.UPLOAD_DIR
        pdf_path = None

        for ext in ['.pdf']:
            candidate = os.path.join(upload_dir, f"{doc_id}{ext}")
            if os.path.exists(candidate):
                pdf_path = candidate
                break

        if not pdf_path:
            raise HTTPException(status_code=404, detail="PDF file not found")

        import fitz

        doc = fitz.open(pdf_path)
        info = {
            "doc_id": doc_id,
            "page_count": doc.page_count,
            "metadata": doc.metadata,
            "pages": []
        }

        for i in range(doc.page_count):
            page = doc[i]
            info["pages"].append({
                "page_num": i + 1,
                "width": page.rect.width,
                "height": page.rect.height
            })

        doc.close()
        return info

    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF preview not available")
    except Exception as e:
        logger.error(f"PDF info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
