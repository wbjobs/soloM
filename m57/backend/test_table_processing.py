import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tempfile
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

from app.services.pdf_processor import PDFProcessor, extract_text_from_pdf
from app.services.document_service import get_document_chunks


def create_test_pdf_with_tables(output_path):
    doc = SimpleDocTemplate(output_path, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()

    title = Paragraph("产品销售数据报告", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))

    intro = Paragraph(
        "本报告包含了2024年各季度的产品销售数据。"
        "数据按产品类别和地区进行了分类汇总。",
        styles['BodyText']
    )
    story.append(intro)
    story.append(Spacer(1, 12))

    data1 = [
        ["产品名称", "Q1销量", "Q2销量", "Q3销量", "Q4销量", "年度总计"],
        ["智能手机", "1,250", "1,480", "1,320", "1,680", "5,730"],
        ["笔记本电脑", "890", "950", "1,020", "1,150", "4,010"],
        ["平板电脑", "650", "720", "680", "890", "2,940"],
        ["智能手表", "420", "510", "480", "620", "2,030"],
        ["无线耳机", "1,890", "2,150", "1,980", "2,340", "8,360"]
    ]

    table1 = Table(data1)
    table1.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(table1)
    story.append(Spacer(1, 20))

    h2 = Paragraph("表1：2024年各产品季度销售数据", styles['Heading2'])
    story.append(h2)
    story.append(Spacer(1, 12))

    data2 = [
        ["地区", "销售额(万元)", "同比增长", "市场份额"],
        ["华东地区", "12,580", "+15.2%", "28.3%"],
        ["华南地区", "9,860", "+12.8%", "22.1%"],
        ["华北地区", "8,420", "+8.5%", "18.9%"],
        ["西南地区", "6,210", "+22.4%", "13.9%"],
        ["西北地区", "3,890", "+18.6%", "8.7%"],
        ["东北地区", "3,560", "+5.2%", "8.1%"]
    ]

    table2 = Table(data2)
    table2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.lightblue),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(table2)
    story.append(Spacer(1, 20))

    h2_2 = Paragraph("表2：2024年各地区销售数据对比", styles['Heading2'])
    story.append(h2_2)
    story.append(Spacer(1, 12))

    conclusion = Paragraph(
        "根据以上数据分析，无线耳机和智能手机是销量最高的两类产品，"
        "华东地区贡献了最大的市场份额。西南地区的同比增长率最高，"
        "达到了22.4%，显示出强劲的增长势头。建议在下一年度加大对"
        "西南市场的投入。",
        styles['BodyText']
    )
    story.append(conclusion)

    doc.build(story)
    print(f"测试 PDF 已创建: {output_path}")


def test_pdf_processing():
    print("=" * 70)
    print("测试 PDF 表格处理功能")
    print("=" * 70)

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "test_sales_report.pdf")
        create_test_pdf_with_tables(pdf_path)

        print("\n1. 测试 PDF 文本提取...")
        processor = PDFProcessor(pdf_path)
        pages = processor.extract_text()

        print(f"   提取到 {len(pages)} 页内容")
        print(f"   检测到表格: {processor.has_tables}")
        if processor.has_tables:
            print(f"   表格所在页码: {sorted(processor.table_pages)}")

        print("\n2. 测试表格内容提取...")
        for i, page in enumerate(pages, 1):
            print(f"\n   --- 第 {i} 页 ---")
            print(f"   是否包含表格: {page.get('has_tables', False)}")

            if page.get('tables'):
                for j, table in enumerate(page['tables']):
                    print(f"\n   表格 {j + 1}:")
                    print(f"   列名: {table['headers']}")
                    print(f"   行数: {table['row_count']}")
                    print(f"   列数: {table['col_count']}")
                    print(f"\n   结构化文本:")
                    print("   " + "=" * 60)
                    for line in table['structured_text'].split('\n')[:10]:
                        print(f"   {line}")
                    if len(table['structured_text'].split('\n')) > 10:
                        print(f"   ... (共 {len(table['structured_text'].split(chr(10)))} 行)")
                    print("   " + "=" * 60)

                    print(f"\n   Markdown 格式:")
                    print("   " + "=" * 60)
                    for line in table['markdown'].split('\n')[:8]:
                        print(f"   {line}")
                    if len(table['markdown'].split('\n')) > 8:
                        print(f"   ...")
                    print("   " + "=" * 60)

        print("\n3. 测试文档切片...")
        chunks = get_document_chunks(pdf_path, 'pdf')
        print(f"   生成 {len(chunks)} 个切片")

        table_chunks = [c for c in chunks if c.get('is_table')]
        text_chunks = [c for c in chunks if not c.get('is_table')]
        print(f"   - 表格切片: {len(table_chunks)} 个")
        print(f"   - 文本切片: {len(text_chunks)} 个")

        print("\n4. 测试切片内容...")
        for i, chunk in enumerate(chunks[:5]):
            chunk_type = "表格" if chunk.get('is_table') else "文本"
            print(f"\n   切片 {i + 1} (类型: {chunk_type}, 页码: {chunk['page_number']}):")
            content_preview = chunk['content'][:200].replace('\n', '\n      ')
            print(f"      {content_preview}...")

        print("\n" + "=" * 70)
        print("测试完成!")
        print("=" * 70)

        return True


if __name__ == "__main__":
    try:
        success = test_pdf_processing()
        if success:
            print("\n✅ 所有测试通过!")
            sys.exit(0)
        else:
            print("\n❌ 测试失败!")
            sys.exit(1)
    except ImportError as e:
        print(f"\n⚠️  缺少依赖: {e}")
        print("请先运行: pip install pdfplumber pymupdf pandas reportlab")
        sys.exit(2)
    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
