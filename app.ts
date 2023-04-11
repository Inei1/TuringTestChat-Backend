import EditorServer from './src/server/EditorServer';

// Start the server or run tests
if (process.argv[2] !== 'test') {
    let server = new EditorServer();
    server.startHttps(8081);
    server.startHttp(8080);
} else {

}