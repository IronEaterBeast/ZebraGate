package setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// resetModelTags 把全局标签状态清空，避免用例间相互污染。
func resetModelTags(t *testing.T) {
	t.Helper()
	modelTagsLock.Lock()
	modelTags = map[string][]string{}
	modelTagsLock.Unlock()
}

func TestUpdateModelTagsByJsonStringRoundTrip(t *testing.T) {
	resetModelTags(t)

	require.NoError(t, UpdateModelTagsByJsonString(`{"default":["gpt-4o-mini","claude-3-5-sonnet"]}`))

	assert.Equal(t, []string{"gpt-4o-mini", "claude-3-5-sonnet"}, GetModelsByTag(ModelTagDefault))
	assert.Equal(t, map[string][]string{
		"default": {"gpt-4o-mini", "claude-3-5-sonnet"},
	}, GetModelTags())
}

func TestUpdateModelTagsByJsonStringEmptyResetsToEmptyMap(t *testing.T) {
	resetModelTags(t)
	require.NoError(t, UpdateModelTagsByJsonString(`{"default":["gpt-4o-mini"]}`))

	// 空字符串应被视为「无标签」，而非解析错误。
	require.NoError(t, UpdateModelTagsByJsonString(""))
	assert.Empty(t, GetModelTags())
	assert.Empty(t, GetModelsByTag(ModelTagDefault))
}

func TestUpdateModelTagsByJsonStringInvalidReturnsError(t *testing.T) {
	resetModelTags(t)
	assert.Error(t, UpdateModelTagsByJsonString(`{not json}`))
}

func TestGetModelTagsReturnsCopy(t *testing.T) {
	resetModelTags(t)
	require.NoError(t, UpdateModelTagsByJsonString(`{"default":["gpt-4o-mini"]}`))

	// 修改返回值不应影响内部状态。
	snapshot := GetModelTags()
	snapshot["default"] = append(snapshot["default"], "tampered")
	snapshot["recommended"] = []string{"injected"}

	assert.Equal(t, []string{"gpt-4o-mini"}, GetModelsByTag(ModelTagDefault))
	_, hasInjected := GetModelTags()["recommended"]
	assert.False(t, hasInjected)
}
