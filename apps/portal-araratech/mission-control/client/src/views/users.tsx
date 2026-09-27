import React from "react";
/***
 *
 *   USERS
 *   Manage individual users registered to your application
 *
 **********/

import { useContext } from "react";
import Axios from "axios";
import Settings from "settings.json";
import { ViewContext, Card, Table, Animate, useAPI } from "components/lib";

export function Users(props) {
  const viewContext = useContext(ViewContext);
  const users = useAPI("/api/user");

  function editUser(data, callback) {
    viewContext.modal.show(
      {
        title: "Edit User",
        form: {
          name: {
            label: "Name",
            type: "text",
            value: data.name,
            required: true,
          },
          email: {
            label: "Email",
            type: "email",
            value: data.email,
            required: true,
          },
        },
        buttonText: "Save",
        url: `/api/user/${data.id}`,
        method: "PATCH",
      },
      (res) => {
        viewContext.notification.show(
          data.name + " was updated",
          "success",
          true,
        );
        callback(res);
      },
    );
  }

  function deleteUser(data, callback) {
    viewContext.modal.show(
      {
        title: "Delete User",
        form: {},
        buttonText: "Delete User",
        text: `Are you sure you want to delete ${data.email}? This will remove them from all accounts.`,
        url: `/api/user/${data.id}`,
        method: "DELETE",
        destructive: true,
      },
      () => {
        viewContext.notification.show(
          `${data.email} was deleted`,
          "success",
          true,
        );
        callback();
      },
    );
  }

  async function impersonateUser(data: { id: string }) {
    try {
      const res = await Axios.post(`/api/user/impersonate/${data.id}`);
      const token = res.data?.data?.token;
      if (token) {
        window.location.href =
          Settings[process.env.NODE_ENV].remote_client +
          `/signin/impersonate?token=${token}`;
      }
    } catch (err) {
      viewContext.handleError(err);
    }
  }

  return (
    <Animate>
      <Card>
        <Table
          search
          data={users.data}
          loading={users.loading}
          show={["name", "email", "date_created", "last_active", "onboarded"]}
          actions={{
            edit: editUser,
            delete: deleteUser,
            email: true,
            custom: [{ icon: "log-in", action: impersonateUser }],
          }}
        />
      </Card>
    </Animate>
  );
}
