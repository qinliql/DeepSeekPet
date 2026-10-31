/** Local companion panel. Uses the same per-process capability as the API settings page. */
export const companionPanel = `<section class="companion"><h2>鱼团 · 个性设置</h2><button id="world-studio" type="button">角色、人设与世界管理</button><button id="appearance-size-jump" type="button">调整鱼团大小</button>
<label for="appearance-size">桌宠大小（默认大小的百分比）</label><input id="appearance-size" type="range" min="50" max="180" step="5" value="100"><output id="appearance-size-value">100%</output><p class="hint">保存后约30秒内更新桌宠，聊天窗口不受影响。</p>
<label for="appearance-name">正式名字</label><input id="appearance-name" maxlength="30" value="鱼团">
<label for="appearance-owner">主人称呼</label><input id="appearance-owner" maxlength="30" value="主人">
<label for="appearance-personality">性格补充</label><textarea id="appearance-personality" maxlength="1200" rows="3" style="width:100%;font:inherit"></textarea>
<div class="pair"><div><label for="appearance-font">聊天字号</label><input id="appearance-font" type="number" min="15" max="24" value="18"></div><div><label for="appearance-accent">主题色</label><input id="appearance-accent" type="color" value="#548eaa"></div></div>
<label class="check"><input id="appearance-quiet" type="checkbox" checked>安静待机（关闭后恢复活泼随机动画）</label>
<label class="check"><input id="appearance-drag-throw" type="checkbox">启用拖拽惯性、甩抛与碰撞反弹（默认关闭）</label>
<label class="check"><input id="appearance-click-enabled" type="checkbox" checked>点击时说简短的话（不调用API）</label>
<label for="appearance-click-lines">自定义点击短句（每行一句，留空使用内置台词；{owner}代表当前称呼）</label><textarea id="appearance-click-lines" rows="5" style="width:100%;font:inherit"></textarea>
<label for="appearance-idle">无互动时，偶尔换动画的间隔（分钟）</label><input id="appearance-idle" type="number" min="2" max="60" value="8">
<button id="appearance-save" type="button">保存个性设置</button><p id="appearance-status" class="hint">待机设置约30秒内生效；聊天外观重新打开聊天后生效。</p>
<h2>陪伴状态</h2><button id="companion-chat" type="button">返回聊天</button>
<p id="companion-state" role="status">正在读取…</p>
<button id="companion-refresh" type="button">刷新状态</button> <button id="companion-feed" type="button">喂点零食</button>
<p class="hint">零食仅增加本地饱食度，不会充值或扣费。</p>
<label class="check"><input id="companion-enabled" type="checkbox">启用挂机数值</label>
<label class="check"><input id="companion-memory" type="checkbox">启用长期记忆</label>
<button id="companion-save" type="button">保存陪伴设置</button> <button id="companion-export" type="button">导出记忆与状态</button>
<p class="hint">记忆在聊天结束约3分钟后或累计6轮时整理，会调用一次API。关闭记忆后保留已有记录，不再整理或注入。</p>
<details><summary id="companion-count">长期记忆</summary><pre id="companion-facts" style="white-space:pre-wrap"></pre></details></section>`;
/** No secrets are persisted in the browser; memory is rendered only as text. */
export const companionScript = `(() => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  const get = id => document.getElementById(id);
  let latest;
  const status = get('companion-state');
  async function request(body) {
    const response = await fetch('/companion', {method: body ? 'POST' : 'GET', credentials:'omit', cache:'no-store',
      headers: {'X-DSH-Pet-Token':token, ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body:JSON.stringify(body)} : {})});
    if (!response.ok) throw Error('陪伴状态暂时无法读取，请从桌宠重新打开设置。');
    const data = await response.json(); latest=data;
    const pet = data.pets.main;
    const v = pet.vitals;
    status.textContent = '饱食 ' + Math.round(v.satiety) + ' · 精力 ' + Math.round(v.energy) + ' · 心情 ' + Math.round(v.mood) + ' · 亲密 ' + Math.round(v.affection) + ' · 思念 ' + Math.round(v.miss);
    get('companion-enabled').checked=data.enabled;
    get('companion-memory').checked=data.memoryEnabled;
    get('companion-count').textContent='长期记忆（'+pet.facts.length+'条，待整理'+Math.ceil(pet.pending.length/2)+'轮）';
    get('companion-facts').textContent=pet.facts.map(f=>'• '+f.text+(f.done?'（已完成）':'')).join('\\n') || '还没有整理出的长期记忆。';
  }
  function act(body) { return request(body).catch(error=>{status.textContent=error.message;}); }
  get('world-studio').addEventListener('click',()=>{location.href='/studio/#token='+encodeURIComponent(token);});
  get('companion-chat').addEventListener('click',()=>{location.href='/chat/#token='+encodeURIComponent(token);});
  get('companion-refresh').addEventListener('click',()=>act());
  get('companion-feed').addEventListener('click',()=>act({action:'feed'}));
  get('companion-save').addEventListener('click',()=>act({action:'settings',enabled:get('companion-enabled').checked,memoryEnabled:get('companion-memory').checked}));
  get('companion-export').addEventListener('click',async()=>{
    try { await request(); const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download='鲸伴记忆备份.json';
      link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(error) {status.textContent=error.message;}
  });
  async function appearance(body) {
    const response=await fetch('/dsh-pet-7340/appearance',{method:body?'POST':'GET',credentials:'omit',cache:'no-store',
      headers:{'X-DSH-Pet-Token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Error('保存失败，请检查名字、字号和间隔范围。');
    const p=await response.json();get('appearance-size').value=p.sizePercent;get('appearance-size-value').textContent=p.sizePercent+'%';get('appearance-name').value=p.name;get('appearance-owner').value=p.owner;
    get('appearance-personality').value=p.personality;get('appearance-font').value=p.fontSize;get('appearance-accent').value=p.accent;
    get('appearance-click-enabled').checked=p.clickRepliesEnabled!==false;get('appearance-click-lines').value=(p.clickReplies||[]).join('\\n');get('appearance-drag-throw').checked=p.dragThrowEnabled===true;get('appearance-quiet').checked=p.quiet;get('appearance-idle').value=p.idleMinutes;
  }
  get('appearance-size').addEventListener('input',()=>{get('appearance-size-value').textContent=get('appearance-size').value+'%';});
  get('appearance-size-jump').addEventListener('click',()=>{get('appearance-size').scrollIntoView({behavior:'smooth',block:'center'});get('appearance-size').focus();});
  get('appearance-save').addEventListener('click',()=>{
    void appearance({sizePercent:Number(get('appearance-size').value),name:get('appearance-name').value,owner:get('appearance-owner').value,personality:get('appearance-personality').value,
      fontSize:Number(get('appearance-font').value),accent:get('appearance-accent').value,clickRepliesEnabled:get('appearance-click-enabled').checked,clickReplies:get('appearance-click-lines').value.split(/\\n/).map(s=>s.trim()).filter(Boolean),dragThrowEnabled:get('appearance-drag-throw').checked,quiet:get('appearance-quiet').checked,idleMinutes:Number(get('appearance-idle').value)})
      .then(()=>{get('appearance-status').textContent='已保存。待机设置约30秒内生效，聊天外观重新打开聊天后生效。';})
      .catch(error=>{get('appearance-status').textContent=error.message;});
  });
  if(token){void act();void appearance().catch(error=>{get('appearance-status').textContent=error.message;});}
})();`;
