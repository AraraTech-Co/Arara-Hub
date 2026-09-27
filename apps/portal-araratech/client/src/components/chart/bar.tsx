import "chart.js/auto";
import { ChartData, ChartOptions } from "chart.js/auto";
import { Chart } from "react-chartjs-2";

type BarChartProps = {
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
}

export function BarChart(props: BarChartProps) {
  let options = { ...props.options };
  options.maintainAspectRatio = false;
  options.responsive = true;

  return <Chart type="bar" data={props.data} options={options} />;
}
