import React from 'react';
/***
*
*   DASHBOARD
*   Overview of your application usage
*
**********/

import { Card, Chart, Grid, Stat, Animate, useAPI } from 'components/lib';

export function Dashboard(props){

  const stats = useAPI('/api/metrics/accounts');
  const growth = useAPI('/api/metrics/accounts/growth');

  return(
    <Animate type='pop'>

      <Grid cols='3'>
        <Stat
          loading={ stats?.loading }
          value={ stats?.data?.totalAccounts }
          label='Accounts'
          icon='users'
        />
        <Stat
          loading={ stats?.loading }
          value={ stats?.data?.activeAccounts }
          label='Active'
          icon='check'
        />
        <Stat
          loading={ stats?.loading }
          value={ stats?.data?.churnedAccounts }
          label='Churned'
          icon='arrow-down-right'
        />
      </Grid>

      <Card title='User Growth'>
        <Chart
          type='line'
          color='green'
          data={ growth.data }
          loading={ growth.loading }
        />
      </Card>
    </Animate>
  );
}
