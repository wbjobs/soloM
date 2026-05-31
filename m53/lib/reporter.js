function generateReport(results) {
  let errorCount = 0;
  let warningCount = 0;
  let fixableCount = 0;

  for (const fileResult of results) {
    for (const msg of fileResult.messages) {
      if (msg.severity === 2) {
        errorCount++;
      } else {
        warningCount++;
      }
      if (msg.fix) {
        fixableCount++;
      }
    }
  }

  return {
    summary: {
      totalFiles: results.length,
      filesWithIssues: results.filter((r) => r.messages.length > 0).length,
      errorCount,
      warningCount,
      fixableCount,
    },
    results,
  };
}

module.exports = { generateReport };
