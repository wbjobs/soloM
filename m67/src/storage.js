const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class StorageEngine {
  constructor(options = {}) {
    this.useElasticsearch = options.useElasticsearch !== false;
    this.esNode = options.esNode || process.env.ELASTICSEARCH_NODE || 'http://localhost:9200';
    this.esUsername = options.esUsername || process.env.ELASTICSEARCH_USERNAME;
    this.esPassword = options.esPassword || process.env.ELASTICSEARCH_PASSWORD;
    this.indexName = options.indexName || process.env.ELASTICSEARCH_INDEX || 'llm_injection_logs';
    this.localFilePath = options.localFilePath || path.join(__dirname, '..', 'data', 'injection-logs.json');
    this.localLearnedPath = options.localLearnedPath || path.join(__dirname, '..', 'data', 'learned-samples.json');
    this.esClient = null;
    this.connected = false;
    this._ensureLocalDirs();
    this._learnedPhrases = this._loadLearnedPhrases();
  }

  _ensureLocalDirs() {
    const dataDir = path.dirname(this.localFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  async connect() {
    if (!this.useElasticsearch) {
      logger.info('Using local file storage (Elasticsearch disabled)');
      this.connected = true;
      return true;
    }

    try {
      const config = { node: this.esNode };
      if (this.esUsername && this.esPassword) {
        config.auth = { username: this.esUsername, password: this.esPassword };
      }

      this.esClient = new Client(config);
      await this.esClient.ping();

      const indexExists = await this.esClient.indices.exists({ index: this.indexName });
      if (!indexExists) {
        await this._createIndex();
      }

      this.connected = true;
      logger.info('Connected to Elasticsearch successfully');
      return true;
    } catch (err) {
      logger.warn(`Elasticsearch connection failed, falling back to local file storage: ${err.message}`);
      this.useElasticsearch = false;
      this.connected = true;
      return true;
    }
  }

  async _createIndex() {
    await this.esClient.indices.create({
      index: this.indexName,
      body: {
        mappings: {
          properties: {
            timestamp: { type: 'date' },
            ip: { type: 'ip' },
            userAgent: { type: 'keyword' },
            path: { type: 'keyword' },
            content: { type: 'text' },
            score: { type: 'float' },
            threshold: { type: 'float' },
            matchedItems: { type: 'nested' },
            semantic: { type: 'object' },
            status: { type: 'keyword' },
            feedback: { type: 'keyword' },
            feedbackNote: { type: 'text' },
            feedbackAt: { type: 'date' },
            learned: { type: 'boolean' },
          },
        },
      },
    });
    logger.info(`Created Elasticsearch index: ${this.indexName}`);
  }

  async saveLog(logEntry) {
    if (!this.connected) await this.connect();

    const entry = {
      ...logEntry,
      timestamp: logEntry.timestamp || new Date().toISOString(),
      status: 'blocked',
      feedback: null,
      learned: false,
    };

    if (this.useElasticsearch && this.esClient) {
      try {
        const result = await this.esClient.index({
          index: this.indexName,
          body: entry,
        });
        return { ...entry, id: result.body._id };
      } catch (err) {
        logger.error(`Failed to save to Elasticsearch: ${err.message}`);
        return this._saveLocal(entry);
      }
    }

    return this._saveLocal(entry);
  }

  _saveLocal(entry) {
    let logs = [];
    if (fs.existsSync(this.localFilePath)) {
      try {
        logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
      } catch (e) {
        logs = [];
      }
    }

    const id = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fullEntry = { ...entry, id };
    logs.unshift(fullEntry);
    fs.writeFileSync(this.localFilePath, JSON.stringify(logs, null, 2));
    return fullEntry;
  }

  async queryLogs(options = {}) {
    if (!this.connected) await this.connect();

    const {
      page = 1,
      pageSize = 20,
      feedback = null,
      fromDate = null,
      toDate = null,
      minScore = null,
      search = null,
    } = options;

    if (this.useElasticsearch && this.esClient) {
      return this._queryElasticsearch({ page, pageSize, feedback, fromDate, toDate, minScore, search });
    }

    return this._queryLocal({ page, pageSize, feedback, fromDate, toDate, minScore, search });
  }

  async _queryElasticsearch(options) {
    const { page, pageSize, feedback, fromDate, toDate, minScore, search } = options;

    const query = { bool: { must: [], filter: [] } };

    if (feedback) {
      query.bool.filter.push({ term: { feedback } });
    }

    if (fromDate || toDate) {
      const range = {};
      if (fromDate) range.gte = fromDate;
      if (toDate) range.lte = toDate;
      query.bool.filter.push({ range: { timestamp: range } });
    }

    if (minScore !== null) {
      query.bool.filter.push({ range: { score: { gte: minScore } } });
    }

    if (search) {
      query.bool.must.push({
        multi_match: {
          query: search,
          fields: ['content', 'matchedItems.value'],
        },
      });
    }

    if (query.bool.must.length === 0) delete query.bool.must;
    if (query.bool.filter.length === 0) delete query.bool.filter;
    if (Object.keys(query.bool).length === 0) query.match_all = {};

    const result = await this.esClient.search({
      index: this.indexName,
      from: (page - 1) * pageSize,
      size: pageSize,
      sort: [{ timestamp: { order: 'desc' } }],
      body: query.match_all ? { query: { match_all: {} } } : { query },
    });

    return {
      total: result.body.hits.total.value,
      page,
      pageSize,
      items: result.body.hits.hits.map(hit => ({ ...hit._source, id: hit._id })),
    };
  }

  _queryLocal(options) {
    const { page, pageSize, feedback, fromDate, toDate, minScore, search } = options;

    let logs = [];
    if (fs.existsSync(this.localFilePath)) {
      logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
    }

    let filtered = logs;

    if (feedback) {
      filtered = filtered.filter(log => log.feedback === feedback);
    }

    if (fromDate) {
      filtered = filtered.filter(log => log.timestamp >= fromDate);
    }
    if (toDate) {
      filtered = filtered.filter(log => log.timestamp <= toDate);
    }

    if (minScore !== null) {
      filtered = filtered.filter(log => log.score >= minScore);
    }

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(log =>
        log.content.toLowerCase().includes(lowerSearch) ||
        JSON.stringify(log.matchedItems).toLowerCase().includes(lowerSearch)
      );
    }

    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      total: filtered.length,
      page,
      pageSize,
      items,
    };
  }

  async getById(id) {
    if (!this.connected) await this.connect();

    if (this.useElasticsearch && this.esClient) {
      try {
        const result = await this.esClient.get({ index: this.indexName, id });
        return { ...result.body._source, id: result.body._id };
      } catch (err) {
        if (err.statusCode === 404) return null;
        throw err;
      }
    }

    const logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
    return logs.find(log => log.id === id) || null;
  }

  async updateFeedback(id, feedback, note = null) {
    if (!this.connected) await this.connect();

    const updateData = {
      feedback,
      feedbackNote: note,
      feedbackAt: new Date().toISOString(),
    };

    if (this.useElasticsearch && this.esClient) {
      await this.esClient.update({
        index: this.indexName,
        id,
        body: { doc: updateData },
      });
    } else {
      const logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
      const idx = logs.findIndex(log => log.id === id);
      if (idx >= 0) {
        logs[idx] = { ...logs[idx], ...updateData };
        fs.writeFileSync(this.localFilePath, JSON.stringify(logs, null, 2));
      }
    }

    return await this.getById(id);
  }

  async markAsLearned(id) {
    if (!this.connected) await this.connect();

    const updateData = { learned: true };

    if (this.useElasticsearch && this.esClient) {
      await this.esClient.update({
        index: this.indexName,
        id,
        body: { doc: updateData },
      });
    } else {
      const logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
      const idx = logs.findIndex(log => log.id === id);
      if (idx >= 0) {
        logs[idx] = { ...logs[idx], ...updateData };
        fs.writeFileSync(this.localFilePath, JSON.stringify(logs, null, 2));
      }
    }

    return await this.getById(id);
  }

  async getStats() {
    if (!this.connected) await this.connect();

    if (this.useElasticsearch && this.esClient) {
      return this._getStatsElasticsearch();
    }

    return this._getStatsLocal();
  }

  async _getStatsElasticsearch() {
    const result = await this.esClient.search({
      index: this.indexName,
      size: 0,
      body: {
        aggs: {
          total_blocked: { value_count: { field: 'feedback' } },
          by_feedback: { terms: { field: 'feedback', size: 10 } },
          avg_score: { avg: { field: 'score' } },
          last_24h: {
            filter: { range: { timestamp: { gte: 'now-24h' } } },
            aggs: { count: { value_count: { field: 'feedback' } } },
          },
        },
      },
    });

    const aggs = result.body.aggregations;
    const byFeedback = {};
    aggs.by_feedback.buckets.forEach(b => {
      byFeedback[b.key] = b.doc_count;
    });

    return {
      totalBlocked: aggs.total_blocked.value,
      byFeedback,
      avgScore: aggs.avg_score.value,
      last24h: aggs.last_24h.count.value,
    };
  }

  _getStatsLocal() {
    const logs = JSON.parse(fs.readFileSync(this.localFilePath, 'utf8'));
    const byFeedback = {};
    let totalScore = 0;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let last24h = 0;

    logs.forEach(log => {
      if (log.feedback) {
        byFeedback[log.feedback] = (byFeedback[log.feedback] || 0) + 1;
      }
      totalScore += log.score || 0;
      if (log.timestamp >= oneDayAgo) {
        last24h++;
      }
    });

    return {
      totalBlocked: logs.length,
      byFeedback,
      avgScore: logs.length > 0 ? totalScore / logs.length : 0,
      last24h,
    };
  }

  saveLearnedPhrase(content, type = 'benign') {
    const entry = {
      id: `learned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      content,
      type,
      createdAt: new Date().toISOString(),
    };

    if (type === 'benign') {
      this._learnedPhrases.benign.push(entry);
    } else {
      this._learnedPhrases.attack.push(entry);
    }

    fs.writeFileSync(this.localLearnedPath, JSON.stringify(this._learnedPhrases, null, 2));
    return entry;
  }

  _loadLearnedPhrases() {
    if (fs.existsSync(this.localLearnedPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.localLearnedPath, 'utf8'));
      } catch (e) {
        return { benign: [], attack: [] };
      }
    }
    return { benign: [], attack: [] };
  }

  getLearnedPhrases() {
    return this._learnedPhrases;
  }
}

module.exports = StorageEngine;
