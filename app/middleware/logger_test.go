package middleware

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestShouldSkipAccessLog 保护访问日志的跳过契约：
// 所有 2xx 成功请求不打印日志（避免正常请求刷屏），
// 非 2xx（重定向、客户端/服务端错误等）必须照常记录，方便排查问题。
func TestShouldSkipAccessLog(t *testing.T) {
	cases := []struct {
		name       string
		statusCode int
		wantSkip   bool
	}{
		{"200 skipped", 200, true},
		{"204 skipped", 204, true},
		{"299 skipped", 299, true},
		{"199 not skipped", 199, false},
		{"300 not skipped", 300, false},
		{"301 not skipped", 301, false},
		{"400 not skipped", 400, false},
		{"404 not skipped", 404, false},
		{"500 not skipped", 500, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.wantSkip, shouldSkipAccessLog(tc.statusCode))
		})
	}
}
