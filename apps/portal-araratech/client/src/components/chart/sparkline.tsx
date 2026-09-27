
import "chart.js/auto";
import { ChartData, ChartOptions } from "chart.js/auto";
import { Chart } from "react-chartjs-2";

type SparkLineChartProps = {
  data: ChartData<"line">;
  options: ChartOptions<"line">;
}

export function SparkLineChart(props: SparkLineChartProps) {
  let options = { ...props.options };

  options.scales.y.display = false;
  options.scales.x.display = false;
  options.maintainAspectRatio = false;
  options.responsive = true;

  return <Chart type="line" data={props.data} options={options} />;
}
