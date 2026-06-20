package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// desktopAuthRefreshLeewaySeconds 决定 /v1/auth/refresh 返回的 expiresAt 距当前的时长。
// app/ 的 access token 本身无过期语义，这里返回一个远期过期时间，
// 让桌面客户端不会频繁触发刷新，同时保持其「带 expiresAt」的会话模型可用。
const desktopAuthRefreshTTLSeconds int64 = 30 * 24 * 60 * 60

// desktopAuthSession 与桌面客户端的 AuthSession 字段（camelCase）保持一致。
type desktopAuthSession struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresAt    int64  `json:"expiresAt"`
	Email        string `json:"email"`
	UserId       string `json:"userId"`
}

type desktopAuthRefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// DesktopAuthRefresh 兼容桌面客户端的登录态刷新调用。
//
// 第一阶段 app/ 不引入独立的 refresh 令牌体系：桌面客户端持有的 refreshToken
// 即用户的 access token。这里用它定位用户，校验通过后原样返回该 token，
// 并附带一个远期 expiresAt，使桌面会话模型继续可用。
func DesktopAuthRefresh(c *gin.Context) {
	var req desktopAuthRefreshRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"message": "Request body must be valid JSON.",
			"code":    "BAD_REQUEST",
			"type":    "invalid_request_error",
		}})
		return
	}

	refreshToken := strings.TrimSpace(req.RefreshToken)
	if refreshToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"message": "refreshToken is required.",
			"code":    "BAD_REQUEST",
			"type":    "invalid_request_error",
		}})
		return
	}

	user, err := model.ValidateAccessToken(refreshToken)
	if err != nil || user == nil || user.Username == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": gin.H{
			"message": "The provided refresh token is invalid.",
			"code":    "UNAUTHORIZED",
			"type":    "invalid_request_error",
		}})
		return
	}

	c.JSON(http.StatusOK, desktopAuthSession{
		AccessToken:  user.GetAccessToken(),
		RefreshToken: user.GetAccessToken(),
		ExpiresAt:    time.Now().Unix() + desktopAuthRefreshTTLSeconds,
		Email:        user.Email,
		UserId:       desktopUserIdString(user.Id),
	})
}

// DesktopTraceEvent 接收桌面客户端上报的链路埋点。
// 第一阶段不建表、不持久化，仅落简单日志保证可观测，并返回成功，
// 让桌面客户端的埋点调用不报错。
func DesktopTraceEvent(c *gin.Context) {
	var event map[string]any
	if err := common.UnmarshalBodyReusable(c, &event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{
			"message": "Request body must be valid JSON.",
			"code":    "BAD_REQUEST",
			"type":    "invalid_request_error",
		}})
		return
	}

	traceId, _ := event["traceId"].(string)
	stage, _ := event["stage"].(string)
	status, _ := event["status"].(string)
	deviceId := c.Request.Header.Get("x-device-id")
	common.SysLog("desktop trace event: traceId=" + traceId + " stage=" + stage +
		" status=" + status + " deviceId=" + deviceId)

	c.JSON(http.StatusOK, gin.H{"recorded": true})
}

// DesktopCreditsBalance 返回当前桌面用户的额度余额，供桌面客户端主界面展示。
// 鉴权由 DesktopAuth 中间件完成，用户 id 已写入上下文。
//
// 按既定约定直接返回 app/ 的 quota 原值作为 balance。
// 注意：桌面客户端的 balance 字段为 i32，若用户 quota 原值超过 i32 范围
// （约对应 4294 美元额度），桌面侧反序列化可能溢出，这是当前已知限制。
func DesktopCreditsBalance(c *gin.Context) {
	id := c.GetInt("id")
	quota, err := model.GetUserQuota(id, false)
	if err != nil {
		common.SysLog("DesktopCreditsBalance GetUserQuota error: " + err.Error())
		c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{
			"message": "Failed to load credits balance.",
			"code":    "INTERNAL_ERROR",
			"type":    "invalid_request_error",
		}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"balance": quota})
}

func desktopUserIdString(id int) string {
	return strconv.Itoa(id)
}
