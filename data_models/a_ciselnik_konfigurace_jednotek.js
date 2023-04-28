module.exports = (sequelize, type) => {
    return sequelize.define('a_ciselnik_konfigurace_jednotek', {
        KONFIGURACE: {
            type: type.STRING(255),
            primaryKey: true,
            allowNull: false
        },
        PROTOKOL: {
            type: type.STRING(20),
            allowNull: true
        },
        VZOR: {
            type: type.STRING(255),
            allowNull: true
        },
        ODPOVED: {
            type: type.STRING(20),
            allowNull: true
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};