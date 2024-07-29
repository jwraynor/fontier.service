import {Database} from '../modules/database';

interface Client {
    hwid: string;
    name: string;
    lastSeen: Date;
    socket: any;
}

export class ClientManager {
    private clients: Map<string, Client> = new Map();

    constructor(private database: Database) {
    }

    async authenticateClient(data: { client_name: string, client_hwid: string }, socket: any): Promise<Client> {
        const client: Client = {
            hwid: data.client_hwid,
            name: data.client_name,
            lastSeen: new Date(),
            socket: socket
        };

        //Checks if the client is already in the database
        const existingClient = await this.database.get<{ hwid: string, name: string, last_seen: string }>(
            'SELECT hwid, name, last_seen FROM clients WHERE hwid = ?',
            [client.hwid]
        );

        if (existingClient) {
            client.lastSeen = new Date(existingClient.last_seen);
            //Updates the last seen time
            await this.database.run('UPDATE clients SET last_seen = ?, active = ? WHERE hwid = ?', [new Date().toISOString(), true, client.hwid]);
        } else {
            //Inserts the client into the database
            await this.database.run('INSERT INTO clients (hwid, name, last_seen, active) VALUES (?, ?, ?, ?)', [client.hwid, client.name, new Date().toISOString(), true]);
        }


        this.clients.set(client.hwid, client);
        return client;
    }


    async disconnectClient(socket: any) {
        const clientHWID = Array.from(this.clients.entries()).find(([_, client]) => client.socket === socket)?.[0];
        if (clientHWID) {
            this.clients.delete(clientHWID);
            await this.database.run('UPDATE clients SET last_seen = ?, active = ? WHERE hwid = ?', [new Date().toISOString(), false, clientHWID]);
        }
    }

    getClientBySocket(socket: any): Client | undefined {
        return Array.from(this.clients.values()).find(client => client.socket === socket);
    }

    getClientByHWID(hwid: string): Client | undefined {
        return this.clients.get(hwid);
    }

    async getAllClients(): Promise<Omit<Client, 'socket'>[]> {
        const clients = await this.database.all<{
            id: number,
            hwid: string,
            name: string,
            last_seen: string,
            active: boolean
        }>(
            'SELECT id, hwid, name, last_seen, active FROM clients'
        );
        return clients.map(client => ({
            id: client.id,
            hwid: client.hwid,
            name: client.name,
            active: client.active ? true : false,
            lastSeen: new Date(client.last_seen)
        }));
    }
}