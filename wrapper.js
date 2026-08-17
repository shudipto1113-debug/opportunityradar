import base from './worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
});

const MATCH_FIX = `\n<script>\n(function(){\n  function wireMatchButton(){\n    var b=document.getElementById('match');\n    if(!b || b.dataset.matchFixWired) return;\n    b.dataset.matchFixWired='1';\n    b.addEventListener('click', function(){\n      // "Find my matches" is a profile action, not a browse-filter action.\n      // Clear stale search/category filters before running the profile match.\n      ['q','kind','scope'].forEach(function(id){\n        var el=document.getElementById(id);\n        if(el) el.value='';\n      });\n      var sort=document.getElementById('sort');\n      if(sort) sort.value='match';\n      var count=document.getElementById('count');\n      if(count) count.textContent='Finding your best verified matches…';\n      setTimeout(function(){\n        if(typeof window.render==='function') window.render();\n        var grid=document.getElementById('grid');\n        if(grid) grid.scrollIntoView({behavior:'smooth',block:'start'});\n      },0);\n    }, true);\n  }\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wireMatchButton);\n  else wireMatchButton();\n})();\n</script>\n`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return base.fetch(request, env, ctx);
    if (!env.ASSETS) return base.fetch(request, env, ctx);
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get('content-type') || '';
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
