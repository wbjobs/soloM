import * as t from '@babel/types'

export function inferTypeFromNode(node) {
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
    case 'Identifier':
      if (node.name === 'undefined') return 'undefined'
      return 'any'
    case 'ArrayExpression':
      return inferArrayType(node)
    case 'ObjectExpression':
      return inferObjectType(node)
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return inferFunctionType(node)
    case 'RegExpLiteral':
      return 'RegExp'
    case 'TemplateLiteral':
      return 'string'
    case 'UnaryExpression':
      if (node.operator === '!') return 'boolean'
      if (node.operator === '-' || node.operator === '+') return 'number'
      return 'any'
    case 'BinaryExpression':
      if (['+', '-', '*', '/', '%', '**'].includes(node.operator)) return 'number'
      if (['===', '!==', '==', '!=', '>', '<', '>=', '<='].includes(node.operator)) return 'boolean'
      return 'any'
    case 'LogicalExpression':
      return 'boolean'
    case 'ConditionalExpression':
      const consequentType = inferTypeFromNode(node.consequent)
      const alternateType = inferTypeFromNode(node.alternate)
      if (consequentType === alternateType) return consequentType
      return `${consequentType} | ${alternateType}`
    default:
      return 'any'
  }
}

function inferArrayType(node) {
  if (node.elements.length === 0) return 'any[]'

  const elementTypes = node.elements.map(el => inferTypeFromNode(el))
  const uniqueTypes = [...new Set(elementTypes)]
  
  if (uniqueTypes.length === 1) {
    return `${uniqueTypes[0]}[]`
  }
  
  return `(${uniqueTypes.join(' | ')})[]`
}

function inferObjectType(node) {
  if (node.properties.length === 0) return 'Record<string, any>'

  const propTypes = node.properties.map(prop => {
    if (prop.type !== 'ObjectProperty') return ''
    const key = prop.key.name || prop.key.value
    const valueType = inferTypeFromNode(prop.value)
    return `  ${key}: ${valueType}`
  }).filter(Boolean)

  if (propTypes.length === 0) return 'Record<string, any>'

  return `{\n${propTypes.join('\n')}\n}`
}

function inferFunctionType(node) {
  const params = node.params.map((param, i) => {
    const name = param.name || `arg${i}`
    return `${name}: any`
  }).join(', ')
  
  const returnType = 'any'
  
  return `(${params}) => ${returnType}`
}

export function generateTypeDefinition(name, type) {
  return `type ${name} = ${type}`
}

export function generateInterface(name, properties) {
  const props = properties.map(p => `  ${p.name}: ${p.type}`).join('\n')
  return `interface ${name} {\n${props}\n}`
}

export function inferRefType(node) {
  const baseType = inferTypeFromNode(node)
  
  if (node.type === 'ObjectExpression') {
    return baseType
  }
  
  return baseType
}

export function inferPropsType(propNode) {
  if (!propNode.value || propNode.value.type !== 'ObjectExpression') {
    return 'any'
  }

  const typeProp = propNode.value.properties.find(p => 
    (p.key.name || p.key.value) === 'type'
  )

  if (!typeProp || !typeProp.value) return 'any'

  if (typeProp.value.type === 'Identifier') {
    const typeName = typeProp.value.name
    const typeMap = {
      String: 'string',
      Number: 'number',
      Boolean: 'boolean',
      Array: 'any[]',
      Object: 'Record<string, any>',
      Function: 'Function',
      Date: 'Date'
    }
    return typeMap[typeName] || 'any'
  }

  return 'any'
}

export function collectAllTypes(options) {
  const types = {
    data: {},
    props: {},
    computed: {},
    methods: {},
    interfaces: []
  }

  for (const data of options.data) {
    types.data[data.name] = inferRefType(data.value)
  }

  for (const prop of options.props) {
    types.props[prop.name] = inferPropsType(prop.node)
  }

  for (const computed of options.computed) {
    types.computed[computed.name] = 'any'
  }

  for (const method of options.methods) {
    types.methods[method.name] = 'Function'
  }

  if (options.data.length > 0) {
    const dataProps = options.data.map(d => ({
      name: d.name,
      type: types.data[d.name]
    }))
    types.interfaces.push({
      name: 'DataState',
      properties: dataProps
    })
  }

  if (options.props.length > 0) {
    const propsList = options.props.map(p => ({
      name: p.name,
      type: types.props[p.name]
    }))
    types.interfaces.push({
      name: 'Props',
      properties: propsList
    })
  }

  return types
}

export function generateDtsFile(componentName, types) {
  const lines = []

  lines.push(`export interface ${componentName}Props {`)
  for (const [name, type] of Object.entries(types.props)) {
    lines.push(`  ${name}: ${type}`)
  }
  lines.push('}')
  lines.push('')

  lines.push(`export interface ${componentName}State {`)
  for (const [name, type] of Object.entries(types.data)) {
    lines.push(`  ${name}: ${type}`)
  }
  lines.push('}')
  lines.push('')

  lines.push(`export interface ${componentName}Computed {`)
  for (const [name, type] of Object.entries(types.computed)) {
    lines.push(`  ${name}: ${type}`)
  }
  lines.push('}')
  lines.push('')

  lines.push(`export interface ${componentName}Methods {`)
  for (const [name, type] of Object.entries(types.methods)) {
    lines.push(`  ${name}: ${type}`)
  }
  lines.push('}')
  lines.push('')

  lines.push(`declare const ${componentName}: import('vue').DefineComponent<`)
  lines.push(`  ${componentName}Props,`)
  lines.push(`  ${componentName}State,`)
  lines.push(`  ${componentName}Methods,`)
  lines.push(`  ${componentName}Computed`)
  lines.push(`>`)
  lines.push('')
  lines.push(`export default ${componentName}`)

  return lines.join('\n')
}
