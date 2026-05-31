const os = require('os');
const { Worker } = require('worker_threads');
const path = require('path');
const cliProgress = require('cli-progress');
const { writeFileWithBOM } = require('./fixer');

function lintParallel(files, options) {
  return new Promise((resolve) => {
    const totalFiles = files.length;
    const numWorkers = Math.min(os.cpus().length, totalFiles);
    const fix = !!options.fix;
    const quiet = !!options.quiet;

    const allResults = new Array(totalFiles);
    let nextFileIndex = 0;
    let completedCount = 0;
    let activeWorkers = 0;

    const workerCurrentIndex = new Map();

    const progressBar = new cliProgress.SingleBar({
      format: 'Linting |{bar}| {percentage}% | {value}/{total} files | {status}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
    }, cliProgress.Presets.shades_classic);

    if (!quiet) {
      progressBar.start(totalFiles, 0, { status: 'starting...' });
    }

    const workerScript = path.resolve(__dirname, 'worker.js');

    function dispatchNext(worker) {
      if (nextFileIndex >= totalFiles) {
        return false;
      }
      const fileIndex = nextFileIndex++;
      workerCurrentIndex.set(worker.threadId, fileIndex);
      worker.postMessage({
        filePath: files[fileIndex],
        fix,
        fileIndex,
      });
      return true;
    }

    function onWorkerMessage(worker, data) {
      const { fileIndex, filePath, fixed, fixedCount, output, hasBOM, error, messages } = data;

      if (fix && fixed) {
        writeFileWithBOM(filePath, output, hasBOM);
      }

      const entry = { filePath };
      if (error) entry.error = error;
      entry.messages = messages || [];
      if (fixedCount) entry.fixedCount = fixedCount;
      allResults[fileIndex] = entry;

      workerCurrentIndex.delete(worker.threadId);
      completedCount++;

      const issueFiles = allResults.filter(Boolean).filter(
        (r) => r.messages && r.messages.length > 0
      ).length;
      if (!quiet) {
        progressBar.update(completedCount, {
          status: `${issueFiles} file(s) with issues`,
        });
      }

      if (!dispatchNext(worker)) {
        worker.terminate();
        activeWorkers--;
        if (activeWorkers === 0) {
          if (!quiet) progressBar.stop();
          resolve(allResults);
        }
      }
    }

    function onWorkerError(worker, err) {
      const threadId = worker.threadId;
      const failedIndex = workerCurrentIndex.get(threadId);

      if (failedIndex !== undefined) {
        allResults[failedIndex] = {
          filePath: files[failedIndex],
          error: err.message,
          messages: [],
        };
        workerCurrentIndex.delete(threadId);
      }

      completedCount++;
      if (!quiet) {
        progressBar.update(completedCount, { status: 'worker error' });
      }

      if (!dispatchNext(worker)) {
        worker.terminate();
        activeWorkers--;
        if (activeWorkers === 0) {
          if (!quiet) progressBar.stop();
          resolve(allResults);
        }
      }
    }

    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker(workerScript);
      activeWorkers++;

      worker.on('message', (data) => onWorkerMessage(worker, data));
      worker.on('error', (err) => onWorkerError(worker, err));

      dispatchNext(worker);
    }
  });
}

module.exports = { lintParallel };
