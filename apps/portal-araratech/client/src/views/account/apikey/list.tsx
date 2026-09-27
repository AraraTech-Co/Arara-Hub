/***
 *
 *   API Keys List
 *   List & manage the API keys
 *
 **********/

import React, { Fragment, useContext, useState, useEffect } from "react";
import Axios from "axios";
import {
  ViewContext,
  Animate,
  AccountNav,
  Button,
  Card,
  Table,
  TitleRow,
  BlankSlateMessage,
  Loader,
  useNavigate,
  useAPI,
} from "@/components/lib";

export function APIKeyList(props) {
  const navigate = useNavigate();
  const context = useContext<any>(ViewContext); // TODO: Type Context
  const fetch = useAPI("/api/key");
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    if (fetch?.data?.length) setKeys(fetch.data);
  }, [fetch]);

  function revoke(data) {
    context.modal.show(
      {
        title: "Revoke API Key ",
        form: {
          active: {
            type: "hidden",
            value: false,
          },
        },
        text: "Are you sure you want to revoke this API Key? This action cannot be undone.",
        buttonText: "Revoke",
        url: `/api/key/${data.id}`,
        destructive: true,
        method: "PATCH",
      },
      () => {
        const state = [...keys];
        state.find((x) => x.id === data.id).active = false;
        setKeys(state);
      },
    );
  }

  function del(data) {
    context.modal.show(
      {
        title: "Delete API Key ",
        form: {},
        text: "Are you sure you want to delete this API Key? This action cannot be undone.",
        buttonText: "Delete API Key",
        url: `/api/key/${data.id}`,
        destructive: true,
        method: "DELETE",
      },
      () => {
        const state = [...keys];
        state.splice(
          state.findIndex((x) => x.id === data.id),
          1,
        );
        setKeys(state);
      },
    );
  }

  async function reveal(data) {
    // reveal the api key
    const key = (await Axios.get(`/api/key/${data.id}`))?.data?.data?.[0].key;
    const state = [...keys];
    state[state.findIndex((x) => x.id === data.id)].key = key;
    setKeys(state);
  }

  return (
    <Fragment>
      <AccountNav />

      {fetch.loading ? (
        <Loader />
      ) : (
        <Fragment>
          {keys?.length ? (
            <Animate>
              <TitleRow title="Your API Keys">
                <Button
                  small
                  text="Generate New API Key"
                  goto="/account/apikeys/create"
                />
              </TitleRow>

              <Card>
                <Table
                  data={keys}
                  loading={fetch.loading}
                  show={["name", "key", "active"]}
                  actions={{
                    custom: [
                      { icon: "eye", action: reveal },
                      {
                        icon: "rotate-ccw",
                        action: revoke,
                        condition: { col: "active", value: true },
                      },
                    ],

                    edit: (data) => {
                      navigate(`/account/apikeys/edit?id=${data.id}`);
                    },
                    delete: del,
                  }}
                  badge={{
                    col: "active",
                    color: "green",
                    condition: [
                      { value: true, color: "green" },
                      { value: false, color: "red" },
                    ],
                  }}
                />
              </Card>
            </Animate>
          ) : (
            <BlankSlateMessage
              title="Create an API Key"
              text={`You haven't created any API keys yet. Would you like to create one now?`}
              buttonText="Create API Key"
              action={() => navigate("/account/apikeys/create")}
              marginTop="4em"
            />
          )}
        </Fragment>
      )}
    </Fragment>
  );
}
