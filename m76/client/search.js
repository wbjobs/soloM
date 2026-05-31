const { decrypt, extractKeywords } = require('./crypto');

class SearchIndex {
  constructor() {
    this.index = new Map();
    this.notes = new Map();
    this.password = null;
  }

  setPassword(password) {
    this.password = password;
  }

  async buildIndex(notesData) {
    if (!this.password) {
      throw new Error('Password not set');
    }

    this.index.clear();
    this.notes.clear();

    for (const [noteId, encryptedData] of Object.entries(notesData)) {
      try {
        const content = decrypt(encryptedData, this.password);
        const title = decodeNoteTitle(noteId);
        const fullText = title + ' ' + content;
        
        this.notes.set(noteId, {
          title,
          content,
          timestamp: encryptedData.timestamp
        });

        const keywords = extractKeywords(fullText);
        for (const keyword of keywords) {
          if (!this.index.has(keyword)) {
            this.index.set(keyword, new Set());
          }
          this.index.get(keyword).add(noteId);
        }
      } catch (error) {
        console.warn(`Failed to index note ${noteId}:`, error.message);
      }
    }

    return {
      indexedCount: this.notes.size,
      keywordCount: this.index.size
    };
  }

  search(query, options = {}) {
    const { limit = 20, minScore = 0.1 } = options;
    
    if (!query || query.trim().length === 0) {
      return [];
    }

    const queryKeywords = extractKeywords(query.toLowerCase());
    if (queryKeywords.length === 0) {
      return [];
    }

    const scores = new Map();

    for (const queryKw of queryKeywords) {
      const matchedNotes = this.index.get(queryKw) || new Set();
      
      for (const noteId of matchedNotes) {
        const currentScore = scores.get(noteId) || 0;
        scores.set(noteId, currentScore + 1);
      }
    }

    const results = [];
    for (const [noteId, score] of scores.entries()) {
      const normalizedScore = score / queryKeywords.length;
      if (normalizedScore >= minScore) {
        const note = this.notes.get(noteId);
        if (note) {
          const preview = this.generatePreview(note.content, query);
          results.push({
            noteId,
            title: note.title,
            preview,
            score: normalizedScore,
            matchCount: score,
            timestamp: note.timestamp
          });
        }
      }
    }

    results.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.timestamp - a.timestamp;
    });

    return results.slice(0, limit);
  }

  generatePreview(content, query, length = 150) {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    
    let pos = contentLower.indexOf(queryLower);
    if (pos === -1) {
      const keywords = extractKeywords(query);
      for (const kw of keywords) {
        pos = contentLower.indexOf(kw);
        if (pos !== -1) break;
      }
    }
    
    if (pos === -1) {
      return content.substring(0, length) + (content.length > length ? '...' : '');
    }

    const start = Math.max(0, pos - Math.floor(length / 2));
    const end = Math.min(content.length, start + length);
    
    let preview = content.substring(start, end);
    
    if (start > 0) preview = '...' + preview;
    if (end < content.length) preview = preview + '...';
    
    return preview;
  }

  clear() {
    this.index.clear();
    this.notes.clear();
  }
}

function decodeNoteTitle(noteId) {
  try {
    return decodeURIComponent(noteId);
  } catch {
    return noteId;
  }
}

module.exports = { SearchIndex, decodeNoteTitle };
