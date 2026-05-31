const { SQL_KEYWORDS } = require('./config');

class Fixer {
  constructor() {
    this.fixedCount = 0;
    this.protectedRanges = [];
    this.sqlLines = [];
  }

  applyFixes(sql, errors, protectedRanges = []) {
    let fixedSql = sql;
    this.fixedCount = 0;
    this.protectedRanges = protectedRanges;
    this.sqlLines = sql.split('\n');

    const fixableErrors = errors
      .filter(e => e.fixable && e.fix)
      .sort((a, b) => {
        const lineA = a.fix.start?.line || a.fix.line || a.line || 0;
        const lineB = b.fix.start?.line || b.fix.line || b.line || 0;
        const colA = a.fix.start?.column || a.column || 0;
        const colB = b.fix.start?.column || b.column || 0;
        return lineB - lineA || colB - colA;
      });

    for (const error of fixableErrors) {
      if (!this.isFixInProtectedRange(error)) {
        const result = this.applyFix(fixedSql, error);
        if (result.applied) {
          fixedSql = result.sql;
          this.fixedCount++;
        }
      }
    }

    return {
      sql: fixedSql,
      fixedCount: this.fixedCount
    };
  }

  getLineOffset(lineNum) {
    let offset = 0;
    for (let i = 0; i < lineNum - 1 && i < this.sqlLines.length; i++) {
      offset += this.sqlLines[i].length + 1;
    }
    return offset;
  }

  isFixInProtectedRange(error) {
    const fix = error.fix;
    if (!fix || this.protectedRanges.length === 0) return false;

    let startLine, startCol, endCol;
    
    if (fix.start) {
      startLine = fix.start.line;
      startCol = fix.start.column;
      endCol = fix.end?.column;
    } else if (fix.line) {
      startLine = fix.line;
      startCol = error.column || 1;
      endCol = startCol + (fix.oldValue?.length || 1);
    } else {
      startLine = error.line;
      startCol = error.column || 1;
      endCol = startCol + 1;
    }

    const lineOffset = this.getLineOffset(startLine);
    const startPos = lineOffset + startCol - 1;
    const endPos = lineOffset + (endCol || startCol) - 1;

    for (const range of this.protectedRanges) {
      if (startPos >= range.start && endPos <= range.end) {
        return true;
      }
      if (startPos < range.end && endPos > range.start) {
        return true;
      }
    }
    return false;
  }

  applyFix(sql, error) {
    const fix = error.fix;
    if (!fix) return { sql, applied: false };

    switch (fix.type) {
      case 'uppercase':
        return this.fixUppercase(sql, fix);
      case 'trim-trailing':
        return this.fixTrimTrailing(sql, fix);
      case 'indentation':
        return this.fixIndentation(sql, fix);
      case 'wrap-quote':
        return this.fixWrapQuote(sql, error, fix);
      case 'wrap-backtick':
        return this.fixWrapBacktick(sql, error, fix);
      default:
        return { sql, applied: false };
    }
  }

  fixUppercase(sql, fix) {
    const lines = sql.split('\n');
    const lineIndex = fix.start.line - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const startCol = fix.start.column - 1;
      const endCol = fix.end.column - 1;
      
      if (startCol >= 0 && endCol <= line.length) {
        const before = line.substring(0, startCol);
        const after = line.substring(endCol);
        lines[lineIndex] = before + fix.newValue + after;
        return { sql: lines.join('\n'), applied: true };
      }
    }
    return { sql, applied: false };
  }

  fixTrimTrailing(sql, fix) {
    const lines = sql.split('\n');
    const lineIndex = fix.line - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      lines[lineIndex] = fix.newValue;
      return { sql: lines.join('\n'), applied: true };
    }
    return { sql, applied: false };
  }

  fixIndentation(sql, fix) {
    const lines = sql.split('\n');
    const lineIndex = fix.line - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const trimmed = line.trimStart();
      const newIndent = ' '.repeat(fix.expectedIndent);
      lines[lineIndex] = newIndent + trimmed;
      return { sql: lines.join('\n'), applied: true };
    }
    return { sql, applied: false };
  }

  fixWrapQuote(sql, error, fix) {
    const lines = sql.split('\n');
    const lineIndex = (error.line || 1) - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const value = fix.value;
      const table = fix.table;
      const quoteChar = fix.quoteChar || '`';
      
      let pattern;
      let replacement;
      
      const escapedQuote = quoteChar === '`' ? '`' : quoteChar;
      
      if (table) {
        const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lookBehind = `(?<!${escapedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
        const lookAhead = `(?!${escapedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
        pattern = new RegExp(lookBehind + escapedTable + '\\.' + escapedValue + lookAhead, 'g');
        replacement = `${table}.${quoteChar}${value}${quoteChar}`;
      } else {
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lookBehind = `(?<!${escapedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
        const lookAhead = `(?!${escapedQuote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
        pattern = new RegExp(lookBehind + '\\b' + escapedValue + '\\b' + lookAhead, 'g');
        replacement = `${quoteChar}${value}${quoteChar}`;
      }
      
      if (pattern.test(line)) {
        lines[lineIndex] = line.replace(pattern, replacement);
        return { sql: lines.join('\n'), applied: true };
      }
    }
    return { sql, applied: false };
  }

  fixWrapBacktick(sql, error, fix) {
    const lines = sql.split('\n');
    const lineIndex = (error.line || 1) - 1;
    
    if (lineIndex >= 0 && lineIndex < lines.length) {
      const line = lines[lineIndex];
      const value = fix.value;
      const table = fix.table;
      
      let pattern;
      let replacement;
      
      if (table) {
        const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp('(?<!`)' + escapedTable + '\\.' + escapedValue + '(?!`)', 'g');
        replacement = `${table}.\`${value}\``;
      } else {
        const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp('(?<!`)\\b' + escapedValue + '\\b(?!`)', 'g');
        replacement = `\`${value}\``;
      }
      
      if (pattern.test(line)) {
        lines[lineIndex] = line.replace(pattern, replacement);
        return { sql: lines.join('\n'), applied: true };
      }
    }
    return { sql, applied: false };
  }

  fixKeywordCase(sql) {
    const keywordPattern = new RegExp(`\\b(${SQL_KEYWORDS.join('|')})\\b`, 'gi');
    return sql.replace(keywordPattern, (match) => match.toUpperCase());
  }

  formatSQL(sql) {
    let formatted = sql;
    
    formatted = formatted
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*\(\s*/g, ' (')
      .replace(/\s*\)\s*/g, ') ')
      .replace(/\s*=\s*/g, ' = ')
      .replace(/\s*<>\s*/g, ' <> ')
      .replace(/\s*<=\s*/g, ' <= ')
      .replace(/\s*>=\s*/g, ' >= ')
      .replace(/\s*<\s*/g, ' < ')
      .replace(/\s*>\s*/g, ' > ')
      .replace(/\s*\+\s*/g, ' + ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s*\*\s*/g, ' * ')
      .replace(/\s*\/\s*/g, ' / ')
      .trim();

    return formatted;
  }
}

module.exports = Fixer;
