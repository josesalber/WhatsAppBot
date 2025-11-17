const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

// Variables para módulos ESM cargados dinámicamente
let makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Boom;

class WhatsAppServiceBaileys extends EventEmitter {
    constructor(userId = null) {
        super();
        this.sock = null;
        this.isReady = false;
        this.userId = userId;
        this.qrCode = null;
        this.isInitializing = false;
        this.isSending = false;
        this.authState = null;
        this.saveCreds = null;
    }

    async initialize(forceNew = false) {
        try {
            // Cargar Baileys dinámicamente (ESM en CommonJS)
            if (!makeWASocket) {
                console.log('📦 Cargando módulos ESM de Baileys v7...');
                const baileys = await import('@whiskeysockets/baileys');
                makeWASocket = baileys.default;
                DisconnectReason = baileys.DisconnectReason;
                useMultiFileAuthState = baileys.useMultiFileAuthState;
                fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
                
                const boomModule = await import('@hapi/boom');
                Boom = boomModule.Boom;
                
                console.log('✅ Módulos ESM cargados correctamente');
            }

            // Prevenir múltiples inicializaciones simultáneas
            if (this.isInitializing) {
                console.log(`⚠️ Ya hay una inicialización en progreso para usuario ${this.userId}`);
                return;
            }
            
            this.isInitializing = true;
            
            // Si ya hay un socket activo y no forzamos nueva sesión, no hacer nada
            if (this.sock && !forceNew) {
                console.log(`ℹ️ Cliente ya conectado para usuario ${this.userId}`);
                this.isInitializing = false;
                return;
            }

            // Cerrar socket existente si existe
            if (this.sock) {
                try {
                    await this.sock.logout();
                } catch (error) {
                    console.log(`⚠️ Error al cerrar socket anterior: ${error.message}`);
                }
                this.sock = null;
            }
            
            const cleanUserId = this.userId ? String(this.userId).replace(/[^a-zA-Z0-9_-]/g, '') : 'default';
            console.log(`🚀 Inicializando Baileys v7 para usuario ${this.userId} (ID: ${cleanUserId})`);
            
            // Configurar sesión independiente por usuario
            const sessionPath = this.userId ? 
                path.join(__dirname, '../..', 'baileys_sessions', `session_${cleanUserId}`) :
                path.join(__dirname, '../..', 'baileys_sessions', 'default');

            // Si forceNew es true, eliminar sesión existente para forzar QR
            if (forceNew && fs.existsSync(sessionPath)) {
                console.log(`🔄 Forzando nueva sesión - eliminando credenciales existentes...`);
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }

            // Crear directorio si no existe
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            // Configurar autenticación multi-archivo
            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
            this.authState = state;
            this.saveCreds = saveCreds;
            this.sessionPath = sessionPath;

            // Obtener la última versión de Baileys
            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`📱 Usando versión de WhatsApp: ${version.join('.')}, es la última: ${isLatest}`);

            // Crear logger compatible con Baileys
            const logger = {
                level: 'warn',
                child: (bindings) => logger,
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: console.warn,
                error: console.error,
                fatal: console.error
            };

            // Crear socket de conexión con configuración optimizada para v7
            this.sock = makeWASocket({
                version,
                auth: this.authState,
                printQRInTerminal: false,
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                logger: logger,
                browser: ['Bot WhatsApp', 'Desktop', '1.0.0'],
                retryRequestDelayMs: 250,
                maxMsgRetryCount: 5,
                emitOwnEvents: false,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                generateHighQualityLinkPreview: false,
                shouldSyncHistoryMessage: () => false,
                shouldIgnoreJid: () => false,
                fireInitQueries: true,
                getMessage: async (key) => {
                    return { conversation: 'Message not found' };
                }
            });

            // Event listeners
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                console.log(`🔄 Connection update para usuario ${this.userId}: connection=${connection}, qr=${!!qr}`);
                
                if (qr) {
                    console.log(`📱 QR Code generado para usuario ${this.userId || 'default'}`);
                    this.qrCode = qr;
                    this.emit('qr', qr);
                }
                
                // Detectar cuando el QR se escanea
                if (!qr && this.qrCode && connection !== 'open' && connection !== 'close') {
                    console.log(`🔄 QR escaneado para usuario ${this.userId} - procesando conexión...`);
                    this.qrCode = null;
                    this.emit('qr_scanned');
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const errorData = lastDisconnect?.error?.data;
                    console.log(`❌ Conexión cerrada para usuario ${this.userId || 'default'}`);
                    console.log(`   Código: ${statusCode}, Razón: ${lastDisconnect?.error?.message}`);
                    
                    // Diagnóstico de credenciales
                    if (statusCode === 401 || statusCode === 428) {
                        console.log(`🔍 Verificando credenciales (código ${statusCode})...`);
                        const credsPath = path.join(this.sessionPath, 'creds.json');
                        if (fs.existsSync(credsPath)) {
                            try {
                                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                                console.log(`📄 Claves presentes:`, Object.keys(creds));
                                
                                const criticalKeys = ['me', 'signedIdentityKey', 'signedPreKey', 'registrationId'];
                                const missingKeys = criticalKeys.filter(k => !creds[k]);
                                if (missingKeys.length > 0) {
                                    console.log(`⚠️ Faltan claves críticas:`, missingKeys);
                                }
                            } catch (readError) {
                                console.log(`❌ Error leyendo creds.json:`, readError.message);
                            }
                        } else {
                            console.log(`⚠️ No existe creds.json`);
                        }
                    }
                    
                    this.isReady = false;
                    this.emit('disconnected', lastDisconnect?.error?.message || 'Conexión cerrada');
                    
                    // Limpiar credenciales para códigos de error específicos
                    if (statusCode === 401 || statusCode === 428 || statusCode === DisconnectReason.badSession) {
                        console.log(`🔄 Código ${statusCode} detectado - limpiando credenciales...`);
                        setTimeout(async () => {
                            try {
                                if (fs.existsSync(this.sessionPath)) {
                                    fs.rmSync(this.sessionPath, { recursive: true, force: true });
                                    console.log(`🗑️ Credenciales eliminadas - usuario debe reconectar manualmente`);
                                }
                            } catch (error) {
                                console.log(`❌ Error limpiando credenciales: ${error.message}`);
                            }
                        }, 1000);
                    } else if (statusCode === DisconnectReason.loggedOut) {
                        console.log(`🚪 Usuario cerró sesión manualmente`);
                    } else if (statusCode === DisconnectReason.restartRequired) {
                        console.log(`🔄 WhatsApp requiere reinicio`);
                    } else if (this.isSending) {
                        console.log(`⏸️ No reconectando durante envío masivo`);
                    }
                } else if (connection === 'connecting') {
                    console.log(`🔄 Conectando WhatsApp para usuario ${this.userId || 'default'}...`);
                } else if (connection === 'open') {
                    console.log(`🎉 WhatsApp conectado exitosamente para usuario ${this.userId || 'default'}`);
                    
                    // Obtener información del usuario
                    try {
                        const userInfo = this.sock.user;
                        if (userInfo) {
                            console.log(`📞 Número conectado: ${userInfo.id.split(':')[0]}`);
                            console.log(`👤 Nombre: ${userInfo.name || 'Sin nombre'}`);
                        }
                    } catch (error) {
                        console.log('⚠️ No se pudo obtener información del usuario:', error.message);
                    }
                    
                    this.isReady = true;
                    this.qrCode = null;
                    this.emit('ready');
                    console.log(`✅ Cliente Baileys v7 listo para usuario ${this.userId || 'default'}`);
                }
            });

            // Guardar credenciales cuando cambien - CRÍTICO para v7
            this.sock.ev.on('creds.update', async () => {
                try {
                    if (!fs.existsSync(this.sessionPath)) {
                        console.log(`📁 Creando directorio de sesión: ${this.sessionPath}`);
                        fs.mkdirSync(this.sessionPath, { recursive: true });
                    }
                    await this.saveCreds();
                    console.log(`💾 Credenciales guardadas (incluyendo lid-mapping/device-index)`);
                } catch (error) {
                    console.error(`❌ Error guardando credenciales para usuario ${this.userId}:`, error.message);
                }
            });

            // Manejar actualizaciones de mensajes
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type === 'notify') {
                    for (const message of messages) {
                        if (!message.key.fromMe) {
                            console.log(`📨 Mensaje recibido de ${message.key.remoteJid}`);
                        }
                    }
                }
            });

            this.isInitializing = false;

        } catch (error) {
            this.isInitializing = false;
            console.error(`❌ Error al inicializar Baileys v7 para usuario ${this.userId || 'default'}:`, error);
            throw error;
        }
    }

    getRandomEmoji() {
        const emojis = [
            '😊', '🌟', '✨', '💫', '🎉', '🎊', '🎈','🍀',
            '☀️', '⭐', '💎', '🎯', '🏆', '🎖️', '🏅', '🎁', 
            '🔥','⚡','🥳', '😄', '😃', '😀', '😁', '🤩',
            '🙂', '😌', '😋', '😎', '🤗', '🤭', '💪', '👏', 
            '🙌', '👍', '✌️', '🤞', '🤟', '👌', '🤘','💯', '✅'
        ];
        return emojis[Math.floor(Math.random() * emojis.length)];
    }

    personalizeMessage(baseMessage, contactName) {
        const emoji = this.getRandomEmoji();
        return `${emoji} ${baseMessage}`;
    }

    resolveJid(phoneNumber) {
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        let intl = cleaned;
        if (intl.length === 9) {
            intl = '51' + intl;
            console.log(`🇵🇪 Número peruano detectado: ${phoneNumber} -> ${intl}`);
        } else if (intl.length === 10) {
            intl = '52' + intl;
            console.log(`🇲🇽 Número mexicano detectado: ${phoneNumber} -> ${intl}`);
        }
        
        const jid = `${intl}@s.whatsapp.net`;
        console.log(`📱 JID generado: ${phoneNumber} -> ${jid}`);
        return jid;
    }

    async sendBulkMessages(contacts, message, imageBase64 = null, progressCallback = null) {
        if (!this.isReady || !this.sock) {
            throw new Error('WhatsApp no está conectado');
        }

        this.isSending = true;
        console.log('🔒 Modo envío activado');

        const hasImage = !!imageBase64;
        console.log(`🚀 Iniciando envío masivo v7 a ${contacts.length} contactos ${hasImage ? 'CON IMAGEN 🖼️' : ''}`);
        const results = [];
        let sentCount = 0;
        let failedCount = 0;
        
        let imageBuffer = null;
        let imageMimetype = 'image/jpeg';
        if (hasImage) {
            try {
                const mimetypeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
                if (mimetypeMatch) {
                    imageMimetype = mimetypeMatch[1];
                }
                
                const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
                imageBuffer = Buffer.from(base64Data, 'base64');
                
                const sizeInKB = Math.round(imageBuffer.length / 1024);
                console.log(`📸 Imagen procesada: ${sizeInKB}KB (${imageMimetype})`);
                
                if (imageBuffer.length === 0) {
                    throw new Error('Buffer de imagen vacío');
                }
            } catch (error) {
                console.error('❌ Error procesando imagen:', error);
                throw new Error('Error al procesar la imagen');
            }
        }
        
        try {
            for (let i = 0; i < contacts.length; i++) {
                const contact = contacts[i];
                
                try {
                    if (!this.sock || !this.isReady) {
                        throw new Error('Socket WhatsApp desconectado');
                    }

                    const jid = this.resolveJid(contact.number);

                    try {
                        const results_check = await this.sock.onWhatsApp(jid);
                        if (!results_check || results_check.length === 0) {
                            console.log(`❌ Número no registrado en WhatsApp: ${contact.number}`);
                            results.push({
                                contact: contact.name,
                                number: contact.number,
                                success: false,
                                error: 'Número no registrado en WhatsApp'
                            });
                            failedCount++;
                            if (progressCallback) {
                                progressCallback(sentCount, failedCount);
                            }
                            continue;
                        }
                        console.log(`✅ Número verificado en WhatsApp: ${contact.number}`);
                    } catch (verifyError) {
                        console.log(`⚠️ No se pudo verificar el número ${contact.number}, continuando...`);
                    }

                    const personalizedMessage = this.personalizeMessage(message, contact.name);

                    let messageSent = false;
                    let retries = 3;
                    
                    while (retries > 0 && !messageSent) {
                        try {
                            if (imageBuffer) {
                                await this.sock.sendMessage(jid, {
                                    image: imageBuffer,
                                    caption: personalizedMessage,
                                    mimetype: imageMimetype,
                                    jpegThumbnail: null,
                                    fileName: `image_${Date.now()}.jpg`
                                });
                                console.log(`✅ Imagen + mensaje enviado a ${contact.name} (${contact.number})`);
                            } else {
                                await this.sock.sendMessage(jid, { text: personalizedMessage });
                                console.log(`✅ Mensaje enviado a ${contact.name} (${contact.number})`);
                            }
                            messageSent = true;
                            
                        } catch (sendError) {
                            retries--;
                            console.log(`❌ Error enviando a ${contact.number} (${retries} intentos restantes):`, sendError.message);
                            
                            if (retries > 0) {
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            } else {
                                throw sendError;
                            }
                        }
                    }
                    
                    results.push({
                        contact: contact.name,
                        number: contact.number,
                        success: true,
                        timestamp: new Date(),
                        sentMessage: personalizedMessage,
                        withImage: hasImage
                    });
                    
                    sentCount++;
                    
                    if (progressCallback) {
                        progressCallback(sentCount, failedCount);
                    }

                    if (i < contacts.length - 1) {
                        await this.intelligentDelay(i, contacts.length);
                    }

                } catch (error) {
                    console.error(`❌ Error enviando a ${contact.name} (${contact.number}):`, error.message);
                    results.push({
                        contact: contact.name,
                        number: contact.number,
                        success: false,
                        error: error.message
                    });
                    
                    failedCount++;
                    
                    if (progressCallback) {
                        progressCallback(sentCount, failedCount);
                    }
                    
                    if (error.message.includes('Connection Closed') || 
                        error.message.includes('desconectado')) {
                        console.error('🚨 Socket WhatsApp cerrado. Deteniendo envío.');
                        break;
                    }
                }
            }

            console.log(`🎯 Envío masivo completado: ${results.filter(r => r.success).length}/${results.length} exitosos`);
            
            console.log('🔒 Programando cierre automático de sesión de WhatsApp...');
            setTimeout(async () => {
                try {
                    console.log('🔐 Cerrando y limpiando sesión de WhatsApp automáticamente...');
                    await this.destroy();
                    await this.clearUserCredentials(this.userId);
                    console.log('✅ Sesión cerrada - Próxima conexión requerirá QR');
                } catch (error) {
                    console.log('⚠️ Error cerrando sesión automática:', error.message);
                }
            }, 5000);

            return results;
            
        } catch (error) {
            console.error('🚨 Error crítico en envío masivo:', error.message);
            throw error;
        } finally {
            this.isSending = false;
            console.log('🔓 Modo envío desactivado');
        }
    }

    async intelligentDelay(currentIndex, totalMessages) {
        let delay;
        
        if ((currentIndex + 1) % 50 === 0) {
            delay = 300000;
        } else if ((currentIndex + 1) % 25 === 0) {
            delay = 120000;
        } else if ((currentIndex + 1) % 10 === 0) {
            delay = 60000;
        } else {
            delay = Math.floor(Math.random() * 7000) + 8000;
        }

        console.log(`⏰ Esperando ${delay/1000} segundos...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async getContacts() {
        if (!this.isReady || !this.sock) {
            throw new Error('WhatsApp no está conectado');
        }

        try {
            const contacts = Object.values(this.sock.store?.contacts || {});
            return contacts.map(contact => ({
                id: contact.id,
                name: contact.name || contact.notify || 'Sin nombre',
                number: contact.id.split('@')[0]
            }));
        } catch (error) {
            console.error('Error al obtener contactos:', error);
            throw error;
        }
    }

    async destroy() {
        try {
            if (this.sock) {
                console.log(`🔌 Cerrando conexión de WhatsApp para usuario ${this.userId || 'default'}...`);
                
                this.isReady = false;
                this.emit('disconnected', 'Manually disconnected');
                
                try {
                    await this.sock.logout();
                    console.log('📤 Logout de WhatsApp exitoso');
                } catch (logoutError) {
                    console.log('⚠️ Logout error (ignorado):', logoutError.message);
                }
                
                this.sock = null;
                console.log('✅ Socket cerrado correctamente');
            }
        } catch (error) {
            console.error('❌ Error al destruir socket:', error.message);
            this.sock = null;
            this.isReady = false;
        }
    }

    getConnectionState() {
        return {
            isReady: this.isReady,
            client: !!this.sock,
            userId: this.userId,
            qrCode: this.qrCode
        };
    }

    clearUserCredentials(userId) {
        return new Promise((resolve) => {
            try {
                const cleanUserId = String(userId || this.userId).replace(/[^a-zA-Z0-9_-]/g, '');
                const sessionPath = path.join(__dirname, '../..', 'baileys_sessions', `session_${cleanUserId}`);
                
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    console.log(`🗑️ Credenciales eliminadas para usuario ${userId || this.userId}`);
                } else {
                    console.log(`ℹ️ No había credenciales para limpiar`);
                }
                
                resolve(true);
            } catch (error) {
                console.error(`❌ Error limpiando credenciales:`, error);
                resolve(false);
            }
        });
    }
}

module.exports = WhatsAppServiceBaileys;