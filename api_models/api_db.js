const Sequelize = require('sequelize');
//const moment = require('moment');
//const bcrypt = require('bcrypt');
const fs = require('fs');
//const path = require('path');
const JednotkyModel = require('../data_models/a_jednotky');
const KonfiguraceModel = require('../data_models/a_konfigurace_test');
const ErrorTblModel = require('../data_models/a_error_log');
const CiselnikKonfiguraceJednotekModel = require('../data_models/a_ciselnik_konfigurace_jednotek');
const PrichoziDataModel = require('../data_models/a_prichozi_data');
const PrichoziDataTestModel = require('../data_models/a_prichozi_data_test');
const NastaveniModel = require('../data_models/a_nastaveni');

const cfg = JSON.parse(fs.readFileSync('./config/config.json'));
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
  dialectOptions: {
        //        useUTC: false, 
        dateStrings: true,
        typeCast: true
  },
  keepDefaultTimezone: true
});

const sourceSequelize = new Sequelize(cfg.db.dbsourcename, cfg.db.user, cfg.db.password, {
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
    dialectOptions: {
        //        useUTC: false, 
        dateStrings: true,
        typeCast: true
    },
    keepDefaultTimezone: true
});

const Jednotky = JednotkyModel(sourceSequelize, Sequelize);
const Nastaveni = NastaveniModel(sourceSequelize, Sequelize);
const CiselnikKonfiguraceJednotek = CiselnikKonfiguraceJednotekModel(sourceSequelize, Sequelize);
const Konfigurace = KonfiguraceModel(sequelize, Sequelize);
const ErrorTbl = ErrorTblModel(sequelize, Sequelize);
const PrichoziData = PrichoziDataModel(sequelize, Sequelize);
const PrichoziDataTest = PrichoziDataTestModel(sequelize, Sequelize);
//hooks



//Lists



//data foreign keys



// export models
module.exports.Nastaveni = Nastaveni;
module.exports.Jednotky = Jednotky;
module.exports.CiselnikKonfiguraceJednotek = CiselnikKonfiguraceJednotek;
module.exports.Konfigurace = Konfigurace;
module.exports.ErrorTbl=ErrorTbl;
module.exports.PrichoziData = PrichoziData;
module.exports.PrichoziDataTest = PrichoziDataTest;

