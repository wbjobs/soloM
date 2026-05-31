import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { convertVue2ToVue3 } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'fixtures', 'input.vue')
const outputPath = path.join(__dirname, 'fixtures', 'output.vue')

const source = fs.readFileSync(inputPath, 'utf-8')

console.log('=== Converting Vue2 to Vue3 ===\n')

const result = convertVue2ToVue3(source)

console.log(result.code)

fs.writeFileSync(outputPath, result.code, 'utf-8')

console.log('\n=== Conversion complete! ===')
console.log(`Output written to: ${outputPath}`)
