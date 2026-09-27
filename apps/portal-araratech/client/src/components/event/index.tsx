/*
 * EVENT
 * log a new client event in the database
 */

import Axios from "axios";

export function Event(name: string, metadata: any = {}) {
  console.log("Event name:", name);
console.log("Event metadata:", metadata);
  // TODO: Type This
  Axios.post("/api/event", {
    name: name,
    metadata: metadata,
  });
}
