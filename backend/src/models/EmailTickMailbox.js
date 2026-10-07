const {DataTypes}=require('sequelize');
const db=require('../config/database');
module.exports=db.define('EmailTickMailbox',{
 id:{type:DataTypes.BIGINT.UNSIGNED,primaryKey:true,autoIncrement:true},
 mailbox_id:{type:DataTypes.STRING(36),allowNull:false},
 owner_username:{type:DataTypes.STRING(100),allowNull:false},
 email:{type:DataTypes.STRING(255),allowNull:false},
 mailbox_code:{type:DataTypes.TEXT,allowNull:false},
 types:{type:DataTypes.JSON,allowNull:false},
 status:{type:DataTypes.ENUM('CREATING','ACTIVE','ERROR','EXPIRED'),allowNull:false,defaultValue:'CREATING'},
 last_email_time:{type:DataTypes.BIGINT.UNSIGNED,allowNull:true},
 last_message_code:{type:DataTypes.STRING(255),allowNull:true},
 processed_message_codes:{type:DataTypes.JSON,allowNull:false,defaultValue:[]},
},{tableName:'emailtick_mailboxes',timestamps:true,createdAt:'created_at',updatedAt:'updated_at',defaultScope:{attributes:{exclude:['mailbox_code']}},indexes:[{unique:true,name:'uq_emailtick_public_id',fields:['mailbox_id']}]});
