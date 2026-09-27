import React from 'react';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';

export function DonutChart(props) {

  let options = {...props.options };
  options.responsive = true;
  options.maintainAspectRatio = false;
  options.scales.x.ticks.display = false; 
  options.scales.y.ticks.display = false;
  options.scales.x.display = false;
  options.scales.y.display = false;

  return <Chart type='doughnut' data={ props.data } options={ options } />

}
