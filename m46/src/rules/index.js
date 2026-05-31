class LintError {
  constructor(options) {
    this.rule = options.rule;
    this.message = options.message;
    this.line = options.line || 1;
    this.column = options.column || 1;
    this.severity = options.severity || 'warning';
    this.fixable = options.fixable || false;
    this.fix = options.fix || null;
    this.node = options.node || null;
  }
}

class RuleEngine {
  constructor(config, parser) {
    this.config = config;
    this.parser = parser;
    this.errors = [];
    this.sqlLines = [];
    this.statementStartLines = [];
    this.protectedRanges = [];
    this.keywords = config.getKeywords();
    this.quoteChar = config.getQuoteChar();
    this.databaseType = config.databaseType;
  }

  lint(sql, ast) {
    this.errors = [];
    this.sqlLines = sql.split('\n');
    this.detectStatementBoundaries();
    this.detectProtectedRanges(sql);

    const enabledRules = this.config.getEnabledRules();

    for (const rule of enabledRules) {
      switch (rule.name) {
        case 'select-no-asterisk':
          this.checkSelectNoAsterisk(ast, rule);
          break;
        case 'table-name-backtick':
          this.checkTableNameBacktick(ast, rule, '`');
          break;
        case 'column-name-backtick':
          this.checkColumnNameBacktick(ast, rule, '`');
          break;
        case 'table-name-double-quote':
          this.checkTableNameBacktick(ast, rule, '"');
          break;
        case 'column-name-double-quote':
          this.checkColumnNameBacktick(ast, rule, '"');
          break;
        case 'keyword-uppercase':
          this.checkKeywordUppercase(rule);
          break;
        case 'indentation':
          this.checkIndentation(rule);
          break;
        case 'no-trailing-whitespace':
          this.checkTrailingWhitespace(rule);
          break;
        case 'where-required':
          this.checkWhereRequired(ast, rule);
          break;
        case 'insert-explicit-columns':
          this.checkInsertExplicitColumns(ast, rule);
          break;
        case 'foreign-key-check':
          this.checkForeignKey(ast, rule);
          break;
      }
    }

    return this.errors;
  }

  detectStatementBoundaries() {
    this.statementStartLines = [];
    const statementKeywords = ['with', 'select', 'insert', 'update', 'delete', 'create', 'alter', 'drop'];
    let parenDepth = 0;
    let inMultiLineComment = false;
    
    for (let i = 0; i < this.sqlLines.length; i++) {
      let line = this.sqlLines[i];
      const trimmed = line.trim().toLowerCase();
      
      if (parenDepth === 0 && !inMultiLineComment) {
        for (const kw of statementKeywords) {
          if (trimmed.startsWith(kw)) {
            this.statementStartLines.push(i + 1);
            break;
          }
        }
      }
      
      let j = 0;
      while (j < line.length) {
        if (inMultiLineComment) {
          const endIdx = line.indexOf('*/', j);
          if (endIdx >= 0) {
            inMultiLineComment = false;
            j = endIdx + 2;
          } else {
            j = line.length;
          }
        } else if (line[j] === '-' && line[j + 1] === '-') {
          j = line.length;
        } else if (line[j] === '/' && line[j + 1] === '*') {
          inMultiLineComment = true;
          j += 2;
        } else if (line[j] === "'" || line[j] === '"') {
          const quote = line[j];
          j++;
          while (j < line.length) {
            if (line[j] === quote && line[j + 1] === quote) {
              j += 2;
            } else if (line[j] === quote) {
              j++;
              break;
            } else {
              j++;
            }
          }
        } else if (line[j] === '(') {
          parenDepth++;
          j++;
        } else if (line[j] === ')') {
          parenDepth = Math.max(0, parenDepth - 1);
          j++;
        } else if (line[j] === ';' && parenDepth === 0) {
          parenDepth = 0;
          j++;
        } else {
          j++;
        }
      }
    }
  }

  detectProtectedRanges(sql) {
    this.protectedRanges = [];
    let i = 0;
    const len = sql.length;
    
    while (i < len) {
      if (sql[i] === '-' && sql[i + 1] === '-') {
        const start = i;
        while (i < len && sql[i] !== '\n') {
          i++;
        }
        this.protectedRanges.push({ start, end: i, type: 'comment' });
      } else if (sql[i] === '/' && sql[i + 1] === '*') {
        const start = i;
        i += 2;
        while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) {
          i++;
        }
        i += 2;
        this.protectedRanges.push({ start, end: i, type: 'comment' });
      } else if (sql[i] === "'") {
        const start = i;
        i++;
        while (i < len) {
          if (sql[i] === "'" && sql[i + 1] === "'") {
            i += 2;
          } else if (sql[i] === "'") {
            i++;
            break;
          } else {
            i++;
          }
        }
        this.protectedRanges.push({ start, end: i, type: 'string' });
      } else if (sql[i] === '"') {
        const start = i;
        i++;
        while (i < len) {
          if (sql[i] === '"' && sql[i + 1] === '"') {
            i += 2;
          } else if (sql[i] === '"') {
            i++;
            break;
          } else {
            i++;
          }
        }
        this.protectedRanges.push({ start, end: i, type: 'string' });
      } else {
        i++;
      }
    }
  }

  getLineOffset(lineNum) {
    let offset = 0;
    for (let i = 0; i < lineNum - 1 && i < this.sqlLines.length; i++) {
      offset += this.sqlLines[i].length + 1;
    }
    return offset;
  }

  isInProtectedRange(lineNum, colNum, endColNum = null) {
    const lineOffset = this.getLineOffset(lineNum);
    const startPos = lineOffset + colNum - 1;
    const endPos = endColNum ? lineOffset + endColNum - 1 : startPos;
    
    for (const range of this.protectedRanges) {
      if (startPos >= range.start && endPos <= range.end) {
        return true;
      }
    }
    return false;
  }

  findColumn(line, text) {
    const idx = this.sqlLines[line - 1]?.toLowerCase().indexOf(text.toLowerCase());
    return idx >= 0 ? idx + 1 : 1;
  }

  checkSelectNoAsterisk(ast, rule) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    const allStatements = [];
    for (const statement of astArray) {
      allStatements.push({ stmt: statement, stmtIdx: allStatements.length });
      
      if (statement.with && Array.isArray(statement.with)) {
        for (const cte of statement.with) {
          if (cte.stmt && cte.stmt.ast) {
            allStatements.push({ stmt: cte.stmt.ast, stmtIdx: allStatements.length, isCTE: true });
          }
        }
      }
    }
    
    for (let sIdx = 0; sIdx < allStatements.length; sIdx++) {
      const { stmt: statement, stmtIdx } = allStatements[sIdx];
      const selectNodes = this.parser.findNodes(statement, 'select');
      
      for (const node of selectNodes) {
        if (node.columns) {
          for (const col of node.columns) {
            if (col.expr?.type === 'column_ref' && col.expr.column === '*') {
              const startLine = this.statementStartLines[stmtIdx] || 1;
              const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
              
              let lineNum = startLine;
              for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
                if (/\*/.test(this.sqlLines[i])) {
                  lineNum = i + 1;
                  break;
                }
              }
              
              const colNum = this.findColumn(lineNum, '*');
              this.errors.push(new LintError({
                rule: rule.name,
                message: rule.description,
                line: lineNum,
                column: colNum,
                severity: rule.severity,
                fixable: rule.fixable,
                node: col
              }));
            }
          }
        }
      }
    }
  }

  checkTableNameBacktick(ast, rule, quoteChar) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    const allStatements = [];
    for (const statement of astArray) {
      allStatements.push({ stmt: statement, stmtIdx: allStatements.length });
      
      if (statement.with && Array.isArray(statement.with)) {
        for (const cte of statement.with) {
          if (cte.stmt && cte.stmt.ast) {
            allStatements.push({ stmt: cte.stmt.ast, stmtIdx: allStatements.length, isCTE: true, cteName: cte.name?.value });
          }
        }
      }
    }
    
    for (let sIdx = 0; sIdx < allStatements.length; sIdx++) {
      const { stmt: statement, stmtIdx } = allStatements[sIdx];
      const stmtType = statement.type;
      const tableRefs = [];
      
      if (stmtType === 'select' && statement.from) {
        statement.from.forEach(t => {
          if (t.table) tableRefs.push({ table: t.table, node: t, parentType: 'select' });
        });
      } else if (stmtType === 'insert' && statement.table) {
        tableRefs.push({ table: statement.table, node: statement.table, parentType: 'insert' });
      } else if (stmtType === 'update' && statement.table) {
        tableRefs.push({ table: statement.table, node: statement.table, parentType: 'update' });
      } else if (stmtType === 'delete' && statement.from) {
        statement.from.forEach(t => {
          if (t.table) tableRefs.push({ table: t.table, node: t, parentType: 'delete' });
        });
      }

      for (const ref of tableRefs) {
        const tableName = typeof ref.table === 'string' ? ref.table : ref.table?.table;
        if (tableName && !tableName.startsWith(quoteChar) && !tableName.endsWith(quoteChar)) {
          const startLine = this.statementStartLines[stmtIdx] || 1;
          const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
          
          let lineNum = startLine;
          const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
            if (new RegExp('\\b' + escapedName + '\\b', 'i').test(this.sqlLines[i])) {
              lineNum = i + 1;
              break;
            }
          }
          
          const lineContent = this.sqlLines[lineNum - 1] || '';
          const escapedQuote = quoteChar === '`' ? '`' : '"';
          const alreadyWrapped = new RegExp(escapedQuote + escapedName + escapedQuote, 'i').test(lineContent);
          
          if (!alreadyWrapped) {
            const colNum = this.findColumn(lineNum, tableName);
            const quoteName = quoteChar === '`' ? '反引号' : '双引号';
            this.errors.push(new LintError({
              rule: rule.name,
              message: `表名 \`${tableName}\` 必须用${quoteName}包裹`,
              line: lineNum,
              column: colNum,
              severity: rule.severity,
              fixable: rule.fixable,
              node: ref.node,
              fix: {
                type: 'wrap-quote',
                target: 'table',
                value: tableName,
                quoteChar: quoteChar
              }
            }));
          }
        }
      }
    }
  }

  checkColumnNameBacktick(ast, rule, quoteChar) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    const allStatements = [];
    for (const statement of astArray) {
      allStatements.push({ stmt: statement, stmtIdx: allStatements.length });
      
      if (statement.with && Array.isArray(statement.with)) {
        for (const cte of statement.with) {
          if (cte.stmt && cte.stmt.ast) {
            allStatements.push({ stmt: cte.stmt.ast, stmtIdx: allStatements.length, isCTE: true, cteName: cte.name?.value });
          }
        }
      }
    }
    
    for (let sIdx = 0; sIdx < allStatements.length; sIdx++) {
      const { stmt: statement, stmtIdx } = allStatements[sIdx];
      const columnRefs = [];
      
      this.parser.traverse(statement, {
        'column_ref': (node) => {
          if (node.column && typeof node.column === 'string') {
            columnRefs.push(node);
          }
        }
      });

      for (const colRef of columnRefs) {
        const colName = colRef.column;
        const tableName = colRef.table;
        
        if (colName && !colName.startsWith(quoteChar) && !colName.endsWith(quoteChar) && colName !== '*') {
          let searchPattern;
          if (tableName) {
            searchPattern = `${tableName}\\.${colName}`;
          } else {
            searchPattern = `\\b${colName}\\b`;
          }
          
          const startLine = this.statementStartLines[stmtIdx] || 1;
          const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
          
          let lineNum = startLine;
          for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
            if (this.sqlLines[i].match(new RegExp(searchPattern, 'i'))) {
              lineNum = i + 1;
              break;
            }
          }
          
          const lineContent = this.sqlLines[lineNum - 1] || '';
          const escapedCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedQuote = quoteChar === '`' ? '`' : '"';
          let alreadyWrapped;
          if (tableName) {
            const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            alreadyWrapped = new RegExp(escapedTable + '\\.' + escapedQuote + escapedCol + escapedQuote, 'i').test(lineContent);
          } else {
            alreadyWrapped = new RegExp(escapedQuote + escapedCol + escapedQuote, 'i').test(lineContent);
          }
          
          if (!alreadyWrapped) {
            const fullColName = tableName ? `${tableName}.${colName}` : colName;
            const colNum = this.findColumn(lineNum, tableName ? `${tableName}.` : colName);
            const quoteName = quoteChar === '`' ? '反引号' : '双引号';
            
            this.errors.push(new LintError({
              rule: rule.name,
              message: `列名 \`${fullColName}\` 建议用${quoteName}包裹`,
              line: lineNum,
              column: tableName ? colNum + tableName.length + 1 : colNum,
              severity: rule.severity,
              fixable: rule.fixable,
              node: colRef,
              fix: {
                type: 'wrap-quote',
                target: 'column',
                value: colName,
                table: tableName,
                quoteChar: quoteChar
              }
            }));
          }
        }
      }
    }
  }

  checkKeywordUppercase(rule) {
    const keywordPattern = new RegExp(`\\b(${this.keywords.join('|')})\\b`, 'gi');
    
    for (let i = 0; i < this.sqlLines.length; i++) {
      const line = this.sqlLines[i];
      let match;
      while ((match = keywordPattern.exec(line)) !== null) {
        const matchedWord = match[0];
        const startCol = match.index + 1;
        const endCol = match.index + matchedWord.length + 1;
        
        if (matchedWord !== matchedWord.toUpperCase()) {
          if (!this.isInProtectedRange(i + 1, startCol, endCol)) {
            this.errors.push(new LintError({
              rule: rule.name,
              message: `关键字 \`${matchedWord}\` 应该大写为 \`${matchedWord.toUpperCase()}\``,
              line: i + 1,
              column: startCol,
              severity: rule.severity,
              fixable: rule.fixable,
              fix: {
                type: 'uppercase',
                start: { line: i + 1, column: startCol },
                end: { line: i + 1, column: endCol },
                oldValue: matchedWord,
                newValue: matchedWord.toUpperCase()
              }
            }));
          }
        }
      }
    }
  }

  checkIndentation(rule) {
    const indentSize = rule.options?.indentSize || 2;
    let inMultiLineParen = false;
    let inSetClause = false;
    let inCTE = false;
    let cteDepth = 0;

    for (let i = 0; i < this.sqlLines.length; i++) {
      const line = this.sqlLines[i];
      if (line.trim() === '') continue;

      const leadingSpaces = line.match(/^ */)[0].length;
      const actualIndent = leadingSpaces;
      const upperLine = line.trim().toUpperCase();
      
      let expectedIndent = 0;
      
      if (upperLine.startsWith('WITH')) {
        inCTE = true;
        cteDepth = 0;
        expectedIndent = 0;
      } else if (inCTE && upperLine.startsWith('(')) {
        cteDepth++;
        expectedIndent = indentSize * cteDepth;
      } else if (inCTE && upperLine.startsWith(')')) {
        cteDepth--;
        if (cteDepth === 0 && !upperLine.includes(',')) {
          inCTE = false;
        }
        expectedIndent = Math.max(0, indentSize * (cteDepth - 1));
      } else if (inCTE && cteDepth > 0) {
        expectedIndent = indentSize * cteDepth;
      } else if (inCTE) {
        expectedIndent = indentSize;
      } else if (upperLine.match(/^(AND|OR|ON)/)) {
        expectedIndent = indentSize;
      }
      
      if (upperLine.startsWith('SET')) {
        inSetClause = true;
        expectedIndent = 0;
      } else if (inSetClause && !upperLine.match(/^(WHERE|ORDER|GROUP|HAVING|LIMIT|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)/) && !upperLine.startsWith('SET')) {
        expectedIndent = indentSize * 2;
      }
      
      if (upperLine.match(/^(WHERE|ORDER|GROUP|HAVING|LIMIT|FROM|JOIN|LEFT|RIGHT|INNER)/)) {
        inSetClause = false;
        inMultiLineParen = false;
        if (!inCTE) {
          expectedIndent = 0;
        }
      }
      
      if (upperLine.startsWith(')')) {
        inMultiLineParen = false;
      }
      
      if (inMultiLineParen && !upperLine.match(/^(FROM|WHERE|AND|OR|GROUP|ORDER|HAVING|JOIN|LEFT|RIGHT|INNER|ON|SET|VALUES|LIMIT|SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)/)) {
        expectedIndent = indentSize;
      }
      
      if (upperLine.endsWith('(') && !upperLine.includes(')')) {
        inMultiLineParen = true;
      }

      if (actualIndent !== expectedIndent && !upperLine.match(/^(--|#)/)) {
        this.errors.push(new LintError({
          rule: rule.name,
          message: `缩进错误：期望 ${expectedIndent} 空格，实际 ${actualIndent} 空格`,
          line: i + 1,
          column: 1,
          severity: rule.severity,
          fixable: rule.fixable,
          fix: {
            type: 'indentation',
            line: i + 1,
            expectedIndent: expectedIndent,
            actualIndent: actualIndent
          }
        }));
      }
    }
  }

  checkTrailingWhitespace(rule) {
    for (let i = 0; i < this.sqlLines.length; i++) {
      const line = this.sqlLines[i];
      if (line.endsWith(' ') || line.endsWith('\t')) {
        const trimmed = line.trimEnd();
        this.errors.push(new LintError({
          rule: rule.name,
          message: rule.description,
          line: i + 1,
          column: trimmed.length + 1,
          severity: rule.severity,
          fixable: rule.fixable,
          fix: {
            type: 'trim-trailing',
            line: i + 1,
            oldValue: line,
            newValue: trimmed
          }
        }));
      }
    }
  }

  checkWhereRequired(ast, rule) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    const allStatements = [];
    for (const statement of astArray) {
      allStatements.push({ stmt: statement, stmtIdx: allStatements.length });
      
      if (statement.with && Array.isArray(statement.with)) {
        for (const cte of statement.with) {
          if (cte.stmt && cte.stmt.ast) {
            allStatements.push({ stmt: cte.stmt.ast, stmtIdx: allStatements.length, isCTE: true });
          }
        }
      }
    }
    
    for (let sIdx = 0; sIdx < allStatements.length; sIdx++) {
      const { stmt: node, stmtIdx } = allStatements[sIdx];
      if ((node.type === 'update' || node.type === 'delete') && !node.where) {
        const startLine = this.statementStartLines[stmtIdx] || 1;
        const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
        
        let lineNum = startLine;
        for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
          if (new RegExp('\\b' + node.type + '\\b', 'i').test(this.sqlLines[i])) {
            lineNum = i + 1;
            break;
          }
        }
        
        this.errors.push(new LintError({
          rule: rule.name,
          message: `${node.type.toUpperCase()} 语句 ${rule.description}`,
          line: lineNum,
          column: 1,
          severity: rule.severity,
          fixable: rule.fixable,
          node: node
        }));
      }
    }
  }

  checkInsertExplicitColumns(ast, rule) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    const allStatements = [];
    for (const statement of astArray) {
      allStatements.push({ stmt: statement, stmtIdx: allStatements.length });
      
      if (statement.with && Array.isArray(statement.with)) {
        for (const cte of statement.with) {
          if (cte.stmt && cte.stmt.ast) {
            allStatements.push({ stmt: cte.stmt.ast, stmtIdx: allStatements.length, isCTE: true });
          }
        }
      }
    }
    
    for (let sIdx = 0; sIdx < allStatements.length; sIdx++) {
      const { stmt: node, stmtIdx } = allStatements[sIdx];
      if (node.type === 'insert' && (!node.columns || node.columns.length === 0)) {
        const startLine = this.statementStartLines[stmtIdx] || 1;
        const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
        
        let lineNum = startLine;
        for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
          if (/\binsert\b/i.test(this.sqlLines[i])) {
            lineNum = i + 1;
            break;
          }
        }
        
        this.errors.push(new LintError({
          rule: rule.name,
          message: rule.description,
          line: lineNum,
          column: 1,
          severity: rule.severity,
          fixable: rule.fixable,
          node: node
        }));
      }
    }
  }

  checkForeignKey(ast, rule) {
    const astArray = Array.isArray(ast) ? ast : [ast];
    
    for (let stmtIdx = 0; stmtIdx < astArray.length; stmtIdx++) {
      const statement = astArray[stmtIdx];
      
      if (statement.type === 'create' && statement.keyword === 'table' && statement.create_definitions) {
        for (const def of statement.create_definitions) {
          if (def.resource === 'constraint' && def.constraint_type === 'foreign key') {
            const startLine = this.statementStartLines[stmtIdx] || 1;
            const endLine = this.statementStartLines[stmtIdx + 1] || (this.sqlLines.length + 1);
            
            let lineNum = startLine;
            for (let i = startLine - 1; i < endLine - 1 && i < this.sqlLines.length; i++) {
              if (/\bforeign\s+key\b/i.test(this.sqlLines[i])) {
                lineNum = i + 1;
                break;
              }
            }
            
            this.errors.push(new LintError({
              rule: rule.name,
              message: `检测到外键约束: ${def.constraint_name || 'FOREIGN KEY'}`,
              line: lineNum,
              column: 1,
              severity: rule.severity,
              fixable: rule.fixable,
              node: def
            }));
          }
        }
      }
      
      if (statement.type === 'alter' && statement.expr && statement.expr.action === 'add' && 
          statement.expr.resource === 'constraint' && statement.expr.constraint_type === 'foreign key') {
        const startLine = this.statementStartLines[stmtIdx] || 1;
        
        this.errors.push(new LintError({
          rule: rule.name,
          message: `检测到外键约束: ${statement.expr.constraint_name || 'FOREIGN KEY'}`,
          line: startLine,
          column: 1,
          severity: rule.severity,
          fixable: rule.fixable,
          node: statement.expr
        }));
      }
    }
  }
}

module.exports = { RuleEngine, LintError };
