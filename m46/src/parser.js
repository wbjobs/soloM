const { Parser } = require('node-sql-parser');

const parser = new Parser();

class ASTParser {
  constructor() {
    this.parser = parser;
  }

  parse(sql, databaseType = 'mysql') {
    try {
      const ast = this.parser.astify(sql, { database: databaseType });
      return {
        success: true,
        ast: Array.isArray(ast) ? ast : [ast],
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        ast: null,
        errors: [{
          message: error.message,
          line: error.location?.start?.line || 1,
          column: error.location?.start?.column || 1
        }]
      };
    }
  }

  traverse(ast, visitor) {
    if (!ast) return;

    const nodes = Array.isArray(ast) ? ast : [ast];

    nodes.forEach(node => {
      this.traverseNode(node, visitor);
    });
  }

  traverseNode(node, visitor, parent = null, key = null, index = null) {
    if (!node || typeof node !== 'object') return;

    if (visitor[node.type]) {
      visitor[node.type](node, parent, key, index);
    }

    if (visitor['*']) {
      visitor['*'](node, parent, key, index);
    }

    for (const [k, v] of Object.entries(node)) {
      if (Array.isArray(v)) {
        v.forEach((child, i) => {
          this.traverseNode(child, visitor, node, k, i);
        });
      } else if (v && typeof v === 'object' && v.type) {
        this.traverseNode(v, visitor, node, k);
      }
    }
  }

  findNodes(ast, type) {
    const results = [];
    this.traverse(ast, {
      [type]: (node) => results.push(node)
    });
    return results;
  }

  getSQL(ast, databaseType = 'mysql') {
    try {
      return this.parser.sqlify(ast, { database: databaseType });
    } catch (error) {
      return null;
    }
  }
}

module.exports = ASTParser;
