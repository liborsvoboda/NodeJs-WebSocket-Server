module.exports = (sequelize, type) => {
    return sequelize.define('a_jednotky', {
        CISLO_JEDNOTKY: {
            type: type.INTEGER.UNSIGNED,
            allowNull: true,
            autoIncrement: true,
            primaryKey: true
        },
        PORT: {
            type: type.INTEGER.UNSIGNED,
            allowNull: true
        },
        AKTIVNI: {
            type: type.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        NAZEV_JEDNOTKY: {
            type: type.STRING(20),
            allowNull: false
        },
        RESET_PORT: {
            type: type.INTEGER,
            allowNull: false
        },
        PRIPOJENO: {
            type: type.BOOLEAN,
            allowNull: false,
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};