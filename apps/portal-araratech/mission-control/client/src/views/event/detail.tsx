import React from "react";
/***
 *
 *   EVENT/DETAIL
 *   View the details of an individual event
 *
 **********/

import { useEffect, useState } from "react";
import {
  Animate,
  Card,
  Breadcrumbs,
  Form,
  useAPI,
  useLocation,
} from "components/lib";

export function EventDetail(props) {
  const location = useLocation();
  const path = location?.pathname?.split("/");
  const group = path[2];
  const id = path[3];

  // fetch
  const event = useAPI(`/api/event/${id}`);
  const [form, setForm] = useState<any>(null); // TODO: Type this // TODO: Type this

  useEffect(() => {
    if (event.data?.length) {
      let time = event.data[0].time.split("T");
      time = time[0] + " " + time[1].split(".")[0];

      const f: any = {}; // TODO: Type this
      Object.keys(event.data[0]).forEach((key) => {
        f[key] = {
          label: key,
          value: event.data[0][key],
          type: event.data[0][key] ? "text" : null,
        };
      });

      if (f.metadata?.value) f.metadata.type = "textarea";

      f.time.value = time;

      setForm(f);
    }
  }, [event.data]);

  return (
    <Animate>
      <Breadcrumbs
        items={[
          { name: "groups", url: "/events" },
          { name: group, url: `/events/${group}` },
          { name: "detail", url: `/events/${group}/${id}` },
        ]}
      />

      <Card loading={event.loading}>{form && <Form inputs={form} />}</Card>
    </Animate>
  );
}
