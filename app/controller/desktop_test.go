package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupDesktopControllerTestDB(t *testing.T) *gorm.DB {
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

func seedDesktopUser(t *testing.T, db *gorm.DB, accessToken string, status int) *model.User {
	t.Helper()

	user := &model.User{
		Username:    "desktop-user-" + strings.ReplaceAll(t.Name(), "/", "_"),
		Password:    "placeholder-pass",
		Email:       "desktop@example.com",
		Status:      status,
		Group:       "default",
		AccessToken: &accessToken,
	}
	require.NoError(t, db.Create(user).Error, "create desktop user")
	return user
}

func newDesktopRequestContext(t *testing.T, method, target, rawBody string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, target, bytes.NewReader([]byte(rawBody)))
	ctx.Request.Header.Set("Content-Type", "application/json")
	return ctx, recorder
}

// /v1/auth/refresh 的会话契约：合法 token 必须原样返回 token，并附带一个未来的
// expiresAt 与正确的 userId/email，桌面客户端据此维持登录态。
func TestDesktopAuthRefreshReturnsSessionForValidToken(t *testing.T) {
	db := setupDesktopControllerTestDB(t)
	accessToken := strings.Repeat("a", 32)
	user := seedDesktopUser(t, db, accessToken, common.UserStatusEnabled)

	before := time.Now().Unix()
	ctx, recorder := newDesktopRequestContext(t, http.MethodPost, "/v1/auth/refresh",
		`{"refreshToken":"`+accessToken+`"}`)
	DesktopAuthRefresh(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)

	var session desktopAuthSession
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &session))

	assert.Equal(t, accessToken, session.AccessToken)
	assert.Equal(t, accessToken, session.RefreshToken)
	assert.Equal(t, "desktop@example.com", session.Email)
	assert.Equal(t, strconv.Itoa(user.Id), session.UserId)
	// expiresAt 必须是未来时间，保证桌面端不会立即触发刷新。
	assert.Greater(t, session.ExpiresAt, before)
}

func TestDesktopAuthRefreshRejectsEmptyToken(t *testing.T) {
	setupDesktopControllerTestDB(t)

	ctx, recorder := newDesktopRequestContext(t, http.MethodPost, "/v1/auth/refresh", `{"refreshToken":""}`)
	DesktopAuthRefresh(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestDesktopAuthRefreshRejectsUnknownToken(t *testing.T) {
	db := setupDesktopControllerTestDB(t)
	seedDesktopUser(t, db, strings.Repeat("a", 32), common.UserStatusEnabled)

	ctx, recorder := newDesktopRequestContext(t, http.MethodPost, "/v1/auth/refresh",
		`{"refreshToken":"`+strings.Repeat("z", 32)+`"}`)
	DesktopAuthRefresh(ctx)

	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
}

// trace-events 第一阶段只需保证：合法 body 返回 recorded:true，非法 JSON 返回 400，
// 让桌面客户端的埋点调用不报错。
func TestDesktopTraceEventAcceptsValidEvent(t *testing.T) {
	ctx, recorder := newDesktopRequestContext(t, http.MethodPost, "/v1/openai/trace-events",
		`{"traceId":"t-1","stage":"desktop_inbound","status":"started"}`)
	DesktopTraceEvent(ctx)

	require.Equal(t, http.StatusOK, recorder.Code)

	var body map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
	assert.Equal(t, true, body["recorded"])
}

func TestDesktopTraceEventRejectsInvalidJSON(t *testing.T) {
	ctx, recorder := newDesktopRequestContext(t, http.MethodPost, "/v1/openai/trace-events", `not-json`)
	DesktopTraceEvent(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
}
