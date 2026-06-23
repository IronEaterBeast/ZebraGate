package middleware

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func DeprecatedWebAPI() gin.HandlerFunc {
	return func(c *gin.Context) {
		abortWithOpenAiMessage(
			c,
			http.StatusGone,
			common.TranslateMessage(c, i18n.MsgDeprecatedWebAPI),
			types.ErrorCodeInvalidRequest,
		)
	}
}
