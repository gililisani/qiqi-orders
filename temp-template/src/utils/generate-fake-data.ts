export function generateFakeData(
  baseValue: number,
  count: number,
  yRange: { max: number; min: number }
) {
  let i = 0;
  const series = [];

  while (i < count) {
    const x = Math.floor(Math.random() * (750 - 1 + 1)) + 1;
    const y =
      Math.floor(Math.random() * (yRange.max - yRange.min + 1)) + yRange.min;
    const z = Math.floor(Math.random() * (75 - 15 + 1)) + 15;

    series.push([x, y, z]);
    baseValue += 86400000;
    i++;
  }
  return series;
}

export default generateFakeData;
