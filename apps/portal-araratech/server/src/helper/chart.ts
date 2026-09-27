/*
 * create a new chart object
 * accepts a dataset comprised of an object with label/value keys
 * and array of labels for each dataset
 * see model/demo.js for an example
 */

export const create = ({ datasets, labels }) => {
  if (!Array.isArray(datasets[0])) datasets = [datasets];

  if (!Array.isArray(labels)) labels = [labels];

  const chart = {
    labels: null,
    datasets: [],
  };

  // for each dataset
  if (datasets) {
    for (let i = 0; i < datasets.length; i++) {
      const values = [],
        ticks = [];

      for (let j = 0; j < datasets[i].length; j++) {
        ticks.push(datasets[i][j].label);
        values.push(datasets[i][j].value);
      }

      chart.labels = ticks;
      chart.datasets.push({
        label: labels[i],
        data: values,
      });
    }
  }

  return chart;
};
