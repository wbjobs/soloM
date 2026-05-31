const MAX_COMPLEXITY = 10;

function computeComplexity(node) {
  let complexity = 1;

  function walk(n) {
    if (!n || typeof n !== 'object') return;

    const branchNodeTypes = new Set([
      'IfStatement',
      'ForStatement',
      'ForInStatement',
      'ForOfStatement',
      'WhileStatement',
      'DoWhileStatement',
      'ConditionalExpression',
      'SwitchCase',
      'CatchClause',
      'LogicalExpression',
    ]);

    if (branchNodeTypes.has(n.type)) {
      complexity++;
    }

    if (n.type === 'ConditionalExpression') {
      // already counted above
    }

    if (n.type === 'LogicalExpression') {
      // each && or || adds one branch
    }

    for (const key of Object.keys(n)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && item.type) {
            walk(item);
          }
        }
      } else if (val && typeof val === 'object' && val.type) {
        walk(val);
      }
    }
  }

  walk(node.body);
  return complexity;
}

module.exports = {
  meta: {
    id: 'max-complexity',
    description: `Enforce a maximum cyclomatic complexity of ${MAX_COMPLEXITY}`,
    severity: 2,
    fixable: false,
  },

  create(context) {
    return {
      FunctionDeclaration(path) {
        checkComplexity(path.node, path);
      },
      FunctionExpression(path) {
        checkComplexity(path.node, path);
      },
      ArrowFunctionExpression(path) {
        checkComplexity(path.node, path);
      },
      ObjectMethod(path) {
        checkComplexity(path.node, path);
      },
      ClassMethod(path) {
        checkComplexity(path.node, path);
      },
    };

    function checkComplexity(node, path) {
      const complexity = computeComplexity(node);
      if (complexity > MAX_COMPLEXITY) {
        const name = getNodeName(node, path);
        context.report({
          node,
          message: `Function '${name}' has a complexity of ${complexity} (max allowed is ${MAX_COMPLEXITY})`,
          line: node.loc.start.line,
          column: node.loc.start.column,
        });
      }
    }

    function getNodeName(node, path) {
      if (node.id && node.id.name) return node.id.name;
      if (path.parentKey === 'value' && path.parent.type === 'ObjectProperty') {
        if (path.parent.key && path.parent.key.name) return path.parent.key.name;
      }
      if (path.parentKey === 'value' && path.parent.type === 'ClassProperty') {
        if (path.parent.key && path.parent.key.name) return path.parent.key.name;
      }
      if (path.parent && path.parent.type === 'VariableDeclarator') {
        if (path.parent.id && path.parent.id.name) return path.parent.id.name;
      }
      if (path.parent && path.parent.type === 'AssignmentExpression') {
        if (t && path.parent.left && path.parent.left.name) return path.parent.left.name;
      }
      return '<anonymous>';
    }
  },
};
