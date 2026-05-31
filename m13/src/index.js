import { parseVueFile, extractOptions, extractImports } from './parser.js'
import { transformToComposition, transformThisReferences } from './transformer.js'
import { generateScript, generateVueFile, formatCode } from './generator.js'
import { collectAllTypes, generateDtsFile } from './type-inference.js'
import * as t from '@babel/types'

export function convertVue2ToVue3(source, options = {}) {
  const { typescript = false, generateDts = false } = options
  
  const parsed = parseVueFile(source)
  
  if (!parsed.scriptAst) {
    return { code: source, dts: null }
  }
  
  const extractedOptions = extractOptions(parsed.scriptAst)
  const imports = extractImports(parsed.scriptAst)
  
  const newBody = transformToComposition(extractedOptions, imports)
  
  const newAst = t.program(newBody, [], 'module')
  transformThisReferences(newAst, extractedOptions)
  
  let scriptContent = generateScript(newAst.body)
  
  if (typescript) {
    scriptContent = addTypeScriptTypes(scriptContent, extractedOptions)
  }
  
  const formattedScript = formatCode(scriptContent)
  
  const result = generateVueFile(
    formattedScript,
    parsed.template,
    parsed.styles,
    source
  )
  
  const finalCode = formatCode(result)
  
  let dtsContent = null
  if (generateDts || typescript) {
    const types = collectAllTypes(extractedOptions)
    const componentName = extractedOptions.name || 'Component'
    dtsContent = generateDtsFile(componentName, types)
  }
  
  return {
    code: finalCode,
    dts: dtsContent,
    types: collectAllTypes(extractedOptions)
  }
}

function addTypeScriptTypes(scriptContent, options) {
  let result = scriptContent
  
  for (const data of options.data) {
    const type = inferRefTypeForReplacement(data.value)
    const name = data.name
    const wrapper = data.value.type === 'ObjectExpression' ? 'reactive' : 'ref'
    
    const regex = new RegExp(`const ${name} = ${wrapper}\\(`)
    result = result.replace(regex, `const ${name} = ${wrapper}<${type}>(`)
  }
  
  return result
}

function inferRefTypeForReplacement(node) {
  if (!node) return 'any'

  switch (node.type) {
    case 'StringLiteral':
      return 'string'
    case 'NumericLiteral':
      return 'number'
    case 'BooleanLiteral':
      return 'boolean'
    case 'NullLiteral':
      return 'null'
    case 'ArrayExpression':
      if (node.elements.length === 0) return 'any[]'
      const firstType = node.elements[0] ? inferRefTypeForReplacement(node.elements[0]) : 'any'
      return `${firstType}[]`
    case 'ObjectExpression':
      if (node.properties.length === 0) return 'Record<string, any>'
      const props = node.properties.map(prop => {
        if (prop.type !== 'ObjectProperty') return ''
        const key = prop.key.name || prop.key.value
        const valueType = inferRefTypeForReplacement(prop.value)
        return `  ${key}: ${valueType}`
      }).filter(Boolean)
      return `{ ${props.join('; ')} }`
    default:
      return 'any'
  }
}

export { parseVueFile, extractOptions, extractImports } from './parser.js'
export { transformToComposition, transformThisReferences } from './transformer.js'
export { generateScript, generateVueFile } from './generator.js'
export { collectAllTypes, generateDtsFile } from './type-inference.js'
