const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_FILE_NAMES = [
  '.gitcommitrc',
  '.git-commit-ai.json',
  '.commitrc.json'
];

const CONFIG_PATHS = {
  user: CONFIG_FILE_NAMES.map(name => path.join(os.homedir(), name)),
  project: CONFIG_FILE_NAMES.map(name => path.join(process.cwd(), name))
};

const DEFAULT_CONFIG = {
  llm: {
    provider: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'llama3',
    maxContextLength: 4000,
    options: {
      temperature: 0.7,
      top_p: 0.9
    }
  },
  commit: {
    maxLength: 72,
    language: 'zh-CN',
    types: [
      'feat',
      'fix',
      'docs',
      'style',
      'refactor',
      'perf',
      'test',
      'build',
      'ci',
      'chore',
      'revert'
    ]
  },
  filter: {
    excludeExtensions: [],
    excludePatterns: [],
    includeExtensions: [],
    includePatterns: []
  }
};

function parseConfigFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  
  try {
    return JSON.parse(content);
  } catch (jsonError) {
    try {
      const result = {};
      const lines = content.split('\n');
      let currentSection = null;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
          continue;
        }
        
        const sectionMatch = trimmed.match(/^\[(.+)\]$/);
        if (sectionMatch) {
          currentSection = sectionMatch[1];
          if (!result[currentSection]) {
            result[currentSection] = {};
          }
          continue;
        }
        
        const eqMatch = trimmed.match(/^([^=]+)=(.+)$/);
        if (eqMatch) {
          const key = eqMatch[1].trim();
          let value = eqMatch[2].trim();
          
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          } else if (value.startsWith('[') && value.endsWith(']')) {
            try {
              value = JSON.parse(value);
            } catch {}
          } else if (value === 'true') {
            value = true;
          } else if (value === 'false') {
            value = false;
          } else if (!isNaN(Number(value))) {
            value = Number(value);
          }
          
          if (currentSection) {
            result[currentSection][key] = value;
          } else {
            result[key] = value;
          }
        }
      }
      
      return normalizeConfig(result);
    } catch (rcError) {
      throw new Error(`配置文件格式错误: ${jsonError.message} / ${rcError.message}`);
    }
  }
}

function normalizeConfig(config) {
  const normalized = {};
  
  if (config.language || config['commit.language']) {
    if (!normalized.commit) normalized.commit = {};
    normalized.commit.language = config.language || config['commit.language'];
  }
  
  if (config.excludeExtensions || config['filter.excludeExtensions']) {
    if (!normalized.filter) normalized.filter = {};
    const exts = config.excludeExtensions || config['filter.excludeExtensions'];
    normalized.filter.excludeExtensions = typeof exts === 'string' 
      ? exts.split(',').map(e => e.trim()) 
      : exts;
  }
  
  if (config.excludePatterns || config['filter.excludePatterns']) {
    if (!normalized.filter) normalized.filter = {};
    const patterns = config.excludePatterns || config['filter.excludePatterns'];
    normalized.filter.excludePatterns = typeof patterns === 'string' 
      ? patterns.split(',').map(p => p.trim()) 
      : patterns;
  }
  
  if (config.includeExtensions || config['filter.includeExtensions']) {
    if (!normalized.filter) normalized.filter = {};
    const exts = config.includeExtensions || config['filter.includeExtensions'];
    normalized.filter.includeExtensions = typeof exts === 'string' 
      ? exts.split(',').map(e => e.trim()) 
      : exts;
  }
  
  if (config.includePatterns || config['filter.includePatterns']) {
    if (!normalized.filter) normalized.filter = {};
    const patterns = config.includePatterns || config['filter.includePatterns'];
    normalized.filter.includePatterns = typeof patterns === 'string' 
      ? patterns.split(',').map(p => p.trim()) 
      : patterns;
  }
  
  if (config.commit && typeof config.commit === 'object') {
    normalized.commit = { ...normalized.commit, ...config.commit };
  }
  
  if (config.filter && typeof config.filter === 'object') {
    normalized.filter = normalized.filter || {};
    for (const key of ['excludeExtensions', 'excludePatterns', 'includeExtensions', 'includePatterns']) {
      if (config.filter[key] && typeof config.filter[key] === 'string') {
        config.filter[key] = config.filter[key].split(',').map(e => e.trim());
      }
    }
    normalized.filter = { ...normalized.filter, ...config.filter };
  }
  
  if (config.llm && typeof config.llm === 'object') {
    normalized.llm = config.llm;
  }
  
  return normalized;
}

function findConfigFile(paths) {
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function loadConfig(customPath = null) {
  let config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  const userConfigPath = findConfigFile(CONFIG_PATHS.user);
  if (userConfigPath) {
    try {
      const userConfig = parseConfigFile(userConfigPath);
      config = deepMerge(config, userConfig);
    } catch (error) {
      console.warn(`警告: 用户配置文件读取失败 (${userConfigPath}): ${error.message}`);
    }
  }

  const projectConfigPath = findConfigFile(CONFIG_PATHS.project);
  if (projectConfigPath) {
    try {
      const projectConfig = parseConfigFile(projectConfigPath);
      config = deepMerge(config, projectConfig);
    } catch (error) {
      console.warn(`警告: 项目配置文件读取失败 (${projectConfigPath}): ${error.message}`);
    }
  }

  if (customPath && fs.existsSync(customPath)) {
    try {
      const customConfig = parseConfigFile(customPath);
      config = deepMerge(config, customConfig);
    } catch (error) {
      throw new Error(`自定义配置文件读取失败: ${error.message}`);
    }
  }

  return config;
}

function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

function validateConfig(config) {
  const errors = [];

  if (!config.llm) {
    errors.push('缺少 llm 配置');
    return errors;
  }

  if (!config.llm.provider) {
    errors.push('缺少 llm.provider 配置');
  }

  if (!['ollama', 'openai-compatible'].includes(config.llm.provider)) {
    errors.push(`不支持的 llm.provider: ${config.llm.provider}`);
  }

  if (!config.llm.baseUrl) {
    errors.push('缺少 llm.baseUrl 配置');
  }

  if (!config.llm.model) {
    errors.push('缺少 llm.model 配置');
  }

  return errors;
}

function initConfig(force = false) {
  const configPath = CONFIG_PATHS.project;
  
  if (fs.existsSync(configPath) && !force) {
    throw new Error(`配置文件已存在: ${configPath}`);
  }

  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  return configPath;
}

function initUserConfig(force = false) {
  const configPath = CONFIG_PATHS.user;
  
  if (fs.existsSync(configPath) && !force) {
    throw new Error(`用户配置文件已存在: ${configPath}`);
  }

  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
  return configPath;
}

module.exports = {
  loadConfig,
  validateConfig,
  initConfig,
  initUserConfig,
  CONFIG_PATHS,
  DEFAULT_CONFIG
};
