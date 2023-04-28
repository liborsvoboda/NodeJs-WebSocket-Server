module.exports = (sequelize, type) => {
    return sequelize.define('a_nastaveni', {
        PARAMETR: {
            type: type.STRING(50),
            allowNull: false
        },
        HODNOTA: {
            type: type.STRING(255),
            allowNull: false
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};