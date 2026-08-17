import base from './worker.js';

const MATCH_FIX = `
<script>
(function(){
  function wireMatchButton(){
    var b=document.getElementById('match');
    if(!b || b.dataset.matchFixWired) return;
    b.dataset.matchFixWired='1';
    b.addEventListener('click', function(){
      ['q','kind','scope'].forEach(function(id){var el=document.getElementById(id); if(el) el.value='';});
      var sort=document.getElementById('sort'); if(sort) sort.value='match';
      var count=document.getElementById('count'); if(count) count.textContent='Finding your best verified matches…';
      try{fetch('/api/event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'match_click'})}).catch(function(){});}catch(e){}
      setTimeout(function(){
        if(typeof window.render==='function') window.render();
        var grid=document.getElementById('grid');
        if(grid) grid.scrollIntoView({behavior:'smooth',block:'start'});
      },0);
    }, true);
  }
  document.addEventListener('DOMContentLoaded',wireMatchButton);
})();
</script>
`;

async function eventResponse(request, env){
  if(request.method !== 'POST') return new Response('Method Not Allowed',{status:405});
  if(!env.ANALYTICS) return new Response(null,{status:204});
  try{
    const body=await request.json();
    const event=String(body?.event||'unknown').slice(0,80);
    const path=String(body?.path||'').slice(0,240);
    const country=String(body?.country||'').slice(0,96);
    env.ANALYTICS.writeDataPoint({
      indexes:[event],
      blobs:[path,country],
      doubles:[1]
    });
  }catch(e){}
  return new Response(null,{status:204,headers:{'cache-control':'no-store'}});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname === '/api/event') return eventResponse(request, env);
    if (url.pathname.startsWith('/api/')) return base.fetch(request, env, ctx);
    if (!env.ASSETS) return base.fetch(request, env, ctx);
    const response = await env.ASSETS.fetch(request);
    if (url.pathname === '/' || url.pathname.endsWith('.html')) {
      const text = await response.text();
      return new Response(text.replace('</body>', MATCH_FIX + '</body>'), {
        status: response.status,
        headers: new Headers(response.headers)
      });
    }
    return response;
  },
  async scheduled(controller, env, ctx) {
    return base.scheduled(controller, env, ctx);
  }
};
