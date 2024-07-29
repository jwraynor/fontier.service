import express from 'express';
import {ClientManager} from '../managers/ClientManager';
import {TCPServer} from "./server";
import {Database} from './database';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import * as fontkit from 'fontkit';
import fs from 'fs';
import fsp from 'fs/promises';
import {randomUUID} from "node:crypto";
import crypto from 'crypto';
import {FontInstallRequestPacket, FontInstallResponsePacket} from "./tcp_packets";

export class ExpressServer {
    private app: express.Application;
    private clientManager: ClientManager;
    private database: Database;
    private upload: multer.Multer;

    constructor(
        private server: TCPServer,
        private port: number,
        clientManager: ClientManager,
        database: Database
    ) {
        this.app = express();
        this.clientManager = clientManager;
        this.database = database;
        this.setupMiddleware();
        this.setupUpload();
        this.setupRoutes();
        this.setupStaticFiles();
    }

    private setupMiddleware() {
        this.app.use(express.json());
        this.app.use(cors());
    }

    private setupUpload() {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, 'data/uploads/fonts/');
            },
            filename: (req, file, cb) => {
                const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
                cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
            }
        });

        this.upload = multer({storage: storage});
    }

    private setupStaticFiles() {
        this.app.use('/perma', express.static('data/permanent/fonts'));
    }

    private setupRoutes() {
        // Client routes
        this.app.get('/api/clients', this.getClients.bind(this));
        this.app.get('/api/clients/:clientId', this.getClientById.bind(this));
        this.app.get('/api/clients/:clientId/libraries', this.getClientLibraries.bind(this));
        this.app.post('/api/clients/:clientId/libraries', this.assignClientLibraries.bind(this));
        this.app.get('/api/clients/:clientId/fonts', this.getClientFonts.bind(this));
        this.app.post('/api/clients/:clientId/fonts', this.assignClientFonts.bind(this));
        this.app.delete('/api/clients/:clientId/fonts/:fontId', this.unassignClientFonts.bind(this));
        this.app.get('/api/clients/:clientId/groups', this.getClientGroups.bind(this));
        this.app.post('/api/clients/:clientId/groups', this.assignClientGroups.bind(this));

        // Font routes
        this.app.get('/api/fonts', this.getFonts.bind(this));
        // this.app.post('/api/fonts', this.addFont.bind(this));
        this.app.get('/api/fonts/:fontId', this.getFontById.bind(this));
        this.app.post('/api/fonts', this.upload.single('file'), this.uploadAndProcessFont.bind(this));

        // Library routes
        this.app.get('/api/libraries', this.getLibraries.bind(this));
        this.app.post('/api/libraries', this.createLibrary.bind(this));
        this.app.get('/api/libraries/:libraryId', this.getLibraryById.bind(this));
        this.app.post('/api/libraries/:libraryId/fonts', this.addFontToLibrary.bind(this));

        // Group routes
        this.app.get('/api/groups', this.getGroups.bind(this));
        this.app.post('/api/groups', this.createGroup.bind(this));
        this.app.get('/api/groups/:groupId', this.getGroupById.bind(this));
        this.app.post('/api/groups/:groupId/clients', this.addClientToGroup.bind(this));
        this.app.post('/api/groups/:groupId/libraries', this.addLibraryToGroup.bind(this));
        this.app.post('/api/groups/:groupId/fonts', this.addFontToGroup.bind(this));

        // Analytics routes
        this.app.get('/api/analytics/client-activity', this.getClientActivity.bind(this));
        this.app.get('/api/analytics/library-distribution', this.getLibraryDistribution.bind(this));
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`HTTP server listening on port ${this.port}`);
        });
    }


    private async assignClientLibraries(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        const {libraryId} = req.body;
        try {
            await this.database.assignLibraryToClient(parseInt(libraryId), clientId);
            res.json({success: true, message: 'Library assigned to client'});
        } catch (error) {
            res.status(500).json({error: 'Failed to assign library to client'});
        }
    }

    private async assignClientFonts(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        const {fontId} = req.body;
        try {
            const fontNum = parseInt(fontId);
            //Send the install packet
            const client = this.clientManager.getClientByHWID(clientId);
            const font = await this.database.getFontById(fontNum);
            if (!client) {
                //TODO: we should queue the font install packet, and send it when the client connects.
                return res.status(404).json({error: 'Client not found'});
            }
            if (!font) {
                return res.status(404).json({error: 'Font not found'});
            }
            //Retrieve the fonts

            const fontInstallPacket: FontInstallRequestPacket = {
                file_hash: font.file_hash,
                name: font.name,
                style: font.style,
                file_type: font.file_type,
                install: true
            }
            //Send the font install packet
            this.server.installFont(clientId, fontInstallPacket);
            console.log('Font install packet sent');
            await this.database.assignFontToClient(fontNum, clientId);
            res.json({success: true, message: 'Font assigned to client'});
        } catch (error) {
            res.status(500).json({error: 'Failed to assign font to clien', message: error.message});
        }
    }

    private async unassignClientFonts(req: express.Request, res: express.Response) {
        const {clientId, fontId} = req.params;
        try {
            const fontNum = parseInt(fontId);
            //Send the install packet
            const client = this.clientManager.getClientByHWID(clientId);
            const font = await this.database.getFontById(fontNum);
            if (!client) {
                //TODO: we should queue the font install packet, and send it when the client connects.
                return res.status(404).json({error: 'Client not found'});
            }
            if (!font) {
                return res.status(404).json({error: 'Font not found'});
            }
            //Retrieve the fonts

            const fontInstallPacket: FontInstallRequestPacket = {
                file_hash: font.file_hash,
                name: font.name,
                style: font.style,
                file_type: font.file_type,
                install: false
            }
            //Send the font install packet
            this.server.installFont(clientId, fontInstallPacket);
            console.log('Font uninstall packet sent');
            await this.database.unassignFontFromClient(parseInt(fontId), clientId);
            res.json({success: true, message: 'Font unassigned from client'});
        } catch (error) {
            res.status(500).json({error: 'Failed to unassign font from client'});
        }
    }

    private async assignClientGroups(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        const {groupId} = req.body;
        try {
            await this.database.addClientToGroup(clientId, parseInt(groupId));
            res.json({success: true, message: 'Client added to group'});
        } catch (error) {
            res.status(500).json({error: 'Failed to add client to group'});
        }
    }

    // Client routes handlers
    private async getClients(req: express.Request, res: express.Response) {
        try {
            const clients = await this.clientManager.getAllClients();
            res.json(clients);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch clients'});
        }
    }

    private async getClientById(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        try {
            const client = await this.database.getClientByHWID(clientId);
            if (client) {
                res.json(client);
            } else {
                res.status(404).json({error: 'Client not found'});
            }
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch client'});
        }
    }

    private async getClientLibraries(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        try {
            const libraries = await this.database.getClientLibraries(clientId);
            res.json(libraries);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch client libraries'});
        }
    }

    private async getClientFonts(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        try {
            const fonts = await this.database.getClientFonts(clientId);
            res.json(fonts);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch client fonts'});
        }
    }

    private async getClientGroups(req: express.Request, res: express.Response) {
        const {clientId} = req.params;
        try {
            const groups = await this.database.getClientGroups(clientId);
            res.json(groups);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch client groups'});
        }
    }

    // Font routes handlers
    private async getFonts(req: express.Request, res: express.Response) {
        try {
            const fonts = await this.database.getFonts();
            res.json(fonts);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch fonts'});
        }
    }


    private async uploadAndProcessFont(req: express.Request, res: express.Response) {
        if (!req.file) {
            return res.status(400).json({error: 'No file uploaded'});
        }

        const getHash = (path: string): Promise<string> => new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const rs = fs.createReadStream(path);
            rs.on('error', reject);
            rs.on('data', chunk => hash.update(chunk));
            rs.on('end', () => resolve(hash.digest('hex')));
        })

        const filePath = req.file.path;
        const uniqueId = randomUUID();
        const uniqueFilePath = `${uniqueId}-${req.file.filename}`;

        try {
            // Process the font file using fontkit
            const font = await fontkit.open(filePath);
            const familyName = font.familyName;
            const style = font.subfamilyName;
            const file_ext = path.extname(filePath);
            // Extract relevant information
            //Get the hash of the file
            const hash: string = await getHash(filePath);
            console.log('Hash:', hash);
            const permanentPath = path.join('data/permanent/fonts/', hash + path.extname(filePath));
            await fsp.rename(filePath, permanentPath);
            //Insert the font into the database
            const fontId = await this.database.addFont(familyName, permanentPath, style, hash, file_ext).catch(err => {
                if (err.message.includes('UNIQUE constraint failed')) {
                    console.error('Font already exists in database');
                    res.status(409).json({error: 'Font already exists in database'});
                    return -1;
                }
            });
            if (fontId === -1) return;

            console.log('Font ID:', fontId);
            const newFont = await this.database.getFontById(fontId);
            res.json(newFont);
        } catch (error) {
            console.error('Error processing font:', error);
            res.status(500).json({error: 'Failed to process uploaded font'});
        }
    }


    private async getFontById(req: express.Request, res: express.Response) {
        const {fontId} = req.params;
        try {
            const font = await this.database.getFontById(parseInt(fontId));
            if (font) {
                res.json(font);
            } else {
                res.status(404).json({error: 'Font not found'});
            }
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch font'});
        }
    }

    // Library routes handlers
    private async getLibraries(req: express.Request, res: express.Response) {
        try {
            const libraries = await this.database.getLibraries();
            res.json(libraries);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch libraries'});
        }
    }

    private async createLibrary(req: express.Request, res: express.Response) {
        const {name, description} = req.body;
        try {
            const libraryId = await this.database.addLibrary(name, description);
            res.json({id: libraryId, name, description});
        } catch (error) {
            res.status(500).json({error: 'Failed to create library'});
        }
    }

    private async getLibraryById(req: express.Request, res: express.Response) {
        const {libraryId} = req.params;
        try {
            const library = await this.database.getLibraryById(parseInt(libraryId));
            if (library) {
                res.json(library);
            } else {
                res.status(404).json({error: 'Library not found'});
            }
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch library'});
        }
    }

    private async addFontToLibrary(req: express.Request, res: express.Response) {
        const {libraryId} = req.params;
        const {fontId} = req.body;
        try {
            await this.database.assignFontToLibrary(fontId, parseInt(libraryId));
            res.json({success: true, message: 'Font added to library'});
        } catch (error) {
            res.status(500).json({error: 'Failed to add font to library'});
        }
    }

    // Group routes handlers
    private async getGroups(req: express.Request, res: express.Response) {
        try {
            const groups = await this.database.getGroups();
            res.json(groups);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch groups'});
        }
    }

    private async createGroup(req: express.Request, res: express.Response) {
        const {name, description} = req.body;
        try {
            const groupId = await this.database.addGroup(name, description);
            res.json({id: groupId, name, description});
        } catch (error) {
            res.status(500).json({error: 'Failed to create group'});
        }
    }

    private async getGroupById(req: express.Request, res: express.Response) {
        const {groupId} = req.params;
        try {
            const group = await this.database.getGroupById(parseInt(groupId));
            if (group) {
                res.json(group);
            } else {
                res.status(404).json({error: 'Group not found'});
            }
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch group'});
        }
    }

    private async addClientToGroup(req: express.Request, res: express.Response) {
        const {groupId} = req.params;
        const {clientId} = req.body;
        try {
            await this.database.addClientToGroup(clientId, parseInt(groupId));
            res.json({success: true, message: 'Client added to group'});
        } catch (error) {
            res.status(500).json({error: 'Failed to add client to group'});
        }
    }

    private async addLibraryToGroup(req: express.Request, res: express.Response) {
        const {groupId} = req.params;
        const {libraryId} = req.body;
        try {
            await this.database.addLibraryToGroup(parseInt(libraryId), parseInt(groupId));
            res.json({success: true, message: 'Library added to group'});
        } catch (error) {
            res.status(500).json({error: 'Failed to add library to group'});
        }
    }

    private async addFontToGroup(req: express.Request, res: express.Response) {
        const {groupId} = req.params;
        const {fontId} = req.body;
        try {
            await this.database.assignFontToGroup(parseInt(fontId), parseInt(groupId));
            res.json({success: true, message: 'Font added to group'});
        } catch (error) {
            res.status(500).json({error: 'Failed to add font to group'});
        }
    }

    // Analytics routes handlers
    private async getClientActivity(req: express.Request, res: express.Response) {
        try {
            const clientActivity = await this.database.getClientActivityAnalytics();
            res.json(clientActivity);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch client activity analytics'});
        }
    }

    private async getLibraryDistribution(req: express.Request, res: express.Response) {
        try {
            const libraryDistribution = await this.database.getLibraryDistributionAnalytics();
            res.json(libraryDistribution);
        } catch (error) {
            res.status(500).json({error: 'Failed to fetch library distribution analytics'});
        }
    }
}