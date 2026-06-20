package middleware

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

const RouteTagKey = "route_tag"

func RouteTag(tag string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(RouteTagKey, tag)
		c.Next()
	}
}

// shouldSkipAccessLog 判断是否跳过本次访问日志。
// 成功（2xx）的请求不打印日志，避免大量正常请求刷屏；
// 非 2xx（重定向、客户端/服务端错误等）时仍然记录，方便排查问题。
func shouldSkipAccessLog(statusCode int) bool {
	return statusCode >= 200 && statusCode < 300
}

func SetUpLogger(server *gin.Engine) {
	server.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()

		statusCode := c.Writer.Status()
		if shouldSkipAccessLog(statusCode) {
			return
		}

		requestID, _ := c.Get(common.RequestIdKey)
		requestIDStr, _ := requestID.(string)
		tag, _ := c.Get(RouteTagKey)
		tagStr, _ := tag.(string)
		if tagStr == "" {
			tagStr = "web"
		}

		fmt.Fprintf(gin.DefaultWriter, "[GIN] %s | %s | %s | %3d | %13v | %15s | %7s %s\n",
			start.Format("2006/01/02 - 15:04:05"),
			tagStr,
			requestIDStr,
			statusCode,
			time.Since(start),
			c.ClientIP(),
			c.Request.Method,
			c.Request.URL.Path,
		)
	})
}
