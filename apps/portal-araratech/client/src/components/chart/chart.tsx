
/***
 *
 *   CHART
 *   Responsive chart that supports multiple datasets and chart types
 *
 *   PROPS
 *   type: line/bar/pie/donut/sparkline
 *   legend: boolean to toggle the legend
 *   data: object containing chart data
 *   color: red/blue/purple/green (pass array for multiple datasets)
 *
 **********/

import { useState, useEffect } from "react";
import { LineChart } from "./line";
import { BarChart } from "./bar";
import { PieChart } from "./pie";
import { DonutChart } from "./donut";
import { SparkLineChart } from "./sparkline";
import { Loader, Icon } from "@/components/lib";
import Style from "./chart.tailwind";
import { ChartData } from "chart.js";

const Options = require("./options.json");
const Methods = require("./methods");

type ChartProps = {
  type?: string;
  legend?: boolean;
  data?: ChartData;
  color?: string | string[];
  loading?: boolean;
}

export function Chart(props: ChartProps) {
  // state
  const [data, setData] = useState<ChartData>(null);

  // chart types
  const charts = {
    line: LineChart,
    bar: BarChart,
    pie: PieChart,
    donut: DonutChart,
    sparkline: SparkLineChart,
  };

  // config the options
  const Chart = charts[props.type ? props.type : "line"];
  const options = JSON.parse(JSON.stringify(Options));
  options.scales.y.ticks.callback = Methods.roundTicks;

  useEffect(() => {
    props.data && setData(props.data);
  }, [props.data]);

  // chart is loading
  if (props.loading) {
    return (
      <div className={Style.wrapper}>
        <Loader />
      </div>
    );
  }

  if (!data) return null;

  setChartColors(props, data);
  const legend = createLegend(props, data);

  // no chart data – render blank slate
  if (!data?.datasets?.length) {
    return (
      <div className={Style.wrapper}>
        <div className={Style.blankslate}>
          <Icon image="bar-chart" className={Style.blankslateIcon} />
          No data to show
        </div>
      </div>
    );
  }

  // render the chart
  return (
    <div className={Style.wrapper}>
      <div id="chart-tooltip"></div>
      {legend && <ul className={Style.legend}>{legend}</ul>}

      <div className={Style.chart}>
        <Chart data={data} options={options} />
      </div>
    </div>
  );
}

function setChartColors(props, data) {
  // set the color
  const Colors = require("./colors.json");
  let colors = [];

  // override with user defined color
  if (props.color) {
    if (Array.isArray(props.color)) {
      if (props.color.length) {
        for (let i = 0; i < props.color.length; i++) {
          colors[i] = Colors[props.color[i]];
        }
      }
    } else {
      colors[0] = Colors[props.color];
    }
  }

  // set default color
  for (let color in Colors) colors.push(Colors[color]);

  if (data?.datasets?.length) {
    data.datasets.forEach((ds, i) => {
      ds.borderColor = colors[i].borderColor;
      ds.backgroundColor = colors[i].backgroundColor[i];

      if (props.type === "line") {
        ds.pointBackgroundColor = colors[i].pointBackgroundColor;
        ds.backgroundColor = colors[i].transparentColor;
        ds.pointRadius = colors[i].pointRadius;
        ds.pointHoverRadius = colors[i].pointHoverRadius;
        ds.pointBorderWidth = colors[i].pointBorderWidth;
        ds.pointBackgroundColor = colors[i].pointBackgroundColor;
        ds.pointHoverBackgroundColor = colors[i].pointHoverBackgroundColor;
        ds.pointHoverBorderColor = colors[i].pointHoverBorderColor;
      }

      if (props.type === "sparkline") {
        ds.backgroundColor = "transparent";
        ds.pointRadius = 0;
        ds.lineTension = 0;
      }

      if (props.type === "pie" || props.type === "donut") {
        ds.borderColor = "#FFFFFF";
        ds.hoverBorderColor = "transparent";
        ds.backgroundColor = colors[i].backgroundColor;
      }
    });
  }
}

function createLegend(props, data) {
  let legend = [];

  // create the legend
  if (props.legend) {
    if (props.type === "pie" || props.type === "donut") {
      data.labels.map((label, index) => {
        return legend.push(
          <li key={label} className={Style.legendItem}>
            <span
              style={{
                backgroundColor: data?.datasets[0].backgroundColor[index],
              }}
              className={Style.legendColor}
            />
            {label}
          </li>,
        );
      });
    } else if (props.type === "line" || props.type === "bar") {
      data.datasets.map((data, index) => {
        return legend.push(
          <li key={data.label} className={Style.legendItem}>
            <span
              style={{ backgroundColor: data?.borderColor }}
              className={Style.legendColor}
            />
            {data.label}
          </li>,
        );
      });
    }
  }

  return legend;
}
