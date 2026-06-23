package types

import (
	"errors"
	"testing"
)

func TestNewErrorDefaultsToZebraGateErrorType(t *testing.T) {
	err := NewError(errors.New("failed"), ErrorCodeInvalidRequest)

	if got := err.ToOpenAIError().Type; got != "zebragate_error" {
		t.Fatalf("error type = %q, want zebragate_error", got)
	}
}
