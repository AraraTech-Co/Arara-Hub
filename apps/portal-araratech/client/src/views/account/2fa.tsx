import React, { Fragment, useState, useEffect } from "react";
import {
  Animate,
  AccountNav,
  Card,
  Form,
  Message,
  useAPI,
} from "@/components/lib";

export function TwoFA(props) {
  // get the user state
  const user = useAPI("/api/user");
  const [qrCode, setQrCode] = useState(undefined);
  const [enabled, setEnabled] = useState(undefined);
  const [backupCode, setBackupCode] = useState(undefined);

  useEffect(() => {
    setEnabled(user.data?.["2fa_enabled"]);
  }, [user.data]);

  return (
    <Fragment>
      <AccountNav />
      <Animate>
        <Card
          title="Two-Factor Authentication"
          restrictWidth
          className={props.className}
          loading={user.loading}
        >
          <Form
            url="/api/user/2fa"
            method="put"
            submitOnChange
            inputs={{
              "2fa_enabled": {
                type: "switch",
                label: "Enable two-factor authentication",
                default: user?.data?.["2fa_enabled"],
              },
            }}
            callback={(res) => {
              setQrCode(res.data.data.qr_code);

              if (!res.data.data["2fa_enabled"]) setEnabled(false);
            }}
          />

          {qrCode ? (
            <Fragment>
              <Message
                title="Scan QR Code"
                type="info"
                text="Scan the QR code below with an authenticator app such as Google Authenticator and enter the verification code."
              />

              <img
                src={qrCode}
                alt="Please scan this with your authenticator app"
                style={{ marginBottom: "1em", marginLeft: "-0.75em" }}
              />

              <Form
                method="post"
                url="/api/user/2fa/verify"
                buttonText="Verify"
                inputs={{
                  code: {
                    label: "Verification code",
                    type: "text",
                  },
                }}
                callback={(res) => {
                  setQrCode(null);
                  setEnabled(true);
                  setBackupCode(res.data.data.backup_code);
                }}
              />
            </Fragment>
          ) : (
            <Fragment>
              {enabled ? (
                <Fragment>
                  {backupCode ? (
                    <Message
                      title="Your backup code"
                      type="success"
                      text="Please store your backup code somewhere safe."
                    >
                      <Form
                        inputs={{
                          code: {
                            type: "text",
                            value: backupCode,
                          },
                        }}
                      />
                    </Message>
                  ) : (
                    <Message
                      title="2FA Enabled"
                      type="success"
                      text="Good job! Two-factor authentication is enabled on your account."
                    />
                  )}
                </Fragment>
              ) : (
                <Message
                  title="Enable 2FA"
                  type="warning"
                  text={
                    "We recommended enabling 2FA on your account for added security."
                  }
                />
              )}
            </Fragment>
          )}
        </Card>
      </Animate>
    </Fragment>
  );
}
