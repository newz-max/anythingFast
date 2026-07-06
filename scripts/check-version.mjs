import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

const files = {
  packageJson: path.join(rootDir, 'package.json'),
  tauriConfig: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
  cargoToml: path.join(rootDir, 'src-tauri', 'Cargo.toml')
}

const versions = [
  {
    label: 'package.json',
    value: readJsonVersion(files.packageJson)
  },
  {
    label: 'src-tauri/tauri.conf.json',
    value: readJsonVersion(files.tauriConfig)
  },
  {
    label: 'src-tauri/Cargo.toml',
    value: readCargoPackageVersion(files.cargoToml)
  }
]

const resolvedVersions = await Promise.all(
  versions.map(async (entry) => ({
    label: entry.label,
    value: await entry.value
  }))
)

const invalid = resolvedVersions.filter((entry) => !semverPattern.test(entry.value))
if (invalid.length > 0) {
  console.error('Invalid version metadata:')
  for (const entry of invalid) {
    console.error(`- ${entry.label}: ${entry.value || '<missing>'}`)
  }
  process.exit(1)
}

const uniqueVersions = new Set(resolvedVersions.map((entry) => entry.value))
if (uniqueVersions.size > 1) {
  console.error('Version metadata mismatch:')
  for (const entry of resolvedVersions) {
    console.error(`- ${entry.label}: ${entry.value}`)
  }
  process.exit(1)
}

console.log(`Version metadata consistent: ${resolvedVersions[0].value}`)

async function readJsonVersion(filePath) {
  const content = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(content)
  if (typeof parsed.version !== 'string') {
    throw new Error(`${path.relative(rootDir, filePath)} does not contain a string version`)
  }
  return parsed.version
}

async function readCargoPackageVersion(filePath) {
  const content = await readFile(filePath, 'utf8')
  const match = content.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)
  if (!match) {
    throw new Error(`${path.relative(rootDir, filePath)} does not contain a package-level version`)
  }
  return match[1]
}
