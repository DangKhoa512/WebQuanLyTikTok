const db=require('../config/database');
const lockName="CONCAT('quanly:cron:',LEFT(SHA2(DATABASE(),256),40))";
const withCronLock=async(work)=>{
 const connection=await db.connectionManager.getConnection({type:'WRITE'});
 const query=sql=>new Promise((resolve,reject)=>connection.query(sql,(err,rows)=>err?reject(err):resolve(rows)));
 let acquired=false;
 try{const rows=await query('SELECT GET_LOCK('+lockName+',0) AS acquired');acquired=Number(rows[0].acquired)===1;
 if(!acquired)return {executed:false};await work(connection);return {executed:true};
 }finally{
 if(acquired)try{await query('SELECT RELEASE_LOCK('+lockName+')');}catch{connection.destroy();}
 await db.connectionManager.releaseConnection(connection);
 }
};
module.exports={withCronLock};
