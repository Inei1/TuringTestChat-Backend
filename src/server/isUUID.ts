export const isUUID = (text: string | null | undefined) => {
  if (!text) {
    return false;
  }
  return text.match(/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi);
}