const net = require('net');
const { execSync } = require("child_process");
const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const { Op } = require("sequelize");
const fastify = require('fastify');
const IndexHints = Sequelize.IndexHints;
const moment = require('moment');
const Ajv = require('ajv');
const fastJson = require('fast-json-stringify');
const decoder = new TextDecoder();
const db = require('./api_models/api_db');
const ZongJi = require('zongji');
const child_process = require("child_process");
const nodemailer = require('nodemailer');

const cfg = JSON.parse(fs.readFileSync(path.join('./config/config.json'), 'utf8'));
//const zongji = new ZongJi(cfg.db.realtime);

const sequelize = new Sequelize(cfg.db.dbname, cfg.db.user, cfg.db.password, {
    host: cfg.db.host,
    dialect: cfg.db.type,
    logging: false,
    operatorsAliases: false,
    pool: {
        max: cfg.db.poolMax,
        min: cfg.db.poolMin,
        acquire: cfg.db.poolAcquire,
        idle: cfg.db.poolIdle
    },
    keepDefaultTimezone: true,
    dialectOptions: {
//        useUTC: false, 
        dateStrings: true,
        typeCast: true
    },
});
var servers = [], sockets = []; 

//clear binary log after restart
sequelize.query(
    'PURGE BINARY LOGS BEFORE NOW() - INTERVAL 5 MINUTE;'
).then(res => {
    return null;
}).catch(err => {
    return null;
});

var transporter = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.secure, // upgrade later with STARTTLS
    auth: {
        user: cfg.smtp.auth.user,
        pass: cfg.smtp.auth.pass
    },
    tls: {
        rejectUnauthorized: cfg.smtp.auth.rejectUnauthorized
    }
});

//SERVER PART
function startServer(port) {
    console.log(getDateNow(), "servers Starting " + new Date(), '\n');

    db.Jednotky.findAll({
        where: {
            PORT: (port != null) ? port : { [Op.ne]: null }, 
            [Op.or]: [
                { NAZEV_JEDNOTKY: { [Op.like]: 'Atrack%' } },
                { NAZEV_JEDNOTKY: { [Op.like]: 'BlackBox%' } },
                { NAZEV_JEDNOTKY: { [Op.like]: 'TopFly%' } },
                { NAZEV_JEDNOTKY: { [Op.like]: 'Looket%' } },
                { NAZEV_JEDNOTKY: { [Op.like]: 'GT06%' } }
            ]
            //,CISLO_JEDNOTKY: 393
        },
        //limit: 10,
        order: [
            ['PORT', 'ASC'],
        ],
        raw: true,
        attributes: ['PORT', 'CISLO_JEDNOTKY', 'NAZEV_JEDNOTKY']
    }).then(jednotky => {
        if (port === null) { jednotky.push({ PORT: cfg.server.controlPort, CISLO_JEDNOTKY: 0 , NAZEV_JEDNOTKY: 'CONFIG' }); }
        var srvStartIndex = (port != null) ? servers.length : 0;

        jednotky.forEach((jednotka, index, arr) => {
            srvIndex = srvStartIndex + index;

            if (cfg.ufwEnable) {
                systemSync("ufw allow " + jednotka.PORT, jednotka.PORT);
            }

            if (cfg.firewallIdEnable) {
                systemSync("firewall-cmd --zone=public --add-port=" + jednotka.PORT + "/tcp", jednotka.PORT);
            }

            servers[srvIndex] = net.createServer();
            servers[srvIndex].maxConnections = cfg.server.maxConnections;
            servers[srvIndex].unitType = (jednotka.NAZEV_JEDNOTKY.indexOf('BlackBox') != -1) ? 'BlackBox' : (jednotka.NAZEV_JEDNOTKY.indexOf('TopFly') != -1) ? 'TopFly' : (jednotka.NAZEV_JEDNOTKY.indexOf('Looket') != -1) ? 'Looket' : (jednotka.NAZEV_JEDNOTKY.indexOf('GT06') != -1) ? 'GT06' : 'Atrack';
            servers[srvIndex].unitPort = jednotka.PORT;
            servers[srvIndex].unitNumber = jednotka.CISLO_JEDNOTKY;
            servers[srvIndex].configInterval = 10;

            servers[srvIndex].on('error', function (error) {
                console.log(getDateNow(), 'Server Error: ' + error, '\n');
            });

            servers[srvIndex].on('listening', function () {
                console.log(getDateNow(), 'Server is listening on port ' + jednotka.PORT, '\n');
            });

            servers[srvIndex].on('close', function () {
                console.log(getDateNow(), 'Server closed ! ', '\n');
                // servers[srvIndex].listen(jednotka.PORT);
            });

            servers[srvIndex].on('connection', function (socket) {
                let uniqueId = parseInt(Math.floor(new Date() / 1000));
                let localPort = socket.localPort;
                let ipAddress = (socket.remoteAddress) ? socket.remoteAddress.split(":").pop() + ":" + socket.remotePort : socket.remoteAddress + ":" + socket.remotePort;

                socket.firstMesaggeSended = false;
                socket.configSended = null;
                socket.customConfigSended = null;
                socket.configLimit = new Date().getTime() + 50000;
                socket.setEncoding('hex');

                socket.setTimeout(cfg.socket.timeout, function () {
                    db.PrichoziData.create({
                        DATA_HEX: '',
                        LOCAL_PORT: localPort,
                        IP: ipAddress,
                        REQUEST: "CLS",
                        BYTES: 0,
                        SOCKET: uniqueId
                    }).then(created => {
                        return null;
                    }).catch(err => {
                        return db.ErrorTbl.create({
                            LOCAL_PORT: localPort,
                            TEXT: err.toString()
                        }).then(errCreated => {
                            return null;
                        }).catch(err => {
                            return null;
                        });
                    });
                });

                servers[srvIndex].getConnections(function (error, count) {
                    console.log(getDateNow(),'open port: ', localPort, ' has open previous sockets count: ', count);

                    // disconnect previous socket connection
                    let founded = [];
                    let BreakException = {};

                    sockets.forEach((eachSocket) => {
                        if (socket.localPort == eachSocket.localPort && founded.indexOf(socket.localPort) != -1) {
                            try {
                                sockets.forEach((socketForClose, sIndex) => {
                                    if (socketForClose.localPort == socket.localPort) {
                                        socketForClose.end();
                                        sockets.splice(sIndex, 1);

                                        console.log(getDateNow(), 'close previous socket : ', socket.localPort, '\n');
                                        throw BreakException;
                                    }
                                });
                            } catch (e) {
                                if (e !== BreakException) throw e;
                            }
                        }

                        if (socket.localPort == eachSocket.localPort && founded.indexOf(socket.localPort) == -1) {
                            founded.push(socket.localPort);
                        }
                    });

                });


                //checkConfigurationCycle
                socket.checkConfigInterval = setInterval(function () {
                    if (socket.configLimit < new Date().getTime() && socket.configSended) {
                        socket.configSended = null;
                    }
                }, 8000);

                socket.setInterval = setInterval(function () {
                    return db.Konfigurace.findOne({
                        where: {
                            LOCAL_PORT: jednotka.PORT,
                            CONFIRMED: 0
                        },
                        order: [
                            ['ID', 'ASC']
                        ],
                        raw: true,
                        attributes: ['ID', 'KONFIGURACE']
                    }).then(foundedUnit => {
                        if (foundedUnit && !socket.configSended) {
                            let resultFunct = new Promise((resolve, reject) => {
                                resolve(checkNewConfig(socket, jednotka.PORT, uniqueId));
                            });
                            resultFunct.then((value) => {
                                socket.configSended = value;
                                socket.configLimit = new Date().getTime() + 60000;
                                //console.log(getDateNow(), "nastavuji cas pro reset socketu", localPort, socket.configSended);
                                return null;
                            });
                        } else {
                            return null;
                        }
                        return null;
                    }).catch(err => {
                       return null;
                    });
                }, socket.server.configInterval * 1000);




                sockets.push(socket);


                if (socket.localPort == cfg.server.controlPort) {
                    let socketBuffer = socket.write('Welcome in Service Socket\n');
                    if (socketBuffer) {
                    } else {
                        socket.pause();
                    }

                }

                //start looket
                if (socket.server['unitType'] == 'Looket' && !socket.firstMesaggeSended) {
                    socket.firstMesaggeSended = true;
                    db.PrichoziData.create({
                        DATA_HEX: '',
                        LOCAL_PORT: localPort,
                        IP: ipAddress,
                        REQUEST: "ANO",
                        BYTES: 0,
                        SOCKET: uniqueId
                    }).then(created => {
                        return null;
                    }).catch(err => {
                        return null;
                    });
                }

                socket.on('data', function (data) {
                    let BreakException = {};

                    console.log(getDateNow(), 'Incoming Data from port: ', localPort, hex2a(data), data, '\n');
                    //console.log("SOCKETDATA:", socket);
                    try {

                        //controlPort Start
                        if (socket.localPort == cfg.server.controlPort) {
                            if (hex2a(data).substring(0, 6) == 'start:' && hex2a(data).split(':').length == 3 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2])) {

                                try {
                                    sockets.forEach((eachSocket, sIndex) => {
                                        if (eachSocket.localPort == hex2a(data).split(':')[2] && eachSocket.server.unitNumber == hex2a(data).split(':')[1]) {
                                            eachSocket.end();
                                            sockets.splice(sIndex, 1);
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }

                                try {
                                    servers.forEach((eachServer, sIndex) => {
                                        if (eachServer.unitNumber == hex2a(data).split(':')[1] && eachServer.unitPort == hex2a(data).split(':')[2]) {
                                            eachServer.close();
                                            servers.splice(sIndex, 1);
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }

                                startServer(hex2a(data).split(':')[2].toString());

                                console.log('Listening on port ' + hex2a(data).split(':')[2].toString() + ' started/restarted', '\n');

                                let socketBuffer = socket.write(' Listening on port ' + hex2a(data).split(':')[2].toString() + ' started/restarted');
                                if (socketBuffer) {
                                } else {
                                    socket.pause();
                                }
                                return null;

                            } else if (hex2a(data).substring(0, 9) == 'showType:' && hex2a(data).split(':').length == 3 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2])) {
                                try {
                                    servers.forEach((eachServer) => {
                                        if (eachServer.unitNumber == hex2a(data).split(':')[1] && eachServer.unitPort == hex2a(data).split(':')[2]) {
                                            console.log('Port Type is: ', eachServer.unitType, '\n');
                                            let socketBuffer = socket.write(' Port Type is: ' + eachServer.unitType);
                                            if (socketBuffer) {
                                            } else {
                                                socket.pause();
                                            }
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }
                                return null;
                            } else if (hex2a(data).substring(0, 17) == 'showSocketStatus:' && hex2a(data).split(':').length == 3 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2])) {
                                try {
                                    sockets.forEach((eachSocket) => {
                                        if (eachSocket.server.unitNumber == hex2a(data).split(':')[1] && eachSocket.server.unitPort == hex2a(data).split(':')[2]) {
                                            console.log('Port Type is: ', eachSocket.readyState, '\n');
                                            let socketBuffer = socket.write(' Socket status is: ' + eachSocket.readyState);
                                            if (socketBuffer) {
                                            } else {
                                                socket.pause();
                                            }
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }
                                return null;
                            } else if (hex2a(data).substring(0, 18) == 'setConfigInterval:' && hex2a(data).split(':').length == 4 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2]) && !isNaN(hex2a(data).split(':')[3])) {
                                try {
                                    servers.forEach((eachServer) => {
                                        if (eachServer.unitNumber == hex2a(data).split(':')[1] && eachServer.unitPort == hex2a(data).split(':')[2]) {
                                            eachServer.configInterval = (hex2a(data).split(':')[3] < 5) ? 5 : (hex2a(data).split(':')[3] > 300) ? 300 : hex2a(data).split(':')[3];
                                            console.log('Config interval was changed ', '\n');
                                            let socketBuffer = socket.write(' Config interval was changed ');
                                            if (socketBuffer) {
                                            } else {
                                                socket.pause();
                                            }
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }

                                try {
                                    sockets.forEach((eachSocket, sIndex) => {
                                        if (eachSocket.localPort == hex2a(data).split(':')[2] && eachSocket.server.unitNumber == hex2a(data).split(':')[1]) {
                                            eachSocket.end();
                                            sockets.splice(sIndex, 1);
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }

                                return null;

                            } else if (hex2a(data).substring(0, 19) == 'showConfigInterval:' && hex2a(data).split(':').length == 3 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2])) {
                                try {
                                    servers.forEach((eachServer) => {
                                        if (eachServer.unitNumber == hex2a(data).split(':')[1] && eachServer.unitPort == hex2a(data).split(':')[2]) {
                                            console.log('Config interval is: ', eachServer.configInterval, '\n');
                                            let socketBuffer = socket.write(' Config interval is: ' + eachServer.configInterval);
                                            if (socketBuffer) {
                                            } else {
                                                socket.pause();
                                            }
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }

                                return null;

                            } else if (hex2a(data).substring(0, 14) == 'server:restart') {
                                sockets.forEach((eachSocket) => {
                                    eachSocket.end();
                                });

                                servers.forEach((eachServer) => {
                                    eachServer.close();
                                });

                                servers = [], sockets = [];
                                startServer(null);

                                console.log('Restarting server', '\n');
                                return null;

                            } else if (hex2a(data).substring(0, 16) == 'server:showPorts') {
                                let portList = [];

                                servers.forEach((eachServer) => {
                                    portList.push(eachServer.unitPort);
                                });

                                console.log('Server listening ports: ', portList, '\n');
                                let socketBuffer = socket.write(' Server listening ports: ' + portList);
                                if (socketBuffer) {
                                } else {
                                    socket.pause();
                                }
                                return null;
                            } else if (hex2a(data).substring(0, 18) == 'server:showSockets') {
                                let socketList = [];

                                sockets.forEach((eachSocket) => {
                                    socketList.push(eachSocket.localPort);
                                });

                                console.log('Server listening ports: ', socketList, '\n');
                                let socketBuffer = socket.write(' Server listening ports: ' + socketList);
                                if (socketBuffer) {
                                } else {
                                    socket.pause();
                                }
                                return null;
                            } else if (hex2a(data).substring(0, 11) == 'showSocket:' && hex2a(data).split(':').length == 3 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2])) {
                                try {
                                    sockets.forEach((eachSocket) => {
                                        if (eachSocket.server.unitNumber == hex2a(data).split(':')[1] && eachSocket.server.unitPort == hex2a(data).split(':')[2]) {
                                            console.log('Socket data are: ', eachSocket, '\n');
                                            let socketBuffer = socket.write(' For show socket data open the logFile: ' + eachSocket + ' https://adm.dispecink.online/logs/ServerLog.html');
                                            if (socketBuffer) {
                                            } else {
                                                socket.pause();
                                            }
                                            throw BreakException;
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }
                                return null;
                            } else if (hex2a(data).substring(0, 12) == 'sendCommand:' && hex2a(data).split(':').length == 5 && !isNaN(hex2a(data).split(':')[1]) && !isNaN(hex2a(data).split(':')[2]) && (hex2a(data).split(':')[3].indexOf('hex') > -1 || hex2a(data).split(':')[3].indexOf('ascii') > -1)) {
                                try {
                                    sockets.forEach((eachSocket) => {
                                        if (eachSocket.server.unitNumber == hex2a(data).split(':')[1] && eachSocket.server.unitPort == hex2a(data).split(':')[2]) {
                                            eachSocket.customConfigSended = (hex2a(data).split(':')[3].indexOf('ascii') > -1) ? hex2a(data).substring(0, 6) : "$" + hex2a(data).split('$').pop().split('=')[0];
                                            let sendCommand = (hex2a(data).split(':')[3].indexOf('ascii') > -1) ? eachSocket.write(new Buffer(hex2a(data).split(':')[4], 'ascii')) : eachSocket.write(new Buffer(a2hex(hex2a(data).split(':')[4]) + "0D0A", 'hex'));
                                            if (sendCommand) {
                                                console.log('Socket command sended.', '\n');
                                                let socketBuffer = socket.write(' Socket command sended.');
                                                if (socketBuffer) {
                                                } else {
                                                    socket.pause();
                                                }
                                                throw BreakException;
                                            } else {
                                                eachSocket.pause();
                                            }
                                        }
                                    });
                                } catch (e) {
                                    if (e !== BreakException) throw e;
                                }
                                return null;
                            } else {
                                socket.destroy();
                            }

                            //    //controlPort End
                        } else {


                            //echo data
                            if (data.substring(0, 4) == "fe02" && socket.server['unitType'] == 'Atrack') { //CONFIRM Communication
                                let is_kernel_buffer_full = socket.write(new Buffer(data.substring(0, 24), 'hex'));
                                if (is_kernel_buffer_full) {
                                    if (!socket.firstMesaggeSended) {
                                        socket.firstMesaggeSended = true;

                                        db.PrichoziData.create({
                                            DATA_HEX: '',
                                            LOCAL_PORT: localPort,
                                            IP: ipAddress,
                                            REQUEST: "ANO",
                                            BYTES: 0,
                                            SOCKET: uniqueId
                                        }).then(created => {
                                            return db.PrichoziData.create({
                                                DATA_HEX: data.substring(0, 24).toUpperCase(),
                                                LOCAL_PORT: localPort,
                                                IP: ipAddress,
                                                REQUEST: "NE",
                                                BYTES: Buffer.byteLength(data + data.substring(0, 24), 'hex'),
                                                SOCKET: uniqueId
                                            }).then(created => {
                                                return null;
                                            }).catch(err => {
                                                return db.ErrorTbl.create({
                                                    LOCAL_PORT: localPort,
                                                    TEXT: "input command: " + data.substring(0, 24).toUpperCase() + ", Error: " + err.message.toString()
                                                }).then(errCreated => {
                                                    return null;
                                                }).catch(err => {
                                                    socket.end("db error");
                                                    return null;
                                                });
                                            });
                                            return null;
                                        }).catch(err => {
                                            return null;
                                        });
                                    } else {
                                        db.PrichoziData.create({
                                            DATA_HEX: data.substring(0, 24).toUpperCase(),
                                            LOCAL_PORT: localPort,
                                            IP: ipAddress,
                                            REQUEST: "NE",
                                            BYTES: Buffer.byteLength(data + data.substring(0, 24), 'hex'),
                                            SOCKET: uniqueId
                                        }).then(created => {
                                            return null;
                                        }).catch(err => {
                                            return db.ErrorTbl.create({
                                                LOCAL_PORT: localPort,
                                                TEXT: "input command: " + data.substring(0, 24).toUpperCase() + ", Error: " + err.message.toString()
                                            }).then(errCreated => {
                                                return null;
                                            }).catch(err => {
                                                socket.end("db error");
                                                return null;
                                            });
                                        });

                                    }
                                    //return null;
                                } else {
                                    socket.pause();
                                }
                                return null;
                            } else if ((data.indexOf("244f4b0d0a") !== -1 || data.substring(0, 10) == "244f4b0d0a") && socket.server['unitType'] == 'Atrack') { //config OK
                                socket.configSended = null;
                                db.Konfigurace.findOne({
                                    where: {
                                        LOCAL_PORT: localPort,
                                        CONFIRMED: 0
                                    },
                                    order: [
                                        ['ID', 'ASC']
                                    ],
                                    attributes: ['ID', 'KONFIGURACE']
                                }).then(config => {
                                    if (config != null) {
                                        db.Konfigurace.update({ CONFIRMED: 1 }, {
                                            where: { ID: config.ID }
                                        }).then(updated => {
                                            return null;
                                        }).catch(err => {
                                            return null;
                                        });
                                    }
                                    return null;
                                }).catch(err => {
                                    return null;
                                });
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });

                            } else if ((data.indexOf("244552524f523d3130320d0a") !== -1 || data.substring(0, 24) == "244552524f523d3130320d0a") && socket.server['unitType'] == 'Atrack') { // BAD config 
                                socket.configSended = null;
                                db.Konfigurace.findOne({
                                    where: {
                                        LOCAL_PORT: localPort,
                                        CONFIRMED: 0
                                    },
                                    order: [
                                        ['ID', 'ASC']
                                    ],
                                    attributes: ['ID', 'KONFIGURACE']
                                }).then(config => {
                                    if (config != null) {
                                        db.Konfigurace.update({ CONFIRMED: 2 }, {
                                            where: { ID: config.ID }
                                        }).then(updated => {
                                            return null;
                                        }).catch(err => {
                                            return null;
                                        });
                                    }
                                    return null;
                                }).catch(err => {
                                    return null;
                                });
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if ((data.substring(0, 4) == "4154" || data.substring(0, 4) == "4050") && socket.server['unitType'] == 'Atrack') { // first connect
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if (data.substring(0, 4) == "2652" && socket.server['unitType'] == 'Atrack') { //DATA communications
                                let prepare = hex2a(data);
                                let answerData = 'FE02' + ('0000000000000000' + decimalToHexString(parseInt(prepare.toString().split(',')[4]))).slice(-16) + ('0000' + decimalToHexString(parseInt(prepare.toString().split(',')[3]))).slice(-4) + "0D0A";
                                let is_kernel_buffer_full = socket.write(new Buffer(answerData, 'hex'));
                                if (is_kernel_buffer_full) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "NE",
                                        BYTES: Buffer.byteLength(data + answerData, 'hex'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                                return null;
                            } else if (hex2a(data).indexOf("connect") != -1 && socket.server['unitType'] == 'BlackBox') {
                                socket.firstMesaggeSended = true;
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "ANO",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if (hex2a(data).substring(0, 4) == "$ACK" && socket.server['unitType'] == 'BlackBox' && socket.firstMesaggeSended) {
                                db.Nastaveni.findOne({
                                    where: {
                                        PARAMETR: 'BB_RFID_VERZE'
                                    },
                                    attributes: ['PARAMETR', 'HODNOTA']
                                }).then(nastaveni => {
                                    if (nastaveni != null) {
                                        let sResponse = socket.write(new Buffer(a2hex(nastaveni.HODNOTA + ":RFIDver") + "0D0A", 'hex'));
                                        if (sResponse) {
                                            return db.PrichoziData.create({
                                                DATA_HEX: data.toString().toUpperCase(),
                                                LOCAL_PORT: localPort,
                                                IP: ipAddress,
                                                REQUEST: "NE",
                                                BYTES: Buffer.byteLength(data, 'hex'),
                                                SOCKET: uniqueId
                                            }).then(created => {
                                                return null;
                                            }).catch(err => {
                                                return db.ErrorTbl.create({
                                                    LOCAL_PORT: localPort,
                                                    TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                                }).then(errCreated => {
                                                    return null;
                                                }).catch(err => {
                                                    socket.end("db error");
                                                    return null;
                                                });
                                            });
                                        } else {
                                            socket.pause();
                                        }
                                        return null;
                                    }
                                }).catch(err => {
                                    return null;
                                });
                            } else if ((hex2a(data).substring(0, 3) == "$B," || hex2a(data).substring(0, 5) == "ERROR") && socket.server['unitType'] == 'BlackBox' && socket.firstMesaggeSended) {
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if (hex2a(data).substring(0, 3) == "$A," && socket.server['unitType'] == 'BlackBox' && socket.firstMesaggeSended) {
                                socket.configSended = null;
                                db.Konfigurace.findOne({
                                    where: {
                                        LOCAL_PORT: localPort,
                                        CONFIRMED: 0
                                    },
                                    order: [
                                        ['ID', 'ASC']
                                    ],
                                    attributes: ['ID', 'KONFIGURACE']
                                }).then(config => {
                                    if (config != null) {
                                        db.Konfigurace.update({ CONFIRMED: 1 }, {
                                            where: { ID: config.ID }
                                        }).then(updated => {
                                            return null;
                                        }).catch(err => {
                                            return null;
                                        });
                                    }
                                    return null;
                                }).catch(err => {
                                    return null;
                                });
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });

                            } else if (data.substring(0, 6) == "232301" && socket.server['unitType'] == 'TopFly') {
                                console.log(getDateNow(), localPort, 'TopFly connect incomming:', data, '\n');
                                socket.firstMesaggeSended = true;

                                let sendMessage = socket.write(new Buffer("232301000F0001" + data.substring(14, 30), 'hex'));
                                console.log(getDateNow(), localPort, 'TopFly connect answer:', "232301000F0001" + data.substring(14, 30), '\n');

                                if (sendMessage) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "ANO",
                                        BYTES: Buffer.byteLength(data, 'hex'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                            } else if (data.substring(0, 6) == "232302" && socket.server['unitType'] == 'TopFly' && socket.firstMesaggeSended) {
                                console.log(getDateNow(), localPort, 'TopFly communication 02 incomming:', data, '\n');
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if (data.substring(0, 6) == "232303" && socket.server['unitType'] == 'TopFly' && socket.firstMesaggeSended) {
                                console.log(getDateNow(), localPort, 'TopFly communication 03 incomming:', data, '\n');

                                let sendMessage = socket.write(new Buffer("232303000F0001" + data.substring(14, 30), 'hex'));
                                console.log(getDateNow(), 'TopFly communication answer:', "232303000F0001" + data.substring(14, 30), '\n');

                                if (sendMessage) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "NE",
                                        BYTES: Buffer.byteLength(data, 'hex'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                            } else if (data.substring(0, 6) == "232304" && socket.server['unitType'] == 'TopFly' && socket.firstMesaggeSended) {
                                console.log(getDateNow(), localPort, 'TopFly alert incomming:', data, '\n');

                                let sendMessage = socket.write(new Buffer("23230400100001" + data.substring(14, 30) + data.substring(74, 76), 'hex'));
                                console.log(getDateNow(), localPort, 'TopFly alert answer:', "23230400100001" + data.substring(14, 30) + data.substring(74, 76), '\n');

                                if (sendMessage) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "NE",
                                        BYTES: Buffer.byteLength(data, 'hex'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                            } else if ((hex2a(data).substring(0, 7) == "&REPORT" || hex2a(data).substring(0, 7) == "$REPORT") && socket.server['unitType'] == 'Looket' && socket.firstMesaggeSended) {
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });

                            } else if (hex2a(data).substring(13, 17) == "BP05" && socket.server['unitType'] == 'GT06') {
                                let is_kernel_buffer_full = socket.write(new Buffer(hex2a(data).substring(0, 13) + "AP05)", 'ascii'));
                                if (is_kernel_buffer_full) {
                                    if (!socket.firstMesaggeSended) {
                                        socket.firstMesaggeSended = true;

                                        db.PrichoziData.create({
                                            DATA_HEX: '',
                                            LOCAL_PORT: localPort,
                                            IP: ipAddress,
                                            REQUEST: "ANO",
                                            BYTES: 0,
                                            SOCKET: uniqueId
                                        }).then(created => {
                                            return db.PrichoziData.create({
                                                DATA_HEX: data.toUpperCase(),
                                                LOCAL_PORT: localPort,
                                                IP: ipAddress,
                                                REQUEST: "NE",
                                                BYTES: Buffer.byteLength(data, 'ascii'),
                                                SOCKET: uniqueId
                                            }).then(created => {
                                                return null;
                                            }).catch(err => {
                                                return db.ErrorTbl.create({
                                                    LOCAL_PORT: localPort,
                                                    TEXT: "input command: " + data.toUpperCase() + ", Error: " + err.message.toString()
                                                }).then(errCreated => {
                                                    return null;
                                                }).catch(err => {
                                                    socket.end("db error");
                                                    return null;
                                                });
                                            });
                                            return null;
                                        }).catch(err => {
                                            return null;
                                        });
                                    } else {
                                        db.PrichoziData.create({
                                            DATA_HEX: data.toUpperCase(),
                                            LOCAL_PORT: localPort,
                                            IP: ipAddress,
                                            REQUEST: "NE",
                                            BYTES: Buffer.byteLength(data, 'ascii'),
                                            SOCKET: uniqueId
                                        }).then(created => {
                                            return null;
                                        }).catch(err => {
                                            return db.ErrorTbl.create({
                                                LOCAL_PORT: localPort,
                                                TEXT: "input command: " + data.toUpperCase() + ", Error: " + err.message.toString()
                                            }).then(errCreated => {
                                                return null;
                                            }).catch(err => {
                                                socket.end("db error");
                                                return null;
                                            });
                                        });

                                    }
                                } else {
                                    socket.pause();
                                }
                            } else if (hex2a(data).substring(13, 17) == "BP00" && socket.server['unitType'] == 'GT06' && socket.firstMesaggeSended) {
                                let sendMessage = socket.write(new Buffer(hex2a(data).substring(0, 13) + "AP01HSO)", 'ascii'));
                                if (sendMessage) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "NE",
                                        BYTES: Buffer.byteLength(data, 'ascii'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                            } else if (hex2a(data).substring(13, 17) == "BO01" && socket.server['unitType'] == 'GT06' && socket.firstMesaggeSended) {
                                console.log(getDateNow(), "alarm odpoved", hex2a(data).substring(0, 13) + "AS01" + hex2a(data).substring(17, 18) + ")");
                                let sendMessage = socket.write(new Buffer(hex2a(data).substring(0, 13) + "AS01" + hex2a(data).substring(17, 18) + ")", 'ascii'));

                                if (sendMessage) {
                                    return db.PrichoziData.create({
                                        DATA_HEX: data.toString().toUpperCase(),
                                        LOCAL_PORT: localPort,
                                        IP: ipAddress,
                                        REQUEST: "NE",
                                        BYTES: Buffer.byteLength(data, 'ascii'),
                                        SOCKET: uniqueId
                                    }).then(created => {
                                        return null;
                                    }).catch(err => {
                                        return db.ErrorTbl.create({
                                            LOCAL_PORT: localPort,
                                            TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                        }).then(errCreated => {
                                            return null;
                                        }).catch(err => {
                                            socket.end("db error");
                                            return null;
                                        });
                                    });
                                } else {
                                    socket.pause();
                                }
                            } else if (hex2a(data).substring(0, 1) == "(" && hex2a(data).substring(hex2a(data).length - 1, hex2a(data).length) == ")" && socket.server['unitType'] == 'GT06' && socket.firstMesaggeSended) {
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'ascii'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            } else if (
                                (hex2a(data).indexOf('474554202F20485454502F312E31') > -1
                                    || hex2a(data).indexOf('E0000000000043') > -1)
                                ) { // not save and disconnect
                                socket.end('Incorrect incomming data without saving');
                            } else { // incorrect data format disconnect (or allowed config answers)
                                //console.log("neznama data:", data, socket.configSended, hex2a(data).indexOf(socket.configSended) );
                                return db.PrichoziData.create({
                                    DATA_HEX: data.toString().toUpperCase(),
                                    LOCAL_PORT: localPort,
                                    IP: ipAddress,
                                    REQUEST: "NE",
                                    BYTES: Buffer.byteLength(data, 'hex'),
                                    SOCKET: uniqueId
                                }).then(created => {
                                    //console.log(getDateNow(), "vyhodnocuji", socket.configSended,socket.customConfigSended );
                                    if (
                                        (
                                            hex2a(data).indexOf('$ERROR') == -1
                                            && hex2a(data).indexOf('@P') == -1
                                            && hex2a(data).indexOf(socket.configSended) == -1
                                            && hex2a(data).indexOf(socket.customConfigSended) == -1
                                        )
                                        || (socket.configSended == null && socket.customConfigSended == null)) {
                                        socket.end('Incorrect incomming data');
                                    }

                                    if (hex2a(data).indexOf(socket.configSended) !== -1 || hex2a(data).indexOf('@P') !== -1) {
                                        db.Konfigurace.findOne({
                                            where: {
                                                LOCAL_PORT: localPort,
                                                CONFIRMED: 0
                                            },
                                            order: [
                                                ['ID', 'ASC']
                                            ],
                                            attributes: ['ID', 'KONFIGURACE']
                                        }).then(config => {
                                            return db.Konfigurace.update({ CONFIRMED: 1 }, {
                                                where: { ID: config.ID }
                                            }).then(updated => {
                                                return null;
                                            }).catch(err => {
                                                return null;
                                            });
                                        }).catch(err => {
                                            return null;
                                        });
                                    }

                                    if (hex2a(data).indexOf('$ERROR') !== -1) {
                                        db.Konfigurace.findOne({
                                            where: {
                                                LOCAL_PORT: localPort,
                                                CONFIRMED: 0
                                            },
                                            order: [
                                                ['ID', 'ASC']
                                            ],
                                            attributes: ['ID', 'KONFIGURACE']
                                        }).then(config => {
                                            return db.Konfigurace.update({ CONFIRMED: 2 }, {
                                                where: { ID: config.ID }
                                            }).then(updated => {
                                                return null;
                                            }).catch(err => {
                                                return null;
                                            });
                                        }).catch(err => {
                                            return null;
                                        });

                                    }
                                    socket.configSended = null;
                                    socket.customConfigSended == null;
                                    return null;
                                }).catch(err => {
                                    return db.ErrorTbl.create({
                                        LOCAL_PORT: localPort,
                                        TEXT: "input command: " + data.toString().toUpperCase() + ", Error: " + err.message.toString()
                                    }).then(errCreated => {
                                        return null;
                                    }).catch(err => {
                                        socket.end("db error");
                                        return null;
                                    });
                                });
                            }
                        }
                    } catch (e) {
                        if (e !== BreakException) throw e;
                    }
                });



                socket.on('drain', function () {
                    console.log(getDateNow(), 'write buffer is empty now .. u can resume the writable stream', '\n');
                    socket.resume();
                });

                socket.on('error', function (error) {
                    let BreakException = {}; // cleaning empty sockets
                    try {
                        sockets.forEach((eachSocket, sIndex) => {
                            if (eachSocket.localPort == undefined) {
                                sockets.splice(sIndex, 1);
                                throw BreakException;
                            }
                        });
                    } catch (e) {
                        //console.log("chyba zavreni socketu:", socket.localPort, e);
                        if (e !== BreakException) throw e;
                    }
                    try {
                        socket.destroy();
                        socket.unref();
                    } catch (e) {
                        //console.log("chyba zavreni socketu:", socket.localPort, e);
                        if (e !== BreakException) throw e;
                    }

                    console.log(getDateNow(), localPort, 'Socket Error : ' + error, '\n');

                });

                socket.on('timeout', function () {
                    console.log(getDateNow(), localPort, 'Socket timed out !', '\n');
                    socket.end('Timed out!');
                });

                socket.on('end', function () {
                    console.log(getDateNow(), 'Socket on port: ' + localPort + ' ended!', '\n');
                    return db.PrichoziData.create({
                        DATA_HEX: '',
                        LOCAL_PORT: localPort,
                        IP: ipAddress,
                        REQUEST: "CLS",
                        BYTES: 0,
                        SOCKET: uniqueId
                    }).then(created => {
                        return null;
                    }).catch(err => {
                        return null;
                    });
                });

                socket.on('close', function (error) {

                    let BreakException = {}; // cleaning empty sockets
                    try {
                        sockets.forEach((eachSocket, sIndex) => {
                            if (eachSocket.localPort == undefined) {
                                sockets.splice(sIndex, 1);
                                throw BreakException;
                            }
                        });
                    } catch (e) {
                        //console.log("chyba zavreni socketu:", socket.localPort, e);
                        if (e !== BreakException) throw e;
                    }

                    socket.destroy();
                    socket.unref();
                  
                    console.log(getDateNow(), localPort,'Socket closed!', '\n');
                    if (error) {
                        console.log(getDateNow(), 'Socket was closed coz of transmission error', '\n');
                    }
                });

            });

            servers[srvIndex].listen(jednotka.PORT);
            servers[srvIndex].timeout = 0;

            // Update reseting after server start 
            if (jednotka.PORT != cfg.server.controlPort ) {
                return db.Jednotky.update({ RESET_PORT: 1 }, {
                    where: {
                        CISLO_JEDNOTKY: jednotka.CISLO_JEDNOTKY,
                        RESET_PORT: 0
                    }
                }).then(eachjednotka => {
                    if (eachjednotka[0] > 0) {
                        console.log(getDateNow(),'Server on port: ' + jednotka.PORT + ' Started/Restarted! ');
                        
                    }
                    return null;
                }).catch(err => {
                    console.log(getDateNow(),'Server on port: ' + jednotka.PORT + ' cannot be Started/Restarted! ', err);
                    return null;
                });
            }

            if (index == arr.length - 1) {
                setTimeout(function () {
                //    startZongji();
                    console.log(getDateNow(), 'All Servers started', '\n');
                    automaticUnitRestart();
                    console.log(getDateNow(), "Automatic unit restart started", "\n");
                    sendMail("Dispečink Server " + cfg.address + " byl restartován");
                }, 3000);
            }
        });
        return null;
    }).catch(err => {
        console.log(getDateNow(), "Server Start Error", err, '\n');
        return null;
    });
}

startServer(null);


// automatic Unit Reset 1 minute cycle
async function automaticUnitRestart() {
    setInterval(function () {
       console.log(getDateNow(), "Checking automatic unit restart", "\n");
       return db.Jednotky.findAll({
            where: {
                PORT: { [Op.ne]: null }, 
                [Op.or]: [
                    { NAZEV_JEDNOTKY: { [Op.like]: 'Atrack%' } },
                    { NAZEV_JEDNOTKY: { [Op.like]: 'BlackBox%' } },
                    { NAZEV_JEDNOTKY: { [Op.like]: 'TopFly%' } },
                    { NAZEV_JEDNOTKY: { [Op.like]: 'Looket%' } },
                    { NAZEV_JEDNOTKY: { [Op.like]: 'GT06' } }
                ],
                RESET_PORT: 0
            },
            raw: true,
            attributes: ['CISLO_JEDNOTKY', 'PORT']
        }).then(foundedUnits => {
            if (foundedUnits.length > 0) {
                let BreakException = {};
                foundedUnits.forEach((foundedUnit) => {
                    console.log(getDateNow(),"founded unit for restart: ", foundedUnit.PORT, "\n");
                    try {
                        sockets.forEach((eachSocket, sIndex) => {
                            if (eachSocket.localPort == foundedUnit.PORT && eachSocket.server.unitNumber == foundedUnit.CISLO_JEDNOTKY) {
                                eachSocket.end();
                                sockets.splice(sIndex, 1);
                                throw BreakException;
                            }
                        });
                    } catch (e) {
                        if (e !== BreakException) throw e;
                    }

                    try {
                        servers.forEach((eachServer, sIndex) => {
                            if (eachServer.unitNumber == foundedUnit.CISLO_JEDNOTKY && eachServer.unitPort == foundedUnit.PORT) {
                                eachServer.close();
                                servers.splice(sIndex, 1);
                                throw BreakException;
                            }
                        });
                    } catch (e) {
                        if (e !== BreakException) throw e;
                    }
                    startServer(foundedUnit.PORT);
                });
            }
            return null;
        }).catch(err => {
            return null;
        });
    }, 60000);
}

// ZONGJI PART
//function hasChanges(database, table, updates) {
//    for (var i = 0; i < updates.length; i++) {
//        if (table === 'a_konfigurace_test' && updates[i].changes.indexOf('CONFIRMED') > -1 && updates[i].row['CONFIRMED'] == 0) {
//            sockets.forEach((socket) => {
//                if (socket.server._connectionKey.split(':').pop() == updates[i].row['LOCAL_PORT']) {
//                    setTimeout(function (row) {
//                        console.log("send detected changed configuration:", table, row.LOCAL_PORT, row.KONFIGURACE, a2hex(row.KONFIGURACE) + "0D0A");

//                        let is_kernel_buffer_full = socket.write(new Buffer(a2hex(row.KONFIGURACE) + "0D0A", 'hex'));
//                        if (is_kernel_buffer_full) {
//                            //db.Konfigurace.update({ CONFIRMED: true }, {
//                            //    where: { ID: row.ID }
//                            //}).then(updated => {

//                            //});
//                        } else {
//                            socket.pause();
//                        }
//                    }.bind(this, updates[i].row), 1000);
//                }
//            });
//        } else if (table === 'a_jednotky') {
//            if (updates[i].row['AKTIVNI'] == 1 && updates[i].changes.indexOf('PORT') > -1) {
//                console.log("a_jednotky change detected =>", table, updates[i].row['PORT']);

//                for (var srvI = 0; srvI < servers.length; srvI++) {
//                    if (servers[srvI] != undefined) {
//                        if (servers[srvI]._connectionKey.split(':').pop() == updates[i].beforeRow['PORT']) {
//                            console.log('Server on port: ' + updates[i].beforeRow['PORT'] + ' closing ! ');
//                            servers[srvI].close();
//                        }
//                    }
//                }
//                sockets.forEach((socket) => {
//                    if (socket.server._connectionKey.split(':').pop() == updates[i].beforeRow['PORT']) {
//                        socket.end();
//                    }
//                });
//                startServer(updates[i].row['PORT']);
//            }
//        }
//    }

//}

//function updatedRows(database, table, rows) {
//    var updates = rows.map(function (row) {
//        var changed = [];
//        for (var val in row['before']) {
//            if (row['before'][val] !== row['after'][val]) {
//                changed.push(val);
//            }
//        }
//        return { changes: changed, beforeRow: row['before'], row: row['after'] };
//    });
//    hasChanges(database, table, updates);
//}

//function writtenRows(database, table, rows) {
//    for (var i = 0; i < rows.length; i++) {
//        if (table === 'a_konfigurace_test') {
//            sockets.forEach((socket) => {
//                if (socket.server._connectionKey.split(':').pop() == rows[i]['LOCAL_PORT'] && rows[i]['CONFIRMED'] == 0) {
//                    setTimeout(function (row) {
//                        console.log("written detected =>", table, row.LOCAL_PORT, row.KONFIGURACE, a2hex(row.KONFIGURACE) + "0D0A");

//                        let is_kernel_buffer_full = socket.write(new Buffer(a2hex(row.KONFIGURACE) + "0D0A", 'hex'));
//                        if (is_kernel_buffer_full) {
//                            //db.Konfigurace.update({ CONFIRMED: true }, {
//                            //    where: { ID: row.ID }
//                            //}).then(updated => {

//                            //});
//                        } else {
//                            socket.pause();
//                        }
//                    }.bind(this, rows[i]), 1000);
//                }
//            });
//        } else if (table === 'a_jednotky') {
//            console.log("written detected =>", table, rows[i]['PORT']);

//            startServer(rows[i]['PORT']);
//        }
//    }
//}

//




function checkNewConfig(socket, port, socketId) {
    //send configuration every minute
    let waitForResult = null;
    return new Promise((resolve, reject) => {
        if (socket.readyState == "open") {
            return db.Konfigurace.findOne({
                where: {
                    LOCAL_PORT: port,
                    CONFIRMED: 0
                },
                order: [
                    ['ID', 'ASC']
                ],
                attributes: ['ID', 'KONFIGURACE']
            }).then(config => {
                if (config != null) {
                    console.log(getDateNow(), "send ", socket.server.configInterval, "(sec) cycle configuration:", port, config.KONFIGURACE, a2hex(config.KONFIGURACE) + "0D0A", new Buffer(a2hex(config.KONFIGURACE) + "0D0A", 'hex'), '\n');

                    waitForResult = (socket.server.unitType == 'Looket') ? config.KONFIGURACE.substring(0, 6) : "$" + config.KONFIGURACE.split('$').pop().split('=')[0];
                    return db.PrichoziData.create({
                        DATA_HEX: a2hex(config.KONFIGURACE) + ((socket.server.unitType != 'Looket') ? "0D0A" : ""),
                        LOCAL_PORT: port,
                        IP: ((socket.remoteAddress) ? socket.remoteAddress.split(":").pop() : 0) + ":" + socket.remotePort,
                        REQUEST: "SND",
                        BYTES: Buffer.byteLength(a2hex(config.KONFIGURACE) + ((socket.server.unitType != 'Looket') ? "0D0A" : "")),
                        SOCKET: socketId
                    }).then(created => {
                        let configData = (socket.server.unitType == 'Looket') ? socket.write(new Buffer(config.KONFIGURACE, 'ascii')) : socket.write(new Buffer(a2hex(config.KONFIGURACE) + "0D0A", 'hex'));
                        if (configData) {
                            if (config.KONFIGURACE.indexOf('QPOS') !== -1 || config.KONFIGURACE.indexOf('GPOS') !== -1 || config.KONFIGURACE.indexOf('DLOG') !== -1) {
                               return db.Konfigurace.update({ CONFIRMED: 1 }, {
                                    where: { ID: config.ID }
                                }).then(updated => {
                                    resolve(waitForResult);
                                }).catch(err => {
                                    resolve(waitForResult);
                                });
                            } else {
                                resolve(waitForResult);
                            }
                        } else {
                            socket.pause();
                        }
                        return null;
                    }).catch(err => {
                       return db.ErrorTbl.create({
                            LOCAL_PORT: localPort,
                            TEXT: "input command: " + a2hex(config.KONFIGURACE) + "0D0A, Error: "+ err.toString()
                       }).then(errCreated => {
                            resolve(null);
                       }).catch(err => {
                            resolve(null);
                        });
                    });
                } else {
                    resolve(waitForResult);
                }
            }).catch(err => {
                console.log(getDateNow(),err);
                resolve(waitForResult);
            });
        } else {
            resolve(waitForResult);
        }
    });
}

//function startZongji() {
//    console.log("zongjiStart");

//    // Binlog must be started, optionally pass in filters
//    zongji.start({
//        serverId: cfg.db.realtime.serverId,
//        startAtEnd: true,
//        includeEvents: ['tablemap', 'writerows', 'updaterows', 'deleterows'],
//        excludeEvents: ['query','xid', 'format', 'rotate', 'intvar', 'unknown'],
//        includeSchema: {
//            'BlackBox_IN': ['a_konfigurace_test'],
//            'BlackBox': ['a_jednotky']
//        },
//        excludeSchema: {
//            'BlackBox_IN': ['a_prichozi_data','a_prichozi_data_test']
//        }
//    });

//    // Each change to the replication log results in an event
//    zongji.on('binlog', function (evt) {
//        if (evt.getEventName() === 'updaterows') {
//            return updatedRows(evt.tableMap[evt.tableId]['parentSchema'], evt.tableMap[evt.tableId]['tableName'], evt.rows);
//        } else if (evt.getEventName() === 'writerows') {
//            return writtenRows(evt.tableMap[evt.tableId]['parentSchema'], evt.tableMap[evt.tableId]['tableName'], evt.rows);
//        }
//    });

//    zongji.on('error', function (err) {
//      //  startZongji();
//    });

//    process.on('SIGINT', function () {
//        console.log('Got SIGINT.');
//        zongji.stop();
//        process.exit();
//    });

//    console.log("zongji Started");
//}




//FUNCTIONS
function a2hex(str) {
    var arr = [];
    for (var i = 0, l = str.length; i < l; i++) {
        var hex = Number(str.charCodeAt(i)).toString(16);
        arr.push(hex);
    }
    return arr.join('');
}

function decimalToHexString(number) {
    if (number < 0) {
        number = 0xFFFFFFFF + number + 1;
    }
    return number.toString(16).toUpperCase();
}

function hex2a(hexx) {
    var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
}

function systemSync(cmd, port) {
    child_process.exec(cmd, (err, stdout, stderr) => {
        //console.log('stdout is:' + stdout)
        console.log('firevall port ' + port + ' result is: ' + stderr, '\n')
        //console.log('error is:' + err)
    }).on('exit', code => console.log('firewall result', code, '\n'))
}

function restartPM() {
    child_process.exec("pm2 restart 1", (err, stdout, stderr) => {
        //console.log('stdout is:' + stdout)
        console.log('pm2 was restarted\n')
        //console.log('error is:' + err)
    }).on('exit', code => console.log(code))
}

function getDateNow() {
    let today = new Date();
    let date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
    let dateTime = date + ' ' + time;
    return dateTime;
}

function sendMail(text) {
    let BreakException = {};
    try { 
        if (cfg.smtp.mailingEnabled) {
            let info = transporter.sendMail({
                from: 'mail', // sender address
                to: 'mail;mail', // list of receivers
                //to: 'libor.svoboda@kliknetezde.cz;mirek@black-box.info;', // list of receivers
                subject: "Server", // Subject line
                html: text
            });
        }
    } catch (e) {
        if (e !== BreakException) throw e;
    }
}

