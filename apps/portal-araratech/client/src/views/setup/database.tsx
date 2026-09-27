// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   SETUP DATABASE
 *   Creates the database for your application.
 *   You can delete this when you've completed the setup process.
 *
 **********/

import React, { Fragment, useState, useEffect } from "react";
import { Form, Helper, Loader, useAPI } from "@/components/lib";

export function SetupDatabase(props) {
  const data = useAPI("/api/setup/database");
  const conn = data?.data?.connection;

  const sql = {
    host: {
      label: "Host",
      type: "text",
      required: true,
      errorMessage: "Please enter a database host",
    },
    user: {
      label: "User",
      type: "text",
      required: true,
      errorMessage: "Please enter your database username",
    },
    password: {
      label: "Password",
      type: "password",
      errorMessage: "Please enter your database password",
    },
    port: {
      label: "Port",
      type: "number",
      required: true,
      errorMessage: "Please enter your database port",
    },
    database: {
      label: "Database Name",
      type: "text",
      required: true,
      errorMessage: "Please provide your database name",
    },
  };

  const sqlLite = {
    filename: {
      type: "text",
      label: "Filename",
      placeholder: "./Sample.sqlite",
      required: true,
    },
  };

  // state
  const [form, setForm] = useState<any>({
    // TODO: Type this
    ...{
      client: {
        label: "Client",
        type: "select",
        default: "pg",
        required: true,
        options: [{ value: "pg", label: "PostgreSQL" }],
        errorMessage: "Please select a database client",
      },
    },
    ...sql,
  });

  function update(udata) {
    console.log("Updated data:", udata);
    if (udata.input === "client" && udata.value === "sqlite3") {
      let database: any = { ...form }; // TODO: Type this
      Object.keys(database).map(
        (key) => key !== "client" && delete database[key],
      );
      setForm({ ...database, ...sqlLite });
    } else if (udata.input === "client") {
      let database = { ...form, ...sql };
      Object.keys(conn).map((key) => {
        return (database[key].value = conn[key]);
      });
      if (udata.value === "mongo") delete database.port;
      // TODO: Check if this is really necessary
      // @ts-ignore
      delete database.filename;
      setForm(database);
    }
  }

  useEffect(() => {
    // if populate inital values
    if (data?.data) {
      if (conn && conn.host && form.host && !form.host.value) {
        const f = { ...form };
        Object.keys(conn).map((key) => {
          return (f[key].value = conn[key]);
        });
        if (data?.data?.client === "mongo") delete f.port;
        f.client.default = data?.data?.client;
        setForm(f);
      }
    }
  }, [conn, form, data?.data]);

  if (data.loading) return <Loader />;
  console.log("SetupDatabase props:", props);
  console.log("API data:", data);
  console.log("Connection data:", conn);
  console.log("Form state:", form);
  return (
    <Fragment>
      <Helper
        text="Need help? Refer to the database docs"
        url="https://docs.Sample.app/Sample-server/installation/database-setup"
      />

      <Form
        inputs={form}
        url="/api/setup/database"
        method="POST"
        updateOnChange
        onChange={update}
        buttonText="Connect to Database"
      />
    </Fragment>
  );
}
