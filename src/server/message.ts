import { DefaultEventsMap } from "socket.io/dist/typed-events";
import { Server as SocketServer } from 'socket.io';

export const message = async (data: any, io: SocketServer<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
  const endTime = await globalThis.collections.chatSessions?.findOne(
    { id: data.roomId }
  );
  if (endTime!.endChatTime >= Date.now()) {
    io.emit("messageResponse", data);
    globalThis.collections.chatSessions?.updateOne(
      { id: data.roomId },
      { $push: { messages: data.message } }
    );
  }

  // this.convertMessage(data);
  // const completion = await this.openai.createChatCompletion({
  //   model: "gpt-3.5-turbo",
  //   messages: this.messages,
  // });
  // setTimeout(() => io.emit("typingResponse", "user2"), 100);
  // const message = completion.data.choices[0].message?.content;

  // setTimeout(() => io.emit("messageResponse", {
  //   name: "user2",
  //   text: completion.data.choices[0].message?.content
  // }), (message?.length! / this.wordsPerSecond) * 1000);
  // io.emit("typingResponse", "");
}