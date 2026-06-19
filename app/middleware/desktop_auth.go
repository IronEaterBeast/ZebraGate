package middleware

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// DesktopAuth 用于 ZebraGate 桌面客户端的转发请求鉴权。
//
// 桌面客户端携带的是用户登录态的 access token（而非 relay 体系的 API 令牌 sk-），
// 因此这里用 access token 定位用户，并写入与 TokenAuth 等价的用户级上下文，
// 使后续 Distribute + Relay 能够按该用户的额度完成渠道调用、日志记录与扣费。
//
// 由于桌面请求没有对应的 API 令牌，这里把上下文标记为「无限额度令牌」
// （TokenUnlimited=true、TokenId=0），让计费链路跳过令牌级额度判断，
// 直接以用户余额结算。
func DesktopAuth() func(c *gin.Context) {
	return func(c *gin.Context) {
		accessToken := strings.TrimSpace(c.Request.Header.Get("Authorization"))
		if accessToken == "" {
			abortWithOpenAiMessage(c, http.StatusUnauthorized,
				common.TranslateMessage(c, i18n.MsgAuthNotLoggedIn))
			return
		}

		user, err := model.ValidateAccessToken(accessToken)
		if err != nil {
			if errors.Is(err, model.ErrDatabase) {
				common.SysLog("DesktopAuth ValidateAccessToken database error: " + err.Error())
				abortWithOpenAiMessage(c, http.StatusInternalServerError,
					common.TranslateMessage(c, i18n.MsgDatabaseError))
			} else {
				abortWithOpenAiMessage(c, http.StatusUnauthorized,
					common.TranslateMessage(c, i18n.MsgAuthAccessTokenInvalid))
			}
			return
		}
		if user == nil || user.Username == "" {
			abortWithOpenAiMessage(c, http.StatusUnauthorized,
				common.TranslateMessage(c, i18n.MsgAuthAccessTokenInvalid))
			return
		}

		userCache, err := model.GetUserCache(user.Id)
		if err != nil {
			common.SysLog(fmt.Sprintf("DesktopAuth GetUserCache error for user %d: %v", user.Id, err))
			abortWithOpenAiMessage(c, http.StatusInternalServerError,
				common.TranslateMessage(c, i18n.MsgDatabaseError))
			return
		}
		if userCache.Status != common.UserStatusEnabled {
			abortWithOpenAiMessage(c, http.StatusForbidden,
				common.TranslateMessage(c, i18n.MsgAuthUserBanned))
			return
		}

		userCache.WriteContext(c)

		// 选定计费用户组：沿用用户自身分组，交由下游渠道分发判断可用性，
		// 避免在鉴权层引入新故障点。
		common.SetContextKey(c, constant.ContextKeyUsingGroup, userCache.Group)

		// 写入用户与「无令牌」上下文，使 relayInfo 能正确构建。
		c.Set("id", user.Id)
		common.SetContextKey(c, constant.ContextKeyTokenId, 0)
		common.SetContextKey(c, constant.ContextKeyTokenKey, "")
		common.SetContextKey(c, constant.ContextKeyTokenUnlimited, true)
		common.SetContextKey(c, constant.ContextKeyTokenGroup, "")
		common.SetContextKey(c, constant.ContextKeyTokenModelLimitEnabled, false)

		c.Next()
	}
}
