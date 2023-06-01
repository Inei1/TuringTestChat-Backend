export const getRandomTypingDelay = () => {
  // between instant-5 seconds, weighting more on the low end
  return 5000 * Math.pow(Math.random(), 1.5);
}
