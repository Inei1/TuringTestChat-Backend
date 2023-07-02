export const getRandomCharactersPerSecond = () => {
  return 1.5 + (4 + 1 - 1.5) * Math.pow(Math.random(), 1.5);
}
