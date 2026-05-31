const inquirer = require('inquirer');

async function confirmCommit() {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: '是否执行 git commit 提交?',
      default: true
    }
  ]);
  return answer.confirm;
}

async function editMessage(originalMessage) {
  const answer = await inquirer.prompt([
    {
      type: 'editor',
      name: 'message',
      message: '编辑 Commit Message:',
      default: originalMessage
    }
  ]);
  return answer.message;
}

async function selectFromOptions(message, choices) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices
    }
  ]);
  return answer.selected;
}

async function inputText(message, defaultValue = '') {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'text',
      message,
      default: defaultValue
    }
  ]);
  return answer.text;
}

async function confirmAction(message, defaultYes = true) {
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message,
      default: defaultYes
    }
  ]);
  return answer.confirm;
}

module.exports = {
  promptUser: {
    confirmCommit,
    editMessage,
    selectFromOptions,
    inputText,
    confirmAction
  }
};
