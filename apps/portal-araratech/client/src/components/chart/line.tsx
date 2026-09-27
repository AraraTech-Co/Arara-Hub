
import "chart.js/auto";
import { ChartData, ChartOptions } from "chart.js/auto";
import { Chart } from "react-chartjs-2";

type LineChartProps = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
}

export function LineChart(props: LineChartProps) {
  let options = { ...props.options };
  options.maintainAspectRatio = false;
  options.responsive = true;

  return <Chart type="line" data={props.data} options={options} />;
}
