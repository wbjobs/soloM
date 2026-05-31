const corpus = require('../config/injection-corpus');
const logger = require('./logger');

class TfIdfEngine {
  constructor() {
    this.documents = [];
    this.idfCache = new Map();
  }

  addDocument(tokens) {
    const termFreq = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    this.documents.push(termFreq);
  }

  computeIdf() {
    const docCount = this.documents.length;
    const docFreq = new Map();
    for (const doc of this.documents) {
      for (const term of doc.keys()) {
        docFreq.set(term, (docFreq.get(term) || 0) + 1);
      }
    }
    for (const [term, freq] of docFreq) {
      this.idfCache.set(term, Math.log((docCount + 1) / (freq + 1)) + 1);
    }
  }

  getIdf(term) {
    return this.idfCache.get(term) || 0;
  }

  getVector(docIndex) {
    const doc = this.documents[docIndex];
    const totalTerms = Array.from(doc.values()).reduce((s, v) => s + v, 0) || 1;
    const vector = new Map();
    for (const [term, count] of doc) {
      const tf = count / totalTerms;
      const idf = this.getIdf(term);
      vector.set(term, tf * idf);
    }
    return vector;
  }

  textToVector(tokens) {
    const termFreq = new Map();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
    }
    const totalTerms = tokens.length || 1;
    const vector = new Map();
    for (const [term, count] of termFreq) {
      const tf = count / totalTerms;
      const idf = this.getIdf(term);
      if (idf > 0) {
        vector.set(term, tf * idf);
      }
    }
    return vector;
  }
}

class SemanticDetector {
  constructor(options = {}) {
    this.similarityThreshold = options.similarityThreshold || 0.55;
    this.benignSimilarityThreshold = options.benignSimilarityThreshold || 0.60;
    this.ngramMin = options.ngramMin || 2;
    this.ngramMax = options.ngramMax || 4;
    this.injectionWeight = options.injectionWeight || 60;
    this.tfidf = new TfIdfEngine();
    this.injectionVectors = [];
    this.benignVectors = [];
    this.learnedBenignPhrases = [];
    this.learnedInjectionPhrases = [];
    this.initialized = false;
  }

  tokenize(text) {
    const normalized = text.toLowerCase().replace(/[^\w\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = [];
    const segments = normalized.split(' ').filter(w => w.length > 0);

    for (const segment of segments) {
      const isChinese = /[\u4e00-\u9fff]/.test(segment);
      if (isChinese) {
        const chineseChars = segment.replace(/[^\u4e00-\u9fff]/g, '');
        for (let n = this.ngramMin; n <= Math.min(this.ngramMax, chineseChars.length); n++) {
          for (let i = 0; i <= chineseChars.length - n; i++) {
            tokens.push(chineseChars.substring(i, i + n));
          }
        }
      } else {
        if (segment.length >= 2) {
          tokens.push(segment);
        }
        for (let n = this.ngramMin; n <= Math.min(this.ngramMax, segment.length); n++) {
          for (let i = 0; i <= segment.length - n; i++) {
            tokens.push(segment.substring(i, i + n));
          }
        }
      }
    }
    return tokens;
  }

  setLearnedPhrases(learnedBenign = [], learnedInjection = []) {
    this.learnedBenignPhrases = learnedBenign.map(p => typeof p === 'string' ? p : p.content);
    this.learnedInjectionPhrases = learnedInjection.map(p => typeof p === 'string' ? p : p.content);
    this.reinitialize();
    logger.info(`Loaded learned phrases: ${this.learnedBenignPhrases.length} benign, ${this.learnedInjectionPhrases.length} injection`);
  }

  addLearnedBenignPhrase(phrase) {
    if (!this.learnedBenignPhrases.includes(phrase)) {
      this.learnedBenignPhrases.push(phrase);
      this.reinitialize();
      logger.info(`Added learned benign phrase: "${phrase}"`);
      return true;
    }
    return false;
  }

  addLearnedInjectionPhrase(phrase) {
    if (!this.learnedInjectionPhrases.includes(phrase)) {
      this.learnedInjectionPhrases.push(phrase);
      this.reinitialize();
      logger.info(`Added learned injection phrase: "${phrase}"`);
      return true;
    }
    return false;
  }

  reinitialize() {
    this.initialized = false;
    this.tfidf = new TfIdfEngine();
    this.injectionVectors = [];
    this.benignVectors = [];
    this.initialize();
  }

  initialize() {
    if (this.initialized) return;

    logger.info('Initializing semantic detector, building reference vectors...');

    this.tfidf = new TfIdfEngine();

    const allInjection = [...corpus.injectionPhrases, ...this.learnedInjectionPhrases];
    const allBenign = [...corpus.benignPhrases, ...this.learnedBenignPhrases];
    const allPhrases = [...allInjection, ...allBenign];

    for (const phrase of allPhrases) {
      this.tfidf.addDocument(this.tokenize(phrase));
    }
    this.tfidf.computeIdf();

    const injectionCount = allInjection.length;
    this.injectionVectors = [];
    this.injectionPhrases = allInjection;
    for (let i = 0; i < injectionCount; i++) {
      this.injectionVectors.push(this.tfidf.getVector(i));
    }

    this.benignVectors = [];
    this.benignPhrases = allBenign;
    for (let i = 0; i < allBenign.length; i++) {
      this.benignVectors.push(this.tfidf.getVector(injectionCount + i));
    }

    this.initialized = true;
    logger.info(`Semantic detector initialized: ${this.injectionVectors.length} injection refs, ${this.benignVectors.length} benign refs (${this.learnedBenignPhrases.length} learned)`);
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [key, valueA] of vecA) {
      normA += valueA * valueA;
      if (vecB.has(key)) {
        dotProduct += valueA * vecB.get(key);
      }
    }

    for (const valueB of vecB.values()) {
      normB += valueB * valueB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
  }

  detect(text) {
    if (!text || typeof text !== 'string') {
      return {
        detected: false,
        semanticScore: 0,
        maxInjectionSimilarity: 0,
        maxBenignSimilarity: 0,
        bestMatch: null,
        bestBenignMatch: null,
        adjustedSimilarity: 0,
      };
    }

    this.initialize();

    const inputVector = this.tfidf.textToVector(this.tokenize(text));

    if (inputVector.size === 0) {
      return {
        detected: false,
        semanticScore: 0,
        maxInjectionSimilarity: 0,
        maxBenignSimilarity: 0,
        bestMatch: null,
        bestBenignMatch: null,
        adjustedSimilarity: 0,
      };
    }

    let maxInjectionSimilarity = 0;
    let bestInjectionMatch = null;
    let isLearnedInjection = false;

    for (let i = 0; i < this.injectionVectors.length; i++) {
      const similarity = this.cosineSimilarity(inputVector, this.injectionVectors[i]);
      if (similarity > maxInjectionSimilarity) {
        maxInjectionSimilarity = similarity;
        bestInjectionMatch = this.injectionPhrases[i];
        isLearnedInjection = i >= corpus.injectionPhrases.length;
      }
    }

    let maxBenignSimilarity = 0;
    let bestBenignMatch = null;
    let isLearnedBenign = false;

    for (let i = 0; i < this.benignVectors.length; i++) {
      const similarity = this.cosineSimilarity(inputVector, this.benignVectors[i]);
      if (similarity > maxBenignSimilarity) {
        maxBenignSimilarity = similarity;
        bestBenignMatch = this.benignPhrases[i];
        isLearnedBenign = i >= corpus.benignPhrases.length;
      }
    }

    const adjustedSimilarity = maxBenignSimilarity > this.benignSimilarityThreshold
      ? maxInjectionSimilarity * (1 - maxBenignSimilarity * 0.7)
      : maxInjectionSimilarity;

    const semanticScore = Math.round(adjustedSimilarity * 100);
    const detected = semanticScore >= this.similarityThreshold * 100;

    return {
      detected,
      semanticScore,
      maxInjectionSimilarity: parseFloat(maxInjectionSimilarity.toFixed(4)),
      maxBenignSimilarity: parseFloat(maxBenignSimilarity.toFixed(4)),
      bestMatch: bestInjectionMatch,
      bestBenignMatch,
      adjustedSimilarity: parseFloat(adjustedSimilarity.toFixed(4)),
      isLearnedInjection,
      isLearnedBenign,
    };
  }

  addInjectionPhrase(phrase) {
    corpus.injectionPhrases.push(phrase);
    this.initialized = false;
  }

  addBenignPhrase(phrase) {
    corpus.benignPhrases.push(phrase);
    this.initialized = false;
  }

  getStats() {
    return {
      totalInjectionReferences: this.injectionVectors.length,
      totalBenignReferences: this.benignVectors.length,
      learnedBenignPhrases: this.learnedBenignPhrases.length,
      learnedInjectionPhrases: this.learnedInjectionPhrases.length,
      initialized: this.initialized,
    };
  }
}

module.exports = SemanticDetector;
