const t = require('@babel/types');

function isReassigned(source, name, startLine) {
  const lines = source.split('\n');
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const reassignPattern = new RegExp(`\\b${name}\\s*=`, 'g');
    const match = reassignPattern.exec(line);
    if (match) {
      const beforeMatch = line.substring(0, match.index);
      const declPattern = new RegExp(`\\b(var|let|const)\\s+${name}\\b`);
      if (!declPattern.test(beforeMatch)) {
        return true;
      }
    }
  }
  return false;
}

module.exports = {
  meta: {
    id: 'no-var',
    description: 'Disallow var declarations, use let or const instead',
    severity: 2,
    fixable: true,
  },

  create(context) {
    return {
      VariableDeclaration(path) {
        if (path.node.kind === 'var') {
          let fixReplacement = 'let';

          if (path.node.declarations.length === 1) {
            const decl = path.node.declarations[0];
            if (t.isIdentifier(decl.id)) {
              const varName = decl.id.name;
              if (!isReassigned(context.source, varName, path.node.loc.start.line)) {
                fixReplacement = 'const';
              }
            }
          }

          context.report({
            node: path.node,
            message: `Unexpected var, use ${fixReplacement} instead`,
            line: path.node.loc.start.line,
            column: path.node.loc.start.column,
            fix: {
              kind: fixReplacement,
              range: [
                path.node.start,
                path.node.start + 3,
              ],
              text: fixReplacement,
            },
          });
        }
      },
    };
  },
};
