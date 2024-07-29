import sqlite3 from 'sqlite3';
import {open} from 'sqlite';

export class Database {
    private db: sqlite3.Database;

    async open(): Promise<void> {
        const database = await open({
            filename: 'database.sqlite',
            driver: sqlite3.Database
        }).finally(() => console.log('Database initialized'));
        this.db = database.db;
    }

    async init() {
        await this.run(`
            CREATE TABLE IF NOT EXISTS clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hwid TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                active BOOLEAN DEFAULT 0,
                last_seen DATETIME NOT NULL
            );
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS fonts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                style TEXT,
                file_hash TEXT NOT NULL UNIQUE,
                file_path TEXT NOT NULL UNIQUE,
                file_type TEXT NOT NULL,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS libraries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
        `);


        await this.run(`
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            );
        `);


        await this.run(`
            CREATE TABLE IF NOT EXISTS font_libraries (
                library_id INTEGER,
                font_id INTEGER,
                FOREIGN KEY (library_id) REFERENCES libraries (id),
                FOREIGN KEY (font_id) REFERENCES fonts (id),
                PRIMARY KEY (library_id, font_id)
            );
        `);


        await this.run(`
            CREATE TABLE IF NOT EXISTS font_groups (
                font_id INTEGER,
                group_id INTEGER,
                FOREIGN KEY (font_id) REFERENCES fonts (id),
                FOREIGN KEY (group_id) REFERENCES groups (id),
                PRIMARY KEY (font_id, group_id)
            );
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS client_groups (
                client_hwid TEXT,
                group_id INTEGER,
                FOREIGN KEY (client_hwid) REFERENCES clients (hwid),
                FOREIGN KEY (group_id) REFERENCES groups (id),
                PRIMARY KEY (client_hwid, group_id)
            );
        `);


        await this.run(`
            CREATE TABLE IF NOT EXISTS client_libraries (
                client_hwid TEXT,
                library_id INTEGER,
                FOREIGN KEY (client_hwid) REFERENCES clients (hwid),
                FOREIGN KEY (library_id) REFERENCES libraries (id),
                PRIMARY KEY (client_hwid, library_id)
            );
        `);


        await this.run(`
            CREATE TABLE IF NOT EXISTS client_fonts (
                client_hwid TEXT,
                font_id INTEGER,
                FOREIGN KEY (client_hwid) REFERENCES clients (hwid),
                FOREIGN KEY (font_id) REFERENCES fonts (id),
                PRIMARY KEY (client_hwid, font_id)
            );
        `);

        await this.run(`
            CREATE TABLE IF NOT EXISTS library_groups (
                library_id INTEGER,
                group_id INTEGER,
                FOREIGN KEY (library_id) REFERENCES libraries (id),
                FOREIGN KEY (group_id) REFERENCES groups (id),
                PRIMARY KEY (library_id, group_id)
            );
        `);
    }

    //A function using generics to allow for type-safe queries and results
    async all<T>(query: string, params: any[] = []): Promise<T[]> {
        return new Promise((resolve, reject) => {
            this.db.all(query, params, (error, rows) => {
                if (error) {
                    reject(error);
                } else {
                    const results = rows as unknown as T[];
                    resolve(results);
                }
            });
        });
    }


    async get<T>(query: string, params: any[] = []): Promise<T> {
        return new Promise((resolve, reject) => {
            this.db.get(query, params, (error, row) => {
                if (error) {
                    reject(error);
                } else {
                    const result = row as unknown as T;
                    resolve(result);
                }
            });
        });
    }

    async each<T>(query: string, params: any[] = [], callback: (row: T) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.each(query, params, (error, row) => {
                if (error) {
                    reject(error);
                } else {
                    callback(row as unknown as T);
                }
            }, (error, count) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    async exec(query: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.exec(query, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }


    async run(query: string, params: any[] = []): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    // New helper method for insert operations
    async insert(query: string, params: any[] = []): Promise<number> {
        return new Promise((resolve, reject) => {
            this.db.run(query, params, function (error) {
                if (error) {
                    reject(error);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    }


    async close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    async getClientLibraries(clientHWID: string): Promise<any[]> {
        return this.all(`
            SELECT DISTINCT l.*
            FROM libraries l
            LEFT JOIN client_libraries cl ON l.id = cl.library_id
            LEFT JOIN client_groups cg ON cg.client_hwid = ?
            LEFT JOIN library_groups lg ON l.id = lg.library_id AND cg.group_id = lg.group_id
            WHERE cl.client_hwid = ? OR lg.group_id IS NOT NULL
        `, [clientHWID, clientHWID]);
    }

    async getClientFonts(clientHWID: string): Promise<any[]> {
        return this.all(`
            SELECT DISTINCT f.*
            FROM fonts f
            LEFT JOIN client_fonts cf ON f.id = cf.font_id
            LEFT JOIN client_groups cg ON cg.client_hwid = ?
            LEFT JOIN font_groups fg ON f.id = fg.font_id AND cg.group_id = fg.group_id
            WHERE cf.client_hwid = ? OR fg.group_id IS NOT NULL
        `, [clientHWID, clientHWID]);
    }

    async getClientGroups(clientHWID: string): Promise<any[]> {
        return this.all(`
            SELECT g.*
            FROM groups g
            JOIN client_groups cg ON g.id = cg.group_id
            WHERE cg.client_hwid = ?
        `, [clientHWID]);
    }

    async addOrUpdateClient(hwid: string, name: string): Promise<number> {
        const existingClient = await this.getClientByHWID(hwid);
        if (existingClient) {
            await this.run(
                'UPDATE clients SET name = ?, last_seen = datetime("now") WHERE hwid = ?',
                [name, hwid]
            );
            return existingClient.id;
        } else {
            return this.addClient(hwid, name);
        }
    }

    async addGroup(name: string, description: string): Promise<number> {
        return this.insert(
            'INSERT INTO groups (name, description, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
            [name, description]
        );
    }

    async addClientToGroup(clientHWID: string, groupId: number): Promise<void> {
        await this.run(
            'INSERT OR IGNORE INTO client_groups (client_hwid, group_id) VALUES (?, ?)',
            [clientHWID, groupId]
        );
    }

    async addLibraryToGroup(libraryId: number, groupId: number): Promise<void> {
        await this.run(
            'INSERT OR IGNORE INTO library_groups (library_id, group_id) VALUES (?, ?)',
            [libraryId, groupId]
        );
    }

    async getClientByHWID(hwid: string): Promise<any> {
        return this.get('SELECT * FROM clients WHERE hwid = ?', [hwid]);
    }

    async addFont(name: string, filePath: string, style: string, fileHash: string, fileType: string): Promise<number> {
        return this.insert(
            'INSERT INTO fonts (name, file_path, created_at, updated_at, style, file_hash, file_type) VALUES (?, ?, datetime("now"), datetime("now"), ?, ?, ?)',
            [name, filePath, style, fileHash, fileType]
        );
    }

    async addLibrary(name: string, description: string): Promise<number> {
        return this.insert(
            'INSERT INTO libraries (name, description, created_at, updated_at) VALUES (?, ?, datetime("now"), datetime("now"))',
            [name, description]
        );
    }

    async addClient(hwid: string, name: string): Promise<number> {
        return this.insert(
            'INSERT INTO clients (hwid, name, last_seen) VALUES (?, ?, datetime("now"))',
            [hwid, name]
        );
    }

    async assignFontToLibrary(fontId: number, libraryId: number): Promise<void> {
        await this.run(
            'INSERT OR IGNORE INTO font_libraries (library_id, font_id) VALUES (?, ?)',
            [libraryId, fontId]
        );
    }

    async assignFontToGroup(fontId: number, groupId: number): Promise<void> {
        await this.run(
            'INSERT OR IGNORE INTO font_groups (font_id, group_id) VALUES (?, ?)',
            [fontId, groupId]
        );
    }

    async assignLibraryToClient(libraryId: number, clientHWID: string): Promise<void> {
        await this.run(
            'INSERT OR IGNORE INTO client_libraries (client_hwid, library_id) VALUES (?, ?)',
            [clientHWID, libraryId]
        );
    }

    async getGroups(): Promise<any[]> {
        return this.all('SELECT * FROM groups');
    }

    async getGroupById(groupId: number): Promise<any> {
        return this.get('SELECT * FROM groups WHERE id = ?', [groupId]);
    }

    async getFonts(): Promise<any[]> {
        return this.all('SELECT * FROM fonts');
    }

    async getFontById(fontId: number): Promise<any> {
        return this.get('SELECT * FROM fonts WHERE id = ?', [fontId]);
    }

    async getLibraries(): Promise<any[]> {
        return this.all('SELECT * FROM libraries');
    }

    async getLibraryById(libraryId: number): Promise<any> {
        return this.get('SELECT * FROM libraries WHERE id = ?', [libraryId]);
    }

    async getClientUptime(): Promise<{ client_hwid: string, uptime: number }[]> {
        // This method requires a 'commands' table that doesn't exist in the current schema.
        // We'll leave it commented out for now.
        /*
        return this.all(`
            SELECT
                c.hwid as client_hwid,
                (JULIANDAY('now') - JULIANDAY(MIN(co.created_at))) * 24 * 60 * 60 as uptime
            FROM
                clients c
            LEFT JOIN
                commands co ON c.hwid = co.client_hwid
            WHERE
                co.created_at >= datetime('now', '-30 days')
            GROUP BY
                c.hwid
        `);
        */
        throw new Error('getClientUptime method not implemented');
    }



    async getClientActivityAnalytics(): Promise<{ date: string, active_clients: number }[]> {
        return this.all(`
            SELECT 
                DATE(last_seen) as date,
                COUNT(DISTINCT hwid) as active_clients
            FROM 
                clients
            WHERE 
                last_seen >= datetime('now', '-7 days')
            GROUP BY 
                DATE(last_seen)
            ORDER BY 
                date
        `);
    }

    async getLibraryDistributionAnalytics(): Promise<{ library_id: number, font_count: number }[]> {
        return this.all(`
            SELECT 
                library_id,
                COUNT(font_id) as font_count
            FROM 
                font_libraries
            GROUP BY 
                library_id
        `);
    }

    async assignFontToClient(fontId: number, clientId: string): Promise<void> {
        console.log(`Font ID: ${fontId}, Client ID: ${clientId}`);

        return this.run('INSERT INTO client_fonts (client_hwid, font_id) VALUES (?, ?)', [clientId, fontId]);
    }

    async unassignFontFromClient(number: number, clientId: string) {
        return this.run('DELETE FROM client_fonts WHERE client_hwid = ? AND font_id = ?', [clientId, number]);
    }
}