module.exports = (sequelize, type) => {
    return sequelize.define('a_prichozi_data', {
        ID: {
            type: type.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        DATA_HEX: {
            type: type.TEXT,
            allowNull: false
        },
        LOCAL_PORT: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false
        },
        IP: {
            type: type.STRING(25),
            allowNull: false
        },
        REQUEST: {
            type: type.STRING(3),
            allowNull: false
        },
        BYTES: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false
        },
        SOCKET: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};