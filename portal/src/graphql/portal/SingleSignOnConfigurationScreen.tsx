import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { produce } from "immer";
import deepEqual from "deep-equal";
import { Link, Text } from "@fluentui/react";
import { FormattedMessage } from "@oursky/react-messageformat";

import SingleSignOnConfigurationWidget from "./SingleSignOnConfigurationWidget";
import ShowLoading from "../../ShowLoading";
import ShowError from "../../ShowError";
import ButtonWithLoading from "../../ButtonWithLoading";
import NavigationBlockerDialog from "../../NavigationBlockerDialog";
import { useAppAndSecretConfigQuery } from "./query/appAndSecretConfigQuery";
import { useUpdateAppAndSecretConfigMutation } from "./mutations/updateAppAndSecretMutation";
import { clearEmptyObject } from "../../util/misc";
import { parseError } from "../../util/error";
import { Violation } from "../../util/validation";
import { nonNullable } from "../../util/types";
import {
  OAuthClientCredentialItem,
  OAuthSecretItem,
  OAuthSSOProviderConfig,
  OAuthSSOProviderType,
  oauthSSOProviderTypes,
  PortalAPIApp,
  PortalAPIAppConfig,
  PortalAPISecretConfig,
} from "../../types";

import styles from "./SingleSignOnConfigurationScreen.module.scss";

interface SingleSignOnConfigurationProps {
  rawAppConfig: PortalAPIAppConfig | null;
  effectiveAppConfig: PortalAPIAppConfig | null;
  secretConfig: PortalAPISecretConfig | null;
  updatingAppConfig: boolean;
  updateAppConfig: (
    appConfig: PortalAPIAppConfig,
    secretConfig: PortalAPISecretConfig
  ) => Promise<PortalAPIApp | null>;
  updateAppConfigError: unknown;
}

export interface OAuthSSOProviderExtraState {
  enabled: boolean;
}

type SingleSignOnScreenExtraState = Record<
  OAuthSSOProviderType,
  OAuthSSOProviderExtraState
>;

export interface SingleSignOnScreenState {
  extraState: SingleSignOnScreenExtraState;
  appConfig: PortalAPIAppConfig | null;
  secretConfig: PortalAPISecretConfig | null;
}

interface WidgetWrapperProps {
  className?: string;
  screenState: SingleSignOnScreenState;
  setScreenState: Dispatch<SetStateAction<SingleSignOnScreenState>>;
  providerType: OAuthSSOProviderType;
  violations: Violation[];
}

function getScreenExtraState(
  effectiveAppConfig: PortalAPIAppConfig | null
): SingleSignOnScreenExtraState {
  const extraState: Partial<SingleSignOnScreenExtraState> = {};
  const providers = effectiveAppConfig?.identity?.oauth?.providers ?? [];
  for (const providerType of oauthSSOProviderTypes) {
    const enabled =
      providers.find((provider) => provider.type === providerType) != null;
    extraState[providerType] = { enabled };
  }
  return extraState as SingleSignOnScreenExtraState;
}

function providerTypeToAlias(
  appConfigState: PortalAPIAppConfig,
  providerType: OAuthSSOProviderType
) {
  const providers = appConfigState.identity?.oauth?.providers;
  if (providers == null) {
    return undefined;
  }
  const provider = providers.find((provider) => provider.type === providerType);
  return provider == null ? undefined : provider.alias;
}

// TODO: update UI, require alias on create new widget instead of toggle
function createNewProvider(
  appConfig: PortalAPIAppConfig,
  providerType: OAuthSSOProviderType,
  alias: string
) {
  const providers = appConfig.identity?.oauth?.providers;
  if (providers == null) {
    return;
  }
  providers.push({
    alias,
    type: providerType,
  });
}

function getOrCreateSecret(secretConfigState: PortalAPISecretConfig) {
  let secret = extractSecretFromConfig(secretConfigState);
  if (secret == null) {
    secret = {
      key: "sso.oauth.client",
      data: { items: [] },
    };
    secretConfigState.secrets.push(secret);
  }
  return secret;
}

function getProviderIndex(appConfig: PortalAPIAppConfig, alias: string) {
  const index = appConfig.identity?.oauth?.providers?.findIndex(
    (provider) => provider.alias === alias
  );
  return index == null || index < 0 ? undefined : index;
}

function getSecretItemFromSecret(secret?: OAuthSecretItem, alias?: string) {
  return secret?.data.items.find((item) => item.alias === alias);
}

function getWidgetData(state: SingleSignOnScreenState, alias?: string) {
  const appConfigState = state.appConfig!;
  const providers = appConfigState.identity?.oauth?.providers;
  const providerIndex = alias
    ? providers?.findIndex((provider) => provider.alias === alias)
    : undefined;
  const provider =
    providerIndex != null && providerIndex !== -1
      ? providers![providerIndex]
      : undefined;

  const secretConfigState = state.secretConfig!;
  const secret = extractSecretFromConfig(secretConfigState);
  const secretItem = getSecretItemFromSecret(secret, alias);

  return {
    providerIndex,
    clientID: provider?.client_id,
    clientSecret: secretItem?.client_secret ?? "",
    tenant: provider?.tenant,
    keyID: provider?.key_id,
    teamID: provider?.team_id,
  };
}

function removeProvider(appConfig: PortalAPIAppConfig, alias: string) {
  const providers = appConfig.identity?.oauth?.providers;
  if (providers == null) {
    return;
  }
  const index = getProviderIndex(appConfig, alias);
  if (index != null) {
    providers.splice(index, 1);
  }
}

function onProviderToggled(
  screenState: SingleSignOnScreenState,
  providerType: OAuthSSOProviderType,
  enabled: boolean
) {
  const appConfigState = screenState.appConfig!;
  const secretConfigState = screenState.secretConfig!;
  const secret = getOrCreateSecret(secretConfigState);
  let alias = providerTypeToAlias(appConfigState, providerType);
  if (enabled) {
    if (alias == null) {
      alias = providerType;
      createNewProvider(appConfigState, providerType, alias);
    }
    const secretItem = getSecretItemFromSecret(secret, alias);
    if (secretItem == null) {
      secret.data.items.push({
        alias,
        client_secret: "",
      });
    }
  } else {
    if (alias != null) {
      removeProvider(appConfigState, alias);
    }
    const index = secret.data.items.findIndex((item) => item.alias === alias);
    if (index >= 0) {
      secret.data.items.slice(index, 1);
    }
  }

  screenState.extraState[providerType].enabled = enabled;
}

function updateAppConfigField(
  appConfigState: PortalAPIAppConfig,
  alias: string,
  field: keyof OAuthSSOProviderConfig,
  newValue: string
) {
  const provider = appConfigState.identity?.oauth?.providers?.find(
    (provider) => provider.alias === alias
  );
  if (provider == null) {
    return;
  }
  if (field !== "type") {
    provider[field] = newValue;
  }
}

function extractSecretFromConfig(secretConfigState: PortalAPISecretConfig) {
  for (const secret of secretConfigState.secrets) {
    if (secret.key === "sso.oauth.client") {
      return secret;
    }
  }
  return undefined;
}

function updateClientSecretField(
  secretConfigState: PortalAPISecretConfig,
  alias: string,
  newValue: string
) {
  const secret = extractSecretFromConfig(secretConfigState);
  if (secret == null) {
    return;
  }

  let secretItem:
    | OAuthClientCredentialItem
    | undefined = getSecretItemFromSecret(secret, alias);

  // create item if not exist, clean up on save
  if (secretItem == null) {
    secretItem = { alias, client_secret: "" };
    secret.data.items.push(secretItem);
  }
  secretItem.client_secret = newValue;
}

function updateAlias(
  state: SingleSignOnScreenState,
  oldAlias: string,
  newAlias: string
) {
  if (newAlias === "") {
    return;
  }
  if (state.appConfig != null) {
    updateAppConfigField(state.appConfig, oldAlias, "alias", newAlias);
  }
  if (state.secretConfig != null) {
    const secret = extractSecretFromConfig(state.secretConfig);
    const secretItem = getSecretItemFromSecret(secret, oldAlias);
    if (secretItem != null) {
      secretItem.alias = newAlias;
    } else {
      if (secret != null) {
        secret.data.items.push({ alias: newAlias, client_secret: "" });
      }
    }
  }
}

function textFieldOnChangeWrapper(updater: (value: string) => void) {
  return (_event: any, value?: string) => {
    if (value == null) {
      return;
    }
    updater(value);
  };
}

function makeAppConfigUpdater(
  alias: string,
  field: keyof OAuthSSOProviderConfig,
  setState: Dispatch<SetStateAction<SingleSignOnScreenState>>
) {
  return (value: string) => {
    setState((prev) => {
      return produce(prev, (draftState) => {
        const appConfigState = draftState.appConfig!;
        updateAppConfigField(appConfigState, alias, field, value);
      });
    });
  };
}

function makeAliasUpdater(
  alias: string,
  setState: Dispatch<SetStateAction<SingleSignOnScreenState>>
) {
  return (value: string) => {
    setState((prev) => {
      return produce(prev, (draftState) => {
        updateAlias(draftState, alias, value);
      });
    });
  };
}

function makeClientSecretUpdater(
  alias: string,
  setState: Dispatch<SetStateAction<SingleSignOnScreenState>>
) {
  return (value: string) => {
    setState((prev) => {
      return produce(prev, (draftState) => {
        const secretConfigState = draftState.secretConfig!;
        updateClientSecretField(secretConfigState, alias, value);
      });
    });
  };
}

function makeWidgetStateUpdaters(
  alias: string,
  providerType: OAuthSSOProviderType,
  setState: Dispatch<SetStateAction<SingleSignOnScreenState>>
) {
  const setEnabled = (_event: any, checked?: boolean) => {
    setState((prev) => {
      return produce(prev, (draftState) => {
        onProviderToggled(draftState, providerType, !!checked);
      });
    });
  };
  const onAliasChange = textFieldOnChangeWrapper(
    makeAliasUpdater(alias, setState)
  );
  const onClientIDChange = textFieldOnChangeWrapper(
    makeAppConfigUpdater(alias, "client_id", setState)
  );
  const onClientSecretChange = textFieldOnChangeWrapper(
    makeClientSecretUpdater(alias, setState)
  );
  const onTenantChange = textFieldOnChangeWrapper(
    makeAppConfigUpdater(alias, "tenant", setState)
  );
  const onKeyIDChange = textFieldOnChangeWrapper(
    makeAppConfigUpdater(alias, "key_id", setState)
  );
  const onTeamIDChange = textFieldOnChangeWrapper(
    makeAppConfigUpdater(alias, "team_id", setState)
  );
  return {
    setEnabled,
    onAliasChange,
    onClientIDChange,
    onClientSecretChange,
    onTenantChange,
    onKeyIDChange,
    onTeamIDChange,
  };
}

function constructProviders(
  extraState: SingleSignOnScreenExtraState,
  providers: OAuthSSOProviderConfig[]
) {
  return providers.filter((provider) => extraState[provider.type].enabled);
}

// filter violations that can be handled by widget
function filterViolations(violations: Violation[]) {
  const widgetViolations: Violation[] = [];
  const unhandledViolation: Violation[] = [];
  for (const violation of violations) {
    // general violation has no location -> not handled
    const locationPrefix = "/identity/oauth/providers";
    if (violation.kind !== "required") {
      unhandledViolation.push(violation);
      continue;
    }
    if (!violation.location.startsWith(locationPrefix)) {
      unhandledViolation.push(violation);
      continue;
    }
    widgetViolations.push(violation);
  }
  return { widgetViolations, unhandledViolation };
}

const SingleSignOnConfigurationWidgetWrapper: React.FC<WidgetWrapperProps> = function SingleSignOnConfigurationWidgetWrapper(
  props: WidgetWrapperProps
) {
  const {
    className,
    violations,
    providerType,
    screenState,
    setScreenState,
  } = props;
  const { appConfig, extraState } = screenState;

  const alias = useMemo(() => providerTypeToAlias(appConfig!, providerType), [
    appConfig,
    providerType,
  ]);

  const {
    providerIndex,
    clientID,
    clientSecret,
    tenant,
    keyID,
    teamID,
  } = useMemo(() => getWidgetData(screenState, alias), [alias, screenState]);

  const {
    setEnabled,
    onAliasChange,
    onClientIDChange,
    onClientSecretChange,
    onTenantChange,
    onKeyIDChange,
    onTeamIDChange,
  } = useMemo(
    () =>
      makeWidgetStateUpdaters(
        alias ?? providerType,
        providerType,
        setScreenState
      ),
    [alias, providerType, setScreenState]
  );

  const errorLocation = useMemo(() => {
    return providerIndex != null
      ? `/identity/oauth/providers/${providerIndex}`
      : undefined;
  }, [providerIndex]);

  return (
    <SingleSignOnConfigurationWidget
      className={className}
      errorLocation={errorLocation}
      alias={alias ?? providerType}
      enabled={extraState[providerType].enabled}
      serviceProviderType={providerType}
      clientID={clientID ?? ""}
      clientSecret={clientSecret}
      tenant={tenant}
      keyID={keyID}
      teamID={teamID}
      setEnabled={setEnabled}
      onAliasChange={onAliasChange}
      onClientIDChange={onClientIDChange}
      onClientSecretChange={onClientSecretChange}
      onTenantChange={onTenantChange}
      onKeyIDChange={onKeyIDChange}
      onTeamIDChange={onTeamIDChange}
      violations={violations}
    />
  );
};

const SingleSignOnConfiguration: React.FC<SingleSignOnConfigurationProps> = function SingleSignOnConfiguration(
  props: SingleSignOnConfigurationProps
) {
  const {
    rawAppConfig,
    effectiveAppConfig,
    secretConfig,
    updateAppConfig,
    updatingAppConfig,
    updateAppConfigError,
  } = props;

  const initialState: SingleSignOnScreenState = useMemo(() => {
    const initialAppConfigState =
      effectiveAppConfig != null
        ? produce(effectiveAppConfig, (draftConfig) => {
            draftConfig.identity = draftConfig.identity ?? {};
            draftConfig.identity.oauth = draftConfig.identity.oauth ?? {};
            draftConfig.identity.oauth.providers =
              draftConfig.identity.oauth.providers ?? [];
          })
        : null;

    const initialSecretConfigState =
      secretConfig != null
        ? produce(secretConfig, (draftConfig) => {
            getOrCreateSecret(draftConfig);
          })
        : null;

    return {
      appConfig: initialAppConfigState,
      secretConfig: initialSecretConfigState,
      extraState: getScreenExtraState(effectiveAppConfig),
    };
  }, [effectiveAppConfig, secretConfig]);

  const [state, setState] = useState(initialState);

  const isFormModified = useMemo(() => {
    return !deepEqual(initialState, state);
  }, [state, initialState]);

  const [unhandledViolation, setUnhandleViolation] = useState<Violation[]>([]);

  const onSaveClick = useCallback(() => {
    if (rawAppConfig == null || state.secretConfig == null) {
      return;
    }

    const providers = constructProviders(
      state.extraState,
      state.appConfig?.identity?.oauth?.providers ?? []
    );

    const newAppConfig = produce(rawAppConfig, (draftConfig) => {
      if (providers.length > 0) {
        draftConfig.identity = draftConfig.identity ?? {};
        draftConfig.identity.oauth = draftConfig.identity.oauth ?? {};
        draftConfig.identity.oauth.providers = providers;
      } else {
        delete draftConfig.identity?.oauth?.providers;
      }

      clearEmptyObject(draftConfig);
    });

    const newSecretConfig = produce(state.secretConfig, (draftConfig) => {
      const enabledAlias = providers
        .map((provider) => provider.alias)
        .filter(nonNullable);
      const secret = extractSecretFromConfig(draftConfig);
      if (secret != null) {
        const newSecretItems = secret.data.items.filter((item) =>
          enabledAlias.includes(item.alias)
        );
        secret.data.items = newSecretItems;
      }
    });

    updateAppConfig(newAppConfig, newSecretConfig).catch(() => {});
  }, [rawAppConfig, state, updateAppConfig]);

  const widgetViolations = useMemo(() => {
    if (updateAppConfigError == null) {
      setUnhandleViolation([]);
      return [];
    }
    const violations = parseError(updateAppConfigError);
    const {
      widgetViolations: _widgetViolations,
      unhandledViolation: _unhandledViolation,
    } = filterViolations(violations);
    setUnhandleViolation(_unhandledViolation);
    return _widgetViolations;
  }, [updateAppConfigError]);

  return (
    <section className={styles.screenContent}>
      <NavigationBlockerDialog blockNavigation={isFormModified} />
      {unhandledViolation.length > 0 && (
        <div className={styles.error}>
          <ShowError error={updateAppConfigError} />
        </div>
      )}
      {oauthSSOProviderTypes.map((providerType) => {
        if (state.appConfig == null || state.secretConfig == null) {
          return null;
        }
        return (
          <SingleSignOnConfigurationWidgetWrapper
            key={providerType}
            providerType={providerType}
            className={styles.widget}
            screenState={state}
            setScreenState={setState}
            violations={widgetViolations}
          />
        );
      })}
      <ButtonWithLoading
        className={styles.saveButton}
        disabled={!isFormModified}
        loading={updatingAppConfig}
        labelId="save"
        loadingLabelId="saving"
        onClick={onSaveClick}
      />
    </section>
  );
};

const SingleSignOnConfigurationScreen: React.FC = function SingleSignOnConfigurationScreen() {
  const { appID } = useParams();
  const { data, loading, error, refetch } = useAppAndSecretConfigQuery(appID);
  const {
    updateAppAndSecretConfig,
    loading: updatingAppAndSecretConfig,
    error: updateAppAndSecretConfigError,
  } = useUpdateAppAndSecretConfigMutation(appID);

  if (loading) {
    return <ShowLoading />;
  }

  if (error != null) {
    return <ShowError error={error} onRetry={refetch} />;
  }

  const rawAppConfig =
    data?.node?.__typename === "App" ? data.node.rawAppConfig : null;
  const effectiveAppConfig =
    data?.node?.__typename === "App" ? data.node.effectiveAppConfig : null;
  const secretConfig =
    data?.node?.__typename === "App" ? data.node.rawSecretConfig : null;

  return (
    <main className={styles.root} role="main">
      <Text as="h1" className={styles.header}>
        <FormattedMessage id="SingleSignOnConfigurationScreen.title" />
      </Text>
      <Link href="#" className={styles.helpLink}>
        <FormattedMessage id="SingleSignOnConfigurationScreen.help-link" />
      </Link>
      <SingleSignOnConfiguration
        rawAppConfig={rawAppConfig}
        effectiveAppConfig={effectiveAppConfig}
        secretConfig={secretConfig}
        updatingAppConfig={updatingAppAndSecretConfig}
        updateAppConfig={updateAppAndSecretConfig}
        updateAppConfigError={updateAppAndSecretConfigError}
      />
    </main>
  );
};

export default SingleSignOnConfigurationScreen;
