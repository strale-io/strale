const menu=document.querySelector('.mobile-nav');
if(menu){
 const summary=menu.querySelector('summary');
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menu.open){menu.open=false;summary.focus();}});
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))menu.open=false;});
 document.addEventListener('focusin',event=>{if(!menu.contains(event.target))menu.open=false;});
 window.addEventListener('resize',()=>{if(getComputedStyle(menu).display==='none')menu.open=false;});
}
