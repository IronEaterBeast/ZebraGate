package setting

import (
	"sync"

	"github.com/QuantumNous/new-api/common"
)

// ModelTagDefault 是「默认」标签的键名。桌面新建分组（含首次自动建的 default 分组）
// 会据此标签下的 model 名自动勾选默认 model，降低用户首次试用的操作成本。
const ModelTagDefault = "default"

// modelTags 保存「标签 -> model 名列表」映射。设计成多标签可扩展结构：
// 目前仅用 default 标签，后续可加「推荐」等其他标签而无需改动存储结构。
// 以 Option 表的 ModelTags 键持久化为 JSON 字符串，与 AutoGroups/Chats 同模式。
var (
	modelTags     = map[string][]string{}
	modelTagsLock sync.RWMutex
)

// UpdateModelTagsByJsonString 用 JSON 字符串覆盖整个标签映射，供 Option 同步调用。
func UpdateModelTagsByJsonString(jsonString string) error {
	parsed := map[string][]string{}
	if jsonString != "" {
		if err := common.Unmarshal([]byte(jsonString), &parsed); err != nil {
			return err
		}
	}
	modelTagsLock.Lock()
	modelTags = parsed
	modelTagsLock.Unlock()
	return nil
}

// ModelTags2JsonString 把当前标签映射序列化为 JSON 字符串，供持久化与接口返回。
func ModelTags2JsonString() string {
	modelTagsLock.RLock()
	defer modelTagsLock.RUnlock()
	jsonBytes, err := common.Marshal(modelTags)
	if err != nil {
		return "{}"
	}
	return string(jsonBytes)
}

// GetModelTags 返回标签映射的副本，避免调用方意外修改内部状态。
func GetModelTags() map[string][]string {
	modelTagsLock.RLock()
	defer modelTagsLock.RUnlock()
	result := make(map[string][]string, len(modelTags))
	for tag, models := range modelTags {
		copied := make([]string, len(models))
		copy(copied, models)
		result[tag] = copied
	}
	return result
}

// GetModelsByTag 返回指定标签下的 model 名列表副本，标签不存在时返回空切片。
func GetModelsByTag(tag string) []string {
	modelTagsLock.RLock()
	defer modelTagsLock.RUnlock()
	models := modelTags[tag]
	copied := make([]string, len(models))
	copy(copied, models)
	return copied
}
