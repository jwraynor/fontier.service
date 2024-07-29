import { v4 as uuidv4 } from 'uuid';
import { Database } from '../modules/database';

export class CommandManager {
    constructor(private database: Database) {}

    async createCommand(client_hwid: string, command: string): Promise<string> {
        const commandId = uuidv4();
        await this.database.run(
            'INSERT INTO commands (id, client_hwid, command, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [commandId, client_hwid, command, 'PENDING', new Date().toISOString()]
        );
        return commandId;
    }

    async markCommandExecuted(client_hwid: string) {
        await this.database.run(
            'UPDATE commands SET status = ?, executed_at = ? WHERE client_hwid = ? AND status = ?',
            ['EXECUTED', new Date().toISOString(), client_hwid, 'PENDING']
        );
    }

    async getClientCommands(client_hwid: string) {
        const commands = await this.database.all<{
            id: string,
            command: string,
            status: string,
            created_at: string,
            response: string,
            executed_at: string
        }>(
            'SELECT id, command, status, created_at, executed_at, response FROM commands WHERE client_hwid = ?',
            [client_hwid]
        );
        return commands.map(this.formatCommand);
    }

    async getAllCommands() {
        const commands = await this.database.all<{
            id: string,
            client_hwid: string,
            command: string,
            status: string,
            created_at: string,
            response: string,
            executed_at: string
        }>('SELECT * FROM commands');
        return commands.map(this.formatCommand);
    }

    async getCommandById(commandId: string) {
        const command = await this.database.get<{
            id: string,
            client_hwid: string,
            command: string,
            status: string,
            created_at: string,
            response: string,
            executed_at: string
        }>('SELECT * FROM commands WHERE id = ?', [commandId]);
        return command ? this.formatCommand(command) : null;
    }

    async updateCommand(commandId: string, response: string) {
        const command = await this.database.get<{ id: string, response: string }>(
            'SELECT id, response FROM commands WHERE id = ?',
            [commandId]
        );
        if (command && !command.response) {
            await this.database.run(
                'UPDATE commands SET response = ?, status = ?, executed_at = ? WHERE id = ?',
                [response, 'EXECUTED', new Date().toISOString(), commandId]
            );
            return commandId;
        }
    }

    private formatCommand(command: any) {
        return {
            id: command.id,
            clientId: command.client_hwid,
            command: command.command,
            status: command.status,
            response: command.response,
            createdAt: new Date(command.created_at),
            executedAt: command.executed_at ? new Date(command.executed_at) : null
        };
    }
}