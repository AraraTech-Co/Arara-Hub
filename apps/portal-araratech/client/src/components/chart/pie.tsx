
import "chart.js/auto";
import { ChartData, ChartOptions } from "chart.js/auto";
import { Chart } from "react-chartjs-2";

type PieChartProps = {
  data: ChartData<"pie">;
  options: ChartOptions<"pie">;
};

export function PieChart(props: PieChartProps) {
  let options = { ...props.options };
  options.responsive = true;
  options.maintainAspectRatio = false;
  options.scales.x.ticks.display = false;
  options.scales.y.ticks.display = false;
  options.scales.x.border.display = false;
  options.scales.y.border.display = false;

  return <Chart type="pie" data={props.data} options={options} />;
}
