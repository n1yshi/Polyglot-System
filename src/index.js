const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cluster = require('cluster');
const os = require('os');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const winston = require('winston');
const cron = require('node-cron');
const { performance } = require('perf_hooks');

const DatabaseManager = require('./database/manager');
const CacheManager = require('./cache/redis-manager');
const MessageQueue = require('./messaging/kafka-producer');
const GraphQLServer = require('./graphql/server');
const GRPCServer = require('./grpc/server');
const WebRTCManager = require('./webrtc/manager');
const MLPipeline = require('./ml/pipeline');
const BlockchainManager = require('./blockchain/manager');
const SecurityManager = require('./security/manager');
const MetricsCollector = require('./monitoring/metrics');
const LoadBalancer = require('./network/load-balancer');

let nativeModule;
try {
    nativeModule = require('../build/Release/native_module');
} catch (error) {
    console.warn('Native C++ module not available:', error.message);
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

class PolyglotSystem {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });
        this.dbManager = new DatabaseManager();
        this.cacheManager = new CacheManager();
        this.messageQueue = new MessageQueue();
        this.mlPipeline = new MLPipeline();
        this.blockchainManager = new BlockchainManager();
        this.securityManager = new SecurityManager();
        this.metricsCollector = new MetricsCollector();
        this.loadBalancer = new LoadBalancer();
        this.activeConnections = new Map();
        this.processPool = new Map();
        this.taskQueue = [];
        this.isProcessing = false;
    }

    async initialize() {
        await this.setupMiddleware();
        await this.setupRoutes();
        await this.setupWebSocket();
        await this.setupCronJobs();
        await this.initializeServices();
        await this.startGraphQLServer();
        await this.startGRPCServer();
        this.setupClusterManagement();
    }

    async setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(compression());
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        this.app.use(this.securityManager.authenticate);
        this.app.use(this.metricsCollector.middleware);
    }

    async setupRoutes() {
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            });
        });

        this.app.post('/compute/matrix', async (req, res) => {
            try {
                const { matrix1, matrix2, operation } = req.body;
                const startTime = performance.now();
                
                let result;
                if (nativeModule) {
                    result = nativeModule.matrixOperation(matrix1, matrix2, operation);
                } else {
                    result = await this.fallbackMatrixOperation(matrix1, matrix2, operation);
                }
                
                const endTime = performance.now();
                res.json({
                    result,
                    executionTime: endTime - startTime,
                    method: nativeModule ? 'native' : 'fallback'
                });
            } catch (error) {
                logger.error('Matrix computation error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/ml/predict', async (req, res) => {
            try {
                const { model, data } = req.body;
                const prediction = await this.mlPipeline.predict(model, data);
                res.json({ prediction });
            } catch (error) {
                logger.error('ML prediction error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/crypto/hash', async (req, res) => {
            try {
                const { data, algorithm } = req.body;
                let hash;
                
                if (nativeModule) {
                    hash = nativeModule.cryptoHash(data, algorithm);
                } else {
                    hash = await this.executePythonScript('crypto_hash.py', [data, algorithm]);
                }
                
                res.json({ hash });
            } catch (error) {
                logger.error('Crypto hash error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/rust/fibonacci', async (req, res) => {
            try {
                const { n } = req.body;
                const result = await this.executeRustFunction('fibonacci', n);
                res.json({ result });
            } catch (error) {
                logger.error('Rust fibonacci error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/go/concurrent', async (req, res) => {
            try {
                const { tasks } = req.body;
                const result = await this.executeGoFunction('concurrent_process', tasks);
                res.json({ result });
            } catch (error) {
                logger.error('Go concurrent error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/wasm/math', async (req, res) => {
            try {
                const { operation, params } = req.body;
                const result = await this.executeWasmFunction(operation, params);
                res.json({ result });
            } catch (error) {
                logger.error('WASM math error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/blockchain/transaction', async (req, res) => {
            try {
                const { from, to, amount } = req.body;
                const transaction = await this.blockchainManager.createTransaction(from, to, amount);
                res.json({ transaction });
            } catch (error) {
                logger.error('Blockchain transaction error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/metrics', async (req, res) => {
            const metrics = await this.metricsCollector.getMetrics();
            res.json(metrics);
        });
    }

    async setupWebSocket() {
        this.wss.on('connection', (ws, req) => {
            const connectionId = this.generateConnectionId();
            this.activeConnections.set(connectionId, ws);
            
            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    ws.send(JSON.stringify({ error: error.message }));
                }
            });

            ws.on('close', () => {
                this.activeConnections.delete(connectionId);
            });

            ws.send(JSON.stringify({
                type: 'connection',
                connectionId,
                timestamp: new Date().toISOString()
            }));
        });
    }

    async handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'compute':
                const result = await this.processComputeTask(data.payload);
                ws.send(JSON.stringify({ type: 'result', data: result }));
                break;
            case 'stream':
                await this.startDataStream(ws, data.payload);
                break;
            case 'ml_train':
                await this.mlPipeline.trainModel(data.payload);
                ws.send(JSON.stringify({ type: 'training_complete' }));
                break;
            default:
                ws.send(JSON.stringify({ error: 'Unknown message type' }));
        }
    }

    async setupCronJobs() {
        cron.schedule('*/5 * * * *', async () => {
            await this.performHealthCheck();
        });

        cron.schedule('0 0 * * *', async () => {
            await this.performDailyMaintenance();
        });

        cron.schedule('*/1 * * * *', async () => {
            await this.processTaskQueue();
        });
    }

    async initializeServices() {
        await this.dbManager.initialize();
        await this.cacheManager.initialize();
        await this.messageQueue.initialize();
        await this.mlPipeline.initialize();
        await this.blockchainManager.initialize();
        await this.loadBalancer.initialize();
    }

    async startGraphQLServer() {
        const graphqlServer = new GraphQLServer();
        await graphqlServer.start(this.app);
    }

    async startGRPCServer() {
        const grpcServer = new GRPCServer();
        await grpcServer.start();
    }

    setupClusterManagement() {
        if (cluster.isMaster) {
            const numCPUs = os.cpus().length;
            for (let i = 0; i < numCPUs; i++) {
                cluster.fork();
            }

            cluster.on('exit', (worker, code, signal) => {
                logger.warn(`Worker ${worker.process.pid} died`);
                cluster.fork();
            });
        }
    }

    async executePythonScript(script, args) {
        return new Promise((resolve, reject) => {
            const pythonProcess = spawn('python3', [`python-module/${script}`, ...args]);
            let output = '';
            let error = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(JSON.parse(output));
                } else {
                    reject(new Error(error));
                }
            });
        });
    }

    async executeRustFunction(functionName, ...args) {
        return new Promise((resolve, reject) => {
            const rustProcess = spawn('./rust-module/target/release/rust_module', [functionName, ...args]);
            let output = '';
            let error = '';

            rustProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            rustProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            rustProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(JSON.parse(output));
                } else {
                    reject(new Error(error));
                }
            });
        });
    }

    async executeGoFunction(functionName, args) {
        return new Promise((resolve, reject) => {
            const goProcess = spawn('./go-module/go-module', [functionName, JSON.stringify(args)]);
            let output = '';
            let error = '';

            goProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            goProcess.stderr.on('data', (data) => {
                error += data.toString();
            });

            goProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(JSON.parse(output));
                } else {
                    reject(new Error(error));
                }
            });
        });
    }

    async executeWasmFunction(operation, params) {
        const wasmModule = require('../build/math.js');
        await wasmModule.ready;
        
        switch (operation) {
            case 'fibonacci':
                return wasmModule._fibonacci(params.n);
            case 'prime_check':
                return wasmModule._prime_check(params.number);
            default:
                throw new Error('Unknown WASM operation');
        }
    }

    async processComputeTask(task) {
        const startTime = performance.now();
        let result;

        switch (task.type) {
            case 'matrix_multiply':
                result = nativeModule ? 
                    nativeModule.matrixMultiply(task.matrix1, task.matrix2) :
                    await this.fallbackMatrixMultiply(task.matrix1, task.matrix2);
                break;
            case 'neural_network':
                result = await this.mlPipeline.runInference(task.model, task.input);
                break;
            case 'image_processing':
                result = nativeModule ?
                    nativeModule.processImage(task.imageData, task.operations) :
                    await this.executePythonScript('image_processor.py', [task.imageData, JSON.stringify(task.operations)]);
                break;
            default:
                throw new Error('Unknown compute task type');
        }

        const endTime = performance.now();
        return {
            result,
            executionTime: endTime - startTime,
            timestamp: new Date().toISOString()
        };
    }

    async startDataStream(ws, config) {
        const interval = setInterval(async () => {
            try {
                const data = await this.generateStreamData(config);
                ws.send(JSON.stringify({
                    type: 'stream_data',
                    data,
                    timestamp: new Date().toISOString()
                }));
            } catch (error) {
                clearInterval(interval);
                ws.send(JSON.stringify({ error: error.message }));
            }
        }, config.interval || 1000);

        ws.on('close', () => {
            clearInterval(interval);
        });
    }

    async generateStreamData(config) {
        switch (config.type) {
            case 'metrics':
                return await this.metricsCollector.getCurrentMetrics();
            case 'blockchain':
                return await this.blockchainManager.getLatestBlocks(10);
            case 'ml_predictions':
                return await this.mlPipeline.getBatchPredictions(config.model, config.batchSize);
            default:
                return { random: Math.random(), timestamp: Date.now() };
        }
    }

    async performHealthCheck() {
        const health = {
            timestamp: new Date().toISOString(),
            services: {
                database: await this.dbManager.healthCheck(),
                cache: await this.cacheManager.healthCheck(),
                messageQueue: await this.messageQueue.healthCheck(),
                blockchain: await this.blockchainManager.healthCheck()
            },
            system: {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                uptime: process.uptime()
            }
        };

        logger.info('Health check completed', health);
        return health;
    }

    async performDailyMaintenance() {
        logger.info('Starting daily maintenance');
        
        await this.dbManager.cleanup();
        await this.cacheManager.cleanup();
        await this.mlPipeline.cleanup();
        await this.blockchainManager.cleanup();
        
        logger.info('Daily maintenance completed');
    }

    async processTaskQueue() {
        if (this.isProcessing || this.taskQueue.length === 0) return;
        
        this.isProcessing = true;
        
        while (this.taskQueue.length > 0) {
            const task = this.taskQueue.shift();
            try {
                await this.executeTask(task);
            } catch (error) {
                logger.error('Task execution error:', error);
            }
        }
        
        this.isProcessing = false;
    }

    async executeTask(task) {
        switch (task.type) {
            case 'ml_training':
                await this.mlPipeline.trainModel(task.config);
                break;
            case 'blockchain_mining':
                await this.blockchainManager.mineBlock(task.transactions);
                break;
            case 'data_processing':
                await this.processLargeDataset(task.dataset);
                break;
            default:
                logger.warn('Unknown task type:', task.type);
        }
    }

    generateConnectionId() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    async fallbackMatrixOperation(matrix1, matrix2, operation) {
        return await this.executePythonScript('matrix_operations.py', [JSON.stringify(matrix1), JSON.stringify(matrix2), operation]);
    }

    async fallbackMatrixMultiply(matrix1, matrix2) {
        return await this.executePythonScript('matrix_operations.py', [JSON.stringify(matrix1), JSON.stringify(matrix2), 'multiply']);
    }

    async start(port = 3000) {
        await this.initialize();
        
        this.server.listen(port, () => {
            logger.info(`Polyglot System started on port ${port}`);
            logger.info(`Process ID: ${process.pid}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    }
}

if (require.main === module) {
    const system = new PolyglotSystem();
    system.start(process.env.PORT || 3000).catch(error => {
        logger.error('Failed to start system:', error);
        process.exit(1);
    });
}

module.exports = PolyglotSystem;