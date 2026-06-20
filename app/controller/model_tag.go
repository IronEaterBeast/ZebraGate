package controller

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

// GetModelTags 返回当前「标签 -> model 名列表」映射，供管理面编辑。
// 同时附带全部可用 model 名，便于前端在不可用 model 上做提示/过滤。
func GetModelTags(c *gin.Context) {
	common.ApiSuccess(c, gin.H{
		"modelTags":       setting.GetModelTags(),
		"availableModels": model.GetEnabledModels(),
	})
}

// modelTagsUpdateRequest 是管理面提交的标签映射全量覆盖请求。
type modelTagsUpdateRequest struct {
	ModelTags map[string][]string `json:"modelTags"`
}

// UpdateModelTags 全量覆盖标签映射并持久化。空标签键会被忽略，model 名去重。
func UpdateModelTags(c *gin.Context) {
	req := modelTagsUpdateRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "Invalid request body.")
		return
	}

	cleaned := make(map[string][]string)
	for tag, models := range req.ModelTags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		seen := make(map[string]bool)
		deduped := make([]string, 0, len(models))
		for _, name := range models {
			name = strings.TrimSpace(name)
			if name == "" || seen[name] {
				continue
			}
			seen[name] = true
			deduped = append(deduped, name)
		}
		cleaned[tag] = deduped
	}

	jsonBytes, err := common.Marshal(cleaned)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("ModelTags", string(jsonBytes)); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"modelTags": setting.GetModelTags()})
}
