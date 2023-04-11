import ChatServer from './src/server/ChatServer';

// Start the server or run tests
if (process.argv[2] !== 'test') {
    let server = new ChatServer();
    server.startHttps(8081);
    server.startHttp(8080);
} else {

}