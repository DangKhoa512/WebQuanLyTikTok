const router=require('express').Router();
router.get('/',async(req,res,next)=>{try{
 const user=req.authenticatedUser;if(!user)return res.status(401).json({success:false,message:'Unauthorized'});
 res.set('Cache-Control','private, no-store');
 const data=await require('../services/systemHealthService').getSystemHealth(user.username,user.role==='admin');
 return res.json({success:true,data});
}catch(err){next(err);}});
module.exports=router;
