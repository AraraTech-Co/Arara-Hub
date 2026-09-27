export type Dataset = { label: string; value: number; };

export type Chart = { labels: string[] | null; datasets: { label: string | null; data: number[]; }[]; };

export const create = function (datasets: Dataset[] | Dataset[][], labels: string[] | string | null = null): Chart {
  if (!Array.isArray(datasets[0])) {
    datasets = [datasets as Dataset[]];
  }

  if (!Array.isArray(labels)) {
    labels = labels ? [labels] : [];
  }

  let chart: Chart = {
    labels: null,
    datasets: [],
  };

  if (datasets) {
    for (let i = 0; i < datasets.length; i++) {
      let values: number[] = [];
      let ticks: string[] = [];

      for (let j = 0; j < (datasets[i] as Dataset[]).length; j++) {
        ticks.push((datasets[i] as Dataset[])[j].label);
        values.push((datasets[i] as Dataset[])[j].value);
      }

      chart.labels = ticks;
      chart.datasets.push({
        label: labels[i] || null,
        data: values,
      });
    }
  }

  return chart;
};
