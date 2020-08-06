package webapp

import (
	"net/http"

	"github.com/authgear/authgear-server/pkg/auth/config"
	"github.com/authgear/authgear-server/pkg/auth/dependency/webapp"
	"github.com/authgear/authgear-server/pkg/auth/handler/webapp/viewmodels"
	"github.com/authgear/authgear-server/pkg/db"
	"github.com/authgear/authgear-server/pkg/httproute"
	"github.com/authgear/authgear-server/pkg/template"
	"github.com/authgear/authgear-server/pkg/validation"
)

const (
	TemplateItemTypeAuthUIEnterTOTPHTML config.TemplateItemType = "auth_ui_enter_totp.html"
)

var TemplateAuthUIEnterTOTPHTML = template.Spec{
	Type:        TemplateItemTypeAuthUIEnterTOTPHTML,
	IsHTML:      true,
	Translation: TemplateItemTypeAuthUITranslationJSON,
	Defines:     defines,
	Components:  components,
}

const EnterTOTPRequestSchema = "EnterTOTPRequestSchema"

var EnterTOTPSchema = validation.NewMultipartSchema("").
	Add(EnterTOTPRequestSchema, `
		{
			"type": "object",
			"properties": {
				"x_code": { "type": "string" }
			},
			"required": ["x_code"]
		}
	`).Instantiate()

func ConfigureEnterTOTPRoute(route httproute.Route) httproute.Route {
	return route.
		WithMethods("OPTIONS", "POST", "GET").
		WithPathPattern("/enter_totp")
}

type EnterTOTPHandler struct {
	Database      *db.Handle
	BaseViewModel *viewmodels.BaseViewModeler
	Renderer      Renderer
	WebApp        WebAppService
}

func (h *EnterTOTPHandler) GetData(r *http.Request, state *webapp.State) (map[string]interface{}, error) {
	data := map[string]interface{}{}

	baseViewModel := h.BaseViewModel.ViewModel(r, state.Error)

	viewmodels.Embed(data, baseViewModel)

	return data, nil
}

type EnterTOTPInput struct {
	Code string
}

// GetTOTP implements InputAuthenticationTOTP.
func (i *EnterTOTPInput) GetTOTP() string {
	return i.Code
}

func (h *EnterTOTPHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if r.Method == "GET" {
		h.Database.WithTx(func() error {
			state, _, _, err := h.WebApp.Get(StateID(r))
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return err
			}

			data, err := h.GetData(r, state)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return err
			}

			h.Renderer.Render(w, r, TemplateItemTypeAuthUIEnterTOTPHTML, data)
			return nil
		})
	}

	if r.Method == "POST" {
		h.Database.WithTx(func() error {
			result, err := h.WebApp.PostInput(StateID(r), func() (input interface{}, err error) {
				err = EnterTOTPSchema.PartValidator(EnterTOTPRequestSchema).ValidateValue(FormToJSON(r.Form))
				if err != nil {
					return
				}

				code := r.Form.Get("x_code")

				input = &EnterTOTPInput{
					Code: code,
				}
				return
			})
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return err
			}
			result.WriteResponse(w, r)
			return nil
		})
	}
}