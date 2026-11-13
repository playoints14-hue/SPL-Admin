const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = __dirname;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server = http.createServer((req,res)=>{
 let pathname; try { pathname=decodeURIComponent(new URL(req.url,`http://${req.headers.host||'localhost'}`).pathname); } catch { res.writeHead(400); return res.end('Bad Request'); }
 if(pathname==='/health'||pathname==='/health/'){res.writeHead(200,{'content-type':'application/json; charset=utf-8'});return res.end(JSON.stringify({ok:true,service:'SPL Admin'}));}
 if(pathname==='/'||pathname==='/index.html'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-cache'});return fs.createReadStream(path.join(ROOT,'index.html')).pipe(res);}
 const safePath=path.normalize(pathname).replace(/^(\.\.[/\\])+/, ''); const filePath=path.join(ROOT,safePath);
 if(!filePath.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end('Forbidden');}
 fs.stat(filePath,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not Found');}res.writeHead(200,{'content-type':MIME[path.extname(filePath).toLowerCase()]||'application/octet-stream'});fs.createReadStream(filePath).pipe(res);});
});
server.listen(PORT,HOST,()=>console.log(`SPL Admin server listening on ${HOST}:${PORT}`));
