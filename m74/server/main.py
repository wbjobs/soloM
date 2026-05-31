import os
import uuid
from datetime import datetime
from typing import List, Optional, Any

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams
from matplotlib.font_manager import FontManager, FontProperties


def _configure_chinese_font():
    font_candidates = [
        'SimHei',
        'Microsoft YaHei',
        'Microsoft YaHei UI',
        'Arial Unicode MS',
        'PingFang SC',
        'Heiti SC',
        'STHeiti',
        'WenQuanYi Micro Hei',
        'WenQuanYi Zen Hei',
        'Noto Sans CJK SC',
        'Noto Sans SC',
        'Source Han Sans CN',
        'Source Han Sans SC',
        'SimSun',
        'NSimSun',
        'KaiTi',
        'FangSong',
    ]

    available_fonts = set(f.name for f in FontManager().ttflist)

    selected_font = None
    for font in font_candidates:
        if font in available_fonts:
            selected_font = font
            break

    if selected_font:
        rcParams['font.sans-serif'] = [selected_font] + rcParams.get('font.sans-serif', [])
        print(f"🎨 使用中文字体: {selected_font}")
    else:
        print("⚠️  未找到中文字体，图表中的中文可能显示为方框")
        print("   建议安装以下字体之一:")
        for font in font_candidates[:5]:
            print(f"   - {font}")

    rcParams['axes.unicode_minus'] = False

    if os.name == 'nt':
        try:
            import shutil
            from pathlib import Path

            system_fonts = [
                r"C:\Windows\Fonts\simhei.ttf",
                r"C:\Windows\Fonts\msyh.ttc",
                r"C:\Windows\Fonts\msyh.ttf",
                r"C:\Windows\Fonts\simsun.ttc",
            ]

            matplotlib_fonts_dir = Path(matplotlib.get_data_path()) / "fonts" / "ttf"

            for font_path in system_fonts:
                if os.path.exists(font_path):
                    font_name = os.path.basename(font_path)
                    dest_path = matplotlib_fonts_dir / font_name
                    if not dest_path.exists():
                        try:
                            shutil.copy(font_path, dest_path)
                            print(f"📋 已复制字体到 Matplotlib: {font_name}")
                        except Exception as e:
                            print(f"⚠️  无法复制字体 {font_name}: {e}")

            from matplotlib.font_manager import _rebuild
            try:
                _rebuild()
            except Exception:
                try:
                    from matplotlib import font_manager
                    font_manager._load_fontmanager(try_read_cache=False)
                except Exception:
                    pass
        except Exception as e:
            print(f"⚠️  字体配置出现小问题: {e}")


def _clean_text_for_chart(text: Any) -> str:
    if text is None:
        return ""
    s = str(text)
    s = s.replace('\r\n', ' ')
    s = s.replace('\n', ' ')
    s = s.replace('\r', ' ')
    s = s.replace('\t', ' ')
    s = ''.join(c for c in s if c.isprintable() or c in ' ')
    return s.strip()


_configure_chinese_font()


app = FastAPI(title="SQL 查询可视化 Dashboard", version="1.0.0")

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "charts")
os.makedirs(OUTPUT_DIR, exist_ok=True)

app.mount("/charts", StaticFiles(directory=OUTPUT_DIR), name="charts")


class VisualizeRequest(BaseModel):
    columns: List[str]
    data: List[List[Any]]
    chart_type: str = "line"
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    title: str = "Query Result"


class VisualizeResponse(BaseModel):
    success: bool
    image_url: Optional[str] = None
    error: Optional[str] = None


class ChartInfo(BaseModel):
    filename: str
    title: str
    created_at: str
    url: str


generated_charts: List[ChartInfo] = []


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    charts_html = ""
    for chart in reversed(generated_charts):
        charts_html += f"""
        <div class="chart-card">
            <h3>{chart.title}</h3>
            <p class="timestamp">{chart.created_at}</p>
            <img src="{chart.url}" alt="{chart.title}" />
        </div>
        """

    if not generated_charts:
        charts_html = """
        <div class="empty-state">
            <p>📊 暂无图表</p>
            <p class="hint">使用 CLI 执行 SQL 查询后，图表将显示在这里</p>
        </div>
        """

    html_content = f"""
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SQL 查询可视化 Dashboard</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
            }}
            .container {{ max-width: 1400px; margin: 0 auto; }}
            header {{
                text-align: center;
                color: white;
                margin-bottom: 30px;
            }}
            header h1 {{ font-size: 2.5em; margin-bottom: 10px; }}
            header p {{ font-size: 1.1em; opacity: 0.9; }}
            .charts-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
                gap: 20px;
            }}
            .chart-card {{
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                transition: transform 0.2s, box-shadow 0.2s;
            }}
            .chart-card:hover {{
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            }}
            .chart-card h3 {{
                color: #333;
                margin-bottom: 8px;
                font-size: 1.3em;
            }}
            .chart-card .timestamp {{
                color: #888;
                font-size: 0.85em;
                margin-bottom: 15px;
            }}
            .chart-card img {{
                width: 100%;
                border-radius: 8px;
                display: block;
            }}
            .empty-state {{
                grid-column: 1 / -1;
                text-align: center;
                padding: 60px 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            }}
            .empty-state p {{
                color: #666;
                font-size: 1.2em;
            }}
            .empty-state .hint {{
                font-size: 0.95em;
                margin-top: 10px;
                color: #999;
            }}
            .stats {{
                display: flex;
                justify-content: center;
                gap: 40px;
                margin-bottom: 30px;
                color: white;
            }}
            .stat-item {{
                text-align: center;
            }}
            .stat-item .number {{
                font-size: 2em;
                font-weight: bold;
            }}
            .stat-item .label {{
                opacity: 0.8;
                font-size: 0.9em;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>📊 SQL 查询可视化 Dashboard</h1>
                <p>基于 DataFusion + FastAPI + Matplotlib 的数据可视化平台</p>
            </header>
            <div class="stats">
                <div class="stat-item">
                    <div class="number">{len(generated_charts)}</div>
                    <div class="label">已生成图表</div>
                </div>
            </div>
            <div class="charts-grid">
                {charts_html}
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


@app.post("/visualize", response_model=VisualizeResponse)
async def visualize(request: VisualizeRequest):
    try:
        if not request.data:
            return VisualizeResponse(
                success=False,
                error="没有数据可用于可视化"
            )

        col_index = {col: idx for idx, col in enumerate(request.columns)}

        x_col = request.x_axis or request.columns[0]
        if x_col not in col_index:
            return VisualizeResponse(
                success=False,
                error=f"X 轴列 '{x_col}' 不存在。可用列: {request.columns}"
            )

        y_cols = []
        if request.y_axis:
            if request.y_axis in col_index:
                y_cols = [request.y_axis]
            else:
                return VisualizeResponse(
                    success=False,
                    error=f"Y 轴列 '{request.y_axis}' 不存在。可用列: {request.columns}"
                )
        else:
            for col in request.columns:
                if col != x_col and _is_numeric_column(request.data, col_index[col]):
                    y_cols.append(col)
            if not y_cols and len(request.columns) > 1:
                y_cols = [c for c in request.columns if c != x_col][:1]

        if not y_cols:
            return VisualizeResponse(
                success=False,
                error="没有可用于 Y 轴的数值列"
            )

        fig, ax = plt.subplots(figsize=(10, 6))

        x_data = [_clean_text_for_chart(row[col_index[x_col]]) for row in request.data]
        clean_x_col = _clean_text_for_chart(x_col)
        clean_title = _clean_text_for_chart(request.title)

        for y_col in y_cols:
            y_data = [row[col_index[y_col]] for row in request.data]
            y_data_num = [float(v) if v is not None else None for v in y_data]
            clean_y_label = _clean_text_for_chart(y_col)

            if request.chart_type == "line":
                ax.plot(x_data, y_data_num, marker='o', linewidth=2, label=clean_y_label)
            elif request.chart_type == "bar":
                x_pos = range(len(x_data))
                ax.bar([x + 0.2 * y_cols.index(y_col) for x in x_pos],
                       y_data_num, width=0.8 / len(y_cols), label=clean_y_label)
                ax.set_xticks(range(len(x_data)))
                ax.set_xticklabels(x_data, rotation=45, ha='right')
            elif request.chart_type == "scatter":
                ax.scatter(x_data, y_data_num, s=80, alpha=0.7, label=clean_y_label)
            else:
                return VisualizeResponse(
                    success=False,
                    error=f"不支持的图表类型: {request.chart_type}。支持: line, bar, scatter"
                )

        ax.set_xlabel(clean_x_col, fontsize=12)
        ax.set_ylabel("数值", fontsize=12)
        ax.set_title(clean_title, fontsize=14, pad=20)
        ax.legend()
        ax.grid(True, alpha=0.3)
        plt.tight_layout()

        filename = f"chart_{uuid.uuid4().hex[:12]}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        plt.savefig(filepath, dpi=100, bbox_inches='tight')
        plt.close(fig)

        image_url = f"/charts/{filename}"

        chart_info = ChartInfo(
            filename=filename,
            title=clean_title,
            created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            url=image_url
        )
        generated_charts.append(chart_info)

        return VisualizeResponse(
            success=True,
            image_url=image_url
        )

    except Exception as e:
        plt.close('all')
        return VisualizeResponse(
            success=False,
            error=f"图表生成失败: {str(e)}"
        )


@app.get("/api/charts", response_model=List[ChartInfo])
async def list_charts():
    return list(reversed(generated_charts))


def _is_numeric_column(data: List[List[Any]], col_idx: int) -> bool:
    count = 0
    total = 0
    for row in data:
        val = row[col_idx]
        total += 1
        if val is None:
            continue
        try:
            float(val)
            count += 1
        except (ValueError, TypeError):
            pass
    return total > 0 and count / total > 0.5


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
