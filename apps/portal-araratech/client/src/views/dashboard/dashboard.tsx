/***
 *
 *   DASHBOARD
 *   Template dashboard example demonstrating various components inside a view.
 *
 **********/

import React from "react";
import {
  Card,
  Stat,
  ProgressBar,
  Chart,
  Table,
  Message,
  Grid,
  Animate,
  Feedback,
  useAPI,
} from "@/components/lib";

export function Dashboard(props) {
  const stats = useAPI("/api/demo/stats");
  const progress = useAPI("/api/demo/progress");
  const table = useAPI("/api/demo/users/list");
  const userChart = useAPI("/api/demo/users/types");
  const revenueChart = useAPI("/api/demo/revenue");

  return (
    <Animate type="pop">
      <Message
        closable
        title="Welcome to Sample!"
        text="This is a sample dashboard to get you started. Please read the documentation to learn how to build your own features."
        type="info"
      />

      <Grid cols="4">
        <Stat
          loading={stats?.loading}
          value={stats?.data?.users}
          label="users"
          icon="users"
        />
        <Stat
          loading={stats?.loading}
          value={stats?.data?.active}
          label="active"
          icon="check"
        />
        <Stat
          loading={stats?.loading}
          value={stats?.data?.churned}
          label="churned"
          icon="refresh-cw"
        />
        <Stat
          loading={stats?.loading}
          value={stats?.data?.latest}
          label="this month"
          icon="calendar"
          change="5%"
        />
      </Grid>

      <Card title="Revenue">
        <Chart
          type="line"
          legend
          loading={revenueChart.loading}
          data={revenueChart.data}
          color={["red", "blue"]}
        />
      </Card>

      <Grid cols="2">
        <Card title="Goals" loading={progress.loading}>
          {progress?.data?.map((item) => {
            return (
              <ProgressBar
                key={item.label}
                label={item.label}
                progress={item.value}
              />
            );
          })}
        </Card>
        <Card title="User Types">
          <Chart
            type="pie"
            legend={true}
            data={userChart.data}
            loading={userChart.loading}
            color="purple"
          />
        </Card>
      </Grid>

      <Card title="Users" last>
        <Table
          search
          data={table.data}
          loading={table.loading}
          badge={{ col: "plan", color: "blue" }}
        ></Table>
      </Card>

      <Feedback />
    </Animate>
  );
}
