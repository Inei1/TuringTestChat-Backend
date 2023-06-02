import _ from "lodash";
import { getRandomPercent } from "./getRandomPercent";
import cityTimezones from "city-timezones";
import logger from "jet-logger";

const personalities: string[] = [
  "Friendly",
  "Professional",
  "Playful",
  "Supportive",
  "Informative",
  "Creative",
  "Analytical",
  "Enthusiastic",
  "Calm",
  "Authoritative",
  "Inquisitive",
  "Humorous",
  "Empathetic",
  "Confident",
  "Inspirational",
  "Sarcastic",
  "Thoughtful",
  "Optimistic",
  "Pragmatic",
  "Curious",
  "Energetic",
  "Witty",
  "Patient",
  "Adventurous",
  "Assertive",
  "Quirky",
  "Diplomatic",
  "Inventive",
  "Humble",
  "Charismatic",
  "Logical",
  "Nurturing",
  "Imaginative",
  "Respectful",
  "Serious",
  "Easygoing",
  "Meticulous",
  "Bold",
  "Cheerful",
  "Methodical",
  "Determined",
  "Perceptive",
  "Tenacious",
  "Whimsical",
  "Stoic",
  "Lively",
  "Analytical",
  "Intuitive",
  "Sincere",
  "Dynamic",
  "Romantic",
  "Grounded",
  "Adaptable",
  "Visionary",
];

const locations: string[] = [
  "London, United Kingdom",
  "Toronto, Canada",
  "Sydney, Australia",
  "Auckland, New Zealand",
  "Cape Town, South Africa",
  "Dublin, Ireland",
  "Vancouver, Canada",
  "Wellington, New Zealand",
  "Singapore",
  "Hong Kong",
  "Dubai, United Arab Emirates",
  "Kuala Lumpur, Malaysia",
  "Amsterdam, Netherlands",
  "Stockholm, Sweden",
  "Berlin, Germany",
  "Paris, France",
  "Barcelona, Spain",
  "Tokyo, Japan",
  "Seoul, South Korea",
  "Mumbai, India",
  "Bangkok, Thailand",
  "Manila, Philippines",
  "Cairo, Egypt",
  "São Paulo, Brazil",
  "Buenos Aires, Argentina",
  "Mexico City, Mexico",
  "San Juan, Puerto Rico",
];

export const generateSystemMessage = () => {
  const biographyStatus = getRandomPercent();
  // 1% chance to say completely wild things.
  // example: impersonate the developer
  // be incredibly rude for no reason
  // pretend to be a famous person
  // prompt the bot to say the most crazy things it can think of
  // ask the user to add them on a fake social media account
  const wildcard = getRandomPercent();
  let location = "";
  let inquisitiveness = "";
  const inquisitiveStatus = getRandomPercent();
  if (inquisitiveStatus < 10) {
    inquisitiveness = "Aggressively ask";
  } else if (inquisitiveStatus < 50) {
    inquisitiveness = "Sometimes ask";
  } else {
    inquisitiveness = "Rarely ask";
  }

  let timeLocation = "";
  let locationTimezone;
  try {
  location = _.sample(locations)!;
  locationTimezone = cityTimezones.findFromCityStateProvince(location);
    timeLocation = new Date().toLocaleString("en-US", {
    timeZone: locationTimezone[0].timezone,
    dateStyle: "full",
    timeStyle: "short",
  });
  } catch (err) {
    logger.err(err);
    logger.err("with location " + location);
  }
  const botGoalStatus = getRandomPercent();
  let botGoal = "";
  if (botGoalStatus < 50) {
    botGoal = "human";
  } else {
    botGoal = "bot";
  }
  const lengthStatus = getRandomPercent();
  let length = 0;
  if (lengthStatus < 90) {
    length = 5;
  } else if (lengthStatus < 98) {
    length = 10;
  } else {
    length = 20;
  }

  let confusionResponse = "";
  let confusionFrequency = "";
  const confusionStatus = getRandomPercent();
  if (confusionStatus < 10) {
    confusionResponse = "only a string of random letters";
  } else if (confusionStatus < 40) {
    confusionResponse = "what";
  } else if (confusionStatus < 60) {
    confusionResponse = "?";
  } else if (confusionStatus < 80) {
    confusionResponse = "I don't understand";
  } else {
    confusionResponse = "What are you trying to say?";
  }

  if (confusionStatus % 3 === 0) {
    confusionFrequency = "occasionally reply with";
  } else if (confusionStatus % 3 === 1) {
    confusionFrequency = "always reply with";
  } else {
    confusionFrequency = "ignore them and say something random";
    confusionResponse = "";
  }

  let typoFrequency = "";
  const typoRandom = getRandomPercent();
  if (typoRandom < 33) {
    typoFrequency = "frequently";
  } else if (typoRandom < 66) {
    typoFrequency = "occasionally";
  } else {
    typoFrequency = "rarely";
  }

  const openingMessage = ``;
  const confusionMessage = `If you don't understand the user's message, ${confusionFrequency} ${confusionResponse}. `;
  const baselineMessage = `You will now be a ${botGoal}. Generate a short conversational response to convince the user that you are a ${botGoal}. You are not an AI language model or assistant, and you never help the user. `;
  const dateMessage = `The time is always ${timeLocation}. `;
  const grammarMessage = `You make typos ${typoFrequency}. You don't use capitilization or punctuation. `;
  const locationMessage = `If the user asks about your location, generate a location where the time is ${timeLocation}. `;
  const randomPersonality = _.sample(personalities);
  const personalityMessage = `Your messages have the personality of ${randomPersonality}. `;
  const inquisitiveMessage = `You ${inquisitiveness} ask the other user if they are a bot or a human. `;
  const wildcardMessage = ""; //"You impersonate a famous person.";
  const lengthMessage = `Your messages are usually less than ${length} words. Your messages are strictly 200 characters or less.`;
  return baselineMessage + dateMessage + grammarMessage + locationMessage + 
  personalityMessage + inquisitiveMessage + lengthMessage + wildcardMessage + confusionMessage;
}
