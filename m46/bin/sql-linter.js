#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const path = require('path');
const SQLLinter = require('../src/index');

const program = new Command();

program
  .name('sql-linter')
  .description('基于 AST 的自定义 SQL 语法检查与自动格式化 Linter')
  .version('1.0.0');

program
  .argument('[files...]', '要检查的 SQL 文件或目录（支持 glob 模式）')
  .option('-c, --config <path>', '配置文件路径', '.sql-linter.json')
  .option('-f, --fix', '自动修复可修复的问题')
  .option('-d, --database <type>', '数据库类型: mysql, postgresql, etc.', 'mysql')
  .option('--format <type>', '输出格式: text, json', 'text')
  .option('--rules', '列出所有可用规则')
  .option('--no-fix', '不执行自动修复')
  .action(async (files, options) => {
    if (options.rules) {
      listRules();
      return;
    }

    if (files.length === 0) {
      console.error('错误：请指定要检查的 SQL 文件或目录');
      program.help();
      return;
    }

    let customConfig = {};
    const configPath = path.resolve(options.config);
    
    if (fs.existsSync(configPath)) {
      try {
        customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        console.log(`使用配置文件: ${configPath}`);
      } catch (error) {
        console.error(`警告：配置文件解析失败: ${error.message}`);
      }
    }

    if (options.database) {
      customConfig.databaseType = options.database;
    }

    const linter = new SQLLinter(customConfig);

    try {
      const results = linter.lintFiles(files, {
        fix: options.fix === true
      });

      const output = linter.formatResults(results, {
        format: options.format
      });

      console.log(output);

      const hasErrors = results.some(r => !r.success);
      process.exit(hasErrors ? 1 : 0);
    } catch (error) {
      console.error(`错误：${error.message}`);
      process.exit(1);
    }
  });

function listRules() {
  const linter = new SQLLinter();
  const rules = linter.getRules();

  console.log('\n可用规则列表：\n');
  console.log(`${'规则名称'.padEnd(30)} ${'状态'.padEnd(8)} ${'级别'.padEnd(10)} ${'可修复'.padEnd(8)} 描述`);
  console.log(`${'-'.repeat(30)} ${'-'.repeat(8)} ${'-'.repeat(10)} ${'-'.repeat(8)} ${'-'.repeat(40)}`);

  for (const rule of rules) {
    const status = rule.enabled ? '启用' : '禁用';
    const fixable = rule.fixable ? '是' : '否';
    console.log(`${rule.name.padEnd(30)} ${status.padEnd(8)} ${rule.severity.padEnd(10)} ${fixable.padEnd(8)} ${rule.description}`);
  }
  console.log('');
}

program.parse(process.argv);
