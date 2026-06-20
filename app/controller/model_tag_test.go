package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/setting"

	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/assert"
)

func TestIntersectModelTagsWithAvailable(t *testing.T) {
	// default 标签含一个用户用不到的 model（claude-x），应被过滤掉。
	require.NoError(t, setting.UpdateModelTagsByJsonString(
		`{"default":["gpt-4o-mini","claude-x"],"recommended":["gpt-4o"]}`,
	))
	t.Cleanup(func() {
		_ = setting.UpdateModelTagsByJsonString("")
	})

	available := []string{"gpt-4o-mini", "gpt-4o"}
	result := intersectModelTagsWithAvailable(available)

	assert.Equal(t, []string{"gpt-4o-mini"}, result["default"])
	assert.Equal(t, []string{"gpt-4o"}, result["recommended"])
}

func TestIntersectModelTagsWithAvailableEmptyWhenNoneMatch(t *testing.T) {
	require.NoError(t, setting.UpdateModelTagsByJsonString(`{"default":["claude-x"]}`))
	t.Cleanup(func() {
		_ = setting.UpdateModelTagsByJsonString("")
	})

	result := intersectModelTagsWithAvailable([]string{"gpt-4o-mini"})

	// 标签键保留，但交集为空（非 nil），确保桌面拿到稳定结构。
	require.Contains(t, result, "default")
	assert.Empty(t, result["default"])
	assert.NotNil(t, result["default"])
}
