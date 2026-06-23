/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'bun:test'

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readSrc(path: string) {
  return readFileSync(resolve(srcDir, path), 'utf8')
}

describe('removed legacy web routes', () => {
  test('does not expose API key or Playground routes in the generated route tree', () => {
    const routeTree = readSrc('routeTree.gen.ts')

    expect(routeTree).not.toContain("path: '/keys'")
    expect(routeTree).not.toContain("fullPath: '/keys/'")
    expect(routeTree).not.toContain("'/_authenticated/keys/'")
    expect(routeTree).not.toContain("path: '/playground'")
    expect(routeTree).not.toContain("fullPath: '/playground/'")
    expect(routeTree).not.toContain("'/_authenticated/playground/'")
  })

  test('does not expose Playground in the primary sidebar', () => {
    const sidebarData = readSrc('hooks/use-sidebar-data.ts')

    expect(sidebarData).not.toContain("url: '/playground'")
    expect(sidebarData).not.toContain("title: t('Playground')")
  })
})
