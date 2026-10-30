const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

test('ruta: la landing no contiene el armador ni carga sus scripts pesados',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(/id=["']order-builder["']/.test(html),false,'el formulario debe vivir en armador/');
  assert.equal(/<script[^>]+src=["'][^"']*armador\/(?:armador|preview|audio)\.js["']/.test(html),false,
    'la landing no debe inicializar el editor ni su iframe');
});

test('ruta: armador tiene una página con selección, navegación y vista previa',()=>{
  const file=path.join(root,'armador/index.html');
  assert.ok(fs.existsSync(file),'debe existir armador/index.html');
  const html=fs.readFileSync(file,'utf8');
  for(const id of ['order-builder','order-next','order-back','preview-panel']){
    assert.match(html,new RegExp('id=["\']'+id+'["\']'),'falta '+id);
  }
  assert.match(html,/name=["']order-model["']/);
});

test('ruta: seguimiento y regalo conservan sus URLs bajo el subdirectorio publicado',()=>{
  const window={};
  vm.runInNewContext(fs.readFileSync(path.join(root,'armador/pagos.js'),'utf8'),{
    window,document:{currentScript:{src:'https://ejemplo.test/eros-web/armador/pagos.js'}},URL,
  });
  const slug='23456789abcdefgh23456789abcdefgh';
  assert.equal(window.ErosPagos.urlSeguimiento({slug}),
    'https://ejemplo.test/eros-web/pedido/?c='+slug);
  assert.equal(window.ErosPagos.urlPagina('https://ejemplo.test/eros-web/p/?c='+slug),
    'https://ejemplo.test/eros-web/p/?c='+slug);
});

test('ruta: panel, seguimiento y entrada del regalo siguen teniendo sus páginas',()=>{
  for(const route of ['admin','pedido','p']){
    assert.ok(fs.statSync(path.join(root,route,'index.html')).isFile(),route+'/ debe conservarse');
  }
});
