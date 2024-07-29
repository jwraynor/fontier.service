import {TcpServer, PacketHandler} from './tcp_server';

export interface AuthRequestPacket {
    version: number;
    client_name: string;
    client_hwid: string;
}

export interface AuthResponsePacket {
    success: boolean;
    message: string;
}

//This is enough to reconrstruct the font file on the client side, via the perma link using the hash and the extension
export interface FontInstallRequestPacket {
    name: string;
    style: string;
    file_hash: string;
    file_type: string;
    install: boolean;
}

export interface FontInstallResponsePacket {
    success: boolean;
    message: string;
}


export function registerPackets(server: TcpServer) {
    // Register the packet type for the authentication packet
    server.register({
        type: 0,
        size: 4 + 32 + 64,
        serialize: (data: AuthRequestPacket) => {
            const buffer = Buffer.alloc(4 + 32 + 64);
            buffer.writeUInt32LE(data.version, 0);
            buffer.write(data.client_name.padEnd(32, '\0'), 4, 'utf8');
            buffer.write(data.client_hwid.padEnd(64, '\0'), 36, 'utf8');
            return buffer;
        },
        deserialize: (buffer: Buffer): AuthRequestPacket => {
            return {
                version: buffer.readUInt32LE(0),
                client_name: buffer.toString('utf8', 4, 36),
                client_hwid: buffer.toString('utf8', 36, 100)
            };
        }
    });

    // Register the packet type for the authentication response packet
    server.register({
        type: 1,
        size: 1 + 256,
        serialize: (data: AuthResponsePacket) => {
            const buffer = Buffer.alloc(1 + 256);
            buffer.writeUInt8(data.success ? 1 : 0, 0);
            buffer.write(data.message, 1, 'utf8');
            return buffer;
        },
        deserialize: (buffer: Buffer): AuthResponsePacket => {
            return {
                success: buffer.readUInt8(0) === 1,
                message: buffer.toString('utf8', 1)
            };
        }
    });

    server.register({
        type: 2,
        size: 64 + 32 + 32 + 32 + 1,
        serialize: (data: FontInstallRequestPacket) => {
            const buffer = Buffer.alloc(64 + 32 + 32 + 32 + 1);
            buffer.write(data.file_hash.padEnd(64, '\0'), 0, 'utf8');
            buffer.write(data.name.padEnd(32, '\0'), 64, 'utf8');
            buffer.write(data.style.padEnd(32, '\0'), 96, 'utf8');
            buffer.write(data.file_type.padEnd(32, '\0'), 128, 'utf8');
            buffer.writeUInt8(data.install ? 1 : 0, 160);
            return buffer;
        },
        deserialize: (buffer: Buffer): FontInstallRequestPacket => {
            return {
                file_hash: buffer.toString('utf8', 0, 64),
                name: buffer.toString('utf8', 64, 96),
                style: buffer.toString('utf8', 96, 128),
                file_type: buffer.toString('utf8', 128, 160),
                install: buffer.readUInt8(160) === 1
            };
        }
    });

    server.register({
        type: 3,
        size: 1 + 256,
        serialize: (data: FontInstallResponsePacket) => {
            const buffer = Buffer.alloc(1 + 256);
            buffer.writeUInt8(data.success ? 1 : 0, 0);
            buffer.write(data.message, 1, 'utf8');
            return buffer;
        },
        deserialize: (buffer: Buffer): FontInstallResponsePacket => {
            return {
                success: buffer.readUInt8(0) === 1,
                message: buffer.toString('utf8', 1)
            };
        }
    });
}

