#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

import { extractRecentErrors, formatErrorsForLLM, estimateTokens } from './logParser.js';
import { createLLM, analyzeErrors, testConnection, getModelTokenLimit, ChatSession } from './llmService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program
  .name('log-analyzer')
  .description('CLI tool for analyzing large error.log files using LLM')
  .version(packageJson.version);

program
  .option('-f, --file <path>', 'Path to the error.log file', './error.log')
  .option('-n, --limit <number>', 'Number of recent errors to extract', '50')
  .option('-p, --provider <provider>', 'LLM provider: ollama or openai', 'ollama')
  .option('-m, --model <model>', 'Model name (overrides env var)')
  .option('--base-url <url>', 'API base URL (overrides env var)')
  .option('--api-key <key>', 'API key for OpenAI (overrides env var)')
  .option('-t, --temperature <number>', 'LLM temperature', '0.1')
  .option('--test-connection', 'Test LLM connection and exit')
  .option('--output <path>', 'Save analysis result to file')
  .option('--verbose', 'Show detailed logs')
  .option('--no-merge', 'Disable merging of similar errors')
  .option('--max-lines-per-entry <number>', 'Max lines per error entry (default: 15)', '15')
  .option('--force-truncate', 'Always apply truncation even if under token limit')
  .option('--dry-run', 'Process logs and show token info without calling LLM');

program.parse(process.argv);
const options = program.opts();

async function main() {
  const spinner = ora();

  try {
    const limit = parseInt(options.limit, 10);
    if (isNaN(limit) || limit <= 0) {
      console.error(chalk.red('Error: --limit must be a positive number'));
      process.exit(1);
    }

    const provider = options.provider.toLowerCase();
    if (!['ollama', 'openai'].includes(provider)) {
      console.error(chalk.red('Error: --provider must be either "ollama" or "openai"'));
      process.exit(1);
    }

    const temperature = parseFloat(options.temperature);
    const maxLinesPerEntry = parseInt(options.maxLinesPerEntry, 10);

    console.log(chalk.cyan('\n📊 Log Analyzer CLI v' + packageJson.version));
    console.log(chalk.cyan('=' .repeat(50) + '\n'));

    spinner.start('Initializing LLM client...');
    const llmWrapper = createLLM(provider, {
      model: options.model,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      temperature
    });
    const modelName = llmWrapper.modelName;
    const tokenLimit = getModelTokenLimit(modelName);
    spinner.succeed(chalk.green(`LLM client initialized (${provider}/${modelName}, context: ${tokenLimit} tokens)`));

    if (options.testConnection) {
      spinner.start('Testing LLM connection...');
      const connected = await testConnection(llmWrapper);
      if (connected) {
        spinner.succeed(chalk.green('LLM connection successful!'));
      } else {
        spinner.fail(chalk.red('LLM connection failed!'));
        process.exit(1);
      }
      process.exit(0);
    }

    console.log(chalk.blue('\n📄 Log file: ') + options.file);
    
    spinner.start('Extracting recent ERROR logs...');
    const errors = await extractRecentErrors(options.file, limit);
    spinner.succeed(chalk.green(`Extracted ${errors.length} ERROR entries`));

    if (errors.length === 0) {
      console.log(chalk.yellow('\n⚠️  No ERROR entries found in the log file.'));
      process.exit(0);
    }

    if (options.verbose) {
      console.log(chalk.gray('\n--- Extracted Errors Preview ---'));
      errors.forEach((err, i) => {
        const firstLine = err.split('\n')[0].substring(0, 100);
        console.log(chalk.gray(`${i + 1}. ${firstLine}...`));
      });
      console.log(chalk.gray('-------------------------------\n'));
    }

    const formattedForEstimate = formatErrorsForLLM(errors);
    const estimatedTokens = estimateTokens(formattedForEstimate);
    console.log(chalk.blue(`\n📏 Estimated tokens: ${estimatedTokens} (model limit: ${tokenLimit})`));

    if (options.dryRun) {
      console.log(chalk.cyan('\n📋 Dry Run - Preprocessing Summary'));
      console.log(chalk.cyan('=' .repeat(50)));
      
      const { preprocessErrorsForLLM } = await import('./logParser.js');
      const preprocessResult = preprocessErrorsForLLM(errors, {
        maxTokens: tokenLimit,
        maxErrorsToAnalyze: limit,
        maxLinesPerEntry,
        enableMerge: options.merge !== false
      });

      console.log(chalk.gray(`\nOriginal errors: ${preprocessResult.originalErrors}`));
      console.log(chalk.gray(`Original tokens: ${preprocessResult.originalTokens}`));
      console.log(chalk.gray(`Processed errors: ${preprocessResult.processedErrors}`));
      console.log(chalk.gray(`Processed tokens: ${preprocessResult.processedTokens}`));
      console.log(chalk.gray(`Truncated entries: ${preprocessResult.truncatedCount}`));
      console.log(chalk.gray(`Merged entries: ${preprocessResult.mergedCount}`));
      
      if (preprocessResult.warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        preprocessResult.warnings.forEach(w => console.log(chalk.yellow(`  ⚠️  ${w}`)));
      }

      if (options.verbose) {
        console.log(chalk.gray('\n--- Processed Errors Preview ---'));
        const formattedProcessed = formatErrorsForLLM(preprocessResult.errors.slice(0, 3));
        console.log(chalk.gray(formattedProcessed));
        console.log(chalk.gray('... (more entries truncated for preview)'));
      }

      console.log(chalk.green('\n✅ Dry run completed. No LLM call was made.\n'));
      process.exit(0);
    }

    spinner.start('Preprocessing and sending to LLM for analysis...');
    
    const abortController = new AbortController();
    const signal = abortController.signal;

    const timeout = setTimeout(() => {
      spinner.text = 'Still analyzing... (this may take a moment)';
    }, 10000);

    const preprocessOptions = {
      maxErrorsToAnalyze: limit,
      maxLinesPerEntry,
      enableMerge: options.merge !== false
    };

    if (options.forceTruncate) {
      preprocessOptions.maxTokens = Math.min(tokenLimit * 0.5, 4000);
    }

    const result = await analyzeErrors(llmWrapper, errors, preprocessOptions, signal);
    const { analysis, preprocessInfo } = result;
    
    clearTimeout(timeout);
    spinner.succeed(chalk.green('Analysis complete!'));

    if (preprocessInfo && preprocessInfo.warnings && preprocessInfo.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Preprocessing notes:'));
      preprocessInfo.warnings.forEach(w => console.log(chalk.yellow(`  ${w}`)));
    }

    if (preprocessInfo) {
      console.log(chalk.gray(`\n  ℹ️  Original: ${preprocessInfo.originalErrors} errors, ${preprocessInfo.originalTokens} tokens`));
      console.log(chalk.gray(`  ℹ️  Processed: ${preprocessInfo.processedErrors} errors, ${preprocessInfo.processedTokens} tokens`));
      if (preprocessInfo.truncatedCount > 0) {
        console.log(chalk.gray(`  ℹ️  Truncated: ${preprocessInfo.truncatedCount} entries`));
      }
      if (preprocessInfo.mergedCount > 0) {
        console.log(chalk.gray(`  ℹ️  Merged: ${preprocessInfo.mergedCount} similar entries`));
      }
    }

    console.log(chalk.cyan('\n📋 Analysis Result'));
    console.log(chalk.cyan('=' .repeat(50)));
    console.log('\n' + analysis + '\n');

    if (options.output) {
      const outputPath = path.resolve(options.output);
      
      const preprocessNotes = preprocessInfo && preprocessInfo.warnings && preprocessInfo.warnings.length > 0
        ? `\n## Preprocessing Notes\n\n${preprocessInfo.warnings.map(w => `- ${w}`).join('\n')}\n`
        : '';
      
      const processedErrorsFormatted = preprocessInfo && preprocessInfo.errors
        ? formatErrorsForLLM(preprocessInfo.errors)
        : formattedForEstimate;
      
      const outputContent = `# Log Analysis Report\n\n` +
        `Generated: ${new Date().toISOString()}\n` +
        `Log File: ${options.file}\n` +
        `Original Errors Extracted: ${errors.length}\n` +
        `Errors Analyzed: ${preprocessInfo ? preprocessInfo.processedErrors : errors.length}\n` +
        `Provider: ${provider}/${modelName}\n` +
        `Token Usage: ${preprocessInfo ? preprocessInfo.processedTokens : estimatedTokens}/${tokenLimit}\n` +
        (preprocessInfo && preprocessInfo.truncatedCount > 0 ? `Truncated Entries: ${preprocessInfo.truncatedCount}\n` : '') +
        (preprocessInfo && preprocessInfo.mergedCount > 0 ? `Merged Entries: ${preprocessInfo.mergedCount}\n` : '') +
        preprocessNotes +
        `\n---\n\n${analysis}\n\n` +
        `---\n\n## Processed Errors Sent to LLM\n\n\`\`\`\n${processedErrorsFormatted}\n\`\`\`\n\n` +
        `---\n\n## Original Extracted Errors\n\n\`\`\`\n${formattedForEstimate}\n\`\`\``;
      
      fs.writeFileSync(outputPath, outputContent, 'utf8');
      console.log(chalk.green(`\n✅ Analysis saved to: ${outputPath}`));
    }

    const processedErrors = preprocessInfo && preprocessInfo.errors
      ? preprocessInfo.errors
      : errors;
    const formattedErrorsForChat = formatErrorsForLLM(processedErrors);

    const chatSession = new ChatSession(llmWrapper, formattedErrorsForChat);
    chatSession.history.push({ role: 'assistant', content: analysis });

    await startInteractiveChat(chatSession);

  } catch (error) {
    spinner.fail(chalk.red('Error occurred'));
    
    if (options.verbose) {
      console.error(chalk.red('\nFull error stack:'));
      console.error(error.stack);
    } else {
      console.error(chalk.red(`\nError: ${error.message}`));
      if (error.message.includes('400') || error.message.includes('context length') || error.message.includes('token')) {
        console.error(chalk.yellow('\n💡 Try using --dry-run to see token usage and adjust parameters:'));
        console.error(chalk.yellow('   • Reduce --limit to analyze fewer errors'));
        console.error(chalk.yellow('   • Reduce --max-lines-per-entry for shorter stack traces'));
        console.error(chalk.yellow('   • Use --force-truncate for aggressive preprocessing'));
      }
      console.error(chalk.gray('Use --verbose for detailed error information'));
    }
    
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\nOperation cancelled by user.'));
  process.exit(130);
});

async function startInteractiveChat(chatSession) {
  console.log(chalk.cyan('\n💬 Interactive Chat Mode'));
  console.log(chalk.cyan('─'.repeat(50)));
  console.log(chalk.gray('  你可以基于上面的分析结果继续提问，例如：'));
  console.log(chalk.gray('  • "针对第一个原因，给出具体的 SQL 修复语句"'));
  console.log(chalk.gray('  • "详细解释 Redis 连接失败的根本原因"'));
  console.log(chalk.gray('  • "给出数据库连接池的推荐配置"'));
  console.log(chalk.gray(''));
  console.log(chalk.yellow('  输入 exit 或 quit 退出对话'));
  console.log(chalk.cyan('─'.repeat(50)));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('\n🧑 You> ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    const lowerInput = input.toLowerCase();
    if (lowerInput === 'exit' || lowerInput === 'quit' || lowerInput === 'q') {
      console.log(chalk.cyan('\n👋 Goodbye! 对话已结束。'));
      rl.close();
      process.exit(0);
    }

    if (lowerInput === 'help' || lowerInput === 'h') {
      console.log(chalk.gray('\n可用命令：'));
      console.log(chalk.gray('  exit / quit / q  - 退出对话'));
      console.log(chalk.gray('  help / h         - 显示帮助'));
      console.log(chalk.gray('  history          - 查看对话历史长度'));
      console.log(chalk.gray('  其他任意内容     - 向 LLM 提问\n'));
      rl.prompt();
      return;
    }

    if (lowerInput === 'history') {
      const turns = Math.floor(chatSession.getHistoryLength() / 2);
      console.log(chalk.gray(`\n  对话轮次: ${turns} (历史消息: ${chatSession.getHistoryLength()} 条)`));
      rl.prompt();
      return;
    }

    const spinner = ora('Thinking...').start();

    try {
      const response = await chatSession.chat(input);
      spinner.stop();

      console.log(chalk.blue('\n🤖 Assistant>'));
      console.log(response);
      console.log();
    } catch (error) {
      spinner.fail(chalk.red('Failed to get response'));
      console.error(chalk.red(`  Error: ${error.message}`));
      
      if (error.message.includes('400') || error.message.includes('context length') || error.message.includes('token')) {
        console.error(chalk.yellow('  💡 对话历史过长，请输入 exit 开始新的分析会话'));
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.cyan('\n👋 Goodbye!'));
    process.exit(0);
  });
}

main();
