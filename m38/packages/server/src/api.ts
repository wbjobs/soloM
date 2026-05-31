import { FastifyInstance } from 'fastify';
import { store } from './store';
import { engine } from './engine';
import { PipelineConfig, WebhookPayload } from './types';
import yaml from 'js-yaml';

export const pipelineConfigs: Map<string, PipelineConfig> = new Map();

export default function apiRoutes(fastify: FastifyInstance, opts: any, done: Function) {
  fastify.get('/api/pipelines', async (request, reply) => {
    const runs = store.getRecentRuns();
    return runs;
  });

  fastify.get('/api/pipelines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = store.getRun(id);
    if (!run) {
      reply.code(404).send({ error: 'Run not found' });
      return;
    }
    return run;
  });

  fastify.post('/api/pipelines/trigger', async (request, reply) => {
    const body = request.body as {
      pipelineName: string;
      yaml?: string;
      repoUrl?: string;
      branch?: string;
      commit?: string;
    };

    let config: PipelineConfig | undefined;

    if (body.yaml) {
      try {
        const parsed = yaml.load(body.yaml) as any;
        config = parsed?.pipeline ? parsed.pipeline : parsed;
        if (config) {
          pipelineConfigs.set(body.pipelineName || config.name, config);
        }
      } catch {
        reply.code(400).send({ error: 'Invalid YAML' });
        return;
      }
    } else {
      config = pipelineConfigs.get(body.pipelineName);
    }

    if (!config) {
      reply.code(404).send({ error: 'Pipeline config not found' });
      return;
    }

    const run = await engine.executePipeline(
      config,
      'manual',
      body.branch,
      body.commit,
      body.repoUrl
    );

    reply.code(201).send(run);
  });

  fastify.get('/api/pipelines/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const logs = store.getLogs(id);
    return logs;
  });

  fastify.post('/api/webhook', async (request, reply) => {
    const payload = request.body as WebhookPayload;

    let config: PipelineConfig | undefined;

    if (payload.pipelineName) {
      config = pipelineConfigs.get(payload.pipelineName);
    }

    if (!config) {
      config = {
        name: payload.pipelineName || 'auto-pipeline',
        triggers: [{ event: payload.event, branch: payload.branch }],
        steps: [
          {
            name: 'clone',
            image: 'alpine/git:v2.36.3',
            commands: [
              `git clone ${payload.repoUrl} .`,
              'git checkout ' + (payload.branch || 'main'),
            ],
          },
          {
            name: 'build',
            image: 'node:18-alpine',
            commands: ['npm install', 'npm run build'],
          },
        ],
      };
    }

    const run = await engine.executePipeline(
      config,
      payload.event,
      payload.branch,
      payload.commit,
      payload.repoUrl
    );

    reply.code(201).send(run);
  });

  done();
}
