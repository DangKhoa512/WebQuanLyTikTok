// Legacy device acquisition endpoints enforce the same user task settings as next-task.
// Reports/releases remain available for in-flight work after self-disable or global disable.
const {ownerFromRequest}=require('../utils/owner');
const {createRegistryService}=require('../services/taskRegistryService');
const db=require('../config/database');
const guardTaskAcquire=(taskKey,handler)=>async(req,res,next)=>{
 try{
  const effective=await createRegistryService(db).effective(ownerFromRequest(req));
  if(effective!==null && !effective[taskKey]?.enabled)return res.status(403).json({success:false,code:-1,message:'Tác vụ đã tắt trong cấu hình cá nhân hoặc hệ thống'});
  return await handler(req,res,next);
 }catch(err){next(err);}
};
module.exports=guardTaskAcquire;
