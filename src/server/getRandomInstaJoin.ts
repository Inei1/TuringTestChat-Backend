import { getRandomPercent } from "./getRandomPercent";

export const getRandomInstaJoin = () => {
  const quickJoin = getRandomPercent();
  // 50% chance to join quickly
  if (quickJoin < 50) {
    // join in less than 2 seconds
    return Math.random() * 2000;
  } else {
    // Join in a random amount of time, ranging from 1 to 10 seconds, while favoring low numbers.
    return Math.floor(1000 + (9000 + 1 - 1000) * Math.pow(Math.random(), 2));
  }

}