const fs = require('fs');

function buildLineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

function lineColToOffset(lineStarts, line, column) {
  if (line < 1 || line > lineStarts.length) return 0;
  return lineStarts[line - 1] + column;
}

function offsetToLineCol(lineStarts, offset) {
  for (let i = lineStarts.length - 1; i >= 0; i--) {
    if (lineStarts[i] <= offset) {
      return { line: i + 1, column: offset - lineStarts[i] };
    }
  }
  return { line: 1, column: 0 };
}

function computeDeltaMap(appliedFixes) {
  const deltas = [];
  for (const fix of appliedFixes) {
    const [start, end] = fix.range;
    const oldLen = end - start;
    const newLen = fix.text.length;
    deltas.push({ start, end, text: fix.text, delta: newLen - oldLen });
  }
  return deltas;
}

function mapOffset(originalOffset, deltas) {
  let newOffset = originalOffset;
  for (const d of deltas) {
    if (d.start >= originalOffset) break;
    if (d.end > originalOffset) {
      newOffset = d.start + d.text.length;
      break;
    }
    newOffset += d.delta;
  }
  return newOffset;
}

function recalculateMessages(source, output, appliedFixes, messages) {
  if (appliedFixes.length === 0 || messages.length === 0) return messages;

  const srcLineStarts = buildLineStarts(source);
  const outLineStarts = buildLineStarts(output);
  const deltas = computeDeltaMap(appliedFixes);

  return messages.map((msg) => {
    if (!msg.line) return msg;

    const origOffset = lineColToOffset(srcLineStarts, msg.line, msg.column);
    const newOffset = mapOffset(origOffset, deltas);
    const newLoc = offsetToLineCol(outLineStarts, newOffset);

    return { ...msg, line: newLoc.line, column: newLoc.column };
  });
}

function applyFixes(filePath, source, messages, hasBOM) {
  const fixableMessages = messages.filter((m) => m.fix && m.fix.range);
  const unfixableMessages = messages.filter((m) => !m.fix || !m.fix.range);

  if (fixableMessages.length === 0) {
    return { fixed: false, fixedCount: 0, output: source, remainingMessages: unfixableMessages, appliedFixes: [] };
  }

  const sortedFixes = [...fixableMessages].sort((a, b) => a.fix.range[0] - b.fix.range[0]);

  let output = '';
  let lastEnd = 0;
  let fixedCount = 0;
  const appliedFixes = [];

  for (const msg of sortedFixes) {
    const [start, end] = msg.fix.range;
    if (start < lastEnd) continue;

    output += source.substring(lastEnd, start);
    output += msg.fix.text;
    lastEnd = end;
    fixedCount++;
    appliedFixes.push({ range: [start, end], text: msg.fix.text });
  }

  output += source.substring(lastEnd);

  const remainingMessages = recalculateMessages(source, output, appliedFixes, unfixableMessages);

  return {
    fixed: fixedCount > 0,
    fixedCount,
    output,
    remainingMessages,
    appliedFixes,
  };
}

function writeFileWithBOM(filePath, output, hasBOM) {
  let buffer = Buffer.from(output, 'utf-8');
  if (hasBOM) {
    const bomBuf = Buffer.from([0xef, 0xbb, 0xbf]);
    buffer = Buffer.concat([bomBuf, buffer]);
  }
  fs.writeFileSync(filePath, buffer);
}

module.exports = { applyFixes, writeFileWithBOM };
