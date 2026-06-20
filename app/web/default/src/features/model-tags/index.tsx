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
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { getModelTags, updateModelTags, type ModelTagMap } from './api'

const MODEL_TAGS_QUERY_KEY = ['model-tags']

// 可打的标签清单（与后端 setting 的标签键对齐）。当前仅 default，
// 以后新增「推荐」等标签只需在此追加一项，每个 model 后会多出一个对应 chip。
const TAGS: { key: string; label: string }[] = [{ key: 'default', label: '默认' }]

export function ModelTags() {
  const { data, isLoading } = useQuery({
    queryKey: MODEL_TAGS_QUERY_KEY,
    queryFn: getModelTags,
  })

  const [filter, setFilter] = useState('')
  // 标签 -> 选中 model 名集合。点击 chip 即乐观更新此本地态并自动保存。
  const [tagMap, setTagMap] = useState<ModelTagMap>({})
  // 正在保存中的 chip（model::tag），用于禁用重复点击。
  const [savingChips, setSavingChips] = useState<Set<string>>(new Set())

  // 服务器数据加载/刷新后同步到本地态。
  useEffect(() => {
    if (data) {
      setTagMap(data.modelTags ?? {})
    }
  }, [data])

  const availableModels = useMemo(() => {
    const models = data?.availableModels ?? []
    return [...models].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )
  }, [data])

  const filteredModels = useMemo(() => {
    const keyword = filter.trim().toLowerCase()
    if (!keyword) {
      return availableModels
    }
    return availableModels.filter((m) => m.toLowerCase().includes(keyword))
  }, [availableModels, filter])

  function hasTag(map: ModelTagMap, modelName: string, tag: string): boolean {
    return (map[tag] ?? []).includes(modelName)
  }

  function withToggled(
    map: ModelTagMap,
    modelName: string,
    tag: string
  ): ModelTagMap {
    const current = new Set(map[tag] ?? [])
    if (current.has(modelName)) {
      current.delete(modelName)
    } else {
      current.add(modelName)
    }
    return { ...map, [tag]: Array.from(current) }
  }

  async function toggleTag(modelName: string, tag: string) {
    const chipKey = `${modelName}::${tag}`
    if (savingChips.has(chipKey)) {
      return
    }

    const previous = tagMap
    const next = withToggled(tagMap, modelName, tag)
    // 乐观更新：先改颜色，再后台保存。
    setTagMap(next)
    setSavingChips((s) => new Set(s).add(chipKey))

    try {
      const res = await updateModelTags(next)
      if (!res.success) {
        throw new Error(res.message || '保存失败')
      }
    } catch (error) {
      // 失败回滚到改动前状态，并提示。
      setTagMap(previous)
      toast.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setSavingChips((s) => {
        const copy = new Set(s)
        copy.delete(chipKey)
        return copy
      })
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">模型标签设置</h1>
        <p className="text-sm text-muted-foreground">
          给 model 打上「默认」标签（点击标签按钮即切换，自动保存）。桌面客户端新建分组
          （含首次自动创建的 default 分组）时，会自动选中「默认」标签下的 model，降低用户首次试用的操作成本。
        </p>
      </div>

      <div className="flex justify-end">
        <Input
          className="max-w-xs"
          placeholder="搜索 model…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="rounded-xl border border-border">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">加载中...</div>
        ) : filteredModels.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            {availableModels.length === 0 ? '暂无可用 model' : '没有匹配的 model'}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filteredModels.map((modelName) => (
              <li
                key={modelName}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="text-sm">{modelName}</span>
                <div className="flex items-center gap-2">
                  {TAGS.map((tag) => {
                    const active = hasTag(tagMap, modelName, tag.key)
                    const saving = savingChips.has(`${modelName}::${tag.key}`)
                    return (
                      <button
                        key={tag.key}
                        type="button"
                        disabled={saving}
                        onClick={() => void toggleTag(modelName, tag.key)}
                        aria-pressed={active}
                        title={active ? `点击取消「${tag.label}」` : `点击设为「${tag.label}」`}
                        className={cn(
                          'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors',
                          'disabled:opacity-60',
                          active
                            ? 'bg-green-600 text-white hover:bg-green-700'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {tag.label}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
