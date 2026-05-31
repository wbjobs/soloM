import * as t from '@babel/types'
import { inferRefType, inferPropsType, collectAllTypes } from './type-inference.js'

const lifecycleMap = {
  beforeCreate: null,
  created: null,
  beforeMount: 'onBeforeMount',
  mounted: 'onMounted',
  beforeUpdate: 'onBeforeUpdate',
  updated: 'onUpdated',
  beforeDestroy: 'onBeforeUnmount',
  destroyed: 'onUnmounted',
  activated: 'onActivated',
  deactivated: 'onDeactivated',
  errorCaptured: 'onErrorCaptured',
  serverPrefetch: 'onServerPrefetch'
}

export function transformToComposition(options, imports) {
  const newBody = []
  const vueImports = new Set()
  
  if (options.props.length > 0) {
    vueImports.add('defineProps')
  }
  if (options.emits.length > 0) {
    vueImports.add('defineEmits')
  }
  if (options.data.length > 0) {
    vueImports.add('ref')
    vueImports.add('reactive')
  }
  if (options.computed.length > 0) {
    vueImports.add('computed')
  }
  if (options.watch.length > 0) {
    vueImports.add('watch')
  }
  for (const hookName of Object.keys(options.lifecycle)) {
    const compositionHook = lifecycleMap[hookName]
    if (compositionHook) {
      vueImports.add(compositionHook)
    }
  }
  
  newBody.push(...imports)
  
  if (vueImports.size > 0) {
    const vueImport = t.importDeclaration(
      Array.from(vueImports).map(name => 
        t.importSpecifier(t.identifier(name), t.identifier(name))
      ),
      t.stringLiteral('vue')
    )
    newBody.push(vueImport)
  }
  
  if (options.props.length > 0) {
    newBody.push(transformProps(options.props))
  }
  
  if (options.emits.length > 0) {
    newBody.push(transformEmits(options.emits))
  }
  
  for (const dataProp of options.data) {
    newBody.push(transformDataProperty(dataProp))
  }
  
  for (const computedProp of options.computed) {
    newBody.push(transformComputed(computedProp))
  }
  
  for (const method of options.methods) {
    newBody.push(transformMethod(method))
  }
  
  for (const watcher of options.watch) {
    newBody.push(transformWatch(watcher))
  }
  
  for (const [hookName, hook] of Object.entries(options.lifecycle)) {
    const transformed = transformLifecycle(hookName, hook)
    if (transformed) {
      newBody.push(transformed)
    }
  }
  
  return newBody
}

function transformProps(props) {
  const propsObj = t.objectExpression(
    props.map(p => {
      const node = p.node
      if (node.type === 'StringLiteral') {
        return t.objectProperty(
          t.identifier(p.name),
          t.nullLiteral()
        )
      }
      return t.objectProperty(
        t.identifier(p.name),
        node.value
      )
    })
  )
  
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('props'),
      t.callExpression(t.identifier('defineProps'), [propsObj])
    )
  ])
}

function transformEmits(emits) {
  const emitsArray = t.arrayExpression(
    emits.map(e => t.stringLiteral(e))
  )
  
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier('emit'),
      t.callExpression(t.identifier('defineEmits'), [emitsArray])
    )
  ])
}

function transformDataProperty(dataProp) {
  const value = dataProp.value
  let wrapper = 'ref'
  
  if (value.type === 'ObjectExpression') {
    wrapper = 'reactive'
  }
  
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(dataProp.name),
      t.callExpression(t.identifier(wrapper), [value])
    )
  ])
}

function transformComputed(computedProp) {
  let getterFn
  
  if (computedProp.node.type === 'ObjectMethod') {
    getterFn = t.functionExpression(
      null,
      computedProp.node.params,
      computedProp.node.body,
      false,
      false
    )
    if (computedProp.node.body.comments) {
      getterFn.body.comments = computedProp.node.body.comments
    }
  } else if (computedProp.node.value && computedProp.node.value.type === 'FunctionExpression') {
    getterFn = computedProp.node.value
  } else {
    getterFn = t.arrowFunctionExpression([], t.blockStatement([]))
  }
  
  const declarator = t.variableDeclarator(
    t.identifier(computedProp.name),
    t.callExpression(t.identifier('computed'), [getterFn])
  )
  
  const declaration = t.variableDeclaration('const', [declarator])
  
  if (computedProp.node.leadingComments) {
    declaration.leadingComments = computedProp.node.leadingComments
  }
  if (computedProp.node.trailingComments) {
    declaration.trailingComments = computedProp.node.trailingComments
  }
  
  return declaration
}

function transformMethod(method) {
  let fn
  
  if (method.node.type === 'ObjectMethod') {
    fn = t.functionDeclaration(
      t.identifier(method.name),
      method.node.params,
      method.node.body,
      method.node.generator || false,
      method.node.async || false
    )
  } else if (method.node.value && method.node.value.type === 'FunctionExpression') {
    fn = t.functionDeclaration(
      t.identifier(method.name),
      method.node.value.params,
      method.node.value.body,
      method.node.value.generator || false,
      method.node.value.async || false
    )
  } else if (method.node.value && method.node.value.type === 'ArrowFunctionExpression') {
    fn = t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(method.name),
        method.node.value
      )
    ])
    return fn
  }
  
  return fn
}

function transformWatch(watcher) {
  let handlerFn
  let options = []
  
  const node = watcher.node
  if (node.type === 'ObjectMethod') {
    handlerFn = t.functionExpression(
      null,
      node.params,
      node.body,
      false,
      false
    )
  } else if (node.value && node.value.type === 'FunctionExpression') {
    handlerFn = node.value
  } else if (node.value && node.value.type === 'ObjectExpression') {
    const handlerProp = node.value.properties.find(p => 
      (p.key.name || p.key.value) === 'handler'
    )
    if (handlerProp) {
      if (handlerProp.type === 'ObjectMethod') {
        handlerFn = t.functionExpression(
          null,
          handlerProp.params,
          handlerProp.body,
          false,
          false
        )
      } else if (handlerProp.value) {
        handlerFn = handlerProp.value
      }
    }
    const deepProp = node.value.properties.find(p => 
      (p.key.name || p.key.value) === 'deep'
    )
    if (deepProp) {
      options.push(t.objectProperty(t.identifier('deep'), deepProp.value))
    }
    const immediateProp = node.value.properties.find(p => 
      (p.key.name || p.key.value) === 'immediate'
    )
    if (immediateProp) {
      options.push(t.objectProperty(t.identifier('immediate'), immediateProp.value))
    }
  }
  
  if (!handlerFn) {
    handlerFn = t.arrowFunctionExpression([], t.blockStatement([]))
  }
  
  const args = [
    t.arrowFunctionExpression([], t.identifier(watcher.name)),
    handlerFn
  ]
  
  if (options.length > 0) {
    args.push(t.objectExpression(options))
  }
  
  return t.expressionStatement(
    t.callExpression(t.identifier('watch'), args)
  )
}

function transformLifecycle(hookName, hook) {
  const compositionHook = lifecycleMap[hookName]
  if (!compositionHook) return null
  
  let hookFn
  
  if (hook.node.type === 'ObjectMethod') {
    hookFn = t.functionExpression(
      null,
      hook.node.params,
      hook.node.body,
      false,
      false
    )
  } else if (hook.node.value && hook.node.value.type === 'FunctionExpression') {
    hookFn = hook.node.value
  } else {
    return null
  }
  
  return t.expressionStatement(
    t.callExpression(t.identifier(compositionHook), [hookFn])
  )
}

export function transformThisReferences(ast, options) {
  const dataNames = new Set(options.data.map(d => d.name))
  const methodNames = new Set(options.methods.map(m => m.name))
  const computedNames = new Set(options.computed.map(c => c.name))
  const propNames = new Set(options.props.map(p => p.name))
  
  for (const node of ast.body) {
    traverseNode(node, {
      MemberExpression(path) {
        if (path.node.object.type === 'ThisExpression') {
          const propName = path.node.property.name || path.node.property.value
          if (dataNames.has(propName) || methodNames.has(propName) || computedNames.has(propName)) {
            Object.assign(path.node, t.identifier(propName))
          } else if (propNames.has(propName)) {
            Object.assign(path.node, t.memberExpression(t.identifier('props'), t.identifier(propName)))
          } else if (propName === '$emit') {
            Object.assign(path.node, t.identifier('emit'))
          }
        }
      }
    })
  }
  
  return ast
}

function traverseNode(node, visitors, parent = null, key = null) {
  if (!node || typeof node !== 'object') return
  
  const visitor = visitors[node.type]
  if (visitor) {
    visitor({ node, parent, key })
  }
  
  for (const [k, child] of Object.entries(node)) {
    if (k === 'loc' || k === 'range') continue
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        traverseNode(child[i], visitors, node, k)
      }
    } else if (child && typeof child === 'object' && child.type) {
      traverseNode(child, visitors, node, k)
    }
  }
}
