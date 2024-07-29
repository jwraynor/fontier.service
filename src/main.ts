// import {TcpServer, PacketHandler} from './modules/tcp_server';
// import {AuthRequestPacket, CommandResponsePacket, registerPackets} from "./modules/tcp_packets";
//
//
// try {
//     const server = new TcpServer(6969);
//     registerPackets(server);
//     server.on(0, (socket, packet) => {
//         const data = packet.data as AuthRequestPacket;
//         console.log('Received authentication request:', data);
//         server.sendPacket(socket, {
//                 type: 1,
//                 data: {
//                     success: true,
//                     message: 'Authentication successful\0'
//                 }
//             }
//         );
//         console.log('Sent authentication response');
//
//         server.sendPacket(socket, {
//                 type: 2,
//                 data: {
//                     command: "echo Hello, Worlds!\0"
//                 }
//             }
//         );
//     });
//
//     server.on(3, (socket, packet) => {
//         const data = packet as unknown as CommandResponsePacket;
//         console.log('Received command response:', packet.data);
//     });
//
//     server.on('connect', (socket) => {
//         console.log('New client connected');
//     });
//     server.on('disconnect', (socket) => {
//         console.log('Client disconnected');
//     });
//     server.on('error', (socket, error) => {
//         const {code} = error as unknown as { code: string };
//         if (code !== 'ECONNRESET') { //Ignore connection reset errors
//             console.error('Client error:', error);
//         }
//     });
//
//     console.log('Server successfully started and listening on port 6969');
// } catch (error) {
//     console.error('Failed to start server:', error);
// }


import {Database} from "./modules/database";
import {ClientManager} from "./managers/ClientManager";
import {CommandManager} from "./managers/CommandManager";
import {TCPServer} from "./modules/server";
import {ExpressServer} from "./modules/express_server";

async function main() {
    const database = new Database();
    await database.open();
    await database.init();

    const clientManager = new ClientManager(database);
    const commandManager = new CommandManager(database);

    const tcpServer = new TCPServer(6969, clientManager, commandManager);
    const expressServer = new ExpressServer(tcpServer, 6968, clientManager, database);

    tcpServer.start();
    expressServer.start();
}

main().catch(console.error);