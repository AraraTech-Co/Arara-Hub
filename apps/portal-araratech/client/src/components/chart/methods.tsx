/*
 * rounds ticks to whole numbers (no decimal)
 */

export const roundTicks = function (label, index, labels) {
  if (Math.floor(label) === label) return formatToMetric(label);
};

/*
 * format the specified number to a metric value
 * 10,000 becomes 10k, 1,000,000 becomes 1m
 */

function formatToMetric(num) {
  if (num > 999 && num < 1000000) {
    return num / 1000 + "k";
  } else if (num >= 1000000) {
    return num / 1000000 + "m";
  } else if (num < 0 && num < -999) {
    return "-" + Math.abs(num / 1000) + "k";
  } else if (num < -1000000) {
    return "-" + Math.abs(num / 1000000) + "m";
  } else {
    return num;
  }
}
