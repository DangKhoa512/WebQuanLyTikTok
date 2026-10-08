const {DataTypes}=require('sequelize');
const db=require('../config/database');
// Active warnings only; device/task history stays in the existing tables.
module.exports=db.define('DeviceHealth',{
 id:{type:DataTypes.INTEGER.UNSIGNED,primaryKey:true,autoIncrement:true},
 owner_username:{type:DataTypes.STRING(100),allowNull:false},
 device_id:{type:DataTypes.STRING(255),allowNull:false},
 status:{type:DataTypes.STRING(20),allowNull:false,defaultValue:'OFFLINE'},
 alert_code:{type:DataTypes.STRING(50),allowNull:false,defaultValue:'DEVICE_UNRESPONSIVE'},
 last_seen:{type:DataTypes.DATE,allowNull:false},
 unresponsive_since:{type:DataTypes.DATE,allowNull:false},
 detected_at:{type:DataTypes.DATE,allowNull:false},
},{tableName:'device_health',timestamps:false,indexes:[{unique:true,name:'uq_device_health_owner',fields:['owner_username','device_id']}]});
