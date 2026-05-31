#!/usr/bin/env node

import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import { convertVue2ToVue3 } from '../src/index.js'

const program = new Command()

program
  .name('vue2-to-vue3')
  .description('Convert Vue2 Options API to Vue3 Composition API with <script setup>')
  .version('1.0.0')

program
  .command('convert <input>')
  .description('Convert a Vue file')
  .option('-o, --output <output>', 'Output file path')
  .action((input, options) => {
    try {
      const inputPath = path.resolve(input)
      const source = fs.readFileSync(inputPath, 'utf-8')
      
      const result = convertVue2ToVue3(source)
      
      if (options.output) {
        const outputPath = path.resolve(options.output)
        fs.writeFileSync(outputPath, result, 'utf-8')
        console.log(`Converted: ${inputPath} -> ${outputPath}`)
      } else {
        console.log(result)
      }
    } catch (error) {
      console.error('Error:', error.message)
      process.exit(1)
    }
  })

program.parse()
