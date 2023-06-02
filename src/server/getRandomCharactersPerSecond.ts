export const getRandomCharactersPerSecond = () => {
  // make between 30-80 wpm (150-400 cpm, 2.5-6.66 cps), weighted more to low numbers
  return 2.5 + (6.66 + 1 - 2.5) * Math.pow(Math.random(), 1.5);
}
