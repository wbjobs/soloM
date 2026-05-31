const traverse = require('@babel/traverse').default;
const noVarRule = require('./no-var');
const maxComplexityRule = require('./max-complexity');

const rules = [noVarRule, maxComplexityRule];

function runRules(ast, source, filePath) {
  const allMessages = [];

  for (const rule of rules) {
    const context = {
      report(msg) {
        const { node, ...rest } = msg;
        allMessages.push({
          ruleId: rule.meta.id,
          severity: rule.meta.severity,
          ...rest,
        });
      },
      source,
      filePath,
    };

    traverse(ast, rule.create(context));
  }

  return allMessages;
}

module.exports = { runRules, rules };
