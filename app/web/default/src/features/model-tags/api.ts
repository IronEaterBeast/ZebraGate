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
import { api } from '@/lib/api'

// 标签 -> model 名列表。当前内置 default 标签，结构支持以后扩展更多标签。
export type ModelTagMap = Record<string, string[]>

export interface ModelTagsData {
  modelTags: ModelTagMap
  availableModels: string[]
}

interface ApiResponse<T> {
  success: boolean
  message: string
  data: T
}

export async function getModelTags(): Promise<ModelTagsData> {
  const res = await api.get<ApiResponse<ModelTagsData>>('/api/model-tag/')
  return {
    modelTags: res.data.data?.modelTags ?? {},
    availableModels: res.data.data?.availableModels ?? [],
  }
}

export async function updateModelTags(
  modelTags: ModelTagMap
): Promise<ApiResponse<{ modelTags: ModelTagMap }>> {
  const res = await api.put<ApiResponse<{ modelTags: ModelTagMap }>>(
    '/api/model-tag/',
    { modelTags }
  )
  return res.data
}
