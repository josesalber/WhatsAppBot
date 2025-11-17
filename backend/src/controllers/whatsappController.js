const path = require('path');
const fs = require('fs');
const WhatsAppBot = require('../services/WhatsAppServiceBaileys');
const Usuario = require('../models/Usuario');

class WhatsAppController {
    constructor() {
        // Manejar múltiples instancias por usuario
        this.userInstances = new Map(); // userId -> { bot, qrCode, isReady, qrCheckInterval }
        // Manejar progreso de envíos masivos por usuario
        this.sendingProgress = new Map(); // userId -> { total, sent, failed, inProgress, startTime }
    }

    // Obtener o crear instancia para un usuario específico
    getUserInstance(userId) {
        if (!this.userInstances.has(userId)) {
            this.userInstances.set(userId, {
                bot: null,
                qrCode: null,
                isReady: false,
                isConnecting: false, // Nuevo estado para spinner
                qrCheckInterval: null,
                lastLoggedState: null
            });
        }
        return this.userInstances.get(userId);
    }

    // Limpiar instancia de usuario
    clearUserInstance(userId) {
        const instance = this.userInstances.get(userId);
        if (instance) {
            if (instance.qrCheckInterval) {
                clearInterval(instance.qrCheckInterval);
            }
            this.userInstances.delete(userId);
        }
    }

    // Inicializar bot de WhatsApp
    initializeBot = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const instance = this.getUserInstance(userId);
            console.log(`🚀 Iniciando conexión WhatsApp para usuario ${userId}...`);
            
            // Marcar como conectando para el spinner
            instance.isConnecting = true;
            instance.isReady = false;
            instance.qrCode = null;

            if (instance.bot) {
                console.log(`Destruyendo bot existente para usuario ${userId}...`);
                await instance.bot.destroy();
                instance.bot = null;
            }

            console.log(`Inicializando sesión de WhatsApp para usuario ${userId}...`);
            
            // Crear instancia única para este usuario
            instance.bot = new WhatsAppBot(userId);
            
            // Event listeners optimizados
            instance.bot.on('qr', (qr) => {
                console.log(`📱 QR Code generado para usuario ${userId} - listo para escanear`);
                instance.qrCode = qr;
                instance.isConnecting = false; // Termina carga, ahora tiene QR
                instance.isReady = false;
            });

            instance.bot.on('ready', () => {
                console.log(`✅ WhatsApp conectado y listo para usuario ${userId}!`);
                instance.isReady = true;
                instance.isConnecting = false;
                instance.qrCode = null;
            });
            
            // 🔄 Detectar cuando el QR se procesa (usuario escaneó)
            instance.bot.on('qr_scanned', () => {
                console.log(`🔄 QR escaneado para usuario ${userId} - conectando dispositivo...`);
                instance.qrCode = null;        // QR ya no es necesario
                instance.isConnecting = true;  // Mostrar spinner de "conectando"
                instance.isReady = false;      // Aún no está listo
            });

            instance.bot.on('disconnected', (reason) => {
                console.log(`❌ WhatsApp desconectado para usuario ${userId}:`, reason);
                instance.isReady = false;
                instance.isConnecting = false;
                instance.qrCode = null;
            });

            instance.bot.on('auth_failure', (msg) => {
                console.error(`🚨 Fallo de autenticación WhatsApp para usuario ${userId}:`, msg);
                instance.isReady = false;
                instance.isConnecting = false;
                instance.qrCode = null;
            });

            // Inicializar la conexión
            await instance.bot.initialize();

            res.json({ 
                success: true, 
                message: 'Conectando a WhatsApp...',
                isConnecting: true,
                status: 'connecting'
            });

        } catch (error) {
            console.error('Error al inicializar bot:', error);
            res.status(500).json({ error: 'Error al inicializar WhatsApp' });
        }
    };

    // Obtener estado del bot
    getStatus = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const instance = this.getUserInstance(userId);
            
            // Verificar estado real del bot
            let actualReady = instance.isReady;
            
            if (instance.bot && instance.bot.client) {
                try {
                    // Verificar si el cliente realmente está listo
                    const state = await instance.bot.client.getState();
                    actualReady = (state === 'CONNECTED');
                    
                    // Sincronizar estado si hay diferencia
                    if (actualReady !== instance.isReady) {
                        console.log(`🔄 Sincronizando estado para usuario ${userId}: ${instance.isReady} -> ${actualReady}`);
                        instance.isReady = actualReady;
                        
                        // IMPORTANTE: También sincronizar el estado del servicio
                        instance.bot.isReady = actualReady;
                        
                        if (actualReady) {
                            instance.qrCode = null;
                        }
                    }
                } catch (stateError) {
                    console.log(`⚠️ No se pudo verificar estado del cliente para usuario ${userId}:`, stateError.message);
                }
            }

            const status = {
                success: true,
                isReady: instance.isReady,
                isConnecting: instance.isConnecting, // Nuevo campo para spinner
                hasQR: !!instance.qrCode,
                qrCode: instance.qrCode,
                botExists: !!instance.bot,
                userId: userId,
                status: instance.isConnecting ? 'connecting' : 
                       instance.isReady ? 'ready' : 
                       !!instance.qrCode ? 'waiting_scan' : 'disconnected',
                timestamp: new Date().toISOString()
            };

            // Log solo si hay cambios significativos
            const currentState = `ready:${instance.isReady}, qr:${!!instance.qrCode}, connecting:${instance.isConnecting}`;
            if (instance.lastLoggedState !== currentState) {
                console.log(`📊 Estado WhatsApp usuario ${userId}: ${currentState}, bot:${!!instance.bot}`);
                instance.lastLoggedState = currentState;
            }

            res.json(status);
        } catch (error) {
            console.error('Error al obtener estado:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    // Enviar mensajes masivos
    sendBulkMessages = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const userName = req.usuario.nombre;
            const instance = this.getUserInstance(userId);
            
            console.log(`📤 Usuario ${userName} (ID: ${userId}) iniciando envío masivo...`);
            console.log(`📊 Sesiones activas: ${this.userInstances.size} usuarios independientes`);
            
            // Verificación básica
            if (!instance.isReady || !instance.bot) {
                return res.status(400).json({ error: 'WhatsApp no está conectado para este usuario' });
            }

            // Verificación adicional del estado del servicio
            if (!instance.bot.isReady) {
                console.log(`⚠️ Detectada desincronización de estado para usuario ${userId}, intentando sincronizar...`);
                
                // Intentar sincronizar estado
                try {
                    if (instance.bot.client) {
                        const state = await instance.bot.client.getState();
                        if (state === 'CONNECTED') {
                            instance.bot.isReady = true;
                            instance.isReady = true;
                            console.log(`✅ Estado sincronizado exitosamente para usuario ${userId}`);
                        } else {
                            return res.status(400).json({ error: `WhatsApp no está conectado (estado: ${state})` });
                        }
                    } else {
                        return res.status(400).json({ error: 'Cliente WhatsApp no disponible' });
                    }
                } catch (syncError) {
                    console.error(`❌ Error sincronizando estado para usuario ${userId}:`, syncError);
                    return res.status(400).json({ error: 'Error verificando estado de WhatsApp' });
                }
            }

            const { contacts, message, imageBase64 } = req.body;
            
            if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
                return res.status(400).json({ error: 'Lista de contactos requerida' });
            }

            if (!message) {
                return res.status(400).json({ error: 'Mensaje requerido' });
            }

            // Validar imagen si está presente
            if (imageBase64) {
                try {
                    // Validar formato base64
                    const base64Match = imageBase64.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/);
                    if (!base64Match) {
                        return res.status(400).json({ error: 'Formato de imagen inválido' });
                    }
                    
                    // Calcular tamaño aproximado
                    const sizeInBytes = Math.round((imageBase64.length * 3) / 4);
                    const sizeInKB = Math.round(sizeInBytes / 1024);
                    
                    console.log(`🖼️ Imagen detectada para envío masivo (usuario ${userId}): ${base64Match[1].toUpperCase()}, ~${sizeInKB}KB`);
                    
                    // Validar tamaño máximo (5MB después de base64)
                    if (sizeInBytes > 5 * 1024 * 1024) {
                        return res.status(400).json({ error: 'Imagen demasiado grande (máximo 5MB)' });
                    }
                } catch (error) {
                    console.error('Error validando imagen:', error);
                    return res.status(400).json({ error: 'Error al validar la imagen' });
                }
            }

            // Verificar límite diario
            const limite = await Usuario.getLimiteDiario(req.usuario.id);
            
            if (limite.enviados_hoy + contacts.length > limite.limite_diario) {
                return res.status(400).json({ 
                    error: `Límite diario excedido. Puedes enviar ${limite.restantes} mensajes más hoy.`,
                    limite
                });
            }

            // Procesar contactos
            const processedContacts = contacts.map(contact => {
                if (typeof contact === 'string') {
                    // Si es solo un número
                    return {
                        number: contact.replace(/\D/g, ''), // Solo números
                        name: 'Sin nombre'
                    };
                } else {
                    // Si es un objeto con name y number
                    return {
                        number: contact.number.replace(/\D/g, ''),
                        name: contact.name || 'Sin nombre'
                    };
                }
            });

            // Responder inmediatamente al frontend que el envío ha comenzado
            res.json({
                success: true,
                message: `Envío masivo iniciado. ${processedContacts.length} mensajes se están enviando en segundo plano${imageBase64 ? ' con imagen 🖼️' : ''}.`,
                totalToSend: processedContacts.length,
                userId: userId,
                userName: userName,
                backgroundProcess: true,
                withImage: !!imageBase64
            });

            // Ejecutar el envío en segundo plano para que no se cancele
            this.processBulkMessagesBackground(userId, userName, processedContacts, message, instance, imageBase64);

        } catch (error) {
            console.error('Error al iniciar envío masivo:', error);
            res.status(500).json({ error: 'Error al iniciar envío masivo' });
        }
    };

    // Nuevo método para procesar mensajes en segundo plano
    processBulkMessagesBackground = async (userId, userName, processedContacts, message, instance, imageBase64 = null) => {
        try {
            console.log(`🚀 Iniciando envío de ${processedContacts.length} mensajes para usuario ${userName} (ID: ${userId}) en segundo plano${imageBase64 ? ' con imagen 🖼️' : ''}`);
            
            // Inicializar progreso
            this.sendingProgress.set(userId, {
                total: processedContacts.length,
                sent: 0,
                failed: 0,
                inProgress: true,
                startTime: Date.now()
            });
            
            const results = await instance.bot.sendBulkMessages(
                processedContacts, 
                message, 
                imageBase64,
                // Callback para actualizar progreso en tiempo real
                (sent, failed) => {
                    const progress = this.sendingProgress.get(userId);
                    if (progress) {
                        progress.sent = sent;
                        progress.failed = failed;
                        console.log(`📊 Progreso [Usuario ${userId}]: ${sent + failed}/${progress.total} (${sent} ✅, ${failed} ❌)`);
                    }
                }
            );

            // Registrar envíos en la base de datos
            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const contact = processedContacts[i];
                
                await Usuario.registrarEnvio(
                    userId,
                    contact.number,
                    result.sentMessage || message, // Usar el mensaje personalizado si está disponible
                    result.success
                );
            }

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            console.log(`✅ Envío completado para usuario ${userName} (ID: ${userId}): ${successCount} exitosos, ${failCount} fallidos`);
            console.log(`📊 Detalles del envío - Total: ${processedContacts.length}, Exitosos: ${successCount}, Fallidos: ${failCount}`);
            
            // Marcar como completado
            const progress = this.sendingProgress.get(userId);
            if (progress) {
                progress.inProgress = false;
                progress.sent = successCount;
                progress.failed = failCount;
            }

        } catch (error) {
            console.error(`❌ Error en envío masivo para usuario ${userName} (ID: ${userId}):`, error);
            
            // Marcar como error
            const progress = this.sendingProgress.get(userId);
            if (progress) {
                progress.inProgress = false;
            }
        }
    };

    // Desconectar bot
    disconnect = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const instance = this.getUserInstance(userId);
            
            console.log(`🔒 Cerrando sesión WhatsApp para usuario ${userId} manualmente...`);
            
            if (instance.qrCheckInterval) {
                clearInterval(instance.qrCheckInterval);
                instance.qrCheckInterval = null;
            }
            
            if (instance.bot) {
                await instance.bot.destroy();
                instance.bot = null;
                instance.isReady = false;
                instance.qrCode = null;
                console.log(`✅ Sesión WhatsApp cerrada para usuario ${userId}`);
            }

            // Limpiar la instancia del usuario
            this.clearUserInstance(userId);

            res.json({ 
                success: true, 
                message: `Sesión de WhatsApp cerrada para usuario ${userId}`,
                userId: userId
            });

        } catch (error) {
            console.error(`❌ Error al desconectar bot para usuario ${req.usuario?.id}:`, error);
            res.status(500).json({ error: 'Error al desconectar WhatsApp' });
        }
    };

    // Forzar nueva sesión (elimina credenciales guardadas)
    forceNewSession = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const instance = this.getUserInstance(userId);
            
            console.log(`🔄 Forzando nueva sesión para usuario ${userId}...`);
            
            // Limpiar sesión existente
            if (instance.qrCheckInterval) {
                clearInterval(instance.qrCheckInterval);
                instance.qrCheckInterval = null;
            }
            
            if (instance.bot) {
                await instance.bot.destroy();
                instance.bot = null;
                instance.isReady = false;
                instance.qrCode = null;
            }

            // Eliminar directorio de credenciales guardadas
            const cleanUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '');
            const sessionPath = path.join(__dirname, '../..', 'baileys_sessions', `session_${cleanUserId}`);
            
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`🗑️ Credenciales eliminadas para usuario ${userId}`);
            }

            // Limpiar la instancia del usuario
            this.clearUserInstance(userId);

            res.json({ 
                success: true, 
                message: `Sesión limpia para usuario ${userId}. Inicie WhatsApp nuevamente para generar QR fresco.`,
                userId: userId
            });

        } catch (error) {
            console.error(`❌ Error al forzar nueva sesión para usuario ${req.usuario?.id}:`, error);
            res.status(500).json({ error: 'Error al limpiar sesión de WhatsApp' });
        }
    };

    // Obtener historial de envíos
    getHistorial = async (req, res) => {
        try {
            const { page = 1, limit = 50, fecha } = req.query;
            const offset = (page - 1) * limit;

            console.log(`📅 getHistorial - Parámetros recibidos: page=${page}, limit=${limit}, fecha=${fecha}`);

            // Query de debug para ver todas las fechas del usuario
            if (fecha) {
                try {
                    const pool = await require('../models/database').getConnection();
                    const debugResult = await pool.request()
                        .input('usuarioId', require('mssql').Int, req.usuario.id)
                        .query(`
                            SELECT 
                                CONVERT(date, fecha_envio) as fecha_solo,
                                COUNT(*) as cantidad,
                                MIN(fecha_envio) as primera_hora,
                                MAX(fecha_envio) as ultima_hora
                            FROM envios_historicos 
                            WHERE usuario_id = @usuarioId 
                            GROUP BY CONVERT(date, fecha_envio)
                            ORDER BY fecha_solo DESC
                        `);
                    console.log('📊 DEBUG - Fechas en BD por día:', debugResult.recordset);
                } catch (debugError) {
                    console.log('❌ Error en debug query:', debugError);
                }
            }

            const historial = await Usuario.getHistorialEnvios(req.usuario.id, limit, offset, fecha);

            console.log(`📊 getHistorial - Resultados: ${historial.records.length} registros, total: ${historial.total}`);

            res.json({
                success: true,
                historial: historial.records,
                total: historial.total,
                page: parseInt(page),
                totalPages: Math.ceil(historial.total / limit)
            });

        } catch (error) {
            console.error('Error al obtener historial:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    // Debug endpoint para diagnosticar problemas de conexión
    getDebugInfo = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const instance = this.getUserInstance(userId);
            
            let clientState = null;
            let serviceState = null;
            
            if (instance.bot) {
                serviceState = instance.bot.getConnectionState();
                
                if (instance.bot.client) {
                    try {
                        const state = await instance.bot.client.getState();
                        clientState = {
                            state: state,
                            info: instance.bot.client.info || null
                        };
                    } catch (error) {
                        clientState = { error: error.message };
                    }
                }
            }

            const debugInfo = {
                userId: userId,
                controllerState: {
                    isReady: instance.isReady,
                    hasQR: !!instance.qrCode,
                    botExists: !!instance.bot
                },
                serviceState: serviceState,
                clientState: clientState,
                synchronization: {
                    controller_ready: instance.isReady,
                    service_ready: instance.bot ? instance.bot.isReady : null,
                    in_sync: instance.bot ? (instance.isReady === instance.bot.isReady) : false
                },
                totalInstances: this.userInstances.size,
                timestamp: new Date().toISOString()
            };

            console.log(`🔍 Debug info solicitado para usuario ${userId}:`, JSON.stringify(debugInfo, null, 2));

            res.json({
                success: true,
                debug: debugInfo
            });

        } catch (error) {
            console.error('Error al obtener debug info:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    // Nuevo método: Listar sesiones activas (para verificar independencia)
    getActiveSessions = async (req, res) => {
        try {
            const currentUserId = req.usuario.id;
            const sessions = [];
            
            console.log(`📋 Listando sesiones activas (solicitado por usuario ${currentUserId})`);
            
            for (const [userId, instance] of this.userInstances.entries()) {
                // Solo mostrar información básica por seguridad
                sessions.push({
                    userId: userId,
                    isCurrentUser: userId === currentUserId,
                    isReady: instance.isReady,
                    hasBot: !!instance.bot,
                    hasQR: !!instance.qrCode,
                    lastActivity: new Date().toISOString()
                });
            }
            
            console.log(`📊 Total de sesiones activas: ${sessions.length}`);
            
            res.json({
                success: true,
                currentUserId: currentUserId,
                totalSessions: sessions.length,
                sessions: sessions,
                message: `${sessions.length} sesiones independientes activas`
            });
            
        } catch (error) {
            console.error('Error al listar sesiones:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };

    // Nuevo método: Obtener progreso de envío en tiempo real
    getSendingProgress = async (req, res) => {
        try {
            const userId = req.usuario.id;
            const progress = this.sendingProgress.get(userId);
            
            if (!progress) {
                return res.json({
                    success: true,
                    inProgress: false,
                    message: 'No hay envío en progreso'
                });
            }
            
            // Calcular porcentaje
            const percentage = progress.total > 0 
                ? Math.round((progress.sent + progress.failed) / progress.total * 100)
                : 0;
            
            // Calcular tiempo transcurrido
            const elapsed = Date.now() - progress.startTime;
            const elapsedSeconds = Math.round(elapsed / 1000);
            
            // Estimar tiempo restante
            const messagesProcessed = progress.sent + progress.failed;
            const avgTimePerMessage = messagesProcessed > 0 ? elapsed / messagesProcessed : 0;
            const messagesRemaining = progress.total - messagesProcessed;
            const estimatedTimeRemaining = Math.round(avgTimePerMessage * messagesRemaining / 1000);
            
            res.json({
                success: true,
                inProgress: progress.inProgress,
                total: progress.total,
                sent: progress.sent,
                failed: progress.failed,
                current: progress.sent + progress.failed,
                percentage: percentage,
                elapsedSeconds: elapsedSeconds,
                estimatedSecondsRemaining: estimatedTimeRemaining
            });
            
        } catch (error) {
            console.error('Error al obtener progreso:', error);
            res.status(500).json({ error: 'Error interno del servidor' });
        }
    };
}

module.exports = new WhatsAppController();
