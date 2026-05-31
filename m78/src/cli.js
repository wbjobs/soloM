#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const { generateCommitMessage } = require('./commit-generator');
const { getStagedDiff, hasStagedChanges, executeCommit } = require('./git-utils');
const { loadConfig, validateConfig } = require('./config');
const { promptUser } = require('./prompts');
const { setupConsoleEncoding, smartProcessDiff } = require('./utils');

setupConsoleEncoding();

const program = new Command();

program
  .name('git-commit-ai')
  .description('私有化 Git Commit Message 自动生成 CLI 工具')
  .version('1.0.0');

program
  .command('generate', { isDefault: true })
  .description('生成 Commit Message (默认命令)')
  .option('-y, --yes', '自动确认并提交，不进行询问')
  .option('-e, --edit', '生成后允许编辑 Commit Message')
  .option('-c, --config <path>', '指定配置文件路径')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      
      const configErrors = validateConfig(config);
      if (configErrors.length > 0) {
        console.log(chalk.red('配置错误:'));
        configErrors.forEach(err => console.log(chalk.red(`  - ${err}`)));
        process.exit(1);
      }

      if (!hasStagedChanges()) {
        console.log(chalk.yellow('⚠️  暂存区没有代码变更'));
        console.log(chalk.gray('请先使用 git add 添加文件到暂存区'));
        process.exit(0);
      }

      console.log(chalk.cyan('📝  正在获取暂存区变更...'));
      const filterConfig = config.filter || {};
      const { diff: rawDiff, filteredFiles } = getStagedDiff(filterConfig);
      
      if (filteredFiles && filteredFiles.length > 0) {
        console.log(chalk.gray(`🔍  已过滤 ${filteredFiles.length} 个文件: ${filteredFiles.join(', ')}`));
      }
      
      if (!rawDiff || rawDiff.trim().length === 0) {
        console.log(chalk.yellow('⚠️  暂存区变更为空'));
        process.exit(0);
      }

      const maxContextLength = config.llm?.maxContextLength || 4000;
      const processed = smartProcessDiff(rawDiff, maxContextLength);
      
      if (processed.processed) {
        console.log(chalk.yellow(`📊  检测到大变更 (${processed.originalLength} 字符)，已进行${processed.method === 'summarize' ? '摘要' : '截断'}处理 (${processed.resultLength} 字符)`));
        if (processed.truncatedFiles && processed.truncatedFiles.length > 0) {
          console.log(chalk.gray(`   省略文件: ${processed.truncatedFiles.join(', ')}`));
        }
      }

      console.log(chalk.cyan('🤖  正在调用 LLM 生成 Commit Message...'));
      const commitMessage = await generateCommitMessage(processed.diff, config, {
        isSummarized: processed.processed
      });
      
      if (!commitMessage) {
        console.log(chalk.red('❌  生成 Commit Message 失败'));
        process.exit(1);
      }

      console.log('\n' + chalk.green('✅  生成的 Commit Message:'));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(commitMessage);
      console.log(chalk.gray('─'.repeat(60)) + '\n');

      let finalMessage = commitMessage;

      if (options.edit) {
        finalMessage = await promptUser.editMessage(commitMessage);
      }

      let shouldCommit = options.yes;
      
      if (!shouldCommit) {
        shouldCommit = await promptUser.confirmCommit();
      }

      if (shouldCommit) {
        const success = executeCommit(finalMessage);
        if (success) {
          console.log(chalk.green('🎉  提交成功！'));
        } else {
          console.log(chalk.red('❌  提交失败'));
          process.exit(1);
        }
      } else {
        console.log(chalk.gray('已取消提交'));
      }

    } catch (error) {
      console.log(chalk.red('\n❌  发生错误:'));
      console.log(chalk.red(error.message));
      if (process.env.DEBUG) {
        console.log(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  });

program
  .command('config')
  .description('查看或编辑配置')
  .option('-s, --show', '显示当前配置')
  .option('-i, --init', '初始化配置文件')
  .action((options) => {
    if (options.init) {
      const { initConfig } = require('./config');
      const configPath = initConfig();
      console.log(chalk.green(`✅  配置文件已初始化: ${configPath}`));
      return;
    }

    if (options.show) {
      const { loadConfig, CONFIG_PATHS } = require('./config');
      const config = loadConfig();
      console.log(chalk.cyan('📋  当前配置:'));
      console.log(JSON.stringify(config, null, 2));
      console.log(chalk.gray(`\n用户配置路径: ${CONFIG_PATHS.user.join(', ')}`));
      console.log(chalk.gray(`项目配置路径: ${CONFIG_PATHS.project.join(', ')}`));
      return;
    }

    program.help();
  });

program
  .command('hook')
  .description('Git Hook 相关操作')
  .option('-i, --install', '安装 prepare-commit-msg hook')
  .option('-u, --uninstall', '卸载 prepare-commit-msg hook')
  .action((options) => {
    if (options.install) {
      const { installHook } = require('../scripts/install-git-hook');
      installHook();
      return;
    }
    if (options.uninstall) {
      const { uninstallHook } = require('../scripts/uninstall-git-hook');
      uninstallHook();
      return;
    }
    program.help();
  });

program.parse(process.argv);
