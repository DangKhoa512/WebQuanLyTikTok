const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('GhostInboxMailbox',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 mailbox_id:{type:DataTypes.STRING(36),allowNull:false},
 owner_username:{type:DataTypes.STRING(100),allowNull:false},
 email:{type:DataTypes.STRING(255),allowNull:false},
 provider_state:{type:DataTypes.JSON,allowNull:false},
 status:{type:DataTypes.ENUM('ACTIVE','EXPIRED'),allowNull:false,defaultValue:'ACTIVE'},
 last_email_time:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true},
 last_message_code:{type:DataTypes.STRING(255),allowNull:true},
 processed_message_codes:{type:DataTypes.JSON,allowNull:false,defaultValue:[]}
},{tableName:'ghostinbox_mailboxes',timestamps:true,createdAt:'created_at',updatedAt:'updated_at',defaultScope:{attributes:{exclude:['provider_state']}},indexes:[{unique:true,name:'uq_ghostinbox_public_id',fields:['mailbox_id']}]});
