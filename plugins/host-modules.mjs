import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findHostPackage } from './chat-answer-fix.mjs'

export const hostDirectory = (name, entry = process.argv[1]) => findHostPackage(entry, name)
export function hostImport(name, entry = process.argv[1]) {
  const directory = hostDirectory(name, entry)
  return import(pathToFileURL(createRequire(join(directory, 'package.json')).resolve(`@deepseek-ai/${name}`)).href)
}
