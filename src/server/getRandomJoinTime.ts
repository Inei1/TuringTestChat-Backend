export const getRandomJoinTime = () => {
  // has a chance to join every 5 to 10 seconds.
  return Math.random() * 5000 + 5000;
}