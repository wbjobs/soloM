import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { convertVue2ToVue3 } from '../src/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const inputPath = path.join(__dirname, 'fixtures', 'typescript.vue')
const outputPath = path.join(__dirname, 'fixtures', 'typescript-output.vue')
const dtsPath = path.join(__dirname, 'fixtures', 'typescript-output.vue.d.ts')

const source = fs.readFileSync(inputPath, 'utf-8')

console.log('=== Testing TypeScript Conversion ===\n')

try {
  const result = convertVue2ToVue3(source, { typescript: true, generateDts: true })

  console.log('=== Converted Vue File (with TypeScript types) ===\n')
  console.log(result.code)

  fs.writeFileSync(outputPath, result.code, 'utf-8')
  console.log(`\n=== Vue file written to: ${outputPath}`)

  if (result.dts) {
    console.log('\n=== Generated Type Declaration File (.d.ts) ===\n')
    console.log(result.dts)
    
    fs.writeFileSync(dtsPath, result.dts, 'utf-8')
    console.log(`\n=== Type declaration file written to: ${dtsPath}`)
  }

  console.log('\n=== Inferred Types ===\n')
  console.log(JSON.stringify(result.types, null, 2))

} catch (e) {
  console.error('Error during conversion:', e)
}
