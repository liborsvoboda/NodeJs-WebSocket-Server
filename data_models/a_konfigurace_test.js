module.exports = (sequelize, type) => {
    return sequelize.define('a_konfigurace_test', {
        ID: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true
        },
        KONFIGURACE: {
            type: type.TEXT,
            allowNull: false
        },
        LOCAL_PORT: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false
        },
        CONFIRMED: {
            type: type.INTEGER,
            allowNull: true
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};