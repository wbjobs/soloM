import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import re
from typing import List, Tuple


class TestMarkdownAwareSplitter:
    def __init__(self, chunk_size: int = 200, chunk_overlap: int = 50):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
        self.markdown_headers = [
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
            ("####", "Header 4"),
        ]

    def _extract_code_blocks(self, text: str) -> Tuple[str, List[Tuple[int, int, str]]]:
        code_blocks = []
        pattern = r"```[\w]*\n([\s\S]*?)```"
        
        def replacer(match):
            start = match.start()
            end = match.end()
            content = match.group(0)
            placeholder = f"\x00CODE_BLOCK_{len(code_blocks)}\x00"
            code_blocks.append((start, end, content))
            return placeholder
        
        processed_text = re.sub(pattern, replacer, text, flags=re.MULTILINE)
        return processed_text, code_blocks

    def _restore_code_blocks(self, chunks: List[str], code_blocks: List[Tuple[int, int, str]]) -> List[str]:
        restored_chunks = []
        for chunk in chunks:
            restored = chunk
            for i, (_, _, content) in enumerate(code_blocks):
                placeholder = f"\x00CODE_BLOCK_{i}\x00"
                restored = restored.replace(placeholder, content)
            restored_chunks.append(restored)
        return restored_chunks

    def _split_simple(self, text: str) -> List[str]:
        if len(text) <= self.chunk_size:
            return [text]
        
        chunks = []
        separators = ["\n\n\n", "\n\n", "\n", " ", ".", "!", "?", ";", ",", ""]
        max_allowed_size = self.chunk_size + self.chunk_overlap
        
        for sep in separators:
            if sep:
                parts = text.split(sep)
            else:
                parts = list(text)
            
            current = ""
            temp_chunks = []
            needs_further_split = False
            
            for part in parts:
                if sep:
                    candidate = current + sep + part if current else part
                else:
                    candidate = current + part
                
                if len(candidate) <= self.chunk_size:
                    current = candidate
                else:
                    if current:
                        if len(current) > max_allowed_size and sep:
                            needs_further_split = True
                            break
                        temp_chunks.append(current)
                    current = part
            
            if not needs_further_split and current:
                if len(current) > max_allowed_size and sep:
                    needs_further_split = True
                else:
                    temp_chunks.append(current)
            
            if not needs_further_split and all(len(c) <= max_allowed_size for c in temp_chunks):
                chunks = temp_chunks
                break
        
        if not chunks:
            chunks = []
            current = ""
            for char in text:
                if len(current) >= self.chunk_size:
                    chunks.append(current)
                    current = char
                else:
                    current += char
            if current:
                chunks.append(current)
        
        return chunks

    def _split_preserving_code_blocks(self, text: str) -> List[str]:
        processed_text, code_blocks = self._extract_code_blocks(text)
        chunks = self._split_simple(processed_text)
        restored_chunks = self._restore_code_blocks(chunks, code_blocks)
        return restored_chunks

    def _is_code_block_complete(self, text: str) -> bool:
        tick_count = text.count("```")
        return tick_count % 2 == 0

    def _merge_partial_code_blocks(self, chunks: List[str]) -> List[str]:
        if not chunks:
            return chunks
            
        merged = []
        current = chunks[0]
        
        for i in range(1, len(chunks)):
            if not self._is_code_block_complete(current):
                current += "\n" + chunks[i]
            else:
                merged.append(current)
                current = chunks[i]
        
        merged.append(current)
        return merged

    def split_markdown_by_headers(self, text: str) -> List[str]:
        lines = text.split('\n')
        sections = []
        current_section = []
        current_level = 0
        
        for line in lines:
            header_match = re.match(r'^(#{1,4})\s+', line)
            if header_match:
                level = len(header_match.group(1))
                if current_section and level <= current_level:
                    sections.append('\n'.join(current_section))
                    current_section = [line]
                    current_level = level
                else:
                    if not current_section:
                        current_level = level
                    current_section.append(line)
            else:
                current_section.append(line)
        
        if current_section:
            sections.append('\n'.join(current_section))
        
        return sections

    def split_text(self, text: str, is_markdown: bool = False) -> List[str]:
        if not text or not text.strip():
            return []
        
        if is_markdown:
            try:
                header_splits = self.split_markdown_by_headers(text)
                
                final_chunks = []
                for split in header_splits:
                    if not split or not split.strip():
                        continue
                    if len(split) <= self.chunk_size:
                        final_chunks.append(split)
                    else:
                        sub_chunks = self._split_preserving_code_blocks(split)
                        final_chunks.extend(sub_chunks)
                
                final_chunks = self._merge_partial_code_blocks(final_chunks)
                final_chunks = [c for c in final_chunks if c and c.strip()]
                return final_chunks
            except Exception:
                pass
        
        chunks = self._split_preserving_code_blocks(text)
        chunks = self._merge_partial_code_blocks(chunks)
        chunks = [c for c in chunks if c and c.strip()]
        return chunks


def run_tests():
    print("=" * 60)
    print("运行 MarkdownAwareSplitter 单元测试")
    print("=" * 60)
    
    splitter = TestMarkdownAwareSplitter(chunk_size=200, chunk_overlap=20)
    
    passed = 0
    failed = 0
    
    def test(name, condition):
        nonlocal passed, failed
        if condition:
            print(f"✓ {name}")
            passed += 1
        else:
            print(f"✗ {name}")
            failed += 1
    
    print("\n1. 代码块保护测试:")
    text1 = """# 示例文档

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
    chunks1 = splitter.split_text(text1, is_markdown=True)
    code_block_count = sum(1 for chunk in chunks1 if '```python' in chunk and '```' in chunk)
    test("代码块完整保留", code_block_count >= 1)
    incomplete_code = sum(1 for chunk in chunks1 if chunk.count('```') % 2 != 0)
    test("无残缺代码块", incomplete_code == 0)
    
    print("\n2. 长代码块不分割测试:")
    long_code = "```python\n" + "\n".join([f"line_{i} = {i}" for i in range(50)]) + "\n```"
    text2 = f"# 标题\n\n{long_code}\n\n后续文字"
    chunks2 = splitter.split_text(text2, is_markdown=True)
    code_intact = True
    for chunk in chunks2:
        if '```python' in chunk:
            closing_pos = chunk.find('```', chunk.find('```python') + 3)
            if closing_pos == -1:
                code_intact = False
                break
    test("长代码块保持完整", code_intact)
    
    print("\n3. 残缺代码块合并测试:")
    chunks3 = [
        "一些文本\n```python\ndef func():",
        "    return 42\n```\n更多文本"
    ]
    merged = splitter._merge_partial_code_blocks(chunks3)
    test("合并为单个 chunk", len(merged) == 1)
    test("包含完整代码块", merged[0].count("```") == 2)
    
    print("\n4. 代码块完整性检测:")
    test("完整代码块检测", splitter._is_code_block_complete("```\ncode\n```"))
    test("残缺代码块检测", not splitter._is_code_block_complete("```\ncode"))
    test("无代码块检测", splitter._is_code_block_complete("no code here"))
    
    print("\n5. 代码块提取和恢复测试:")
    text5 = "前导文本\n```js\nconsole.log('hi');\n```\n后续文本"
    processed, code_blocks = splitter._extract_code_blocks(text5)
    test("代码块数量正确", len(code_blocks) == 1)
    test("占位符正确", "CODE_BLOCK_0" in processed)
    restored = splitter._restore_code_blocks([processed], code_blocks)
    test("内容完整恢复", restored[0] == text5)
    
    print("\n6. Markdown 标题分块测试:")
    text6 = """# 第一章

这是第一章的内容，包含一些文字描述。

## 1.1 小节

小节内容。

# 第二章

第二章的内容。
"""
    chunks6 = splitter.split_text(text6, is_markdown=True)
    has_ch1 = any('# 第一章' in c for c in chunks6)
    has_ch2 = any('# 第二章' in c for c in chunks6)
    test("包含第一章", has_ch1)
    test("包含第二章", has_ch2)
    
    print("\n7. Emoji 和特殊字符测试:")
    text7 = """# 特殊字符测试 🌟

这是包含 emoji 的文本：🎉 你好，世界！🌍

```python
# 代码中的 emoji 注释 ✅
print("🚀")
```

更多特殊字符：±∞≠≤≥
"""
    chunks7 = splitter.split_text(text7, is_markdown=True)
    combined = "".join(chunks7)
    test("保留 🌟", "🌟" in combined)
    test("保留 🎉", "🎉" in combined)
    test("保留 🌍", "🌍" in combined)
    test("保留 ✅", "✅" in combined)
    test("保留 🚀", "🚀" in combined)
    test("保留数学符号", "±∞≠≤≥" in combined)
    
    print("\n8. 长文档语义保留测试:")
    sections = []
    for i in range(5):
        section = f"## 第 {i+1} 节\n\n"
        section += f"这是第 {i+1} 节的详细内容。" * 20
        sections.append(section)
    text8 = "# 长文档\n\n" + "\n\n".join(sections)
    chunks8 = splitter.split_text(text8, is_markdown=True)
    
    def is_within_limit(chunk):
        if '```' in chunk:
            return True
        return len(chunk) <= splitter.chunk_size + 100
    
    all_within_limit = all(is_within_limit(c) for c in chunks8)
    test("Chunk 大小在合理范围内", all_within_limit)
    
    print("\n9. 空文档测试:")
    chunks9 = splitter.split_text("", is_markdown=True)
    test("空文档返回空列表", len(chunks9) == 0)
    
    print("\n10. 单行文档测试:")
    text10 = "单行文本"
    chunks10 = splitter.split_text(text10, is_markdown=False)
    test("单行文档单个 chunk", len(chunks10) == 1)
    test("内容完整", chunks10[0] == text10)
    
    print("\n11. 代码块不被拆分测试:")
    text11 = """## 代码示例

```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# 计算前10个斐波那契数
for i in range(10):
    print(fibonacci(i))
```

这是斐波那契数列的实现。
"""
    chunks11 = splitter.split_text(text11, is_markdown=True)
    code_chunks = [c for c in chunks11 if '```python' in c]
    code_complete = True
    for chunk in code_chunks:
        if chunk.count('```') != 2:
            code_complete = False
            break
    test("代码块不被拆分", code_complete)
    
    print("\n12. 多代码块测试:")
    text12 = """# 多代码块

```js
console.log("Hello");
```

中间文本

```python
print("World")
```

结束
"""
    chunks12 = splitter.split_text(text12, is_markdown=True)
    combined12 = "".join(chunks12)
    test("保留所有代码块", combined12.count("```") == 4)
    
    print("\n" + "=" * 60)
    print(f"测试结果: {passed} 通过, {failed} 失败")
    print("=" * 60)
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
