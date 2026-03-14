const { Sequelize, DataTypes } = require('sequelize');

// KONFIGURACIJA BAZE 
const sequelize = new Sequelize('wt26', 'root', '', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
});

// DEFINICIJA MODELA 

const Scenario = sequelize.define('Scenario', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, { 
    timestamps: false,
    freezeTableName: true
});

const Line = sequelize.define('Line', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    lineId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    nextLineId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    scenarioId: { type: DataTypes.INTEGER, 
        allowNull: false }
}, { 
    timestamps: false,
    freezeTableName: true,
    indexes: [
        {
            unique: true,
            fields: ['scenarioId', 'lineId']
        }
    ]
});

const Delta = sequelize.define('Delta', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    scenarioId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    type: {
        type: DataTypes.STRING,
        allowNull: false
    },
    lineId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    nextLineId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    oldName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    newName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    timestamp: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, { 
    timestamps: false,
    freezeTableName: true
});

const Checkpoint = sequelize.define('Checkpoint', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    scenarioId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
}, { 
    timestamps: false,
    freezeTableName: true
});

// RELACIJE 

Scenario.hasMany(Line, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Line.belongsTo(Scenario, { foreignKey: 'scenarioId' });

Scenario.hasMany(Delta, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Delta.belongsTo(Scenario, { foreignKey: 'scenarioId' });

Scenario.hasMany(Checkpoint, { foreignKey: 'scenarioId', onDelete: 'CASCADE' });
Checkpoint.belongsTo(Scenario, { foreignKey: 'scenarioId' });

module.exports = {
    sequelize,
    Scenario,
    Line,
    Delta,
    Checkpoint
};
