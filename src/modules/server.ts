import {TcpServer as BaseTcpServer, Packet} from './tcp_server';
import {registerPackets, AuthRequestPacket, FontInstallRequestPacket, FontInstallResponsePacket} from "./tcp_packets";
import {ClientManager} from '../managers/ClientManager';
import {CommandManager} from '../managers/CommandManager';

export class TCPServer {
    private readonly server: BaseTcpServer;
    private clientManager: ClientManager;
    private commandManager: CommandManager;

    constructor(port: number, clientManager: ClientManager, commandManager: CommandManager) {
        this.server = new BaseTcpServer(port);
        this.clientManager = clientManager;
        this.commandManager = commandManager;
        this.setupServer();
    }

    private setupServer() {
        registerPackets(this.server);
        this.server.on(0, this.handleAuthRequest.bind(this));
        this.server.on(3, this.handleFontInstlalResponse.bind(this));
        this.server.on('connect', this.handleClientConnect.bind(this));
        this.server.on('disconnect', this.handleClientDisconnect.bind(this));
    }

    start() {
        console.log(`TCP server listening on port ${this.server.port()}`);
    }

    private async handleAuthRequest(socket: any, packet: Packet) {
        const data = packet.data as AuthRequestPacket;
        const client = await this.clientManager.authenticateClient(data, socket);
        if (!client) {
            this.server.sendPacket(socket, {
                type: 1,
                data: {
                    success: false,
                    message: 'Authentication failed'
                }
            });
            return;
        }
        console.log(`Client authenticated: ${client.hwid}`);
        this.server.sendPacket(socket, {
            type: 1,
            data: {
                success: true,
                message: 'Authentication successful'
            }
        });


    }

    private async handleFontInstlalResponse(socket: any, packet: Packet) {
        const data = packet.data as FontInstallResponsePacket;
        console.log(`Font install response: ${data.message}`);
        //TODO: Handle the response, update the database
    }

    private async handleClientConnect(socket: any) {
        //Send the queued commands to the client
        const client = this.clientManager.getClientBySocket(socket);
        if (client) {
            const commands = await this.commandManager.getClientCommands(client.hwid);
            console.log(`Sending ${commands.length} queued commands to ${client.hwid}`);
        }

    }

    private async handleClientDisconnect(socket: any) {
        await this.clientManager.disconnectClient(socket);
    }

    installFont(client_hwid: string, font: FontInstallRequestPacket) {
        const client = this.clientManager.getClientByHWID(client_hwid);
        if (client) {
            this.server.sendPacket(client.socket, {
                type: 2,
                data: font
            });
        } else {
            console.error(`Client ${client_hwid} not found`);
        }
    }

    uninstallFont(client_hwid: string, font: FontInstallRequestPacket) {
        const client = this.clientManager.getClientByHWID(client_hwid);
        if (client) {
            this.server.sendPacket(client.socket, {
                type: 2,
                data: font
            });
        } else {
            console.error(`Client ${client_hwid} not found`);
        }
    }

}