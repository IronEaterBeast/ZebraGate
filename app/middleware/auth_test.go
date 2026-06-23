package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func performUserAuthRequest(t *testing.T, authenticated bool, newApiUserHeader string) *httptest.ResponseRecorder {
	t.Helper()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(sessions.Sessions("session", cookie.NewStore([]byte("user-auth-test"))))
	router.GET("/login", func(c *gin.Context) {
		session := sessions.Default(c)
		session.Set("username", "tester")
		session.Set("role", common.RoleCommonUser)
		session.Set("id", 1)
		session.Set("status", common.UserStatusEnabled)
		session.Set("group", "default")
		require.NoError(t, session.Save())
		c.Status(http.StatusNoContent)
	})
	router.GET("/api/test", UserAuth(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"id":      c.GetInt("id"),
			"group":   c.GetString("group"),
		})
	})

	var cookies []*http.Cookie
	if authenticated {
		loginRecorder := httptest.NewRecorder()
		loginRequest := httptest.NewRequest(http.MethodGet, "/login", nil)
		router.ServeHTTP(loginRecorder, loginRequest)
		require.Equal(t, http.StatusNoContent, loginRecorder.Code)
		cookies = loginRecorder.Result().Cookies()
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	if newApiUserHeader != "" {
		request.Header.Set("New-Api-User", newApiUserHeader)
	}
	for _, cookie := range cookies {
		request.AddCookie(cookie)
	}
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestUserAuthAllowsSessionWithoutNewApiUserHeader(t *testing.T) {
	recorder := performUserAuthRequest(t, true, "")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"id":1`)
	require.Contains(t, recorder.Body.String(), `"group":"default"`)
}

func TestUserAuthIgnoresMismatchedNewApiUserHeaderWhenSessionIsValid(t *testing.T) {
	recorder := performUserAuthRequest(t, true, "999")

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Contains(t, recorder.Body.String(), `"id":1`)
}

func TestUserAuthRejectsAnonymousRequestWithoutToken(t *testing.T) {
	recorder := performUserAuthRequest(t, false, "")

	require.Equal(t, http.StatusUnauthorized, recorder.Code)
}
