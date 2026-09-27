/***
 *
 *   API Key Editor
 *   Create or edit a new/existing API key
 *
 **********/

import React, { useState, useEffect, useCallback } from "react";
import Axios from "axios";
import {
  Animate,
  AccountNav,
  Card,
  Form,
  Message,
  Breadcrumbs,
  TextInput,
  Loader,
  useNavigate,
  useLocation,
  useAPI,
} from "@/components/lib";

export function APIKeyEditor(props) {
  const navigate = useNavigate();
  const location = useLocation();

  // get the scopes
  const scopes = useAPI("/api/key/scopes");

  // state
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(false); // NOTE: Type this
  const [newAPIKey, setNewAPIKey] = useState();
  console.log("APIKeyEditor props:", props);
  console.log("API key data:", data);
  console.log("New API key state:", newAPIKey);
  console.log("Scopes data:", scopes?.data);
  console.log("Location search:", location.search);
  const fetch = useCallback(async () => {
    setLoading(true);

    try {
      const res = await Axios.get(`/api/key/${location.search?.substring(4)}`);
      if (res.data.data.length) {
        console.log(res.data.data[0]);
        setData(res.data.data[0]);
      } else {
        navigate("/404");
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      navigate("/404");
    } finally {
      setLoading(false);
    }
  }, [location.search, navigate]);

  useEffect(() => {
    if (location.search) {
      fetch();
    }
  }, [fetch, location.search]);

  if (scopes.loading) return <Loader />;

  return (
    <Animate>
      <AccountNav />

      <Breadcrumbs
        items={[
          { name: "API Keys", url: "/account/apikeys" },
          {
            name: `${data ? "Edit" : "Create"} API Key`,
            url: "/account/apikeys/create",
          },
        ]}
      />

      {newAPIKey ? (
        <Message
          closable
          title="Your New API Key"
          type="warning"
          buttonText="Back to API Keys"
          buttonLink="/account/apikeys"
          text="Your API key is below. Please store this somewhere safe."
        >
          <TextInput value={newAPIKey} />
        </Message>
      ) : (
        <Card title={`${data ? "Edit" : "Create"} API Key`} loading={loading}>
          <Form
            inputs={{
              name: {
                label: "Name",
                type: "text",
                required: true,
                value: data.name,
                errorMessage: "Please provide a descriptive name for your key.",
              },
              scope: {
                type: "checkbox",
                label: "Scope",
                required: true,
                min: 1,
                default: data.scope,
                options: scopes?.data,
                errorMessage: "Please select at least one scope",
              },
            }}
            url={data ? `/api/key/${data.id}` : "/api/key"}
            method={data ? "PATCH" : "POST"}
            buttonText={data ? "Save Changes" : "Create New API Key"}
            callback={(res) => {
              !data && setNewAPIKey(res?.data?.data?.full_key);
            }}
          />
        </Card>
      )}
    </Animate>
  );
}
