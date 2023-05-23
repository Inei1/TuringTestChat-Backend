import { getRandomPercent } from "./getRandomPercent";

export const getRandomJoinTime = () => {
  const quickJoin = getRandomPercent();
  return 0;
  // 90% chance to join quickly
  // if (quickJoin < 90) {
  //   // join in less than 2 seconds
  //   return Math.random() * 2000;
  // } else {
  //   // join in a random amount of time, ranging from instant to around 28 seconds.
  //   // This formula will weight towards lower numbers, but may occasionally take a long time.
  //   return Math.floor(1000 + (28000 + 1 - 1000) * Math.pow(Math.random(), 1.5));
  // }
}