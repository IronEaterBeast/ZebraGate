package middleware

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDesktopAuthTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	gin.SetMode(gin.TestMode)
	common.UsingSQLite = true
	common.UsingMySQL = false
	common.UsingPostgreSQL = false
	common.RedisEnabled = false

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err, "open sqlite db")
	require.NoError(t, db.AutoMigrate(&model.User{}), "migrate user table")

	model.DB = db
	model.LOG_DB = db

	t.Cleanup(func() {
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})

	return db
}

func seedDesktopAuthUser(t *testing.T, db *gorm.DB, accessToken string, status int, group string) *model.User {
	t.Helper()

	user := &model.User{
		Username:    "desktop-" + strings.ReplaceAll(t.Name(), "/", "_"),
		Password:    "placeholder-pass",
		Email:       "desktop@example.com",
		Status:      status,
		Group:       group,
		AccessToken: &accessToken,
	}
	require.NoError(t, db.Create(user).Error, "create desktop user")
	return user
}

func runDesktopAuth(t *testing.T, authorization string) (*gin.Context, *httptest.ResponseRecorder, bool) {
	t.Helper()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/openai/chat/completions", strings.NewReader("{}"))
	if authorization != "" {
		ctx.Request.Header.Set("Authorization", authorization)
	}

	nextCalled := false
	handlers := []gin.HandlerFunc{DesktopAuth(), func(c *gin.Context) { nextCalled = true }}
	ctx.Request.Header.Set("Content-Type", "application/json")
	for _, h := range handlers {
		if ctx.IsAborted() {
			break
		}
		h(ctx)
	}
	return ctx, recorder, nextCalled
}

// 计费链路依赖的上下文契约：合法 access token 必须映射出用户 id、使用分组，
// 并以「无令牌、无限额度令牌」的形式标记（TokenUnlimited=true、TokenId=0），
// 使下游按用户余额结算而不被令牌额度阻断。
func TestDesktopAuthWritesUserContextForValidToken(t *testing.T) {
	db := setupDesktopAuthTestDB(t)
	accessToken := strings.Repeat("a", 32)
	user := seedDesktopAuthUser(t, db, accessToken, common.UserStatusEnabled, "vip")

	ctx, _, nextCalled := runDesktopAuth(t, "Bearer "+accessToken)

	require.True(t, nextCalled, "next handler should run on success")
	assert.False(t, ctx.IsAborted())
	assert.Equal(t, user.Id, ctx.GetInt("id"))
	assert.Equal(t, "vip", common.GetContextKeyString(ctx, constant.ContextKeyUsingGroup))
	assert.Equal(t, "vip", common.GetContextKeyString(ctx, constant.ContextKeyUserGroup))
	assert.True(t, common.GetContextKeyBool(ctx, constant.ContextKeyTokenUnlimited))
	assert.Equal(t, 0, common.GetContextKeyInt(ctx, constant.ContextKeyTokenId))
	assert.False(t, common.GetContextKeyBool(ctx, constant.ContextKeyTokenModelLimitEnabled))
}

func TestDesktopAuthRejectsMissingToken(t *testing.T) {
	setupDesktopAuthTestDB(t)

	ctx, recorder, nextCalled := runDesktopAuth(t, "")

	assert.False(t, nextCalled)
	assert.True(t, ctx.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
}

func TestDesktopAuthRejectsInvalidToken(t *testing.T) {
	db := setupDesktopAuthTestDB(t)
	seedDesktopAuthUser(t, db, strings.Repeat("a", 32), common.UserStatusEnabled, "default")

	ctx, recorder, nextCalled := runDesktopAuth(t, "Bearer "+strings.Repeat("z", 32))

	assert.False(t, nextCalled)
	assert.True(t, ctx.IsAborted())
	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
}

func TestDesktopAuthRejectsDisabledUser(t *testing.T) {
	db := setupDesktopAuthTestDB(t)
	accessToken := strings.Repeat("a", 32)
	seedDesktopAuthUser(t, db, accessToken, common.UserStatusDisabled, "default")

	ctx, recorder, nextCalled := runDesktopAuth(t, "Bearer "+accessToken)

	assert.False(t, nextCalled)
	assert.True(t, ctx.IsAborted())
	assert.Equal(t, http.StatusForbidden, recorder.Code)
}
