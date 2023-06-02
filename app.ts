import ChatServer from './src/server/ChatServer';

// Start the server or run tests
if (process.argv[2] !== 'test') {
    let server = new ChatServer();
    server.startHttp();
} else {

}