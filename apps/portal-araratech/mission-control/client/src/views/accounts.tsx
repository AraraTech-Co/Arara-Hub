import React from 'react';
/***
*
*   ACCOUNTS
*   Manage all accounts signed up to your application
*
**********/

import { useContext } from 'react';
import { AuthContext, ViewContext, Card, Table, Animate, usePlans, useAPI } from 'components/lib';

export function Accounts(props){

  const viewContext = useContext(ViewContext);
  const authContext = useContext(AuthContext);

  const plans =  usePlans();
  const accounts = useAPI('/api/account'); 

  function editAccount(data, callback){
    viewContext.modal.show({

      title: 'Edit Account',
      form: {
        id: {
          type: 'hidden',
          value: data.id
        },
        plan: {
          label: 'Plan',
          type: 'select',
          options: plans.data.list,
          default: data.plan,
          required: true,
        },
        active: {
          label: 'Status',
          type: 'select',
          default: data.active,
          options: [
            { value: 1, label: 'Active' },
            { value: 0, label: 'Cancelled' }
          ],
          required: true
        },
      },
      buttonText: 'Save',
      url: `${authContext.remote_server}/api/account/plan`,
      method: 'PATCH'

    }, (res) => {

      viewContext.notification.show(data.name + ' was updated', 'success', true);
      callback(res);

    });
  }

  function deleteAccount(data, callback){
    viewContext.modal.show({
      title: 'Delete Account',
      form: {},
      buttonText: 'Delete Account',
      text: `Are you sure you want to close ${data.email}'s account?`,
      url: `${authContext.remote_server}/api/account/${data.id}`,
      method: 'DELETE',
      destructive: true,
    }, () => {

      viewContext.notification.show(`${data.email} was deleted`, 'success', true);
      callback();

    });
  }

  return(
    <Animate>
      <Card loading={ false }>

        <Table
          search
          show={['name', 'plan', 'date_created', 'email', 'owner_name']}
          data={ accounts?.data }
          loading={ accounts?.loading }
          badge={{ col: 'plan', color: 'blue' }}
          actions={{ edit: editAccount, delete: deleteAccount, email: true }}
        />

      </Card>
    </Animate>
  );
}
