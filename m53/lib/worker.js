const { parentPort } = require('worker_threads');
const path = require('path');

const libDir = path.resolve(__dirname);
const { parseFile } = require(path.join(libDir, 'parser'));
const { runRules } = require(path.join(libDir, 'rules'));
const { applyFixes } = require(path.join(libDir, 'fixer'));

parentPort.on('message', (task) => {
  const { filePath, fix, fileIndex } = task;

  const result = (function () {
    const parseResult = parseFile(filePath);
    if (parseResult.error) {
      return {
        fileIndex,
        filePath,
        error: parseResult.error,
        messages: [],
        hasBOM: false,
      };
    }

    const messages = runRules(parseResult.ast, parseResult.source, filePath);

    if (fix) {
      const fixResult = applyFixes(filePath, parseResult.source, messages, parseResult.hasBOM);
      return {
        fileIndex,
        filePath,
        messages: fixResult.remainingMessages,
        fixedCount: fixResult.fixedCount,
        output: fixResult.output,
        hasBOM: parseResult.hasBOM,
        fixed: fixResult.fixed,
      };
    }

    return {
      fileIndex,
      filePath,
      messages,
      hasBOM: parseResult.hasBOM,
    };
  })();

  parentPort.postMessage(result);
});
