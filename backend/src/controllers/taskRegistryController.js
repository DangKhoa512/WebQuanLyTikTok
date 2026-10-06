const {createRegistryService,failure}=require('../services/taskRegistryService');
const db=require('../config/database');
const service=createRegistryService(db);
const {ownerFromAdmin}=require('../utils/owner');
const {success}=require('../utils/response');
const wrap=fn=>async(req,res,next)=>{try{return success(res,await fn(req),'OK');}catch(err){if(err.statusCode)return res.status(err.statusCode).json({success:false,message:err.message});next(err);}};
const authenticate=async(req,res,next)=>{try{const user=await service.identity(ownerFromAdmin(req));if(!user)return res.status(401).json({success:false,message:'Phiên người dùng không hợp lệ'});req.taskUser=user;next();}catch(err){next(err);}};
const admin=(req,res,next)=>req.taskUser?.role==='admin'?next():res.status(403).json({success:false,message:'Chỉ admin được quản lý loại tác vụ hệ thống'});
const list=wrap(async req=>{if(!await service.activated())return{ready:false,tasks:[],message:'Migration Task Registry chưa được áp dụng'};return{ready:true,tasks:await service.list(req.taskUser.username)};});
const create=wrap(async req=>({task:await service.create(req.body)}));
const update=wrap(async req=>({task:await service.update(Number(req.params.id),req.body)}));
const archive=wrap(async req=>{await service.archive(Number(req.params.id));return{archived:true};});
const mine=wrap(async req=>{
 await service.saveMine(req.taskUser.username,req.body.tasks);
 return{tasks:await service.list(req.taskUser.username)};
});
module.exports={authenticate,admin,list,create,update,archive,mine};
