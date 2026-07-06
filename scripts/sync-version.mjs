import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/

const packageJsonPath = path.join(rootDir, 'package.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml')
const cargoLockPath = path.join(rootDir, 'src-tauri', 'Cargo.lock')

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const version = packageJson.version

if (typeof version !== 'string' || !semverPattern.test(version)) {
  throw new Error(`package.json version is not a valid semantic version: ${version || '<missing>'}`)
}

await syncTauriConfig(version)
await syncCargoToml(version)
await syncCargoLock(version)

console.log(`Synchronized Tauri, Cargo, and Cargo.lock version metadata to ${version}`)

async function syncTauriConfig(version) {
  const content = await readFile(tauriConfigPath, 'utf8')
  const config = JSON.parse(content)
  config.version = version
  await writeFile(tauriConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

async function syncCargoToml(version) {
  const content = await readFile(cargoTomlPath, 'utf8')
  const packageVersionPattern = /^(\[package\][\s\S]*?^version\s*=\s*)"([^"]+)"/m

  if (!packageVersionPattern.test(content)) {
    throw new Error('src-tauri/Cargo.toml does not contain a package-level version to update')
  }

  const nextContent = content.replace(packageVersionPattern, `$1"${version}"`)
  await writeFile(cargoTomlPath, nextContent, 'utf8')
}

async function syncCargoLock(version) {
  const content = await readFile(cargoLockPath, 'utf8')
  const rootPackageVersionPattern = /(\[\[package\]\]\r?\nname = "anything-fast"\r?\nversion = )"([^"]+)"/

  if (!rootPackageVersionPattern.test(content)) {
    throw new Error('src-tauri/Cargo.lock does not contain the root anything-fast package version to update')
  }

  const nextContent = content.replace(rootPackageVersionPattern, `$1"${version}"`)
  await writeFile(cargoLockPath, nextContent, 'utf8')
}
