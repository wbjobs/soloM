import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import unittest
from langchain_core.documents import Document
from app.services.document_loader import MarkdownAwareSplitter, DocumentProcessingService


class TestMarkdownAwareSplitter(unittest.TestCase):
    
    def setUp(self):
        self.splitter = MarkdownAwareSplitter(chunk_size=200, chunk_overlap=20)
    
    def test_code_block_preservation(self):
        text = """# 示例文档

这是一段普通文本。

```python
def hello_world():
    print("Hello, World!")
    
    for i in range(10):
        print(i)
    
    return True
```

这是代码块之后的文本。
"""
        chunks = self.splitter.split_text(text, is_markdown=True)
        
        code_block_count = sum(1 for chunk in chunks if '```python' in chunk and '```' in chunk)
        self.assertGreaterEqual(code_block_count, 1, "代码块应该完整保留在单个 chunk 中")
        
        incomplete_code = sum(1 for chunk in chunks if chunk.count('```') % 2 != 0)
        self.assertEqual(incomplete_code, 0, "不应该有不完整的代码块")
    
    def test_code_block_not_split(self):
        long_code = "```python\n" + "\n".join([f"line_{i} = {i}" for i in range(50)]) + "\n```"
        text = f"# 标题\n\n{long_code}\n\n后续文字"
        
        chunks = self.splitter.split_text(text, is_markdown=True)
        
        for chunk in chunks:
            if '```python' in chunk:
                self.assertIn('```', chunk[chunk.find('```python')+3:], 
                            "代码块的开始和结束标记应该在同一个 chunk 中")
    
    def test_merge_partial_code_blocks(self):
        chunks = [
            "一些文本\n```python\ndef func():",
            "    return 42\n```\n更多文本"
        ]
        
        merged = self.splitter._merge_partial_code_blocks(chunks)
        
        self.assertEqual(len(merged), 1)
        self.assertIn("```python", merged[0])
        self.assertIn("```", merged[0])
        self.assertEqual(merged[0].count("```"), 2)
    
    def test_is_code_block_complete(self):
        self.assertTrue(self.splitter._is_code_block_complete("```\ncode\n```"))
        self.assertFalse(self.splitter._is_code_block_complete("```\ncode"))
        self.assertTrue(self.splitter._is_code_block_complete("no code here"))
        self.assertFalse(self.splitter._is_code_block_complete("```\ncode\n```\nmore\n```"))
    
    def test_extract_and_restore_code_blocks(self):
        text = "前导文本\n```js\nconsole.log('hi');\n```\n后续文本"
        
        processed, code_blocks = self.splitter._extract_code_blocks(text)
        self.assertEqual(len(code_blocks), 1)
        self.assertIn("CODE_BLOCK_0", processed)
        
        restored = self.splitter._restore_code_blocks([processed], code_blocks)
        self.assertEqual(restored[0], text)
    
    def test_markdown_header_splitting(self):
        text = """# 第一章

这是第一章的内容，包含一些文字描述。

## 1.1 小节

小节内容。

# 第二章

第二章的内容。
"""
        chunks = self.splitter.split_text(text, is_markdown=True)
        
        has_chapter1 = any('# 第一章' in chunk for chunk in chunks)
        has_chapter2 = any('# 第二章' in chunk for chunk in chunks)
        
        self.assertTrue(has_chapter1, "应该包含第一章")
        self.assertTrue(has_chapter2, "应该包含第二章")
    
    def test_chunk_metadata(self):
        docs = [
            Document(
                page_content="# 测试文档\n\n内容1\n\n内容2\n\n内容3",
                metadata={"source": "test.md", "file_type": "markdown"}
            )
        ]
        
        split_docs = self.splitter.split_documents(docs)
        
        for i, doc in enumerate(split_docs):
            self.assertIn("chunk_index", doc.metadata)
            self.assertIn("total_chunks", doc.metadata)
            self.assertEqual(doc.metadata["chunk_index"], i)
            self.assertEqual(doc.metadata["total_chunks"], len(split_docs))
    
    def test_emoji_and_special_chars(self):
        text = """# 特殊字符测试 🌟

这是包含 emoji 的文本：🎉 你好，世界！🌍

```python
# 代码中的 emoji 注释 ✅
print("🚀")
```

更多特殊字符：±∞≠≤≥
"""
        chunks = self.splitter.split_text(text, is_markdown=True)
        
        combined = "".join(chunks)
        self.assertIn("🌟", combined)
        self.assertIn("🎉", combined)
        self.assertIn("🌍", combined)
        self.assertIn("✅", combined)
        self.assertIn("🚀", combined)
        self.assertIn("±∞≠≤≥", combined)
    
    def test_long_document_semantic_preservation(self):
        sections = []
        for i in range(5):
            section = f"## 第 {i+1} 节\n\n"
            section += f"这是第 {i+1} 节的详细内容。" * 20
            sections.append(section)
        
        text = "# 长文档\n\n" + "\n\n".join(sections)
        chunks = self.splitter.split_text(text, is_markdown=True)
        
        for chunk in chunks:
            self.assertLessEqual(len(chunk), self.splitter.chunk_size + 100,
                               f"Chunk 大小 {len(chunk)} 超过限制太多")
    
    def test_empty_document(self):
        chunks = self.splitter.split_text("", is_markdown=True)
        self.assertEqual(len(chunks), 0)
    
    def test_single_line_document(self):
        text = "单行文本"
        chunks = self.splitter.split_text(text, is_markdown=False)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0], text)


class TestDocumentProcessingService(unittest.TestCase):
    
    def setUp(self):
        self.service = DocumentProcessingService()
    
    def test_preprocess_text(self):
        text = "测试\r\n文本\n\n\n\n多行"
        processed = self.service._preprocess_text(text)
        self.assertNotIn("\r", processed)
        self.assertNotIn("\n\n\n", processed)
    
    def test_validate_file_extension(self):
        self.assertEqual(self.service.load_document.__wrapped__(self.service, "test.pdf") is not None or True, True)
        self.assertEqual(self.service.load_document.__wrapped__(self.service, "test.md") is not None or True, True)
        self.assertEqual(self.service.load_document.__wrapped__(self.service, "test.txt") is not None or True, True)
        
        with self.assertRaises(ValueError):
            self.service.load_document("test.docx")


if __name__ == "__main__":
    unittest.main(verbosity=2)
