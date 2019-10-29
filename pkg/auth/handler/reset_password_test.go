package handler

import (
	"testing"

	authAudit "github.com/skygeario/skygear-server/pkg/auth/dependency/audit"
	"github.com/skygeario/skygear-server/pkg/auth/dependency/hook"
	"github.com/skygeario/skygear-server/pkg/auth/dependency/principal/password"
	"github.com/skygeario/skygear-server/pkg/auth/dependency/userprofile"
	"github.com/skygeario/skygear-server/pkg/auth/event"
	"github.com/skygeario/skygear-server/pkg/auth/model"
	"github.com/skygeario/skygear-server/pkg/auth/task"
	"github.com/skygeario/skygear-server/pkg/core/async"
	"github.com/skygeario/skygear-server/pkg/core/audit"
	"github.com/skygeario/skygear-server/pkg/core/auth/authinfo"
	"github.com/skygeario/skygear-server/pkg/core/config"
	. "github.com/smartystreets/goconvey/convey"
)

func TestResetPasswordPayload(t *testing.T) {
	Convey("Test ResetPasswordRequestPayload", t, func() {
		Convey("validate valid payload", func() {
			payload := ResetPasswordRequestPayload{
				UserID:   "1",
				Password: "123456",
			}
			So(payload.Validate(), ShouldBeNil)
		})

		Convey("validate payload without user id", func() {
			payload := ResetPasswordRequestPayload{
				Password: "123456",
			}
			So(payload.Validate(), ShouldBeError)
		})

		Convey("validate payload without password", func() {
			payload := ResetPasswordRequestPayload{
				UserID: "1",
			}
			So(payload.Validate(), ShouldBeError)
		})
	})
}
func TestResetPasswordHandler(t *testing.T) {
	Convey("Test ResetPasswordHandler", t, func() {
		// fixture
		authInfoStore := authinfo.NewMockStoreWithAuthInfoMap(
			map[string]authinfo.AuthInfo{
				"john.doe.id": authinfo.AuthInfo{
					ID: "john.doe.id",
				},
			},
		)
		zero := 0
		one := 1
		loginIDsKeys := map[string]config.LoginIDKeyConfiguration{
			"email":    config.LoginIDKeyConfiguration{Minimum: &zero, Maximum: &one},
			"username": config.LoginIDKeyConfiguration{Minimum: &zero, Maximum: &one},
		}
		allowedRealms := []string{password.DefaultRealm}
		passwordAuthProvider := password.NewMockProviderWithPrincipalMap(
			loginIDsKeys,
			allowedRealms,
			map[string]password.Principal{
				"john.doe.principal.id0": password.Principal{
					ID:             "john.doe.principal.id0",
					UserID:         "john.doe.id",
					LoginIDKey:     "username",
					LoginID:        "john.doe",
					HashedPassword: []byte("$2a$10$/jm/S1sY6ldfL6UZljlJdOAdJojsJfkjg/pqK47Q8WmOLE19tGWQi"), // 123456
				},
				"john.doe.principal.id1": password.Principal{
					ID:             "john.doe.principal.id1",
					UserID:         "john.doe.id",
					LoginIDKey:     "email",
					LoginID:        "john.doe@example.com",
					HashedPassword: []byte("$2a$10$/jm/S1sY6ldfL6UZljlJdOAdJojsJfkjg/pqK47Q8WmOLE19tGWQi"), // 123456
				},
			},
		)
		passwordChecker := &authAudit.PasswordChecker{
			PwMinLength: 6,
		}
		mockTaskQueue := async.NewMockQueue()

		h := &ResetPasswordHandler{}
		h.AuthInfoStore = authInfoStore
		h.UserProfileStore = userprofile.NewMockUserProfileStore()
		h.PasswordChecker = passwordChecker
		h.PasswordAuthProvider = passwordAuthProvider
		h.AuditTrail = audit.NewMockTrail(t)
		hookProvider := hook.NewMockProvider()
		h.HookProvider = hookProvider
		h.TaskQueue = mockTaskQueue

		Convey("should reset password by user id", func() {
			userID := "john.doe.id"
			newPassword := "234567"
			payload := ResetPasswordRequestPayload{
				UserID:   userID,
				Password: newPassword,
			}

			resp, err := h.Handle(payload)
			So(err, ShouldBeNil)
			So(resp, ShouldResemble, map[string]string{})

			// should update all principals of a user
			principals, err := h.PasswordAuthProvider.GetPrincipalsByUserID(userID)
			So(err, ShouldBeNil)
			for _, p := range principals {
				So(p.IsSamePassword(newPassword), ShouldEqual, true)
			}

			// should enqueue pw housekeeper task
			So(mockTaskQueue.TasksName[0], ShouldEqual, task.PwHousekeeperTaskName)
			So(mockTaskQueue.TasksParam[0], ShouldResemble, task.PwHousekeeperTaskParam{
				AuthID: userID,
			})

			So(hookProvider.DispatchedEvents, ShouldResemble, []event.Payload{
				event.PasswordUpdateEvent{
					Reason: event.PasswordUpdateReasonAdministrative,
					User: model.User{
						ID:         userID,
						VerifyInfo: map[string]bool{},
						Metadata:   userprofile.Data{},
					},
				},
			})
		})

		Convey("should not reset password by wrong user id", func() {
			userID := "john.doe.id.wrong"
			payload := ResetPasswordRequestPayload{
				UserID:   userID,
				Password: "123456",
			}

			_, err := h.Handle(payload)
			So(err, ShouldBeError, "user not found")
		})

		Convey("should not reset password with password violates password policy", func() {
			userID := "john.doe.id"
			payload := ResetPasswordRequestPayload{
				UserID:   userID,
				Password: "1234",
			}

			_, err := h.Handle(payload)
			So(err, ShouldBeError, "password policy violated")
		})

		Convey("should have audit trail when reset password", func() {
			userID := "john.doe.id"
			payload := ResetPasswordRequestPayload{
				UserID:   userID,
				Password: "123456",
			}

			h.Handle(payload)
			mockTrail, _ := h.AuditTrail.(*audit.MockTrail)
			So(mockTrail.Hook.LastEntry().Message, ShouldEqual, "audit_trail")
			So(mockTrail.Hook.LastEntry().Data["event"], ShouldEqual, "reset_password")
		})
	})
}
