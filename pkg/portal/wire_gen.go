// Code generated by Wire. DO NOT EDIT.

//go:generate wire
//+build !wireinject

package portal

import (
	"github.com/authgear/authgear-server/pkg/lib/admin/authz"
	"github.com/authgear/authgear-server/pkg/lib/infra/middleware"
	"github.com/authgear/authgear-server/pkg/portal/deps"
	"github.com/authgear/authgear-server/pkg/portal/graphql"
	"github.com/authgear/authgear-server/pkg/portal/loader"
	"github.com/authgear/authgear-server/pkg/portal/service"
	"github.com/authgear/authgear-server/pkg/portal/session"
	"github.com/authgear/authgear-server/pkg/portal/transport"
	"github.com/authgear/authgear-server/pkg/util/clock"
	"github.com/authgear/authgear-server/pkg/util/httproute"
	"net/http"
)

// Injectors from wire.go:

func newPanicEndMiddleware(p *deps.RequestProvider) httproute.Middleware {
	panicEndMiddleware := &middleware.PanicEndMiddleware{}
	return panicEndMiddleware
}

func newPanicLogMiddleware(p *deps.RequestProvider) httproute.Middleware {
	rootProvider := p.RootProvider
	factory := rootProvider.LoggerFactory
	panicLogMiddlewareLogger := middleware.NewPanicLogMiddlewareLogger(factory)
	panicLogMiddleware := &middleware.PanicLogMiddleware{
		Logger: panicLogMiddlewareLogger,
	}
	return panicLogMiddleware
}

func newPanicWriteEmptyResponseMiddleware(p *deps.RequestProvider) httproute.Middleware {
	panicWriteEmptyResponseMiddleware := &middleware.PanicWriteEmptyResponseMiddleware{}
	return panicWriteEmptyResponseMiddleware
}

func newBodyLimitMiddleware(p *deps.RequestProvider) httproute.Middleware {
	bodyLimitMiddleware := &middleware.BodyLimitMiddleware{}
	return bodyLimitMiddleware
}

func newSentryMiddleware(p *deps.RequestProvider) httproute.Middleware {
	rootProvider := p.RootProvider
	hub := rootProvider.SentryHub
	environmentConfig := rootProvider.EnvironmentConfig
	trustProxy := environmentConfig.TrustProxy
	sentryMiddleware := &middleware.SentryMiddleware{
		SentryHub:  hub,
		TrustProxy: trustProxy,
	}
	return sentryMiddleware
}

func newSessionInfoMiddleware(p *deps.RequestProvider) httproute.Middleware {
	sessionInfoMiddleware := &session.SessionInfoMiddleware{}
	return sessionInfoMiddleware
}

func newSessionRequiredMiddleware(p *deps.RequestProvider) httproute.Middleware {
	sessionRequiredMiddleware := &session.SessionRequiredMiddleware{}
	return sessionRequiredMiddleware
}

func newGraphQLHandler(p *deps.RequestProvider) http.Handler {
	rootProvider := p.RootProvider
	environmentConfig := rootProvider.EnvironmentConfig
	devMode := environmentConfig.DevMode
	factory := rootProvider.LoggerFactory
	logger := graphql.NewLogger(factory)
	request := p.Request
	context := deps.ProvideRequestContext(request)
	viewerLoader := &loader.ViewerLoader{
		Context: context,
	}
	appServiceLogger := service.NewAppServiceLogger(factory)
	appConfig := rootProvider.AppConfig
	configServiceLogger := service.NewConfigServiceLogger(factory)
	controller := rootProvider.ConfigSourceController
	configSource := deps.ProvideConfigSource(controller)
	configService := &service.ConfigService{
		Logger:       configServiceLogger,
		AppConfig:    appConfig,
		Controller:   controller,
		ConfigSource: configSource,
	}
	authzService := &service.AuthzService{
		AppConfigs: configService,
	}
	adminAPIConfig := rootProvider.AdminAPIConfig
	clock := _wireSystemClockValue
	adder := &authz.Adder{
		Clock: clock,
	}
	adminAPIService := &service.AdminAPIService{
		AdminAPIConfig: adminAPIConfig,
		ConfigSource:   configSource,
		AuthzAdder:     adder,
	}
	appService := &service.AppService{
		Logger:      appServiceLogger,
		AppConfig:   appConfig,
		AppConfigs:  configService,
		AppAuthz:    authzService,
		AppAdminAPI: adminAPIService,
	}
	appLoader := &loader.AppLoader{
		Apps: appService,
	}
	graphqlContext := &graphql.Context{
		GQLLogger: logger,
		Viewer:    viewerLoader,
		Apps:      appLoader,
	}
	graphQLHandler := &transport.GraphQLHandler{
		DevMode:        devMode,
		GraphQLContext: graphqlContext,
	}
	return graphQLHandler
}

var (
	_wireSystemClockValue = clock.NewSystemClock()
)

func newRuntimeConfigHandler(p *deps.RequestProvider) http.Handler {
	rootProvider := p.RootProvider
	authgearConfig := rootProvider.AuthgearConfig
	runtimeConfigHandler := &transport.RuntimeConfigHandler{
		AuthgearConfig: authgearConfig,
	}
	return runtimeConfigHandler
}

func newAdminAPIHandler(p *deps.RequestProvider) http.Handler {
	rootProvider := p.RootProvider
	adminAPIConfig := rootProvider.AdminAPIConfig
	controller := rootProvider.ConfigSourceController
	configSource := deps.ProvideConfigSource(controller)
	clockClock := _wireSystemClockValue
	adder := &authz.Adder{
		Clock: clockClock,
	}
	adminAPIService := &service.AdminAPIService{
		AdminAPIConfig: adminAPIConfig,
		ConfigSource:   configSource,
		AuthzAdder:     adder,
	}
	factory := rootProvider.LoggerFactory
	adminAPILogger := transport.NewAdminAPILogger(factory)
	adminAPIHandler := &transport.AdminAPIHandler{
		ConfigResolver:   adminAPIService,
		EndpointResolver: adminAPIService,
		HostResolver:     adminAPIService,
		AuthzAdder:       adminAPIService,
		Logger:           adminAPILogger,
	}
	return adminAPIHandler
}
