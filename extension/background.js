const APP_URL = 'https://testing-webapp.aiwebcourse.workers.dev';
const sessions = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.tabId).then(sendResponse).catch(e => sendResponse({ok:false,error:e.message}));
    return true;
  }
  if (msg.type === 'STOP_CAPTURE') {
    stopCapture(msg.tabId).then(sendResponse).catch(e => sendResponse({ok:false,error:e.message}));
    return true;
  }
  if (msg.type === 'GET_SESSION') {
    sendResponse(sessions.get(msg.tabId) || null);
  }
  if (msg.type === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(undefined, {format:'png'}, dataUrl => {
      if (chrome.runtime.lastError) return sendResponse({ok:false,error:chrome.runtime.lastError.message});
      const s = sessions.get(msg.tabId) || freshSession(msg.tabId);
      s.screenshot = dataUrl;
      sessions.set(msg.tabId,s);
      sendResponse({ok:true,dataUrl});
    });
    return true;
  }
  if (msg.type === 'SUBMIT_REPORT') {
    submitReport(msg).then(sendResponse).catch(e => sendResponse({ok:false,error:e.message}));
    return true;
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId;
  if (!tabId || !sessions.has(tabId)) return;
  const s = sessions.get(tabId);
  if (method === 'Runtime.consoleAPICalled') {
    const args = (params.args || []).map(a => a.value ?? a.description ?? a.type);
    s.console.push({type: params.type, args, ts: Date.now()});
  }
  if (method === 'Log.entryAdded') {
    s.console.push({type: params.entry.level || 'log', text: params.entry.text, source: params.entry.source, url: params.entry.url, ts: Date.now()});
  }
  if (method === 'Network.requestWillBeSent') {
    const r = params.request || {};
    s.requests[params.requestId] = {requestId:params.requestId, url:r.url, method:r.method, type:params.type || '', startedAt:Date.now()};
  }
  if (method === 'Network.responseReceived') {
    const r = s.requests[params.requestId] || {requestId:params.requestId};
    const resp = params.response || {};
    Object.assign(r,{status:resp.status,statusText:resp.statusText,mimeType:resp.mimeType,protocol:resp.protocol,fromDiskCache:resp.fromDiskCache,fromServiceWorker:resp.fromServiceWorker,finishedAt:Date.now()});
    s.requests[params.requestId] = r;
  }
  if (method === 'Network.loadingFailed') {
    const r = s.requests[params.requestId] || {requestId:params.requestId};
    Object.assign(r,{failed:true,errorText:params.errorText,canceled:params.canceled,finishedAt:Date.now()});
    s.requests[params.requestId] = r;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const s = sessions.get(tabId);
  if (!s) return;
  if (changeInfo.url) s.actions.push({type:'navigation',url:changeInfo.url,ts:Date.now()});
  if (tab?.title) s.pageTitle = tab.title;
  if (tab?.url) s.pageUrl = tab.url;
});

function freshSession(tabId){
  return {tabId,startedAt:Date.now(),console:[],requests:{},actions:[],pageUrl:'',pageTitle:'',screenshot:null,environment:{}};
}

async function startCapture(tabId){
  const tab = await chrome.tabs.get(tabId);
  const s = freshSession(tabId);
  s.pageUrl = tab.url || '';
  s.pageTitle = tab.title || '';
  sessions.set(tabId,s);
  await new Promise((resolve,reject)=>chrome.debugger.attach({tabId}, '1.3', ()=> chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  for (const method of ['Network.enable','Runtime.enable','Log.enable','Page.enable','Performance.enable']) {
    await new Promise((resolve)=>chrome.debugger.sendCommand({tabId},method,{},()=>resolve()));
  }
  await chrome.scripting.executeScript({target:{tabId},func:installActionTracker});
  return {ok:true};
}

async function stopCapture(tabId){
  const s = sessions.get(tabId);
  try { await new Promise(resolve=>chrome.debugger.detach({tabId},()=>resolve())); } catch {}
  return {ok:true,session:s};
}

async function submitReport(msg){
  const s = sessions.get(msg.tabId) || freshSession(msg.tabId);
  const env = await chrome.scripting.executeScript({target:{tabId:msg.tabId},func:collectEnvironment});
  s.environment = env?.[0]?.result || {};
  try { await stopCapture(msg.tabId); } catch {}
  const network = Object.values(s.requests).slice(-300);
  const payload = {
    title: msg.title,
    description: msg.description || '',
    expected_behavior: msg.expected_behavior || '',
    reproduction_steps: msg.reproduction_steps || '',
    priority: msg.priority || 'high',
    assignee_id: msg.assignee_id || null,
    page_url: s.pageUrl,
    page_title: s.pageTitle,
    screenshot_data: s.screenshot,
    console: s.console.slice(-300),
    network,
    actions: s.actions.slice(-200),
    environment: s.environment
  };
  const res = await fetch(APP_URL + '/api/capture-report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const out = await res.json();
  if (!res.ok) throw new Error(out.error || 'Failed to submit report');
  sessions.delete(msg.tabId);
  return {ok:true,...out};
}

function installActionTracker(){
  if (window.__ferrnTrackerInstalled) return;
  window.__ferrnTrackerInstalled = true;
  document.addEventListener('click',e=>{
    const el=e.target?.closest?.('button,a,input,select,textarea,[role="button"]') || e.target;
    if (!el) return;
    const text = (el.innerText || el.getAttribute?.('aria-label') || el.name || el.id || el.tagName || '').toString().trim().slice(0,120);
    chrome.runtime.sendMessage({type:'ACTION_EVENT',event:{type:'click',target:text,tag:el.tagName,ts:Date.now()}});
  },true);
}

chrome.runtime.onMessage.addListener((msg,sender)=>{
  if (msg.type !== 'ACTION_EVENT' || !sender.tab?.id) return;
  const s=sessions.get(sender.tab.id); if(!s) return;
  s.actions.push(msg.event);
});

function collectEnvironment(){
  return {
    userAgent:navigator.userAgent,
    language:navigator.language,
    platform:navigator.platform,
    viewport:{width:innerWidth,height:innerHeight,devicePixelRatio:devicePixelRatio},
    screen:{width:screen.width,height:screen.height},
    url:location.href,
    title:document.title,
    timezone:Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
