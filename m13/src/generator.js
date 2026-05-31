import generate from '@babel/generator'
import * as t from '@babel/types'

export function generateScript(body) {
  const ast = t.program(body, [], 'module')
  
  const { code } = generate.default(ast, {
    comments: true,
    retainLines: false,
    compact: false,
    concise: false,
    minified: false,
    auxilaryCommentAfter: true,
    shouldPrintComment: (comment) => true,
    jsescOption: {
      quotes: 'single',
      compact: false
    }
  })
  
  return formatCode(code)
}

export function generateVueFile(scriptContent, template, styles, originalSource) {
  const scriptSetup = `<script setup>
${scriptContent}
</script>`

  let templateContent = ''
  if (template) {
    let start = template.loc.start.offset
    while (start > 0 && originalSource[start - 1] !== '<') {
      start--
    }
    const tagMatch = originalSource.slice(start).match(/^<template[^>]*>/)
    const openTag = tagMatch ? tagMatch[0] : '<template>'
    
    const innerContent = originalSource.slice(template.loc.start.offset, template.loc.end.offset).trim()
    const closeTag = '</template>'
    
    templateContent = `${openTag}\n  ${innerContent}\n${closeTag}`
  }

  let stylesContent = ''
  for (const style of styles) {
    let attrs = ''
    if (style.scoped) attrs += ' scoped'
    if (style.module) attrs += ' module'
    if (style.lang) attrs += ` lang="${style.lang}"`
    
    const innerContent = originalSource.slice(style.loc.start.offset, style.loc.end.offset).trim()
    const openTag = `<style${attrs}>`
    const closeTag = '</style>'
    
    stylesContent += `${openTag}\n  ${innerContent}\n${closeTag}\n`
  }

  const parts = [templateContent, scriptSetup, stylesContent]
  
  return parts.filter(p => p.trim()).join('\n\n')
}

export function formatCode(code) {
  let result = code
  
  result = result.replace(/\n{3,}/g, '\n\n')
  
  result = formatTernaryOperators(result)
  
  return result.trim()
}

function formatTernaryOperators(code) {
  const lines = code.split('\n')
  const result = []
  
  for (const line of lines) {
    const ternaryCount = (line.match(/\s+\?\s+/g) || []).length
    
    if (ternaryCount >= 2 && line.length > 80) {
      const formatted = formatDeepTernary(line)
      result.push(formatted)
    } else {
      result.push(line)
    }
  }
  
  return result.join('\n')
}

function formatDeepTernary(line) {
  const leadingSpaces = line.match(/^\s*/)[0]
  let depth = 0
  let result = leadingSpaces
  let i = leadingSpaces.length
  
  while (i < line.length) {
    const questionMark = line.indexOf(' ? ', i)
    const colon = line.indexOf(' : ', i)
    
    if (questionMark !== -1 && (colon === -1 || questionMark < colon)) {
      result += line.slice(i, questionMark) + '\n' + leadingSpaces + '  '.repeat(depth + 1) + '? '
      depth++
      i = questionMark + 3
    } else if (colon !== -1) {
      depth = Math.max(0, depth - 1)
      result += line.slice(i, colon) + '\n' + leadingSpaces + '  '.repeat(depth + 1) + ': '
      i = colon + 3
    } else {
      result += line.slice(i)
      break
    }
  }
  
  return result
}
