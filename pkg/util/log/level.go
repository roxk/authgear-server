package log

import (
	"fmt"
	"strings"

	"github.com/sirupsen/logrus"
)

type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

const DefaultLevel = LevelWarn

func ParseLevel(s string) (Level, error) {
	switch strings.ToLower(s) {
	case string(LevelDebug):
		return LevelDebug, nil
	case string(LevelInfo):
		return LevelInfo, nil
	case string(LevelWarn):
		return LevelWarn, nil
	// Support "warning" as well
	case "warning":
		return LevelWarn, nil
	case string(LevelError):
		return LevelError, nil
	}
	return DefaultLevel, fmt.Errorf("log: unknown level: %v", s)
}

func (l Level) Logrus() logrus.Level {
	switch l {
	case LevelDebug:
		return logrus.DebugLevel
	case LevelInfo:
		return logrus.InfoLevel
	case LevelWarn:
		return logrus.WarnLevel
	case LevelError:
		return logrus.ErrorLevel
	default:
		return logrus.WarnLevel
	}
}
