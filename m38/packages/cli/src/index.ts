#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import WebSocket from 'ws';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as http from 'http';

const SAMPLE_YAML = `pipeline:
  name: my-project
  triggers:
    - event: push
      branch: main
  steps:
    - name: clone
      image: alpine/git:v2.36.3
      commands:
        - git clone $REPO_URL .
        - git checkout $BRANCH
    - name: install
      image: node:18-alpine
      commands:
        - npm install
    - name: build
      image: node:18-alpine
      commands:
        - npm run build
    - name: deploy
      image: docker:latest
      commands:
        - echo "Deploy step - customize as needed"
`;

function getGitInfo(): { repoUrl: string; branch: string; commit: string } {
  let repoUrl = '';
  let branch = 'main';
  let commit = '';

  try {
    repoUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
  } catch {}

  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {}

  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  } catch {}

  return { repoUrl, branch, commit };
}

function streamLogs(serverUrl: string, runId: string): void {
  const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', runId }));
  });

  ws.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'log') {
        const entry = msg.data;
        console.log(`[${entry.stepName}] ${entry.data}`);
      }

      if (msg.type === 'step-status') {
        const data = msg.data;
        const colorFn =
          data.status === 'success'
            ? chalk.green
            : data.status === 'failed'
            ? chalk.red
            : data.status === 'running'
            ? chalk.yellow
            : chalk.gray;
        console.log(`[${data.stepName}] status: ${colorFn(data.status)}`);
      }

      if (msg.type === 'run-status') {
        const data = msg.data;
        if (data.status === 'success' || data.status === 'failed') {
          const colorFn = data.status === 'success' ? chalk.green : chalk.red;
          console.log(`Run ${colorFn(data.status)}`);
          ws.close();
          process.exit(0);
        }
      }
    } catch {}
  });

  ws.on('error', (err: Error) => {
    console.error(chalk.red(`WebSocket error: ${err.message}`));
  });
}

function colorStatus(status: string): string {
  switch (status) {
    case 'success':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'running':
      return chalk.yellow(status);
    case 'pending':
      return chalk.gray(status);
    default:
      return status;
  }
}

const program = new Command();

program
  .name('pipeline')
  .description('CI/CD Pipeline CLI')
  .version('1.0.0')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:4000');

program
  .command('init')
  .description('Create a sample .pipeline.yaml file')
  .action(() => {
    const filePath = path.resolve('.pipeline.yaml');
    if (fs.existsSync(filePath)) {
      console.log(chalk.yellow('.pipeline.yaml already exists'));
      return;
    }
    fs.writeFileSync(filePath, SAMPLE_YAML, 'utf-8');
    console.log(chalk.green('Created .pipeline.yaml'));
  });

program
  .command('run')
  .description('Trigger a pipeline run')
  .argument('[yaml]', 'Path to pipeline yaml file', '.pipeline.yaml')
  .action((yamlPath: string) => {
    const opts = program.opts();
    const serverUrl: string = opts.server;
    const resolvedPath = path.resolve(yamlPath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`File not found: ${resolvedPath}`));
      process.exit(1);
    }

    const rawYaml = fs.readFileSync(resolvedPath, 'utf-8');
    let parsed: any;
    try {
      parsed = yaml.load(rawYaml) as any;
    } catch (err: any) {
      console.error(chalk.red(`Invalid YAML: ${err.message}`));
      process.exit(1);
    }

    const pipelineName = parsed?.pipeline?.name || 'unknown';
    const { repoUrl, branch, commit } = getGitInfo();

    const spinner = ora('Triggering pipeline...').start();

    fetch(`${serverUrl}/api/pipelines/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineName, yaml: rawYaml, repoUrl, branch, commit }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Server error: ${res.status} ${body}`);
        }
        return res.json();
      })
      .then((run: any) => {
        spinner.succeed(`Pipeline triggered: ${chalk.cyan(run.id)}`);
        console.log('');
        streamLogs(serverUrl, run.id);
      })
      .catch((err: Error) => {
        spinner.fail(chalk.red(err.message));
        process.exit(1);
      });
  });

program
  .command('list')
  .description('List recent pipeline runs')
  .action(() => {
    const opts = program.opts();
    const serverUrl: string = opts.server;

    fetch(`${serverUrl}/api/pipelines`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        return res.json();
      })
      .then((runs) => {
        const runList = runs as any[];
        if (!runList.length) {
          console.log(chalk.gray('No pipeline runs found'));
          return;
        }

        const idWidth = 10;
        const nameWidth = 20;
        const statusWidth = 12;
        const triggerWidth = 12;
        const createdWidth = 24;

        const header =
          chalk.bold('Run ID'.padEnd(idWidth)) +
          chalk.bold('Pipeline Name'.padEnd(nameWidth)) +
          chalk.bold('Status'.padEnd(statusWidth)) +
          chalk.bold('Trigger'.padEnd(triggerWidth)) +
          chalk.bold('Created'.padEnd(createdWidth));

        console.log(header);
        console.log('-'.repeat(idWidth + nameWidth + statusWidth + triggerWidth + createdWidth));

        for (const run of runList) {
          const id = run.id.substring(0, 8).padEnd(idWidth);
          const name = (run.pipelineName || '').padEnd(nameWidth);
          const status = colorStatus(run.status).padEnd(statusWidth);
          const trigger = (run.trigger || '').padEnd(triggerWidth);
          const created = (run.createdAt || '').padEnd(createdWidth);
          console.log(id + name + status + trigger + created);
        }
      })
      .catch((err: Error) => {
        console.error(chalk.red(err.message));
        process.exit(1);
      });
  });

program
  .command('logs')
  .description('Show logs for a specific run')
  .argument('<runId>', 'Run ID')
  .action((runId: string) => {
    const opts = program.opts();
    const serverUrl: string = opts.server;

    fetch(`${serverUrl}/api/pipelines/${runId}/logs`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        return res.json();
      })
      .then((logs) => {
        for (const entry of logs as any[]) {
          console.log(`[${entry.stepName}] ${entry.data}`);
        }
        streamLogs(serverUrl, runId);
      })
      .catch((err: Error) => {
        console.error(chalk.red(err.message));
        process.exit(1);
      });
  });

program
  .command('watch')
  .description('Start a local webhook listener')
  .action(() => {
    const opts = program.opts();
    const serverUrl: string = opts.server;
    const PORT = 9000;

    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/webhook') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const githubEvent = req.headers['x-github-event'] as string | undefined;
            const gitlabEvent = req.headers['x-gitlab-event'] as string | undefined;
            const event = githubEvent || gitlabEvent || 'push';

            const repoUrl =
              payload.repository?.clone_url ||
              payload.repository?.git_http_url ||
              '';
            const branch = payload.ref
              ? payload.ref.replace(/^refs\/heads\//, '')
              : 'main';
            const commit = payload.after || payload.checkout_sha || '';
            const pipelineName =
              payload.repository?.name || 'auto-pipeline';

            console.log(
              chalk.cyan(`Webhook received: ${event}`) +
                chalk.gray(` | ${repoUrl} | ${branch} | ${commit}`)
            );

            fetch(`${serverUrl}/api/webhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ repoUrl, branch, commit, event, pipelineName }),
            })
              .then(async (forwardRes) => {
                if (!forwardRes.ok) {
                  const text = await forwardRes.text();
                  console.error(chalk.red(`Forward error: ${forwardRes.status} ${text}`));
                } else {
                  const data = (await forwardRes.json()) as any;
                  console.log(chalk.green(`Pipeline triggered: ${data.id}`));
                }
              })
              .catch((err: Error) => {
                console.error(chalk.red(`Forward error: ${err.message}`));
              });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid payload' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(PORT, () => {
      console.log(chalk.green(`Webhook listener running on http://localhost:${PORT}`));
      console.log(chalk.gray(`POST /webhook to trigger pipelines`));
    });
  });

program.parse();
