const {offlineTimeoutSeconds,capacity,defaultPageSize,maxPageSize}=require('../config/devices');
const classifyDevice=(device,now=Date.now())=>{
 const seen=device.last_seen ? new Date(device.last_seen).getTime() : NaN;
 if(!Number.isFinite(seen)||now-seen>offlineTimeoutSeconds*1000)return 'OFFLINE';
 return device.active_task || device.reported_status==='RUNNING' ? 'RUNNING' : 'IDLE';
};
const paginateDevices=(rows,query={})=>{
 const status=String(query.device_status||'ALL').toUpperCase();
 const task=String(query.device_task||'ALL');
 const search=String(query.device_search||'').trim().toLowerCase();
 const filtered=rows.filter(row=>(status==='ALL'||row.status===status)&&(task==='ALL'||row.current_task===task)&&(!search||[row.device_id,row.device_name,row.current_uid,row.current_task,row.owner_username].join(' ').toLowerCase().includes(search)));
 const size=[20,50,maxPageSize].includes(Number(query.page_size))?Number(query.page_size):defaultPageSize;
 const pages=Math.max(1,Math.ceil(filtered.length/size));
 const page=Math.min(pages,Math.max(1,parseInt(query.page,10)||1));
 return {rows:filtered.slice((page-1)*size,page*size),capacity,page,page_size:size,page_count:pages,filtered_total:filtered.length,total:rows.length,offline_timeout_seconds:offlineTimeoutSeconds,task_options:[...new Set(rows.map(row=>row.current_task).filter(Boolean))].sort()};
};
module.exports={classifyDevice,paginateDevices};
