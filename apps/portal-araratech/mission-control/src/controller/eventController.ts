import * as event from "../model/schema/Event/Event";
import * as chart from "../helper/chart";
import { Request, Response } from 'express';

export const get = async function (req: Request, res: Response) {
  const list = await event.get({ id: req.params.id, filter: req.query });

  if (req.query.name) {
    let chartData;
    const times = await event.times(req.query.name as string);

    if (times?.length) {
      chartData = times.map((x: { time: string; total: number }) => {
        return {
          label: x.time,
          value: x.total,
        };
      });
    }

    return res.status(200).send({
      data: {
        list: list,
        chart: chartData ? chart.create(chartData) : null,
      },
    });
  }

  res.status(200).send({ data: list });
};

export const deleteEvent = async function (req: Request, res: Response) {
  await event.deleteEvent({ id: req.params.id });
  res.status(200).send({ message: "Event deleted" });
};