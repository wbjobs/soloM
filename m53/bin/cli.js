#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const os = require('os');
const { findFiles } = require('../lib/finder');
const { lintParallel } = require('../lib/parallel');
const { generateReport } = require('../lib/reporter');

program
  .name('custom-lint')
  .description('Custom code linter CLI tool with AST-based rules')
  .version('1.0.0')
  .argument('<dir>', 'directory to scan')
  .option('--fix', 'automatically fix simple issues')
  .option('--json', 'output report in JSON format')
  .option('--sequential', 'disable parallel processing (debug mode)')
  .action(async (dir, options) => {
    const absDir = path.resolve(dir);
    const files = findFiles(absDir);

    if (files.length === 0) {
      console.log('No .js or .ts files found in:', absDir);
      process.exit(0);
    }

    const cpuCount = os.cpus().length;
    const useParallel = !options.sequential && files.length > 1 && cpuCount > 1;

    let allResults;

    if (useParallel) {
      allResults = await lintParallel(files, { fix: !!options.fix, quiet: !!options.json });
    } else {
      allResults = lintSequential(files, options);
    }

    const report = generateReport(allResults);

    if (options.json) {
      const cleanReport = sanitizeForJson(report);
      console.log(JSON.stringify(cleanReport, null, 2));
    } else {
      printHumanReadable(report);
    }

    if (report.summary.errorCount > 0) {
      process.exit(1);
    }
  });

function lintSequential(files, options) {
  const { parseFile } = require('../lib/parser');
  const { runRules } = require('../lib/rules');
  const { applyFixes, writeFileWithBOM } = require('../lib/fixer');

  const allResults = [];

  for (const filePath of files) {
    const parseResult = parseFile(filePath);
    if (parseResult.error) {
      allResults.push({
        filePath,
        error: parseResult.error,
        messages: [],
      });
      continue;
    }

    const messages = runRules(parseResult.ast, parseResult.source, filePath);

    if (options.fix) {
      const fixResult = applyFixes(filePath, parseResult.source, messages, parseResult.hasBOM);
      if (fixResult.fixed) {
        writeFileWithBOM(filePath, fixResult.output, parseResult.hasBOM);
      }
      allResults.push({
        filePath,
        messages: fixResult.remainingMessages,
        fixedCount: fixResult.fixedCount,
      });
    } else {
      allResults.push({
        filePath,
        messages,
      });
    }
  }

  return allResults;
}

function sanitizeForJson(report) {
  return {
    summary: report.summary,
    results: report.results.map((r) => ({
      filePath: r.filePath,
      fixedCount: r.fixedCount,
      messages: r.messages.map((m) => ({
        ruleId: m.ruleId,
        severity: m.severity,
        message: m.message,
        line: m.line,
        column: m.column,
        fixable: !!m.fix,
      })),
    })),
  };
}

function printHumanReadable(report) {
  for (const fileResult of report.results) {
    if (fileResult.messages.length === 0 && !fileResult.fixedCount) continue;

    console.log(`\n${fileResult.filePath}`);

    if (fileResult.fixedCount) {
      console.log(`  ✅ Fixed ${fileResult.fixedCount} issue(s) automatically`);
    }

    for (const msg of fileResult.messages) {
      const loc = msg.line ? `${msg.line}:${msg.column}` : '0:0';
      const severity = msg.severity === 2 ? 'error' : 'warn';
      console.log(`  ${loc}  ${severity}  ${msg.ruleId}  ${msg.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(
    `Files: ${report.results.length} | ` +
    `Errors: ${report.summary.errorCount} | ` +
    `Warnings: ${report.summary.warningCount} | ` +
    `Fixable: ${report.summary.fixableCount}`
  );
}

program.parse();
