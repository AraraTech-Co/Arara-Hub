import React from 'react';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';

export function PieChart(props){

  let options = {...props.options };
  options.responsive = true;
  options.maintainAspectRatio = false;
  options.scales.x.ticks.display = false;
  options.scales.y.ticks.display = false;
  options.scales.x.border.display = false;
  options.scales.y.border.display = false;

  return <Chart type='pie' data={ props.data } options={ options } />

}
