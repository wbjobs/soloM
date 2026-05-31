import { parse } from '@vue/compiler-sfc'
import { parse as babelParse } from '@babel/parser'

export function parseVueFile(source) {
  const { descriptor } = parse(source, {
    filename: 'component.vue',
    sourceMap: false
  })

  return {
    descriptor,
    scriptAst: descriptor.script ? parseScript(descriptor.script.content) : null,
    template: descriptor.template,
    styles: descriptor.styles
  }
}

export function parseScript(scriptContent) {
  const ast = babelParse(scriptContent, {
    sourceType: 'module',
    plugins: ['jsx'],
    tokens: true
  })
  
  return ast
}

export function extractOptions(ast) {
  const options = {
    data: [],
    methods: [],
    computed: [],
    props: [],
    watch: [],
    lifecycle: {},
    components: [],
    emits: [],
    name: null
  }

  let defaultExport = null
  
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') {
      defaultExport = node.declaration
      break
    }
  }

  if (!defaultExport || defaultExport.type !== 'ObjectExpression') {
    return options
  }

  for (const prop of defaultExport.properties) {
    if (prop.type !== 'ObjectProperty' && prop.type !== 'ObjectMethod') continue
    
    const key = prop.key.name || prop.key.value
    
    switch (key) {
      case 'name':
        options.name = prop.value.value
        break
      case 'data':
        options.data = extractDataProperties(prop)
        break
      case 'methods':
        options.methods = extractMethods(prop)
        break
      case 'computed':
        options.computed = extractComputed(prop)
        break
      case 'props':
        options.props = extractProps(prop)
        break
      case 'watch':
        options.watch = extractWatch(prop)
        break
      case 'components':
        options.components = extractComponents(prop)
        break
      case 'emits':
        options.emits = extractEmits(prop)
        break
      default:
        if (isLifecycleHook(key)) {
          options.lifecycle[key] = extractLifecycleHook(prop, key)
        }
    }
  }

  return options
}

function extractDataProperties(dataProp) {
  const properties = []
  
  if (dataProp.type === 'ObjectMethod') {
    const body = dataProp.body
    for (const stmt of body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        if (stmt.argument.type === 'ObjectExpression') {
          for (const prop of stmt.argument.properties) {
            if (prop.type === 'ObjectProperty') {
              properties.push({
                name: prop.key.name || prop.key.value,
                value: prop.value,
                node: prop
              })
            }
          }
        }
      }
    }
  }
  
  return properties
}

function extractMethods(methodsProp) {
  const methods = []
  
  if (methodsProp.value && methodsProp.value.type === 'ObjectExpression') {
    for (const prop of methodsProp.value.properties) {
      if (prop.type === 'ObjectMethod' || prop.type === 'ObjectProperty') {
        methods.push({
          name: prop.key.name || prop.key.value,
          node: prop,
          params: prop.params || [],
          body: prop.body
        })
      }
    }
  }
  
  return methods
}

function extractComputed(computedProp) {
  const computed = []
  
  if (computedProp.value && computedProp.value.type === 'ObjectExpression') {
    for (const prop of computedProp.value.properties) {
      computed.push({
        name: prop.key.name || prop.key.value,
        node: prop,
        isGetter: prop.type === 'ObjectMethod' || (prop.value && prop.value.type === 'FunctionExpression')
      })
    }
  }
  
  return computed
}

function extractProps(propsProp) {
  const props = []
  
  if (propsProp.value && propsProp.value.type === 'ObjectExpression') {
    for (const prop of propsProp.value.properties) {
      props.push({
        name: prop.key.name || prop.key.value,
        node: prop
      })
    }
  } else if (propsProp.value && propsProp.value.type === 'ArrayExpression') {
    for (const elem of propsProp.value.elements) {
      if (elem && elem.type === 'StringLiteral') {
        props.push({
          name: elem.value,
          node: elem
        })
      }
    }
  }
  
  return props
}

function extractWatch(watchProp) {
  const watch = []
  
  if (watchProp.value && watchProp.value.type === 'ObjectExpression') {
    for (const prop of watchProp.value.properties) {
      watch.push({
        name: prop.key.name || prop.key.value,
        node: prop
      })
    }
  }
  
  return watch
}

function extractComponents(componentsProp) {
  const components = []
  
  if (componentsProp.value && componentsProp.value.type === 'ObjectExpression') {
    for (const prop of componentsProp.value.properties) {
      components.push({
        name: prop.key.name || prop.key.value,
        value: prop.value,
        node: prop
      })
    }
  }
  
  return components
}

function extractEmits(emitsProp) {
  const emits = []
  
  if (emitsProp.value && emitsProp.value.type === 'ArrayExpression') {
    for (const elem of emitsProp.value.elements) {
      if (elem && elem.type === 'StringLiteral') {
        emits.push(elem.value)
      }
    }
  }
  
  return emits
}

function extractLifecycleHook(prop, hookName) {
  return {
    name: hookName,
    node: prop
  }
}

function isLifecycleHook(name) {
  const lifecycleHooks = [
    'beforeCreate', 'created',
    'beforeMount', 'mounted',
    'beforeUpdate', 'updated',
    'beforeDestroy', 'destroyed',
    'activated', 'deactivated',
    'errorCaptured', 'serverPrefetch'
  ]
  return lifecycleHooks.includes(name)
}

export function extractImports(ast) {
  const imports = []
  
  for (const node of ast.program.body) {
    if (node.type === 'ImportDeclaration') {
      imports.push(node)
    }
  }
  
  return imports
}
