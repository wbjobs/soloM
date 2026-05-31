import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { convertVue2ToVue3 } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'fixtures', 'complex.vue')
const outputPath = path.join(__dirname, 'fixtures', 'complex-output.vue')

const source = fs.readFileSync(inputPath, 'utf-8')

console.log('=== Testing Complex Conversion ===\n')

try {
  const result = convertVue2ToVue3(source)

  console.log(result.code)

  fs.writeFileSync(outputPath, result.code, 'utf-8')

  console.log('\n=== Conversion complete! ===')
  console.log(`Output written to: ${outputPath}`)
  
  console.log('\n=== Syntax Check ===')
  try {
    const scriptMatch = result.code.match(/<script setup>([\s\S]*?)<\/script>/)
    if (scriptMatch) {
      const scriptContent = scriptMatch[1]
      new Function(scriptContent)
      console.log('✓ Script syntax is valid')
    }
  } catch (e) {
    console.log('✗ Script syntax error:', e.message)
  }
} catch (e) {
  console.error('Error during conversion:', e)
}
