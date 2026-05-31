import json
import os
import subprocess
import tempfile
import traceback
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="SlideWasm Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"Unhandled exception: {exc}")
    print(tb)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "traceback": tb}
    )

TEMPLATES_DIR = Path(__file__).parent / "templates"
EXPORT_DIR = Path(tempfile.gettempdir()) / "slidewasm_exports"
PROJECTS_DIR = Path(__file__).parent.parent / "projects"

os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(PROJECTS_DIR, exist_ok=True)


class PresentationData(BaseModel):
    meta: Optional[dict] = None
    slides: list = []
    theme: Optional[dict] = None


class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    content: str


class CommitRequest(BaseModel):
    message: str
    files: dict = {}


class GitError(Exception):
    pass


def get_project_dir(project_id: str) -> Path:
    safe_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
    if not safe_id:
        safe_id = "default"
    return PROJECTS_DIR / safe_id


def run_git(repo_dir: Path, *args: str) -> str:
    try:
        escaped_args = []
        for arg in args:
            if any(c in arg for c in [" ", '"', "|", "&", ">", "<"]):
                escaped_args.append(f'"{arg}"')
            else:
                escaped_args.append(arg)
        cmd = " ".join(["git", *escaped_args])
        result = subprocess.run(
            cmd,
            cwd=str(repo_dir),
            capture_output=True,
            encoding="utf-8",
            errors="replace",
            check=True,
            shell=True,
        )
        return result.stdout or ""
    except subprocess.CalledProcessError as e:
        raise GitError(f"Git command failed: {e.stderr}") from e


def git_repo_exists(repo_dir: Path) -> bool:
    return (repo_dir / ".git").exists()


def init_git_repo(project_id: str) -> dict:
    repo_dir = get_project_dir(project_id)
    os.makedirs(repo_dir, exist_ok=True)

    if git_repo_exists(repo_dir):
        return {"status": "exists", "project_id": project_id}

    try:
        run_git(repo_dir, "init")
        run_git(repo_dir, "config", "user.name", "SlideWasm User")
        run_git(repo_dir, "config", "user.email", "slidewasm@local")
        try:
            subprocess.run(
                "git symbolic-ref HEAD refs/heads/main",
                cwd=str(repo_dir),
                shell=True,
                check=True,
                capture_output=True,
            )
        except Exception:
            pass
        return {"status": "created", "project_id": project_id}
    except GitError as e:
        raise HTTPException(status_code=500, detail=str(e))


def get_git_history(project_id: str, limit: int = 50) -> list:
    repo_dir = get_project_dir(project_id)
    if not git_repo_exists(repo_dir):
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        output = run_git(
            repo_dir,
            "log",
            f"-{limit}",
            "--pretty=format:%H|%at|%an|%s",
            "--reverse",
        )
        commits = []
        for line in output.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|", 3)
            if len(parts) >= 4:
                commits.append({
                    "hash": parts[0],
                    "timestamp": int(parts[1]),
                    "author": parts[2],
                    "message": parts[3],
                })
        return list(reversed(commits))
    except GitError as e:
        raise HTTPException(status_code=500, detail=str(e))


def git_commit(project_id: str, request: CommitRequest) -> dict:
    repo_dir = get_project_dir(project_id)
    if not git_repo_exists(repo_dir):
        init_git_repo(project_id)

    try:
        for filename, content in request.files.items():
            safe_name = Path(filename).name
            file_path = repo_dir / safe_name
            file_path.write_text(str(content), encoding="utf-8")

        run_git(repo_dir, "add", "-A")

        status = run_git(repo_dir, "status", "--porcelain")
        if not status.strip():
            return {"status": "no_changes", "message": "没有需要提交的更改"}

        run_git(repo_dir, "commit", "-m", request.message)
        hash_output = run_git(repo_dir, "rev-parse", "HEAD").strip()
        return {"status": "committed", "hash": hash_output}
    except GitError as e:
        raise HTTPException(status_code=500, detail=str(e))


def git_checkout(project_id: str, commit_hash: str) -> dict:
    repo_dir = get_project_dir(project_id)
    if not git_repo_exists(repo_dir):
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        run_git(repo_dir, "checkout", commit_hash, "--", ".")

        files = {}
        for file_path in repo_dir.iterdir():
            if file_path.is_file() and not file_path.name.startswith("."):
                try:
                    files[file_path.name] = file_path.read_text(encoding="utf-8")
                except (UnicodeDecodeError, OSError):
                    pass

        run_git(repo_dir, "checkout", "HEAD", "--", ".")

        return {"status": "checked_out", "commit": commit_hash, "files": files}
    except GitError as e:
        raise HTTPException(status_code=500, detail=str(e))


def load_builtin_templates():
    templates = []
    if not TEMPLATES_DIR.exists():
        return templates
    for f in TEMPLATES_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            templates.append(data)
        except (json.JSONDecodeError, Exception):
            continue
    return templates


def render_slides_html(presentation: PresentationData) -> str:
    slides_html = []
    meta = presentation.meta or {}
    theme = meta.get("theme", "dark")
    bg_color = "#1a1a2e" if theme == "dark" else "#ffffff"
    text_color = "#e0e0e0" if theme == "dark" else "#1a1a2e"

    custom_css = ""
    if presentation.theme:
        custom_css = presentation.theme.get("css", "")

    for slide in presentation.slides:
        style = slide.get("style") or {}
        slide_bg = style.get("background", bg_color)
        slide_color = style.get("color", text_color)

        elements_html = []
        for el in slide.get("elements", []):
            el_type = el.get("type", "")
            if el_type == "heading":
                level = el.get("level", 1)
                text = el.get("text", "")
                tag = f"h{min(level, 6)}"
                size = {1: "2.8rem", 2: "2rem", 3: "1.5rem"}.get(level, "1.2rem")
                elements_html.append(
                    f'<{tag} style="font-size:{size};margin-bottom:0.5rem;font-weight:700">{escape_html(text)}</{tag}>'
                )
            elif el_type == "paragraph":
                content = render_inline_content(el.get("content", []))
                elements_html.append(f'<p style="margin-bottom:0.6rem;line-height:1.7">{content}</p>')
            elif el_type == "list":
                items = el.get("items", [])
                ordered = el.get("ordered", False)
                tag = "ol" if ordered else "ul"
                items_html = "".join(
                    f'<li style="margin-bottom:0.3rem">{render_inline_content(item.get("content", []))}</li>'
                    for item in items
                )
                elements_html.append(f'<{tag} style="margin-left:1.5rem;margin-bottom:0.6rem">{items_html}</{tag}>')
            elif el_type == "code":
                language = el.get("language", "")
                code = escape_html(el.get("code", ""))
                lang_label = f'<span style="position:absolute;top:0.3rem;right:0.6rem;font-size:0.7rem;color:#6a6a8a">{escape_html(language)}</span>' if language else ""
                elements_html.append(
                    f'<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:1rem;margin:0.5rem 0;position:relative">{lang_label}<pre style="margin:0;font-family:&quot;Cascadia Code&quot;,&quot;Fira Code&quot;,monospace,&quot;Microsoft YaHei&quot;;font-size:0.85rem;line-height:1.5;white-space:pre-wrap"><code>{code}</code></pre></div>'
                )
            elif el_type == "blockquote":
                content = render_inline_content(el.get("content", []))
                elements_html.append(
                    f'<blockquote style="border-left:3px solid #e94560;padding:0.5rem 1rem;margin:0.5rem 0;font-style:italic">{content}</blockquote>'
                )
            elif el_type == "image":
                url = escape_html(el.get("url", ""))
                alt = escape_html(el.get("alt", ""))
                elements_html.append(
                    f'<figure style="text-align:center;margin:0.5rem 0"><img src="{url}" alt="{alt}" style="max-width:80%;border-radius:4px" /></figure>'
                )
            elif el_type == "thematicbreak":
                elements_html.append('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:1rem 0" />')
            elif el_type == "html":
                elements_html.append(el.get("content", ""))

        slides_html.append(
            f'<div class="slide" style="background:{slide_bg};color:{slide_color};width:100%;height:100vh;display:flex;flex-direction:column;justify-content:center;padding:3rem 4rem;page-break-after:always;font-family:&quot;Microsoft YaHei&quot;,&quot;PingFang SC&quot;,&quot;Hiragino Sans GB&quot;,&quot;Noto Sans CJK SC&quot;,sans-serif">'
            + "".join(elements_html)
            + "</div>"
        )

    title = escape_html(meta.get("title", "Presentation"))

    css_block = ""
    if custom_css:
        css_block = f"<style>{custom_css}</style>"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{title}</title>
{css_block}
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ 
  font-family: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "WenQuanYi Micro Hei", sans-serif;
}}
@page {{
  size: A4 landscape;
  margin: 0;
}}
@media print {{
  .slide {{ page-break-after: always; }}
}}
</style>
</head>
<body>
{"".join(slides_html)}
</body>
</html>"""


def render_inline_content(nodes):
    if not nodes:
        return ""
    parts = []
    for node in nodes:
        ntype = node.get("type", "")
        if ntype == "text":
            parts.append(escape_html(node.get("value", "")))
        elif ntype == "code":
            parts.append(f'<code style="background:rgba(255,255,255,0.1);padding:0.1rem 0.4rem;border-radius:3px;font-family:&quot;Cascadia Code&quot;,monospace,&quot;Microsoft YaHei&quot;;font-size:0.9em">{escape_html(node.get("value", ""))}</code>')
        elif ntype == "strong":
            inner = render_inline_content(node.get("content", []))
            parts.append(f"<strong>{inner}</strong>")
        elif ntype == "emph":
            inner = render_inline_content(node.get("content", []))
            parts.append(f"<em>{inner}</em>")
        elif ntype == "link":
            url = escape_html(node.get("url", ""))
            text = escape_html(node.get("text", ""))
            parts.append(f'<a href="{url}" style="color:#e94560">{text}</a>')
        elif ntype == "softbreak":
            parts.append(" ")
        elif ntype == "hardbreak":
            parts.append("<br/>")
    return "".join(parts)


def escape_html(text):
    if not text:
        return ""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


@app.get("/api/templates")
async def list_templates():
    return load_builtin_templates()


@app.post("/api/templates")
async def create_template(template: TemplateCreate):
    slug = template.name.lower().replace(" ", "-").replace("/", "-")
    file_path = TEMPLATES_DIR / f"{slug}.json"
    data = {
        "name": template.name,
        "description": template.description,
        "content": template.content,
    }
    file_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"status": "created", "template": data}


@app.delete("/api/templates/{template_name}")
async def delete_template(template_name: str):
    file_path = TEMPLATES_DIR / f"{template_name}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Template not found")
    file_path.unlink()
    return {"status": "deleted"}


@app.post("/api/export/pdf")
async def export_pdf(presentation: PresentationData):
    html_content = render_slides_html(presentation)

    export_id = str(uuid.uuid4())[:8]
    html_path = EXPORT_DIR / f"slide_{export_id}.html"
    pdf_path = EXPORT_DIR / f"slide_{export_id}.pdf"

    html_path.write_text(html_content, encoding="utf-8")

    export_script = Path(__file__).parent / "export_pdf.js"

    if export_script.exists():
        try:
            result = subprocess.run(
                ["node", str(export_script), str(html_path), str(pdf_path)],
                capture_output=True,
                text=True,
                timeout=60,
                cwd=str(Path(__file__).parent),
            )

            if result.returncode == 0 and pdf_path.exists():
                from fastapi.responses import FileResponse
                return FileResponse(
                    str(pdf_path),
                    media_type="application/pdf",
                    filename=f"{presentation.meta.get('title', 'slides') if presentation.meta else 'slides'}.pdf",
                )
            else:
                fallback_path = EXPORT_DIR / f"slide_{export_id}_fallback.html"
                fallback_path.write_text(html_content, encoding="utf-8")
                return {
                    "status": "html_fallback",
                    "message": "Puppeteer not available, HTML export provided",
                    "html_url": f"/api/export/html/{export_id}",
                    "html_path": str(fallback_path),
                }
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    fallback_path = EXPORT_DIR / f"slide_{export_id}_fallback.html"
    fallback_path.write_text(html_content, encoding="utf-8")
    return {
        "status": "html_fallback",
        "message": "Puppeteer not available, HTML export provided",
        "html_path": str(fallback_path),
    }


@app.get("/api/export/html/{export_id}")
async def get_exported_html(export_id: str):
    html_path = EXPORT_DIR / f"slide_{export_id}_fallback.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="Export not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(html_path), media_type="text/html")


@app.post("/api/projects/{project_id}/init")
async def init_project(project_id: str):
    return init_git_repo(project_id)


@app.get("/api/projects/{project_id}/history")
async def get_project_history(project_id: str, limit: int = 50):
    return get_git_history(project_id, limit)


@app.post("/api/projects/{project_id}/commit")
async def commit_project(project_id: str, request: CommitRequest):
    return git_commit(project_id, request)


@app.post("/api/projects/{project_id}/checkout/{commit_hash}")
async def checkout_project(project_id: str, commit_hash: str):
    return git_checkout(project_id, commit_hash)


@app.get("/api/projects")
async def list_projects():
    projects = []
    if PROJECTS_DIR.exists():
        for project_dir in PROJECTS_DIR.iterdir():
            if project_dir.is_dir() and git_repo_exists(project_dir):
                projects.append({
                    "id": project_dir.name,
                    "has_git": True,
                })
    return {"projects": projects}


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "slidewasm-backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
