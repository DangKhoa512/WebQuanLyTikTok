import {useEffect,useState} from 'react';
import {systemHealthApi} from '../services/api';
export default function SystemHealthPanel(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{let disposed=false,busy=false;
 const load=async()=>{if(busy)return;busy=true;try{const r=await systemHealthApi.get();if(!disposed){setData(r.data);setError('');}}catch(e){if(!disposed)setError(e.message);}finally{busy=false;}};
 load();const timer=setInterval(load,15000);return()=>{disposed=true;clearInterval(timer);};},[refresh]);
 const status=v=>v==='NOT_CONFIGURED'?'Không sử dụng':v==='ADMIN_ONLY'?'Chỉ admin xem':v;
 return <section role="tabpanel" id="platform-panel-health" aria-labelledby="platform-tab-health" aria-label="System Health">
 <h2>System Health</h2><p>Số thiết bị và task thuộc tài khoản đang đăng nhập. Cập nhật mỗi 15 giây.</p>
 <button className="settings-button secondary" onClick={()=>setRefresh(v=>v+1)}>Làm mới</button>
 {error&&<p role="alert">{error}{data && " · Đang hiển thị lần kiểm tra thành công gần nhất."}</p>}{!data&&!error&&<p aria-busy="true">Đang kiểm tra...</p>}
 {data&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginTop:16}}>
 {['backend','database','redis','queue','websocket','cron'].map(key=><article className="settings-card" key={key} style={{padding:16}}><strong>{key.toUpperCase()}</strong><p>{status(data[key]?.status)}</p></article>)}
 </div><dl><dt>Thiết bị online / offline</dt><dd>{data.devices?data.devices.online+' / '+data.devices.offline:'Chưa có dữ liệu'}</dd>
 <dt>Task đang chạy / task thất bại trong lịch sử</dt><dd>{data.tasks?data.tasks.running+' / '+data.tasks.failed_history:'Chưa có dữ liệu'}</dd>
 <dt>Cron thành công gần nhất</dt><dd>{data.cron.last_success_at?new Date(data.cron.last_success_at).toLocaleString():'Chưa có dữ liệu hoặc không có quyền'}</dd>
 <dt>API trung bình (5 phút, toàn backend, admin)</dt><dd>{data.api.average_latency_ms==null?'Chưa có dữ liệu hoặc không có quyền':data.api.average_latency_ms.toFixed(1)+' ms'}</dd></dl>
 {data.alerts.map(a=><p role="alert" key={a.code}>{a.message}{a.count?' ('+a.count+')':''}</p>)}
 {!data.alerts.length&&<p>Chưa ghi nhận cảnh báo trong phạm vi kiểm tra này.</p>}
 <small>Cập nhật: {new Date(data.generated_at).toLocaleString()}</small></>}
 </section>;
}
