#!/usr/bin/env node

const chalk = require('chalk');
const { uninstallHook } = require('../src/git-utils');
const { HOOK_NAME } = require('./install-git-hook');

function uninstallGitHook() {
  try {
    const result = uninstallHook(HOOK_NAME);
    
    if (result.notFound) {
      console.log(chalk.yellow('⚠️  Git hook 不存在'));
    } else if (result.notOurHook) {
      console.log(chalk.yellow(`⚠️  发现非 git-commit-ai 的 hook，请手动删除: ${result.path}`));
    } else {
      console.log(chalk.green(`✅  Git hook 已卸载: ${result.path}`));
    }
    
    return result;
  } catch (error) {
    console.log(chalk.red(`❌  卸载 Git hook 失败: ${error.message}`));
    process.exit(1);
  }
}

if (require.main === module) {
  uninstallGitHook();
}

module.exports = {
  uninstallHook: uninstallGitHook
};
