const APP_URL='https://testing-webapp.aiwebcourse.workers.dev';
let tabId=null, timer=null;
const $=id=>document.getElementById(id);

init();
async function init(){
  const tabs=await chrome.tabs.query({active:true,currentWindow:true}); tabId=tabs[0]?.id;
  await loadMembers(); await refresh(); timer=setInterval(refresh,900);
}
async function loadMembers(){
  try{const r=await fetch(APP_URL+'/api/bootstrap');const d=await r.json();$('assignee').innerHTML='<option value="">Unassigned</option>'+(d.members||[]).filter(m=>m.role==='developer').map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}catch{}
}
async function refresh(){
  if(!tabId)return; chrome.runtime.sendMessage({type:'GET_SESSION',tabId},s=>{
    const active=!!s; $('idle').classList.toggle('hidden',active); $('active').classList.toggle('hidden',!active);
    if(active){$('mConsole').textContent=s.console?.length||0;$('mNetwork').textContent=Object.keys(s.requests||{}).length;$('mActions').textContent=s.actions?.length||0;if(s.screenshot){$('preview').src=s.screenshot;$('preview').classList.remove('hidden')}}
  });
}
$('start').onclick=()=>chrome.runtime.sendMessage({type:'START_CAPTURE',tabId},r=>{msg(r?.ok?'Capture started':r?.error||'Could not start capture');refresh()});
$('stop').onclick=()=>chrome.runtime.sendMessage({type:'STOP_CAPTURE',tabId},r=>{msg(r?.ok?'Capture stopped':r?.error||'Could not stop capture');clearInterval(timer);refresh()});
$('screenshot').onclick=()=>chrome.runtime.sendMessage({type:'CAPTURE_SCREENSHOT',tabId},r=>{if(r?.ok){$('preview').src=r.dataUrl;$('preview').classList.remove('hidden');msg('Screenshot captured')}else msg(r?.error||'Screenshot failed')});
$('submit').onclick=()=>{
  const title=$('title').value.trim(); if(!title)return msg('Add an issue title first'); $('submit').disabled=true;$('submit').textContent='Sending…';
  chrome.runtime.sendMessage({type:'SUBMIT_REPORT',tabId,title,description:$('description').value,priority:$('priority').value,assignee_id:$('assignee').value||null},r=>{
    $('submit').disabled=false;$('submit').textContent='Send to Issue Control'; if(r?.ok){msg('Report sent successfully');setTimeout(()=>window.close(),900)}else msg(r?.error||'Could not send report');
  });
};
function msg(t){$('message').textContent=t}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
