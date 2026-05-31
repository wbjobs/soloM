const babelParser = require('@babel/parser');
const fs = require('fs');

const BOM = 0xfeff;

function parseFile(filePath) {
  try {
    const rawBuffer = fs.readFileSync(filePath);

    let hasBOM = false;
    let sourceBuffer = rawBuffer;
    if (rawBuffer.length >= 3 &&
        rawBuffer[0] === 0xef &&
        rawBuffer[1] === 0xbb &&
        rawBuffer[2] === 0xbf) {
      hasBOM = true;
      sourceBuffer = rawBuffer.subarray(3);
    }

    const source = sourceBuffer.toString('utf-8');

    const ast = babelParser.parse(source, {
      sourceType: 'unambiguous',
      plugins: [
        'typescript',
        'jsx',
        'tsx',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator',
        'dynamicImport',
        'exportDefaultFrom',
      ],
    });
    return { ast, source, hasBOM };
  } catch (err) {
    return { error: err.message, ast: null, source: null, hasBOM: false };
  }
}

module.exports = { parseFile };
