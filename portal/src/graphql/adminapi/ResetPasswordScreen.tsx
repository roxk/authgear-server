import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import cn from "classnames";
import deepEqual from "deep-equal";
import { Text, TextField } from "@fluentui/react";
import { Context, FormattedMessage } from "@oursky/react-messageformat";

import { useResetPasswordMutation } from "./mutations/resetPasswordMutation";
import NavBreadcrumb from "../../NavBreadcrumb";
import PasswordField, {
  handleLocalPasswordViolations,
  handlePasswordPolicyViolatedViolation,
  localValidatePassword,
} from "../../PasswordField";
import NavigationBlockerDialog from "../../NavigationBlockerDialog";
import ShowError from "../../ShowError";
import ShowLoading from "../../ShowLoading";
import ButtonWithLoading from "../../ButtonWithLoading";
import { useAppConfigQuery } from "../portal/query/appConfigQuery";
import { useTextField } from "../../hook/useInput";
import {
  defaultFormatErrorMessageList,
  Violation,
} from "../../util/validation";
import { parseError } from "../../util/error";
import { PortalAPIAppConfig } from "../../types";

import styles from "./ResetPasswordScreen.module.scss";

interface ResetPasswordFormProps {
  appConfig: PortalAPIAppConfig | null;
}

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = function (
  props: ResetPasswordFormProps
) {
  const { appConfig } = props;

  const { userID } = useParams();
  const navigate = useNavigate();
  const {
    resetPassword,
    loading: resettingPassword,
    error: resetPasswordError,
  } = useResetPasswordMutation(userID);
  const { renderToString } = useContext(Context);

  const [localViolations, setLocalViolations] = useState<Violation[]>([]);
  const [submittedForm, setSubmittedForm] = useState(false);

  const passwordPolicy = useMemo(() => {
    return appConfig?.authenticator?.password?.policy ?? {};
  }, [appConfig]);

  const { value: newPassword, onChange: onNewPasswordChange } = useTextField(
    ""
  );
  const {
    value: confirmPassword,
    onChange: onConfirmPasswordChange,
  } = useTextField("");

  const screenState = useMemo(
    () => ({
      newPassword,
      confirmPassword,
    }),
    [newPassword, confirmPassword]
  );

  const isFormModified = useMemo(() => {
    return !deepEqual({ newPassword: "", confirmPassword: "" }, screenState);
  }, [screenState]);

  const onConfirmClicked = useCallback(() => {
    const newLocalViolations: Violation[] = [];
    localValidatePassword(
      newLocalViolations,
      passwordPolicy,
      screenState.newPassword,
      screenState.confirmPassword
    );
    setLocalViolations(newLocalViolations);
    if (newLocalViolations.length > 0) {
      return;
    }

    resetPassword(screenState.newPassword)
      .then((userID) => {
        if (userID != null) {
          setSubmittedForm(true);
        }
      })
      .catch(() => {});
  }, [screenState, passwordPolicy, resetPassword]);

  useEffect(() => {
    if (submittedForm) {
      navigate("../#account-security");
    }
  }, [submittedForm, navigate]);

  const { errorMessages, unhandledViolations } = useMemo(() => {
    const violations =
      localViolations.length > 0
        ? localViolations
        : parseError(resetPasswordError);
    const newPasswordErrorMessages: string[] = [];
    const confirmPasswordErrorMessages: string[] = [];
    const unhandledViolations: Violation[] = [];
    for (const violation of violations) {
      if (violation.kind === "custom") {
        handleLocalPasswordViolations(
          renderToString,
          violation,
          newPasswordErrorMessages,
          confirmPasswordErrorMessages,
          unhandledViolations
        );
      } else if (violation.kind === "PasswordPolicyViolated") {
        handlePasswordPolicyViolatedViolation(
          renderToString,
          violation,
          newPasswordErrorMessages,
          unhandledViolations
        );
      } else {
        unhandledViolations.push(violation);
      }
    }

    const errorMessages = {
      newPassword: defaultFormatErrorMessageList(newPasswordErrorMessages),
      confirmPassword: defaultFormatErrorMessageList(
        confirmPasswordErrorMessages
      ),
    };

    return { errorMessages, unhandledViolations };
  }, [localViolations, resetPasswordError, renderToString]);

  if (appConfig == null) {
    return (
      <Text>
        <FormattedMessage id="ResetPasswordScreen.error.fetch-password-policy" />
      </Text>
    );
  }

  return (
    <div className={styles.form}>
      {unhandledViolations.length > 0 && (
        <ShowError error={resetPasswordError} />
      )}
      <NavigationBlockerDialog
        blockNavigation={!submittedForm && isFormModified}
      />
      <PasswordField
        className={styles.newPasswordField}
        textFieldClassName={styles.passwordField}
        errorMessage={errorMessages.newPassword}
        label={renderToString("ResetPasswordScreen.new-password")}
        value={newPassword}
        onChange={onNewPasswordChange}
        passwordPolicy={passwordPolicy}
      />
      <TextField
        className={cn(styles.passwordField, styles.confirmPasswordField)}
        label={renderToString("ResetPasswordScreen.confirm-password")}
        type="password"
        value={confirmPassword}
        onChange={onConfirmPasswordChange}
        errorMessage={errorMessages.confirmPassword}
      />
      <ButtonWithLoading
        className={styles.confirm}
        onClick={onConfirmClicked}
        loading={resettingPassword}
        labelId="confirm"
      />
    </div>
  );
};

const ResetPasswordScreen: React.FC = function ResetPasswordScreen() {
  const { appID } = useParams();
  const { data, loading, error, refetch } = useAppConfigQuery(appID);

  const navBreadcrumbItems = useMemo(() => {
    return [
      { to: "../../..", label: <FormattedMessage id="UsersScreen.title" /> },
      { to: "../", label: <FormattedMessage id="UserDetailsScreen.title" /> },
      { to: ".", label: <FormattedMessage id="ResetPasswordScreen.title" /> },
    ];
  }, []);

  const appConfig =
    data?.node?.__typename === "App" ? data.node.effectiveAppConfig : null;

  if (loading) {
    return <ShowLoading />;
  }

  if (error != null) {
    return <ShowError error={error} onRetry={refetch} />;
  }

  return (
    <main className={styles.root}>
      <section className={styles.content}>
        <NavBreadcrumb items={navBreadcrumbItems} />
        <ResetPasswordForm appConfig={appConfig} />
      </section>
    </main>
  );
};

export default ResetPasswordScreen;
