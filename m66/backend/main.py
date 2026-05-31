from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uuid
import numpy as np
from alignment import NeedlemanWunsch, parse_fasta

app = FastAPI(title="基因序列比对可视化平台")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

alignment_cache = {}

class AlignmentRequest(BaseModel):
    seq1: str
    seq2: str
    match: Optional[int] = 1
    mismatch: Optional[int] = -1
    gap: Optional[int] = -2

class MatrixViewportRequest(BaseModel):
    alignment_id: str
    row_start: int
    row_end: int
    col_start: int
    col_end: int

@app.post("/api/align")
async def align_sequences(request: AlignmentRequest):
    try:
        seq1_clean = request.seq1.upper().replace("\n", "").replace(" ", "")
        seq2_clean = request.seq2.upper().replace("\n", "").replace(" ", "")
        
        if not seq1_clean or not seq2_clean:
            raise HTTPException(status_code=400, detail="序列不能为空")
        
        if len(seq1_clean) > 10000 or len(seq2_clean) > 10000:
            raise HTTPException(status_code=400, detail="单条序列长度不能超过 10000bp")
        
        valid_chars = set("ATCGUN")
        if not all(c in valid_chars for c in seq1_clean):
            raise HTTPException(status_code=400, detail="序列1包含无效字符，只允许 A, T, C, G, U, N")
        if not all(c in valid_chars for c in seq2_clean):
            raise HTTPException(status_code=400, detail="序列2包含无效字符，只允许 A, T, C, G, U, N")
        
        nw = NeedlemanWunsch(
            match=request.match,
            mismatch=request.mismatch,
            gap=request.gap
        )
        
        result, score_matrix, traceback_matrix = nw.align(seq1_clean, seq2_clean)
        
        alignment_id = str(uuid.uuid4())
        result["alignment_id"] = alignment_id
        
        alignment_cache[alignment_id] = {
            "score_matrix": score_matrix,
            "traceback_matrix": traceback_matrix,
            "seq1": seq1_clean,
            "seq2": seq2_clean,
        }
        
        if len(alignment_cache) > 50:
            oldest_key = next(iter(alignment_cache))
            del alignment_cache[oldest_key]
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/align/matrix-viewport")
async def get_matrix_viewport(request: MatrixViewportRequest):
    try:
        if request.alignment_id not in alignment_cache:
            raise HTTPException(status_code=404, detail="比对结果已过期，请重新比对")
        
        cache = alignment_cache[request.alignment_id]
        score_matrix = cache["score_matrix"]
        
        rows = score_matrix.shape[0]
        cols = score_matrix.shape[1]
        
        row_start = max(0, request.row_start)
        row_end = min(rows, request.row_end)
        col_start = max(0, request.col_start)
        col_end = min(cols, request.col_end)
        
        if row_start >= row_end or col_start >= col_end:
            return {"matrix": [], "row_start": row_start, "col_start": col_start}
        
        max_viewport = 200
        row_end = min(row_end, row_start + max_viewport)
        col_end = min(col_end, col_start + max_viewport)
        
        viewport = score_matrix[row_start:row_end, col_start:col_end]
        
        return {
            "matrix": viewport.tolist(),
            "row_start": row_start,
            "row_end": row_end,
            "col_start": col_start,
            "col_end": col_end,
            "total_rows": rows,
            "total_cols": cols
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/parse-fasta")
async def parse_fasta_file(files: List[UploadFile] = File(...)):
    try:
        all_sequences = []
        
        for file in files:
            content = await file.read()
            content_str = content.decode("utf-8")
            sequences = parse_fasta(content_str)
            
            for header, seq in sequences:
                all_sequences.append({
                    "filename": file.filename,
                    "header": header,
                    "sequence": seq,
                    "length": len(seq)
                })
        
        return {"sequences": all_sequences}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"FASTA文件解析失败: {str(e)}")

@app.get("/api/example")
async def get_example_sequences():
    return {
        "examples": [
            {
                "name": "示例1: 短序列比对",
                "seq1": "GATTACA",
                "seq2": "GCATGCU"
            },
            {
                "name": "示例2: 含空位比对",
                "seq1": "AGTACGCA",
                "seq2": "TATGC"
            },
            {
                "name": "示例3: DNA序列",
                "seq1": "ATCGATCGATCG",
                "seq2": "ATCGAGCTAG"
            }
        ]
    }

@app.get("/")
async def read_root():
    return FileResponse("../frontend/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
