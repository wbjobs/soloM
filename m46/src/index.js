const fs = require('fs');
const path = require('path');
const ASTParser = require('./parser');
const { RuleConfig } = require('./config');
const { RuleEngine } = require('./rules');
const Fixer = require('./fixer');

class SQLLinter {
  constructor(customConfig = {}) {
    this.config = new RuleConfig(customConfig);
    this.parser = new ASTParser();
    this.ruleEngine = new RuleEngine(this.config, this.parser);
    this.fixer = new Fixer();
  }

  lintFile(filePath, options = {}) {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      return {
        filePath: absolutePath,
        success: false,
        errors: [{
          rule: 'file-not-found',
          message: `文件不存在: ${absolutePath}`,
          severity: 'error'
        }],
        parseErrors: [],
        fixedSql: null
      };
    }

    const sql = fs.readFileSync(absolutePath, 'utf8');
    return this.lintSQL(sql, filePath, options);
  }

  lintSQL(sql, filePath = '<inline>', options = {}) {
    const { fix = false } = options;
    
    const parseResult = this.parser.parse(sql, this.config.databaseType);
    
    if (!parseResult.success) {
      return {
        filePath,
        success: false,
        errors: [],
        parseErrors: parseResult.errors,
        fixedSql: null
      };
    }

    const lintErrors = this.ruleEngine.lint(sql, parseResult.ast);
    
    let fixedSql = null;
    let fixedCount = 0;
    
    if (fix) {
      const fixResult = this.fixer.applyFixes(sql, lintErrors, this.ruleEngine.protectedRanges);
      fixedSql = fixResult.sql;
      fixedCount = fixResult.fixedCount;
    }

    const errorCount = lintErrors.filter(e => e.severity === 'error').length;
    const warningCount = lintErrors.filter(e => e.severity === 'warning').length;

    return {
      filePath,
      success: errorCount === 0,
      errors: lintErrors,
      parseErrors: [],
      fixedSql,
      fixedCount,
      stats: {
        errorCount,
        warningCount,
        fixableCount: lintErrors.filter(e => e.fixable).length
      }
    };
  }

  lintFiles(filePatterns, options = {}) {
    const files = this.resolveFiles(filePatterns);
    const results = [];
    
    for (const file of files) {
      const result = this.lintFile(file, options);
      results.push(result);
      
      if (options.fix && result.fixedSql !== null) {
        fs.writeFileSync(file, result.fixedSql, 'utf8');
      }
    }
    
    return results;
  }

  resolveFiles(patterns) {
    const files = [];
    
    for (const pattern of patterns) {
      const absolutePath = path.resolve(pattern);
      
      if (fs.existsSync(absolutePath)) {
        const stat = fs.statSync(absolutePath);
        
        if (stat.isDirectory()) {
          const sqlFiles = this.findSQLFiles(absolutePath);
          files.push(...sqlFiles);
        } else if (stat.isFile() && pattern.endsWith('.sql')) {
          files.push(absolutePath);
        }
      } else {
        const glob = require('glob');
        const matches = glob.sync(pattern, { absolute: true });
        files.push(...matches.filter(f => f.endsWith('.sql')));
      }
    }
    
    return [...new Set(files)];
  }

  findSQLFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        results.push(...this.findSQLFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.sql')) {
        results.push(fullPath);
      }
    }
    
    return results;
  }

  formatResults(results, options = {}) {
    const { format = 'text' } = options;
    
    if (format === 'json') {
      return JSON.stringify(results, null, 2);
    }
    
    return this.formatAsText(results);
  }

  formatAsText(results) {
    let output = '';
    let totalErrors = 0;
    let totalWarnings = 0;
    let totalFixed = 0;
    
    for (const result of results) {
      if (!result.success || result.errors.length > 0 || result.parseErrors.length > 0) {
        output += `\n${result.filePath}\n`;
        output += `${'='.repeat(result.filePath.length)}\n`;
        
        for (const parseErr of result.parseErrors) {
          output += `  ${parseErr.line}:${parseErr.column}  Parse Error  ${parseErr.message}\n`;
        }
        
        for (const error of result.errors) {
          const severity = error.severity === 'error' ? 'Error' : 'Warning';
          const fixable = error.fixable ? ' [fixable]' : '';
          output += `  ${error.line}:${error.column}  ${severity}  ${error.message}  (${error.rule})${fixable}\n`;
        }
        
        if (result.fixedCount > 0) {
          output += `  已自动修复 ${result.fixedCount} 个问题\n`;
          totalFixed += result.fixedCount;
        }
        
        totalErrors += result.stats?.errorCount || 0;
        totalWarnings += result.stats?.warningCount || 0;
      }
    }
    
    if (totalErrors > 0 || totalWarnings > 0) {
      output += `\n总计: ${totalErrors} 个错误, ${totalWarnings} 个警告`;
      if (totalFixed > 0) {
        output += `, 已修复 ${totalFixed} 个问题`;
      }
      output += '\n';
    } else {
      output = '\n所有文件检查通过！\n';
    }
    
    return output;
  }

  getRules() {
    return this.config.getAllRules();
  }
}

module.exports = SQLLinter;
