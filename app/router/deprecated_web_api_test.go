package router

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-gonic/gin"
)

type deprecatedErrorResponse struct {
	Error struct {
		Message string `json:"message"`
		Type    string `json:"type"`
		Code    string `json:"code"`
	} `json:"error"`
}

func newDeprecatedWebAPITestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	if err := i18n.Init(); err != nil {
		panic(err)
	}
	r := gin.New()
	r.Use(sessions.Sessions("session", cookie.NewStore([]byte("deprecated-web-api-test"))))
	SetApiRouter(r)
	SetRelayRouter(r)
	SetVideoRouter(r)
	return r
}

func assertDeprecatedWebAPI(t *testing.T, router http.Handler, method, path string) {
	t.Helper()

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(`{"model":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "zh-CN")
	router.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusGone {
		t.Fatalf("%s %s status = %d, want %d, body = %s", method, path, recorder.Code, http.StatusGone, recorder.Body.String())
	}

	var body deprecatedErrorResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v; body = %s", err, recorder.Body.String())
	}
	if body.Error.Code != "invalid_request" {
		t.Fatalf("%s %s error code = %q, want invalid_request", method, path, body.Error.Code)
	}
	if body.Error.Type != "new_api_error" {
		t.Fatalf("%s %s error type = %q, want new_api_error", method, path, body.Error.Type)
	}
	if !strings.Contains(body.Error.Message, "旧 Web API 已停用") {
		t.Fatalf("%s %s message = %q, want deprecated web api message", method, path, body.Error.Message)
	}
}

func assertNotDeprecatedWebAPI(t *testing.T, router http.Handler, method, path string) {
	t.Helper()

	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(`{"model":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Language", "zh-CN")
	router.ServeHTTP(recorder, req)

	if recorder.Code == http.StatusGone && strings.Contains(recorder.Body.String(), "旧 Web API 已停用") {
		t.Fatalf("%s %s was blocked by DeprecatedWebAPI: %s", method, path, recorder.Body.String())
	}
}

func TestDeprecatedWebAPIRoutes(t *testing.T) {
	r := newDeprecatedWebAPITestRouter()

	cases := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/chat/completions"},
		{http.MethodGet, "/v1/models"},
		{http.MethodGet, "/v1beta/models"},
		{http.MethodGet, "/v1beta/openai/models"},
		{http.MethodPost, "/mj/submit/imagine"},
		{http.MethodPost, "/v1/mj/submit/imagine"},
		{http.MethodPost, "/suno/submit/music"},
		{http.MethodPost, "/v1/video/generations"},
		{http.MethodPost, "/v1/videos"},
		{http.MethodPost, "/kling/v1/videos/text2video"},
		{http.MethodPost, "/jimeng"},
		{http.MethodPost, "/jimeng/"},
		{http.MethodPost, "/pg/chat/completions"},
		{http.MethodGet, "/api/token"},
		{http.MethodGet, "/api/token/search"},
		{http.MethodPost, "/api/token/1/key"},
		{http.MethodPost, "/api/token/batch"},
		{http.MethodPost, "/api/token/batch/keys"},
		{http.MethodGet, "/api/usage/token"},
		{http.MethodGet, "/api/log/token"},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			assertDeprecatedWebAPI(t, r, tc.method, tc.path)
		})
	}
}

func TestDesktopAndUserRoutesAreNotDeprecated(t *testing.T) {
	r := newDeprecatedWebAPITestRouter()

	cases := []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/openai/chat/completions"},
		{http.MethodPost, "/v1/openai/trace-events"},
		{http.MethodPost, "/v1/auth/refresh"},
		{http.MethodGet, "/v1/credits/balance"},
		{http.MethodGet, "/api/user/models"},
		{http.MethodGet, "/api/user/self/token"},
		{http.MethodGet, "/v1/videos/task-1/content"},
	}

	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			assertNotDeprecatedWebAPI(t, r, tc.method, tc.path)
		})
	}
}

func TestMidjourneyImageRouteKeepsAnonymousHandler(t *testing.T) {
	r := newDeprecatedWebAPITestRouter()

	for _, route := range r.Routes() {
		if route.Method == http.MethodGet && route.Path == "/mj/image/:id" {
			if !strings.Contains(route.Handler, "RelayMidjourneyImage") {
				t.Fatalf("/mj/image/:id handler = %q, want RelayMidjourneyImage", route.Handler)
			}
			return
		}
	}

	t.Fatal("GET /mj/image/:id route not registered")
}
