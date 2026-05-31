const defaultRules = require('../config/detection-rules');
const SemanticDetector = require('./semantic-detector');

class PromptInjectionDetector {
  constructor(customRules = {}) {
    this.rules = {
      keywords: customRules.keywords || defaultRules.keywords,
      regexPatterns: customRules.regexPatterns || defaultRules.regexPatterns,
      threshold: customRules.threshold || defaultRules.threshold,
    };

    this.semanticDetector = new SemanticDetector({
      similarityThreshold: customRules.semanticThreshold || 0.55,
      benignSimilarityThreshold: customRules.benignThreshold || 0.60,
      injectionWeight: customRules.semanticWeight || 60,
    });

    this.semanticEnabled = customRules.semanticEnabled !== false;
  }

  detect(text) {
    if (!text || typeof text !== 'string') {
      return {
        detected: false,
        score: 0,
        matchedItems: [],
        semantic: null,
      };
    }

    const ruleResult = this._ruleBasedDetect(text);
    const semanticResult = this.semanticEnabled ? this.semanticDetector.detect(text) : null;

    const finalScore = this._computeHybridScore(ruleResult.score, semanticResult);
    const matchedItems = [...ruleResult.matchedItems];

    if (semanticResult && semanticResult.semanticScore > 0) {
      matchedItems.push({
        type: 'semantic',
        value: semanticResult.bestMatch || 'semantic_match',
        weight: semanticResult.semanticScore,
        similarity: semanticResult.maxInjectionSimilarity,
        benignSimilarity: semanticResult.maxBenignSimilarity,
      });
    }

    return {
      detected: finalScore >= this.rules.threshold,
      score: finalScore,
      matchedItems,
      threshold: this.rules.threshold,
      semantic: semanticResult,
    };
  }

  _ruleBasedDetect(text) {
    const lowerText = text.toLowerCase();
    let totalScore = 0;
    const matchedItems = [];

    for (const keyword of this.rules.keywords) {
      if (lowerText.includes(keyword.word.toLowerCase())) {
        totalScore += keyword.weight;
        matchedItems.push({
          type: 'keyword',
          value: keyword.word,
          weight: keyword.weight,
        });
      }
    }

    for (const regexItem of this.rules.regexPatterns) {
      const matches = lowerText.match(regexItem.pattern);
      if (matches) {
        totalScore += regexItem.weight;
        matchedItems.push({
          type: 'regex',
          value: matches[0],
          weight: regexItem.weight,
        });
      }
    }

    return { score: totalScore, matchedItems };
  }

  _computeHybridScore(ruleScore, semanticResult) {
    if (!semanticResult) {
      return ruleScore;
    }

    if (semanticResult.maxBenignSimilarity > 0.60 && ruleScore < 40) {
      return Math.round(ruleScore * (1 - semanticResult.maxBenignSimilarity * 0.8));
    }

    if (semanticResult.detected) {
      return ruleScore + semanticResult.semanticScore;
    }

    if (ruleScore > 0 && !semanticResult.detected) {
      if (semanticResult.maxBenignSimilarity > 0.50) {
        return Math.round(ruleScore * 0.4);
      }
      if (semanticResult.maxInjectionSimilarity < 0.25) {
        return Math.round(ruleScore * 0.5);
      }
    }

    return ruleScore;
  }

  detectMessages(messages) {
    if (!Array.isArray(messages)) {
      return {
        detected: false,
        score: 0,
        matchedItems: [],
        semantic: null,
      };
    }

    let totalScore = 0;
    const allMatchedItems = [];
    let lastSemantic = null;

    for (const msg of messages) {
      if (msg && msg.content) {
        const result = this.detect(msg.content);
        totalScore += result.score;
        allMatchedItems.push(...result.matchedItems);
        if (result.semantic) {
          lastSemantic = result.semantic;
        }
      }
    }

    return {
      detected: totalScore >= this.rules.threshold,
      score: totalScore,
      matchedItems: allMatchedItems,
      threshold: this.rules.threshold,
      semantic: lastSemantic,
    };
  }

  setThreshold(newThreshold) {
    this.rules.threshold = newThreshold;
  }

  addKeyword(word, weight) {
    this.rules.keywords.push({ word, weight });
  }

  addRegexPattern(pattern, weight) {
    this.rules.regexPatterns.push({ pattern: new RegExp(pattern, 'i'), weight });
  }

  addInjectionPhrase(phrase) {
    this.semanticDetector.addInjectionPhrase(phrase);
  }

  addBenignPhrase(phrase) {
    this.semanticDetector.addBenignPhrase(phrase);
  }

  learnBenignPhrase(phrase) {
    return this.semanticDetector.addLearnedBenignPhrase(phrase);
  }

  learnInjectionPhrase(phrase) {
    return this.semanticDetector.addLearnedInjectionPhrase(phrase);
  }

  loadLearnedPhrases(learnedBenign = [], learnedInjection = []) {
    this.semanticDetector.setLearnedPhrases(learnedBenign, learnedInjection);
  }

  getSemanticStats() {
    return this.semanticDetector.getStats();
  }
}

module.exports = PromptInjectionDetector;
