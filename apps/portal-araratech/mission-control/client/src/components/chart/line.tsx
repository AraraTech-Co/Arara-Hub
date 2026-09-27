import React from 'react';
import 'chart.js/auto';
import { Chart } from 'react-chartjs-2';

export function LineChart(props){

  let options = {...props.options };
  options.maintainAspectRatio = false;
  options.responsive = true;

  return <Chart type='line' data={ props.data } options={ options } />

}
