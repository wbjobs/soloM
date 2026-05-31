const baseRules = {
  'select-no-asterisk': {
    enabled: true,
    severity: 'error',
    description: 'SELECT 语句必须指定字段名，禁止使用 *',
    fixable: false
  },
  'keyword-uppercase': {
    enabled: true,
    severity: 'warning',
    description: 'SQL 关键字必须大写（SELECT, FROM, WHERE, INSERT 等）',
    fixable: true
  },
  'indentation': {
    enabled: true,
    severity: 'warning',
    description: '使用 2 空格缩进',
    fixable: true,
    options: {
      indentSize: 2
    }
  },
  'no-trailing-whitespace': {
    enabled: true,
    severity: 'warning',
    description: '禁止行尾空白字符',
    fixable: true
  },
  'single-query-per-line': {
    enabled: false,
    severity: 'warning',
    description: '每行只能有一条 SQL 语句',
    fixable: true
  },
  'where-required': {
    enabled: false,
    severity: 'error',
    description: 'UPDATE 和 DELETE 语句必须有 WHERE 条件',
    fixable: false
  },
  'insert-explicit-columns': {
    enabled: true,
    severity: 'warning',
    description: 'INSERT 语句必须显式指定列名',
    fixable: false
  },
  'foreign-key-check': {
    enabled: true,
    severity: 'error',
    description: '外键约束检查',
    fixable: false
  },
  'table-name-quote': {
    enabled: true,
    severity: 'error',
    description: '表名必须用引号包裹',
    fixable: true
  },
  'column-name-quote': {
    enabled: true,
    severity: 'warning',
    description: '列名建议用引号包裹',
    fixable: true
  },
  'table-name-backtick': {
    enabled: false,
    severity: 'error',
    description: '表名必须用反引号包裹（MySQL 专用）',
    fixable: true,
    dialect: 'mysql'
  },
  'column-name-backtick': {
    enabled: false,
    severity: 'warning',
    description: '列名建议用反引号包裹（MySQL 专用）',
    fixable: true,
    dialect: 'mysql'
  },
  'table-name-double-quote': {
    enabled: false,
    severity: 'error',
    description: '表名必须用双引号包裹（PostgreSQL 专用）',
    fixable: true,
    dialect: 'postgresql'
  },
  'column-name-double-quote': {
    enabled: false,
    severity: 'warning',
    description: '列名建议用双引号包裹（PostgreSQL 专用）',
    fixable: true,
    dialect: 'postgresql'
  }
};

const dialectConfigs = {
  mysql: {
    name: 'MySQL',
    quoteChar: '`',
    rules: {
      'table-name-quote': { enabled: false },
      'column-name-quote': { enabled: false },
      'table-name-backtick': { enabled: true, severity: 'error' },
      'column-name-backtick': { enabled: true, severity: 'warning' }
    },
    keywords: [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
      'IS', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING',
      'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS',
      'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
      'CREATE', 'TABLE', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
      'ALTER', 'DROP', 'INDEX', 'UNIQUE', 'DEFAULT', 'AUTO_INCREMENT',
      'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN',
      'THEN', 'ELSE', 'END', 'EXISTS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
      'ENGINE', 'CHARSET', 'COLLATE', 'COMMENT', 'SHOW', 'DESCRIBE', 'EXPLAIN'
    ]
  },
  postgresql: {
    name: 'PostgreSQL',
    quoteChar: '"',
    rules: {
      'table-name-quote': { enabled: false },
      'column-name-quote': { enabled: false },
      'table-name-double-quote': { enabled: true, severity: 'error' },
      'column-name-double-quote': { enabled: true, severity: 'warning' }
    },
    keywords: [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
      'IS', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING',
      'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS',
      'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
      'CREATE', 'TABLE', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
      'ALTER', 'DROP', 'INDEX', 'UNIQUE', 'DEFAULT', 'SERIAL',
      'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN',
      'THEN', 'ELSE', 'END', 'EXISTS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
      'RETURNING', 'CTID', 'OIDS', 'WITH', 'RECURSIVE', 'SCHEMA', 'SEQUENCE'
    ]
  },
  hive: {
    name: 'Hive',
    quoteChar: '`',
    rules: {
      'foreign-key-check': { enabled: false },
      'table-name-quote': { enabled: false },
      'column-name-quote': { enabled: false },
      'table-name-backtick': { enabled: true, severity: 'warning' },
      'column-name-backtick': { enabled: false },
      'insert-explicit-columns': { enabled: false }
    },
    keywords: [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
      'IS', 'NULL', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING',
      'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS',
      'INSERT', 'INTO', 'OVERWRITE', 'VALUES', 'UPDATE', 'SET', 'DELETE',
      'CREATE', 'TABLE', 'EXTERNAL', 'PARTITIONED', 'CLUSTERED', 'SORTED',
      'ROW', 'FORMAT', 'DELIMITED', 'FIELDS', 'TERMINATED', 'STORED',
      'AS', 'LOCATION', 'TBLPROPERTIES', 'ALTER', 'DROP',
      'LIMIT', 'UNION', 'ALL', 'DISTINCT', 'CASE', 'WHEN',
      'THEN', 'ELSE', 'END', 'EXISTS', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
      'WITH', 'LATERAL', 'VIEW', 'EXPLODE', 'COLLECT', 'SET', 'SORT',
      'DISTRIBUTE', 'CLUSTER', 'MAP', 'REDUCE', 'USING', 'SKEWED',
      'IF', 'COALESCE', 'NVL', 'CAST', 'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER',
      'DATABASE', 'SCHEMA', 'USE', 'MSCK', 'REPAIR', 'ANALYZE', 'COMPUTE',
      'STATISTICS', 'INDEXES', 'CONSTRAINT', 'CASCADE', 'RESTRICT'
    ]
  }
};

const SUPPORTED_DIALECTS = Object.keys(dialectConfigs);

class RuleConfig {
  constructor(customConfig = {}) {
    this.databaseType = (customConfig.databaseType || 'mysql').toLowerCase();
    this.rules = this._getDialectRules(this.databaseType);
    this.mergeConfig(customConfig);
  }

  _getDialectRules(databaseType) {
    const dialect = dialectConfigs[databaseType] || dialectConfigs.mysql;
    const rules = JSON.parse(JSON.stringify(baseRules));

    for (const [ruleName, ruleConfig] of Object.entries(dialect.rules)) {
      if (rules[ruleName]) {
        rules[ruleName] = { ...rules[ruleName], ...ruleConfig };
      }
    }

    return rules;
  }

  mergeConfig(customConfig) {
    if (customConfig.databaseType) {
      const newType = customConfig.databaseType.toLowerCase();
      if (newType !== this.databaseType && dialectConfigs[newType]) {
        this.databaseType = newType;
        this.rules = this._getDialectRules(newType);
      }
    }

    if (customConfig.rules) {
      for (const [ruleName, ruleConfig] of Object.entries(customConfig.rules)) {
        if (this.rules[ruleName]) {
          const rule = this.rules[ruleName];
          if (rule.dialect && rule.dialect !== this.databaseType) {
            continue;
          }
          if (typeof ruleConfig === 'boolean') {
            this.rules[ruleName].enabled = ruleConfig;
          } else if (typeof ruleConfig === 'string') {
            this.rules[ruleName].enabled = true;
            this.rules[ruleName].severity = ruleConfig;
          } else if (typeof ruleConfig === 'object') {
            this.rules[ruleName] = { ...this.rules[ruleName], ...ruleConfig };
          }
        }
      }
    }
  }

  getRule(ruleName) {
    return this.rules[ruleName];
  }

  isEnabled(ruleName) {
    return this.rules[ruleName]?.enabled;
  }

  getSeverity(ruleName) {
    return this.rules[ruleName]?.severity || 'warning';
  }

  getEnabledRules() {
    return Object.entries(this.rules)
      .filter(([_, config]) => config.enabled)
      .map(([name, config]) => ({ name, ...config }));
  }

  getAllRules() {
    return Object.entries(this.rules).map(([name, config]) => ({ name, ...config }));
  }

  getDialectInfo() {
    return dialectConfigs[this.databaseType] || dialectConfigs.mysql;
  }

  getKeywords() {
    return this.getDialectInfo().keywords || dialectConfigs.mysql.keywords;
  }

  getQuoteChar() {
    return this.getDialectInfo().quoteChar || '`';
  }

  getDialectName() {
    return this.getDialectInfo().name || 'MySQL';
  }

  static getSupportedDialects() {
    return SUPPORTED_DIALECTS;
  }
}

module.exports = { RuleConfig, baseRules, dialectConfigs, SUPPORTED_DIALECTS };
