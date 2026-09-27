import React from 'react';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';

export function SparkLineChart(props){

  let options = {...props.options };

  options.scales.y.display = false;
  options.scales.x.display = false;
  options.maintainAspectRatio = false;
  options.responsive = true;

  return <Chart type='line' data={ props.data } options={ options }/>

}
