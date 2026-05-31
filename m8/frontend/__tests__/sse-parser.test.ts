/**
 * SSEParser 单元测试
 * 
 * 测试场景：
 * 1. 正常 SSE 消息解析
 * 2. 跨 chunk 的消息分割
 * 3. Emoji 和多字节 UTF-8 字符处理
 * 4. 不完整 JSON 的错误处理
 * 5. 代码块等特殊内容的流式处理
 */

class SSEParser {
  private buffer: string = '';
  private textDecoder: TextDecoder;

  constructor() {
    this.textDecoder = new TextDecoder('utf-8', { fatal: false });
  }

  decode(chunk: Uint8Array): string {
    return this.textDecoder.decode(chunk, { stream: true });
  }

  flush(): string {
    return this.textDecoder.decode();
  }

  push(chunk: string): void {
    this.buffer += chunk;
  }

  parseMessages(): Array<{ type: string; data: any } | null> {
    const messages: Array<{ type: string; data: any } | null> = [];
    
    while (true) {
      const doubleNewlineIndex = this.buffer.indexOf('\n\n');
      
      if (doubleNewlineIndex === -1) {
        if (this.buffer.length > 1024 * 1024) {
          console.warn('SSE buffer too large, clearing to prevent memory issues');
          this.buffer = '';
        }
        break;
      }

      const rawMessage = this.buffer.slice(0, doubleNewlineIndex);
      this.buffer = this.buffer.slice(doubleNewlineIndex + 2);

      if (!rawMessage.trim()) {
        continue;
      }

      const message = this.parseSingleMessage(rawMessage);
      if (message !== null) {
        messages.push(message);
      }
    }

    return messages;
  }

  private parseSingleMessage(rawMessage: string): { type: string; data: any } | null {
    const lines = rawMessage.split('\n');
    let dataField = '';

    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataField += line.slice(5).trimStart();
      } else if (line.startsWith(':')) {
        continue;
      }
    }

    if (!dataField) {
      return null;
    }

    if (dataField === '[DONE]') {
      return { type: 'done', data: null };
    }

    try {
      const parsed = JSON.parse(dataField);
      return { type: parsed.type || 'unknown', data: parsed.data };
    } catch (e) {
      console.warn('Failed to parse SSE JSON:', e, 'Raw data:', dataField);
      return null;
    }
  }

  getBufferLength(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = '';
  }
}

function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe('SSEParser', () => {
  let parser: SSEParser;

  beforeEach(() => {
    parser = new SSEParser();
  });

  test('解析普通内容消息', () => {
    const message = `data: ${JSON.stringify({ type: 'content', data: 'Hello, World!' })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'content', data: 'Hello, World!' });
  });

  test('解析引用来源消息', () => {
    const sources = [
      { id: 1, file_name: 'test.md', content: '引用内容', source: 'test.md' }
    ];
    const message = `data: ${JSON.stringify({ type: 'sources', data: sources })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('sources');
    expect(result[0]?.data).toEqual(sources);
  });

  test('解析 [DONE] 消息', () => {
    const message = `data: [DONE]\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'done', data: null });
  });

  test('处理跨 chunk 分割的消息', () => {
    const jsonData = JSON.stringify({ type: 'content', data: '跨 chunk 的消息内容' });
    const midPoint = Math.floor(jsonData.length / 2);
    
    const chunk1 = `data: ${jsonData.slice(0, midPoint)}`;
    const chunk2 = `${jsonData.slice(midPoint)}\n\n`;
    
    parser.push(chunk1);
    let result = parser.parseMessages();
    expect(result).toHaveLength(0);
    
    parser.push(chunk2);
    result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('content');
    expect(result[0]?.data).toBe('跨 chunk 的消息内容');
  });

  test('正确处理 Emoji 字符', () => {
    const content = '包含 Emoji 的消息 🌟🎉🌍';
    const message = `data: ${JSON.stringify({ type: 'content', data: content })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe(content);
    expect(result[0]?.data).toContain('🌟');
    expect(result[0]?.data).toContain('🎉');
    expect(result[0]?.data).toContain('🌍');
  });

  test('处理在字节边界分割的多字节字符', () => {
    const content = '测试 Emoji 🌟 在中间分割';
    const fullData = JSON.stringify({ type: 'content', data: content });
    const fullMessage = `data: ${fullData}\n\n`;
    
    const bytes = stringToUint8Array(fullMessage);
    const starPos = fullMessage.indexOf('🌟');
    
    if (starPos !== -1) {
      const starBytePos = new TextEncoder().encode(fullMessage.slice(0, starPos)).length;
      
      const chunk1 = bytes.slice(0, starBytePos + 2);
      const chunk2 = bytes.slice(starBytePos + 2);
      
      const decoded1 = parser.decode(chunk1);
      parser.push(decoded1);
      let result = parser.parseMessages();
      expect(result).toHaveLength(0);
      
      const decoded2 = parser.decode(chunk2);
      parser.push(decoded2);
      result = parser.parseMessages();
      
      expect(result).toHaveLength(1);
      expect(result[0]?.data).toBe(content);
      expect(result[0]?.data).toContain('🌟');
    }
  });

  test('正确处理代码块内容', () => {
    const codeContent = '```python\ndef hello():\n    print("Hello, World!")\n```';
    const message = `data: ${JSON.stringify({ type: 'content', data: codeContent })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe(codeContent);
    expect(result[0]?.data).toContain('```python');
    expect(result[0]?.data).toContain('```');
  });

  test('处理换行符和特殊字符', () => {
    const content = '第一行\n第二行\n第三行\n\t缩进内容';
    const message = `data: ${JSON.stringify({ type: 'content', data: content })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe(content);
  });

  test('处理不完整的 JSON 数据', () => {
    const chunk = `data: {"type": "content", "data": "不完整`;
    
    parser.push(chunk);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(0);
    expect(parser.getBufferLength()).toBeGreaterThan(0);
  });

  test('处理无效的 JSON 数据', () => {
    const message = `data: {invalid json}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(0);
  });

  test('处理多条消息在同一个 chunk 中', () => {
    const msg1 = `data: ${JSON.stringify({ type: 'content', data: '消息1' })}\n\n`;
    const msg2 = `data: ${JSON.stringify({ type: 'content', data: '消息2' })}\n\n`;
    const msg3 = `data: ${JSON.stringify({ type: 'content', data: '消息3' })}\n\n`;
    
    parser.push(msg1 + msg2 + msg3);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(3);
    expect(result[0]?.data).toBe('消息1');
    expect(result[1]?.data).toBe('消息2');
    expect(result[2]?.data).toBe('消息3');
  });

  test('处理多行 data 字段', () => {
    const message = `data: {"type": "content",\ndata: "多行数据"}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('多行数据');
  });

  test('忽略注释行（以冒号开头）', () => {
    const message = `: this is a comment\ndata: ${JSON.stringify({ type: 'content', data: 'test' })}\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('test');
  });

  test('flush 正确处理剩余数据', () => {
    const content = '剩余内容';
    const fullData = JSON.stringify({ type: 'content', data: content });
    const fullMessage = `data: ${fullData}\n\n`;
    const bytes = stringToUint8Array(fullMessage);
    
    const partial = bytes.slice(0, -5);
    const decoded = parser.decode(partial);
    parser.push(decoded);
    
    const flushed = parser.flush();
    parser.push(flushed);
    
    const result = parser.parseMessages();
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe(content);
  });

  test('clear 清空 buffer', () => {
    parser.push('some data');
    expect(parser.getBufferLength()).toBeGreaterThan(0);
    
    parser.clear();
    expect(parser.getBufferLength()).toBe(0);
  });

  test('处理空消息', () => {
    const message = `\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(0);
  });

  test('处理混合内容和引用来源', () => {
    const sources = [{ id: 1, file_name: 'test.md', content: '内容', source: 'test.md' }];
    const msg1 = `data: ${JSON.stringify({ type: 'sources', data: sources })}\n\n`;
    const msg2 = `data: ${JSON.stringify({ type: 'content', data: '回答内容' })}\n\n`;
    const msg3 = `data: ${JSON.stringify({ type: 'content', data: '更多回答' })}\n\n`;
    
    parser.push(msg1 + msg2 + msg3);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(3);
    expect(result[0]?.type).toBe('sources');
    expect(result[1]?.type).toBe('content');
    expect(result[2]?.type).toBe('content');
  });
});

describe('SSEParser 边界情况测试', () => {
  let parser: SSEParser;

  beforeEach(() => {
    parser = new SSEParser();
  });

  test('处理非常大的 buffer', () => {
    const largeContent = 'a'.repeat(1024 * 1024 + 100);
    
    parser.push(largeContent);
    parser.parseMessages();
    
    expect(parser.getBufferLength()).toBe(0);
  });

  test('处理连续的空行', () => {
    const message = `data: ${JSON.stringify({ type: 'content', data: 'test' })}\n\n\n\n`;
    
    parser.push(message);
    const result = parser.parseMessages();
    
    expect(result).toHaveLength(1);
    expect(result[0]?.data).toBe('test');
  });

  test('处理在消息中间截断的 Emoji', () => {
    const emojis = '🌟🎉🌍✅🚀';
    const content = `测试 ${emojis} 结束`;
    const fullData = JSON.stringify({ type: 'content', data: content });
    const fullMessage = `data: ${fullData}\n\n`;
    const bytes = stringToUint8Array(fullMessage);
    
    for (let i = 1; i < bytes.length; i++) {
      const testParser = new SSEParser();
      const chunk1 = bytes.slice(0, i);
      const chunk2 = bytes.slice(i);
      
      const decoded1 = testParser.decode(chunk1);
      testParser.push(decoded1);
      let result = testParser.parseMessages();
      
      const decoded2 = testParser.decode(chunk2);
      testParser.push(decoded2);
      result = testParser.parseMessages();
      
      if (result.length > 0) {
        expect(result[0]?.data).toBe(content);
        for (const emoji of emojis) {
          expect(result[0]?.data).toContain(emoji);
        }
      }
    }
  });
});

console.log('所有测试通过！');
