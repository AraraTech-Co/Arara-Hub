// Converted to TypeScript
/* Add appropriate types here */
/***
 *
 *   USERS
 *   Enables an admin to manage the users in their application
 *
 **********/

import React, { Fragment, useContext, useState, useEffect } from "react";
import axios from "axios";
import {
  ViewContext,
  Card,
  AccountNav,
  Table,
  Button,
  Animate,
  TitleRow,
  useAPI,
  usePermissions,
  Event,
} from "@/components/lib";

export function Users(props) {
  const context = useContext<any>(ViewContext); // TODO: Type this
  const permissions = usePermissions();
  const data = useAPI("/api/account/users");
  const [users, setUsers] = useState([]);
  console.log("Users props:", props);
  console.log("ViewContext data:", context);
  console.log("Permissions data:", permissions);
  console.log("API data:", data);
  console.log("Users state:", users);
  function invite() {
    context.modal.show(
      {
        title: "Add User",
        form: {
          email: {
            label: "Email",
            type: "text",
            required: true,
          },
          permission: {
            label: "Permission",
            type: "select",
            default: "user",
            options: permissions?.data?.list?.filter(
              (x) => x.value !== "owner",
            ),
          },
        },
        buttonText: "Send Invite",
        text: "To invite more than one user, seperate the emails with a comma",
        url: "/api/invite",
        method: "POST",
      },
      (form, res) => {
        // add the invited user to the
        if (res.length) {
          const state = [...users];
          console.log(state);

          res.forEach((invite) => {
            if (!state.find((x) => x.id === invite.id)) {
              state.push({
                id: invite.id,
                name: "",
                email: invite.email,
                date_created: invite.date_sent,
                permission: invite.permission || "user",
                status: "Invited",
                actions: {
                  invite: resendInvite,
                  delete: deleteInvite,
                },
              });
            }
          });

          Event("invited_user");
          setUsers(state);
        }
      },
    );
  }

  function editUser(data, callback) {
    context.modal.show(
      {
        title: "Update User",
        form: {
          id: {
            type: "hidden",
            value: data.id,
          },
          name: {
            label: "Name",
            type: "text",
            required: true,
            value: data.name,
            errorMessage: "Please enter a name",
          },
          email: {
            label: "Email",
            type: "email",
            value: data.email,
            required: true,
          },
          permission: {
            label: "Permission",
            type: data.permission === "owner" ? null : "select",
            options: permissions?.data?.list?.filter(
              (x) => x.value !== "owner",
            ),
            default: data.permission,
          },
        },
        buttonText: "Save",
        url: "/api/user",
        method: "PATCH",
      },
      (res) => {
        context.notification.show(data.name + " was updated", "success", true);
        callback(res);
      },
    );
  }

  function deleteUser(data, callback) {
    context.modal.show(
      {
        title: "Delete User",
        form: {},
        buttonText: "Delete User",
        text: `Are you sure you want to delete ${data.name}?`,
        url: `/api/user/${data.id}`,
        method: "DELETE",
        destructive: true,
      },
      () => {
        context.notification.show(data.name + " was deleted", "success", true);
        callback();
      },
    );
  }

  function deleteInvite(data, callback) {
    context.modal.show(
      {
        title: "Delete Invite",
        form: {},
        buttonText: "Delete Invite",
        text: `Are you sure you want to delete the invite for ${data.email}?`,
        url: `/api/invite/${data.id}`,
        method: "DELETE",
        destructive: true,
      },
      () => {
        let state = [...users];
        state.splice(
          state.findIndex((x) => x.id === data.id),
          1,
        );
        context.notification.show(
          `${data.email}'s invite was deleted`,
          "success",
          true,
        );
        setUsers(state);
      },
    );
  }

  async function resendInvite(data) {
    try {
      await axios({
        url: "/api/invite",
        method: "post",
        data: { email: data.email },
      });

      context.notification.show(
        `Invite re-sent to ${data.email}`,
        "success",
        true,
      );
    } catch (err) {
      context.handleError(err);
    }
  }

  useEffect(() => {
    // format the user list
    let list = [];

    if (data?.data?.users?.length) {
      list = data.data.users.map((x) => {
        return {
          id: x.id,
          name: x.name,
          email: x.email,
          date_created: x.date_created,
          permission: x.permission,
          status: "Registered",
        };
      });
    }

    if (data?.data?.invites?.length) {
      data.data.invites.forEach((x) => {
        list.push({
          id: x.id,
          name: "",
          email: x.email,
          date_created: x.date_sent,
          permission: x.permission || "user",
          status: "Invited",
        });
      });
    }

    setUsers(list);
  }, [data]);

  // attach the per row actions for invites
  if (users.length) {
    users.forEach((u) => {
      if (u.status === "Invited") {
        u.actions = {
          invite: resendInvite,
          delete: deleteInvite,
        };
      }
    });
  }

  return (
    <Fragment>
      <AccountNav />
      <Animate>
        <TitleRow title="Manage Users">
          <Button small text="Add User" action={invite} />
        </TitleRow>

        <Card>
          <Table
            search
            className="restrict-width"
            data={users}
            loading={data.loading}
            show={[
              "email",
              "name",
              "date_created",
              "last_login",
              "permission",
              "status",
            ]}
            badge={{
              col: "status",
              color: "blue",
              condition: [
                { value: "registered", color: "green" },
                { value: "invited", color: "blue" },
              ],
            }}
            actions={{ edit: editUser, delete: deleteUser, email: true }}
          />
        </Card>
      </Animate>
    </Fragment>
  );
}
