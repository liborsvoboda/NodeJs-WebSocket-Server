module.exports = (sequelize, type) => {
    return sequelize.define('a_error_log', {
        LOCAL_PORT: {
            type: type.INTEGER.UNSIGNED,
            allowNull: false
        },
        TEXT: {
            type: type.TEXT,
            allowNull: false
        }
    }, {
        freezeTableName: true,
        timestamps: false
    });
};