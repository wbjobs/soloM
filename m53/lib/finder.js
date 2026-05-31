const { globSync } = require('glob');
const path = require('path');

function findFiles(dir) {
  const patterns = ['**/*.js', '**/*.ts'];
  const files = new Set();

  for (const pattern of patterns) {
    const matches = globSync(pattern, {
      cwd: dir,
      absolute: true,
      ignore: ['**/node_modules/**'],
    });
    for (const m of matches) {
      files.add(m);
    }
  }

  return [...files].sort();
}

module.exports = { findFiles };
