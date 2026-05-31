export const BLOCK_COLORS = {
  1:  { color: '#808080', name: 'Stone' },
  2:  { color: '#5a9e3e', name: 'Grass' },
  3:  { color: '#8b6b3d', name: 'Dirt' },
  4:  { color: '#6b6b6b', name: 'Cobblestone' },
  5:  { color: '#bc9862', name: 'Planks' },
  7:  { color: '#3a3a3a', name: 'Bedrock' },
  9:  { color: '#3f76e4', name: 'Water' },
  11: { color: '#cf4913', name: 'Lava' },
  12: { color: '#dbd3a0', name: 'Sand' },
  13: { color: '#8a8a8a', name: 'Gravel' },
  14: { color: '#f5d442', name: 'Gold Ore' },
  15: { color: '#c4a882', name: 'Iron Ore' },
  16: { color: '#3a3a3a', name: 'Coal Ore' },
  17: { color: '#6b5030', name: 'Log' },
  18: { color: '#3a8a22', name: 'Leaves' },
  20: { color: '#a8d8ea', name: 'Glass' },
  21: { color: '#2c4e8e', name: 'Lapis Ore' },
  24: { color: '#d4c483', name: 'Sandstone' },
  49: { color: '#1a0a2e', name: 'Obsidian' },
  56: { color: '#4ae8e8', name: 'Diamond Ore' },
  73: { color: '#cc3333', name: 'Redstone Ore' },
  79: { color: '#a0d8ef', name: 'Ice' },
  80: { color: '#f0f0f0', name: 'Snow' },
  82: { color: '#9ea4b0', name: 'Clay' },
  86: { color: '#d47b2e', name: 'Pumpkin' },
  87: { color: '#6b2020', name: 'Netherrack' },
  88: { color: '#5a4a30', name: 'Soul Sand' },
  89: { color: '#f5d442', name: 'Glowstone' },
  129: { color: '#30c030', name: 'Emerald Ore' },
}

export function getBlockColor(blockId) {
  if (BLOCK_COLORS[blockId]) {
    return BLOCK_COLORS[blockId].color
  }
  return '#808080'
}

export function getBlockName(blockId) {
  if (BLOCK_COLORS[blockId]) {
    return BLOCK_COLORS[blockId].name
  }
  return 'Unknown'
}
