import * as net from 'net';

interface Packet {
    type: number;
    data: any;
}

type SerializeFunc = (data: any) => Buffer;
type DeserializeFunc = (buffer: Buffer) => any;

interface PacketHandler {
    type: number;
    size: number;
    serialize: SerializeFunc;
    deserialize: DeserializeFunc;
}

type ListenerType = number | 'connect' | 'disconnect' | 'error';

type Listener =
    (socket: net.Socket, packet: Packet) => void | // On packet
        ((socket: net.Socket) => void) | // On connect/disconnect
        ((socket: net.Socket, error: Error) => void); // On error


class TcpServer {
    private server: net.Server;
    private handlers: Map<number, PacketHandler> = new Map();
    private listeners: Map<ListenerType, Array<Listener>> = new Map();
    //Maps a socket to a client id
    private clients: Map<string, net.Socket> = new Map();

    constructor(port: number) {
        this.server = net.createServer((socket) => this.onConnectionOpen(socket));
        this.server.listen(port, () => {
            console.log(`Server listening on port ${port}`);
        });
    }

    public port(): number {
        return (this.server.address() as net.AddressInfo).port;
    }

    public on(type: ListenerType, listener: Listener) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, []);
        }
        this.listeners.get(type).push(listener);
    }

    private onConnectionOpen(socket: net.Socket) {
        //Setup the client id
        const clientId = socket.remoteAddress + ':' + socket.remotePort;
        if (this.clients.has(clientId)) {
            console.error('Client already connected');
            socket.end();
            return;
        }

        this.clients.set(clientId, socket);

        //Call the connect listeners
        const connectListeners = this.listeners.get('connect');
        if (connectListeners) {
            for (const listener of connectListeners) {
                //Cast to the connect listener type
                (listener as (socket: net.Socket) => void)(socket);
            }
        }
        let buffer = Buffer.alloc(0);

        socket.on('data', (data) => {
            // console.log('Received data:', data.toString('hex'));
            buffer = Buffer.concat([buffer, data]);
            // console.log('Current buffer:', buffer.toString('hex'));

            while (buffer.length >= 2) {
                const type = buffer.readUInt16LE(0);
                const handler = this.handlers.get(type);

                if (!handler) {
                    console.error(`Unknown packet type: ${type}`);
                    buffer = buffer.subarray(2);
                    continue;
                }

                if (buffer.length < 2 + handler.size) {
                    console.log('Not enough data for full packet, waiting for more');
                    break;
                }

                const packetData = buffer.subarray(2, 2 + handler.size);
                // console.log('Packet data:', packetData.toString('hex'));

                try {
                    const packet = handler.deserialize(packetData);
                    this.handlePacket(socket, {type, data: packet});
                } catch (error) {
                    console.error('Error deserializing packet:', error);
                }

                buffer = buffer.subarray(2 + handler.size);
            }
        });

        socket.on('close', () => {
            const disconnectListeners = this.listeners.get('disconnect');
            if (disconnectListeners) {
                for (const listener of disconnectListeners) {
                    //Cast to the disconnect listener type
                    (listener as (socket: net.Socket) => void)(socket);
                }
            }
            this.clients.delete(clientId);
        });

        socket.on('error', (error) => {
            const errorListeners = this.listeners.get('error');
            if (errorListeners) {
                for (const listener of errorListeners) {
                    const errorListener = listener as unknown as (socket: net.Socket, error: Error) => void;
                    errorListener(socket, error);
                }
            }
        });
    }


    private handlePacket(socket: net.Socket, packet: Packet) {
        // Sanitize the packet, trimming strings and removing null characters
        this.sanitizePacketData(packet.data);
        // Call the listener for this packet type
        const listener = this.listeners.get(packet.type);
        if (listener) {
            for (const l of listener) {
                l(socket, packet);
            }
        }
        // Handle the packet here
    }

    private sanitizePacketData(data: any) {
        for (const key in data) {
            if (typeof data[key] === 'string') {
                // Trim the string and remove null characters
                data[key] = data[key].replace(/\0+/g, '').trim();
            } else if (typeof data[key] === 'object' && data[key] !== null) {
                // Recursively sanitize nested objects
                this.sanitizePacketData(data[key]);
            }
        }
    }

    public sendPacket(socket: net.Socket, packet: Packet) {
        const handler = this.handlers.get(packet.type);
        if (!handler) {
            console.error(`Unknown packet type: ${packet.type}`);
            return;
        }

        const dataBuffer = handler.serialize(packet.data);
        const typeBuffer = Buffer.alloc(2);
        typeBuffer.writeUInt16LE(packet.type, 0);

        const fullBuffer = Buffer.concat([typeBuffer, dataBuffer]);

        socket.write(fullBuffer);
    }

    public register(handler: PacketHandler) {
        this.handlers.set(handler.type, handler);
    }
}

export {TcpServer, Packet, PacketHandler};