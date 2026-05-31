const CryptoJS = require('crypto-js');

function deriveKey(password, salt) {
  return CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: 100000
  });
}

function deriveBlindIndexKey(password, salt) {
  return CryptoJS.PBKDF2(password + '_blind', salt, {
    keySize: 256 / 32,
    iterations: 50000
  }).toString();
}

function extractKeywords(text) {
  const cleaned = text.toLowerCase()
    .replace(/[#*`_~\[\]()<>]/g, ' ')
    .replace(/[，。！？、；：""''（）【】《》]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = new Set();
  
  const englishWords = cleaned.match(/[a-zA-Z]{2,}/g) || [];
  englishWords.forEach(w => words.add(w));
  
  const chineseChars = cleaned.match(/[\u4e00-\u9fa5]{1,}/g) || [];
  chineseChars.forEach(chunk => {
    for (let i = 0; i < chunk.length; i++) {
      words.add(chunk[i]);
    }
    for (let len = 2; len <= Math.min(4, chunk.length); len++) {
      for (let i = 0; i <= chunk.length - len; i++) {
        words.add(chunk.substring(i, i + len));
      }
    }
  });
  
  const numbers = cleaned.match(/\d{2,}/g) || [];
  numbers.forEach(n => words.add(n));
  
  return Array.from(words).filter(w => w.length > 0);
}

function generateBlindIndex(text, blindKey) {
  const keywords = extractKeywords(text);
  const hashes = keywords.map(keyword => {
    return CryptoJS.HmacSHA256(keyword, blindKey).toString();
  });
  return {
    hashes: hashes,
    keywordCount: keywords.length
  };
}

function searchBlindIndex(query, blindKey, blindIndexes) {
  const queryKeywords = extractKeywords(query);
  if (queryKeywords.length === 0) return [];
  
  const queryHashes = queryKeywords.map(kw => 
    CryptoJS.HmacSHA256(kw, blindKey).toString()
  );
  
  const results = [];
  for (const [noteId, indexData] of Object.entries(blindIndexes)) {
    let matchCount = 0;
    for (const qh of queryHashes) {
      if (indexData.hashes.includes(qh)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      results.push({
        noteId,
        matchCount,
        score: matchCount / queryHashes.length
      });
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

function encrypt(noteContent, password) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
  const key = deriveKey(password, salt);
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  
  const utf8Content = CryptoJS.enc.Utf8.parse(noteContent);
  
  const encrypted = CryptoJS.AES.encrypt(utf8Content, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  
  const blindKey = deriveBlindIndexKey(password, salt);
  const blindIndex = generateBlindIndex(noteContent, blindKey);
  
  return {
    ciphertext: encrypted.toString(),
    salt: salt,
    iv: iv.toString(),
    timestamp: Date.now(),
    blindIndex: blindIndex
  };
}

function decrypt(encryptedData, password) {
  try {
    const key = deriveKey(password, encryptedData.salt);
    const iv = CryptoJS.enc.Hex.parse(encryptedData.iv);
    
    const decrypted = CryptoJS.AES.decrypt(encryptedData.ciphertext, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    
    const utf8Str = decrypted.toString(CryptoJS.enc.Utf8);
    return utf8Str;
  } catch (error) {
    throw new Error('Decryption failed. Wrong password or corrupted data.');
  }
}

function getBlindKey(encryptedData, password) {
  return deriveBlindIndexKey(password, encryptedData.salt);
}

module.exports = { 
  encrypt, 
  decrypt, 
  extractKeywords,
  generateBlindIndex,
  searchBlindIndex,
  getBlindKey,
  deriveBlindIndexKey
};
