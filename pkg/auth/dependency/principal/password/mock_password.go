package password

import (
	"github.com/skygeario/skygear-server/pkg/auth/dependency/principal"
	coreAuth "github.com/skygeario/skygear-server/pkg/core/auth"
	"github.com/skygeario/skygear-server/pkg/core/auth/metadata"
	"github.com/skygeario/skygear-server/pkg/core/config"
)

// MockProvider is the memory implementation of password provider
type MockProvider struct {
	PrincipalMap   map[string]Principal
	loginIDChecker loginIDChecker
	realmChecker   realmChecker
	allowedRealms  []string
}

// NewMockProvider creates a new instance of mock provider
func NewMockProvider(loginIDsKeys []config.LoginIDKeyConfiguration, allowedRealms []string) *MockProvider {
	return NewMockProviderWithPrincipalMap(loginIDsKeys, allowedRealms, map[string]Principal{})
}

// NewMockProviderWithPrincipalMap creates a new instance of mock provider with PrincipalMap
func NewMockProviderWithPrincipalMap(loginIDsKeys []config.LoginIDKeyConfiguration, allowedRealms []string, principalMap map[string]Principal) *MockProvider {
	return &MockProvider{
		loginIDChecker: defaultLoginIDChecker{
			loginIDsKeys: loginIDsKeys,
		},
		realmChecker: defaultRealmChecker{
			allowedRealms: allowedRealms,
		},
		allowedRealms: allowedRealms,
		PrincipalMap:  principalMap,
	}
}

func (m *MockProvider) ValidateLoginID(loginID LoginID) error {
	return m.loginIDChecker.validateOne(loginID)
}

func (m *MockProvider) ValidateLoginIDs(loginIDs []LoginID) error {
	return m.loginIDChecker.validate(loginIDs)
}

func (m *MockProvider) CheckLoginIDKeyType(loginIDKey string, standardKey metadata.StandardKey) bool {
	return m.loginIDChecker.checkType(loginIDKey, standardKey)
}

func (m *MockProvider) IsRealmValid(realm string) bool {
	return m.realmChecker.isValid(realm)
}

func (m *MockProvider) IsDefaultAllowedRealms() bool {
	return len(m.allowedRealms) == 1 && m.allowedRealms[0] == DefaultRealm
}

// CreatePrincipalsByLoginID creates principals by loginID
func (m *MockProvider) CreatePrincipalsByLoginID(authInfoID string, password string, loginIDs []LoginID, realm string) (principals []*Principal, err error) {
	// do not create principal when there is login ID belongs to another user.
	for _, loginID := range loginIDs {
		loginIDPrincipals, principalErr := m.GetPrincipalsByLoginID("", loginID.Value)
		if principalErr != nil && principalErr != principal.ErrNotFound {
			err = principalErr
			return
		}
		for _, p := range loginIDPrincipals {
			if p.UserID != authInfoID {
				err = ErrLoginIDAlreadyUsed
				return
			}
		}
	}

	for _, loginID := range loginIDs {
		principal := NewPrincipal()
		principal.UserID = authInfoID
		principal.LoginIDKey = loginID.Key
		principal.LoginID = loginID.Value
		principal.Realm = realm
		principal.setPassword(password)
		principal.deriveClaims(m.loginIDChecker)
		err = m.createPrincipal(principal)

		if err != nil {
			return
		}
		principals = append(principals, &principal)
	}

	return
}

// CreatePrincipal creates principal in PrincipalMap
func (m *MockProvider) createPrincipal(p Principal) error {
	if _, existed := m.PrincipalMap[p.ID]; existed {
		return principal.ErrAlreadyExists
	}

	for _, pp := range m.PrincipalMap {
		if p.LoginID == pp.LoginID && p.Realm == pp.Realm {
			return principal.ErrAlreadyExists
		}
	}

	m.PrincipalMap[p.ID] = p
	return nil
}

// GetPrincipalByLoginID get principal in PrincipalMap by login_id
func (m *MockProvider) GetPrincipalByLoginIDWithRealm(loginIDKey string, loginID string, realm string, p *Principal) (err error) {
	for _, pp := range m.PrincipalMap {
		if (loginIDKey == "" || pp.LoginIDKey == loginIDKey) && pp.LoginID == loginID && pp.Realm == realm {
			*p = pp
			return
		}
	}

	return principal.ErrNotFound
}

// GetPrincipalsByUserID get principals in PrincipalMap by userID
func (m *MockProvider) GetPrincipalsByUserID(userID string) (principals []*Principal, err error) {
	for _, p := range m.PrincipalMap {
		if p.UserID == userID {
			principal := p
			principals = append(principals, &principal)
		}
	}

	return
}

// GetPrincipalsByLoginID get principals in PrincipalMap by login ID
func (m *MockProvider) GetPrincipalsByLoginID(loginIDKey string, loginID string) (principals []*Principal, err error) {
	for _, p := range m.PrincipalMap {
		if (loginIDKey == "" || p.LoginIDKey == loginIDKey) && p.LoginID == loginID {
			principal := p
			principals = append(principals, &principal)
		}
	}

	return
}

func (m *MockProvider) UpdatePassword(p *Principal, password string) (err error) {
	if _, existed := m.PrincipalMap[p.ID]; !existed {
		return principal.ErrNotFound
	}

	p.setPassword(password)
	m.PrincipalMap[p.ID] = *p
	return nil
}

func (m *MockProvider) MigratePassword(p *Principal, password string) (err error) {
	if _, existed := m.PrincipalMap[p.ID]; !existed {
		return principal.ErrNotFound
	}

	p.migratePassword(password)
	m.PrincipalMap[p.ID] = *p
	return nil
}

func (m *MockProvider) ID() string {
	return string(coreAuth.PrincipalTypePassword)
}

func (m *MockProvider) GetPrincipalByID(principalID string) (principal.Principal, error) {
	for _, p := range m.PrincipalMap {
		if p.ID == principalID {
			return &p, nil
		}
	}
	return nil, principal.ErrNotFound
}

func (m *MockProvider) ListPrincipalsByClaim(claimName string, claimValue string) ([]principal.Principal, error) {
	var principals []principal.Principal
	for _, p := range m.PrincipalMap {
		if p.ClaimsValue[claimName] == claimValue {
			principal := p
			principals = append(principals, &principal)
		}
	}
	return principals, nil
}

func (m *MockProvider) ListPrincipalsByUserID(userID string) ([]principal.Principal, error) {
	var principals []principal.Principal
	for _, p := range m.PrincipalMap {
		if p.UserID == userID {
			principal := p
			principals = append(principals, &principal)
		}
	}
	return principals, nil
}

var (
	_ Provider = &MockProvider{}
)
